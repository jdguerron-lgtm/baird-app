import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { notificarTecnicoVisitaReprogramada, notificarCambioEstado } from '@/lib/services/whatsapp.service'
import { parsearFechaVisita } from '@/lib/utils/fecha-visita'

// notificarTecnicoVisitaReprogramada puede tardar (red WhatsApp)
export const maxDuration = 60

/**
 * POST /api/reprogramar-repuesto
 *
 * El cliente elige una NUEVA fecha de visita tras la llegada del repuesto.
 * Endpoint público gateado por reprogramacion_token (UUID secreto enviado en la
 * plantilla repuesto_recibido_cliente_v2). No requiere verificarAdmin.
 *
 * Transición: repuesto_recibido → en_proceso. La fecha es TENTATIVA — el técnico
 * la confirma según su disponibilidad (se le notifica por WhatsApp).
 *
 * Body: { token: string, horario: string }
 *   El cliente elige libremente fecha + franja en /reprogramar-repuesto/[token].
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
      .select('id, estado')
      .eq('reprogramacion_token', token)
      .single()

    if (solErr || !sol) {
      return NextResponse.json({ error: 'Enlace inválido o expirado' }, { status: 404 })
    }

    if (sol.estado !== 'repuesto_recibido') {
      return NextResponse.json(
        { error: 'Esta reprogramación ya no está disponible' },
        { status: 400 },
      )
    }

    // Parsear fecha estructurada (null si no se puede) — alimenta el mapa admin.
    const fechaVisitaAt = parsearFechaVisita(horarioElegido)

    // 2. UPDATE atómico — solo si sigue en repuesto_recibido. Limpia el token
    //    para que el enlace no se pueda reusar.
    const { data: updated, error: updateErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        horario_confirmado: horarioElegido,
        horario_confirmado_at: new Date().toISOString(),
        fecha_visita_at: fechaVisitaAt,
        estado: 'en_proceso',
        reprogramacion_token: null,
      })
      .eq('id', sol.id)
      .eq('estado', 'repuesto_recibido')
      .select('id')
      .single()

    if (updateErr || !updated) {
      return NextResponse.json({ error: 'No se pudo confirmar la nueva fecha' }, { status: 500 })
    }

    // 3. Auditoría (append-only). No bloquea la respuesta si falla.
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'reagendamiento_confirmado',
        estado_previo: 'repuesto_recibido',
        estado_nuevo: 'en_proceso',
        actor: 'cliente',
        motivo: 'Cliente eligió nueva fecha tras llegada de repuesto',
        payload: { horario_confirmado: horarioElegido, tentativo: true },
      })
    } catch (err) {
      console.error('[reprogramar-repuesto] No se pudo registrar evento:', err)
    }

    // 4. Notificar al técnico asignado (plantilla repuesto_recibido_tecnico_v1 —
    //    funciona fuera de la ventana 24h, que para entonces suele estar cerrada).
    let tecnicoNotificado = false
    try {
      const notif = await notificarTecnicoVisitaReprogramada(sol.id, horarioElegido)
      tecnicoNotificado = notif.ok
    } catch (err) {
      console.error('[reprogramar-repuesto] notificarTecnicoVisitaReprogramada falló:', err)
    }

    // 5. Notificar a supervisores configurados (no bloquea ni revierte si falla).
    await notificarCambioEstado(sol.id, 'repuesto_recibido', 'en_proceso')

    return NextResponse.json({
      success: true,
      horario: horarioElegido,
      tecnico_notificado: tecnicoNotificado,
    })
  } catch (error) {
    console.error('Error en /api/reprogramar-repuesto:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
