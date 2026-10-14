import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { listarAuxiliaresTecnico } from '@/lib/services/equipo.service'
import { enviarEquipoActualizadoCliente } from '@/lib/services/whatsapp.service'
import { esAuxiliarVisibleAlCliente, fraseAcompanantes, resolverEquipoServicio } from '@/lib/utils/equipo'

/**
 * PATCH /api/tecnico/equipo-servicio  (2026-10-13)
 *
 * El técnico define quién lo acompaña en UN servicio concreto (card
 * "¿Quién va a este servicio?" del portal). Body:
 *   { portalToken, solicitudId, auxiliaresIds: string[] }
 *
 * Reglas:
 *   - Solo auxiliares PROPIOS, activos y verificados por Baird (los demás se
 *     rechazan con 400: el cliente nunca ve a alguien sin verificar).
 *   - Solo servicios del técnico (tecnico_asignado_id) no terminales.
 *   - Si el equipo cambió, se avisa al cliente con
 *     `equipo_servicio_actualizado_v1` (best-effort; el portal
 *     /servicio/{token} siempre refleja el equipo vigente) y se deja
 *     rastro en solicitud_eventos (nota_admin, origen 'equipo').
 */
export async function PATCH(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = z
      .object({
        portalToken: z.string().uuid(),
        solicitudId: z.string().uuid(),
        auxiliaresIds: z.array(z.string().uuid()).max(10),
      })
      .safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const { portalToken, solicitudId } = parsed.data
    const auxiliaresIds = Array.from(new Set(parsed.data.auxiliaresIds))

    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, auxiliares_ids, cliente_nombre')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .maybeSingle()
    if (solErr) return NextResponse.json({ error: solErr.message }, { status: 500 })
    if (!sol) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    if (ESTADOS_TERMINALES.has(sol.estado as string)) {
      return NextResponse.json({ error: 'Este servicio ya está cerrado.' }, { status: 409 })
    }

    const { rows, disponible } = await listarAuxiliaresTecnico(tecnico.id)
    if (!disponible) {
      return NextResponse.json({ error: 'El equipo por servicio aún no está habilitado. Avisa al equipo Baird.' }, { status: 503 })
    }
    const propios = new Map(rows.map(a => [a.id, a]))
    for (const id of auxiliaresIds) {
      const a = propios.get(id)
      if (!a) return NextResponse.json({ error: 'Uno de los auxiliares no es tuyo.' }, { status: 400 })
      if (!esAuxiliarVisibleAlCliente(a)) {
        return NextResponse.json(
          { error: `${a.nombre_completo} aún no está verificado por Baird (o está dado de baja): no puede acompañarte todavía.` },
          { status: 400 },
        )
      }
    }

    const previos = Array.isArray(sol.auxiliares_ids) ? (sol.auxiliares_ids as string[]) : []
    const sinCambio = previos.length === auxiliaresIds.length && previos.every(id => auxiliaresIds.includes(id))
    if (sinCambio) {
      return NextResponse.json({ success: true, auxiliaresIds, cambio: false, cliente_notificado: false })
    }

    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ auxiliares_ids: auxiliaresIds })
      .eq('id', sol.id)
      .eq('tecnico_asignado_id', tecnico.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    const equipoPrevio = resolverEquipoServicio(previos, rows)
    const equipoNuevo = resolverEquipoServicio(auxiliaresIds, rows)
    const descripcion = (lista: typeof equipoNuevo) => (lista.length ? lista.map(a => a.nombre_completo).join(', ') : 'va solo')

    // Rastro (best-effort). nota_admin con payload.origen='equipo' para no
    // tocar el CHECK de solicitud_eventos (mismo patrón que el receptor).
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'nota_admin',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: 'tecnico',
        motivo: `${tecnico.nombre_completo} actualizó el equipo que visita al cliente: ${fraseAcompanantes(equipoNuevo) || 'va solo'}`,
        payload: {
          origen: 'equipo',
          tecnico_nombre: tecnico.nombre_completo,
          campos_modificados: { equipo: { previo: descripcion(equipoPrevio), nuevo: descripcion(equipoNuevo) } },
        },
      })
    } catch (err) {
      console.warn('[tecnico/equipo-servicio] evento no registrado:', err instanceof Error ? err.message : err)
    }

    // Aviso al cliente. Solo tiene sentido si ya le contamos quién iba
    // (técnico asignado ⇒ ya recibió tecnico_asignado_*).
    let clienteNotificado = false
    let whatsappError: string | undefined
    try {
      const r = await enviarEquipoActualizadoCliente(sol.id)
      clienteNotificado = r.ok
      whatsappError = r.error
    } catch (err) {
      whatsappError = err instanceof Error ? err.message : String(err)
    }

    return NextResponse.json({
      success: true,
      auxiliaresIds,
      cambio: true,
      cliente_notificado: clienteNotificado,
      whatsapp_error: whatsappError,
    })
  } catch (err) {
    console.error('[tecnico/equipo-servicio]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
