import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { notificarTecnicos, notificarCambioEstado } from '@/lib/services/whatsapp.service'
import { parsearFechaVisita } from '@/lib/utils/fecha-visita'
import { TYC_VERSION } from '@/types/solicitud'

// Permitir hasta 60s — notificarTecnicos puede tardar varios segundos por técnico
export const maxDuration = 60

/**
 * POST /api/confirmar-horario
 *
 * Recibe la confirmación de horario del cliente y dispara la notificación
 * a los técnicos. Atomic update para evitar doble confirmación.
 *
 * Body: { token: string, horario: string }
 *   El cliente puede elegir libremente fecha+franja horaria en /horario/[token].
 *   Acepta cualquier string no vacío de hasta 200 caracteres.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, horario } = await req.json()

    if (!token || typeof horario !== 'string' || !horario.trim() || horario.length > 200) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const horarioElegido = horario.trim()

    // 1. Validar token
    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, horario_confirmado_at')
      .eq('horario_token', token)
      .single()

    if (solErr || !sol) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 404 })
    }

    if (sol.horario_confirmado_at) {
      return NextResponse.json({ error: 'Este horario ya fue confirmado' }, { status: 400 })
    }

    if (sol.estado === 'sin_agendar') {
      return NextResponse.json({ error: 'La solicitud expiró sin confirmación' }, { status: 410 })
    }

    if (sol.estado !== 'pendiente_horario') {
      return NextResponse.json({ error: 'La solicitud ya no está esperando confirmación de horario' }, { status: 400 })
    }

    // Parsear fecha de visita estructurada (null si no se puede).
    // Sirve al mapa admin para filtrar por día.
    const fechaVisitaAt = parsearFechaVisita(horarioElegido)

    // 2. UPDATE atómico — solo confirma si aún no se ha confirmado
    const { data: updated, error: updateErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        horario_confirmado: horarioElegido,
        horario_confirmado_at: new Date().toISOString(),
        fecha_visita_at: fechaVisitaAt,
        estado: 'notificada',
        notificados_at: new Date().toISOString(),
        tyc_aceptados_at: new Date().toISOString(),
        tyc_version: TYC_VERSION,
      })
      .eq('id', sol.id)
      .is('horario_confirmado_at', null)
      .select('id')
      .single()

    if (updateErr || !updated) {
      return NextResponse.json({ error: 'No se pudo confirmar el horario' }, { status: 500 })
    }

    // Notificar a supervisores configurados (no bloquea el flujo si falla).
    await notificarCambioEstado(sol.id, 'pendiente_horario', 'notificada')

    // 3. Notificar técnicos (await — fire-and-forget se cancela en Vercel serverless)
    let notifResult: { notificados: number; matched: number; errors: string[] } | null = null
    try {
      notifResult = await notificarTecnicos(sol.id)
    } catch (err) {
      console.error('[confirmar-horario] notificarTecnicos falló:', err)
    }

    // 4. Si nadie recibió la notificación (0 técnicos disponibles o todos
    //    fallaron), registrar evento de admin para visibilidad. La fila
    //    quedó en estado 'notificada' pero realmente nadie está al tanto —
    //    admin necesita saber para resolver manualmente (e.g., asignar
    //    técnico de otra zona o avisar al cliente que hay demora).
    const notifFalla = !notifResult || notifResult.notificados === 0
    if (notifFalla) {
      try {
        await supabase.from('solicitud_eventos').insert({
          solicitud_id: sol.id,
          tipo: 'nota_admin',
          estado_previo: 'pendiente_horario',
          estado_nuevo: 'notificada',
          actor: 'sistema',
          motivo: 'Cliente confirmó horario pero ningún técnico fue notificado',
          payload: {
            horario_confirmado: horarioElegido,
            matched: notifResult?.matched ?? 0,
            notificados: 0,
            errors: notifResult?.errors ?? [],
            requiere_intervencion_admin: true,
          },
        })
      } catch (err) {
        console.error('[confirmar-horario] No se pudo registrar evento de admin:', err)
      }
    }

    return NextResponse.json({
      success: true,
      horario: horarioElegido,
      notificados: notifResult?.notificados ?? 0,
      matched: notifResult?.matched ?? 0,
      errors: notifResult?.errors ?? [],
      // Warning visible al cliente cuando no hay técnicos en la zona —
      // HorarioSelector lo muestra para que el cliente sepa que hay demora.
      warning: notifFalla
        ? 'Tu horario fue registrado, pero en este momento no encontramos técnicos disponibles en tu zona. El equipo Baird te contactará para ofrecerte alternativas.'
        : null,
    })
  } catch (error) {
    console.error('Error en /api/confirmar-horario:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
