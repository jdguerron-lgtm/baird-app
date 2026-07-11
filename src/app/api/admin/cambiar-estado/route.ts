import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { ESTADOS_VALIDOS } from '@/lib/constants/estados'
import { notificarCambioEstado } from '@/lib/services/whatsapp.service'

export const maxDuration = 30

/**
 * POST /api/admin/cambiar-estado
 *
 * Permite al admin forzar manualmente el `estado` de una solicitud cuando el
 * flujo automático quedó atascado — p. ej. el técnico o el cliente perdió
 * conexión y la transición que dispara el endpoint normal nunca llegó.
 *
 * Body: {
 *   id: string,
 *   nuevoEstado: string,   // debe estar en ESTADOS_VALIDOS
 *   motivo?: string,       // razón del cambio (queda en audit, max 500)
 * }
 *
 * NO envía WhatsApp — esto solo mueve el estado en la BD. Si el admin quiere
 * avisar al cliente/técnico, usa el botón "Reenviar último mensaje".
 *
 * Toda transición queda registrada en `solicitud_eventos`:
 *   tipo = 'cambio_estado_admin', actor = 'admin'
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const nuevoEstado = typeof body.nuevoEstado === 'string' ? body.nuevoEstado.trim() : ''
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : null

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    if (!nuevoEstado) return NextResponse.json({ error: 'nuevoEstado requerido' }, { status: 400 })
    if (!(ESTADOS_VALIDOS as readonly string[]).includes(nuevoEstado)) {
      return NextResponse.json({ error: `Estado inválido: ${nuevoEstado}` }, { status: 400 })
    }

    // 1. Leer estado actual
    const { data: actual, error: readErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado')
      .eq('id', id)
      .single()
    if (readErr || !actual) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    if (actual.estado === nuevoEstado) {
      return NextResponse.json({
        success: true,
        mensaje: 'La solicitud ya estaba en ese estado',
        estado: nuevoEstado,
      })
    }

    // 2. Forzar el cambio. El guard `.eq('estado', actual.estado)` evita pisar
    //    un cambio concurrente (otro admin, o el flujo automático corriendo).
    const { data: updated, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .eq('estado', actual.estado)
      .select('id')
      .maybeSingle()
    if (updErr) {
      console.error('[cambiar-estado] update falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'El estado cambió mientras tanto. Recargá la página e intentá de nuevo.' },
        { status: 409 },
      )
    }

    // 3. Audit log (best-effort — si falla no revierte la operación)
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'cambio_estado_admin',
        estado_previo: actual.estado,
        estado_nuevo: nuevoEstado,
        actor: 'admin',
        motivo: motivo ?? 'Cambio manual de estado por admin',
      })
      if (auditErr) console.error('[cambiar-estado] audit falló:', auditErr)
    } catch (err) {
      console.error('[cambiar-estado] audit threw:', err)
    }

    // 4. Notificar a supervisores configurados (no bloquea ni revierte si falla).
    // registrarEvento:false — arriba se insertó el evento dedicado 'cambio_estado_admin'.
    await notificarCambioEstado(id, actual.estado, nuevoEstado, { registrarEvento: false })

    return NextResponse.json({
      success: true,
      estado_previo: actual.estado,
      estado_nuevo: nuevoEstado,
    })
  } catch (err) {
    console.error('Error en /api/admin/cambiar-estado:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
