import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { obtenerEmailAdmin } from '@/lib/auth/admin'

/**
 * POST /api/admin/notas
 *
 * Agrega una nota interna del administrador a una solicitud. Las notas son
 * visibles solo en el panel admin (NO se envía WhatsApp a nadie) y quedan en
 * el audit log append-only `solicitud_eventos`:
 *   tipo    = 'nota_admin'
 *   actor   = email del admin autenticado
 *   motivo  = texto de la nota
 *   payload = { origen: 'nota_manual' }  ← distingue la nota escrita a mano de
 *             los demás eventos tipo nota_admin (ediciones de campos, avisos
 *             del sistema), que se renderizan distinto en el detalle.
 *
 * No hay DELETE/PUT a propósito: solicitud_eventos es append-only (auditoría
 * para soporte/disputas). Una nota equivocada se corrige con otra nota.
 *
 * Body: { solicitudId: string, texto: string }
 * Devuelve la nota insertada para que el frontend la muestre sin refetch.
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const texto = typeof body?.texto === 'string' ? body.texto.trim() : ''

    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })
    if (!texto) return NextResponse.json({ error: 'La nota no puede estar vacía' }, { status: 400 })
    if (texto.length > 2000) {
      return NextResponse.json({ error: 'Nota demasiado larga (máx 2000 caracteres)' }, { status: 400 })
    }

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado')
      .eq('id', solicitudId)
      .single()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    const { data: nota, error: insErr } = await supabase
      .from('solicitud_eventos')
      .insert({
        solicitud_id: solicitudId,
        tipo: 'nota_admin',
        // No cambia el estado — se registra el actual para contexto del audit.
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: adminEmail,
        motivo: texto,
        payload: { origen: 'nota_manual' },
      })
      .select('id, tipo, estado_previo, estado_nuevo, actor, motivo, payload, ocurrido_at')
      .single()

    if (insErr || !nota) {
      console.error('[admin/notas] insert falló:', insErr)
      return NextResponse.json({ error: insErr?.message ?? 'No se pudo guardar la nota' }, { status: 500 })
    }

    return NextResponse.json({ success: true, nota })
  } catch (err) {
    console.error('Error en /api/admin/notas:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
