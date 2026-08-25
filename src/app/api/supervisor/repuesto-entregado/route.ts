import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { resolverSupervisorPorToken, solicitudEnAlcance } from '@/lib/auth/supervisor'
import {
  enviarRepuestoLlegadoTecnico,
  enviarRepuestoRecibidoCliente,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'
import crypto from 'crypto'

/**
 * POST /api/supervisor/repuesto-entregado  (JSON: { token, id })
 *
 * Segunda acción de escritura del portal del supervisor (junto a
 * /api/supervisor/guia-envio): marcar que el repuesto YA fue entregado al
 * cliente. Antes esto era exclusivo del admin (/api/repuesto-recibido); el
 * supervisor es quien gestiona el despacho ante la marca, así que puede
 * cerrar el ciclo del repuesto sin pasar por el panel admin.
 *
 * Transición: esperando_repuesto | repuesto_en_camino → repuesto_recibido.
 *   - esperando_repuesto: entrega directa sin guía (p.ej. el técnico lo
 *     recogió en bodega) — mismo camino que el admin.
 *   - repuesto_en_camino: la guía ya se subió y el paquete llegó antes de que
 *     el cliente agendara. Si el cliente ya agendó (en_proceso), este endpoint
 *     responde 400 — no hay nada que marcar.
 *
 * Efectos (mismos que /api/repuesto-recibido del admin):
 *   - repuestos_pendientes de la solicitud: pendiente → recibido.
 *   - Cliente: repuesto_recibido_cliente_v2 (botón → /reprogramar-repuesto/
 *     {token} para elegir fecha de la visita de finalización). Se REUSA el
 *     reprogramacion_token existente si lo hay (el botón "Agendar visita" que
 *     el cliente ya recibió con la guía sigue vivo); solo se genera uno nuevo
 *     si la solicitud no tenía.
 *   - Técnico: repuesto_llegado_tecnico_v1 (informativo).
 *   - Supervisores: notificarCambioEstado (plantilla repuesto en garantía).
 *   - Historial: evento cambio_estado con actor 'supervisor' (se registra
 *     aquí con el nombre; registrarEvento: false evita el duplicado con
 *     actor inferido 'admin').
 *
 * Auth: portal_token del supervisor + gate de alcance (ambito + marca)
 * server-side, igual que /api/supervisor/guia-envio.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = typeof body?.token === 'string' ? body.token : null
    const id = typeof body?.id === 'string' ? body.id : null

    const sup = await resolverSupervisorPorToken(token)
    if (!sup) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
    if (!id) return NextResponse.json({ error: 'Falta id de la solicitud' }, { status: 400 })

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, marca_equipo, reprogramacion_token')
      .eq('id', id)
      .maybeSingle()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    if (!solicitudEnAlcance(sup, { es_garantia: sol.es_garantia, marca_equipo: sol.marca_equipo })) {
      return NextResponse.json({ error: 'Fuera de tu alcance' }, { status: 403 })
    }

    const ESTADOS_PERMITIDOS = ['esperando_repuesto', 'repuesto_en_camino']
    if (!ESTADOS_PERMITIDOS.includes(sol.estado ?? '')) {
      return NextResponse.json(
        { error: 'La solicitud no está en el ciclo de repuesto (ya fue marcado como entregado o el cliente ya agendó)' },
        { status: 400 },
      )
    }
    const estadoPrevio = sol.estado as string

    // 1. Marcar todos los repuestos pendientes de la solicitud como recibidos.
    //    Best-effort: si no hay filas (caso raro) la transición igual procede.
    const { error: repErr } = await supabase
      .from('repuestos_pendientes')
      .update({ estado: 'recibido', recibido_at: new Date().toISOString() })
      .eq('solicitud_id', sol.id)
      .eq('estado', 'pendiente')
    if (repErr) console.error('[supervisor/repuesto-entregado] repuestos_pendientes falló:', repErr)

    // 2. Transición atómica → repuesto_recibido (guard .in evita carrera con
    //    el admin marcando recibido o el cliente agendando al mismo tiempo).
    //    Reusar el reprogramacion_token existente para no invalidar el botón
    //    "Agendar visita" que el cliente recibió con la guía de envío.
    const reprogToken = sol.reprogramacion_token ?? crypto.randomUUID()
    const { data: updated } = await supabase
      .from('solicitudes_servicio')
      .update({
        estado: 'repuesto_recibido',
        reprogramacion_token: reprogToken,
        repuesto_recibido_at: new Date().toISOString(),
      })
      .eq('id', sol.id)
      .in('estado', ESTADOS_PERMITIDOS)
      .select('id')
      .single()

    if (!updated) {
      return NextResponse.json(
        { error: 'La solicitud cambió de estado hace un momento. Recarga la página.' },
        { status: 409 },
      )
    }

    // 3. Notificaciones (best-effort, no revierten la transición).
    const cli = await enviarRepuestoRecibidoCliente(sol.id)
    if (!cli.ok) console.error('[supervisor/repuesto-entregado] aviso cliente falló:', cli.error)
    const tec = await enviarRepuestoLlegadoTecnico(sol.id)
    if (!tec.ok) console.error('[supervisor/repuesto-entregado] aviso técnico falló:', tec.error)

    // Historial con el actor real (supervisor + nombre). registrarEvento: false
    // porque inferirActorTransicion atribuiría repuesto_recibido al admin.
    await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'cambio_estado',
      estado_previo: estadoPrevio,
      estado_nuevo: 'repuesto_recibido',
      actor: 'supervisor',
      motivo: `Supervisor ${sup.nombre} marcó el repuesto como entregado al cliente`,
      payload: { origen: 'portal_supervisor' },
    }).then(({ error }) => {
      if (error) console.error('[supervisor/repuesto-entregado] evento falló:', error.message)
    })
    await notificarCambioEstado(sol.id, estadoPrevio, 'repuesto_recibido', { registrarEvento: false })

    return NextResponse.json({
      success: true,
      cliente_notificado: cli.ok,
      tecnico_notificado: tec.ok,
    })
  } catch (error) {
    console.error('Error en /api/supervisor/repuesto-entregado:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
