import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin } from '@/lib/auth/admin'

/**
 * POST /api/admin/llamadas
 *
 * Registra una llamada telefónica del equipo Baird al cliente (o del cliente
 * al equipo) sobre una solicitud. Queda en el audit log append-only
 * `solicitud_eventos` (igual que las notas — no se puede borrar):
 *   tipo    = 'llamada_admin'
 *   actor   = email del admin autenticado
 *   motivo  = notas de la llamada (qué se habló / resultado)
 *   payload = { origen: 'llamada_manual', hora_llamada: ISO }
 *
 * La hora de la llamada la elige el admin (datetime-local) porque muchas
 * veces se registra DESPUÉS de colgar — no siempre en el momento.
 *
 * NO envía WhatsApp a nadie. Requiere la migración
 * 20260807_llamadas_y_recordatorios.sql (tipo nuevo en el CHECK).
 *
 * Body: { solicitudId: string, horaLlamada: string (ISO), notas: string }
 * Devuelve el evento insertado para que el frontend lo muestre sin refetch.
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const notas = typeof body?.notas === 'string' ? body.notas.trim() : ''
    const horaLlamadaRaw = typeof body?.horaLlamada === 'string' ? body.horaLlamada.trim() : ''

    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })
    if (!notas) return NextResponse.json({ error: 'Describe la llamada antes de guardar' }, { status: 400 })
    if (notas.length > 2000) {
      return NextResponse.json({ error: 'Notas demasiado largas (máx 2000 caracteres)' }, { status: 400 })
    }

    const horaLlamada = new Date(horaLlamadaRaw)
    if (!horaLlamadaRaw || isNaN(horaLlamada.getTime())) {
      return NextResponse.json({ error: 'Hora de llamada inválida' }, { status: 400 })
    }

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado')
      .eq('id', solicitudId)
      .single()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    const { data: llamada, error: insErr } = await supabase
      .from('solicitud_eventos')
      .insert({
        solicitud_id: solicitudId,
        tipo: 'llamada_admin',
        // No cambia el estado — se registra el actual para contexto del audit.
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: adminEmail,
        motivo: notas,
        payload: { origen: 'llamada_manual', hora_llamada: horaLlamada.toISOString() },
      })
      .select('id, tipo, estado_previo, estado_nuevo, actor, motivo, payload, ocurrido_at')
      .single()

    if (insErr || !llamada) {
      console.error('[admin/llamadas] insert falló:', insErr)
      const hint = insErr?.message?.includes('tipo_check')
        ? ' (sugerencia: aplicar migración 20260807_llamadas_y_recordatorios.sql en Supabase)'
        : ''
      return NextResponse.json({ error: (insErr?.message ?? 'No se pudo registrar la llamada') + hint }, { status: 500 })
    }

    return NextResponse.json({ success: true, llamada })
  } catch (err) {
    console.error('Error en /api/admin/llamadas:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
