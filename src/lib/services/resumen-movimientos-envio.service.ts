/**
 * resumen-movimientos-envio.service.ts — I/O del resumen diario a supervisores.
 *
 * - `cargarDatosResumen`: lee eventos, solicitudes, repuestos y técnicos de
 *   una ventana (lo usa el cron y el reintento).
 * - `enviarPlantillaResumen`: envía la plantilla `supervisor_resumen_diario_v1`
 *   (fallback que funciona fuera de la ventana 24h de Meta).
 * - `reintentarResumenPorPlantilla`: lo llama el webhook de WhatsApp cuando
 *   Meta reporta status=failed con 131047 a un supervisor. Meta ACEPTA el
 *   texto libre (200 + wamid) y avisa el fallo DESPUÉS, así que el fallback
 *   síncrono del cron no lo ve (2026-10-27). Busca el resumen enviado por
 *   texto en la última hora, lo reclama de forma atómica (canal texto →
 *   plantilla, así un resumen partido en varios mensajes se reenvía una sola
 *   vez), lo vuelve a armar con los mismos datos y manda la plantilla.
 *
 * La lógica pura (armado del texto, ventanas, reglas del reintento) está en
 * resumen-movimientos.service.ts, que sí tiene tests.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarPlantilla } from '@/lib/services/whatsapp.service'
import { phoneToDigits } from '@/lib/utils/phone'
import {
  armarResumenSupervisor,
  fechaCortaResumen,
  rangoBusquedaResumenFallido,
  ventanaDesdeBitacora,
  TIPOS_EVENTO_MOVIMIENTO,
  ESTADOS_REPUESTO,
  ORIGEN_REAGENDAMIENTO_ADMIN,
  type EventoMovimiento,
  type RepuestoResumen,
  type ResumenSupervisor,
  type SolicitudResumen,
  type SupervisorResumen,
  type VentanaResumen,
} from '@/lib/services/resumen-movimientos.service'

export const PLANTILLA_RESUMEN_SUPERVISOR = 'supervisor_resumen_diario_v1'

export const SELECT_SUPERVISOR_RESUMEN = 'id, nombre, whatsapp, ambito, marca, estados, activo, portal_token'

export interface DatosResumen {
  eventos: EventoMovimiento[]
  solicitudes: SolicitudResumen[]
  repuestos: RepuestoResumen[]
  tecnicos: Map<string, string>
}

/** Carga todo lo que necesita `armarResumenSupervisor` para una ventana. Lanza si falla una query esencial. */
export async function cargarDatosResumen(ventana: VentanaResumen): Promise<DatosResumen> {
  // 1. Movimientos de la ventana (append-only → se lee tal cual). `payload`
  //    solo se usa para la fecha de visita de los eventos de agendamiento.
  const { data: evs, error: evErr } = await supabase
    .from('solicitud_eventos')
    .select('solicitud_id, tipo, estado_previo, estado_nuevo, actor, ocurrido_at, payload')
    .in('tipo', [...TIPOS_EVENTO_MOVIMIENTO])
    .gt('ocurrido_at', ventana.desde.toISOString())
    .lte('ocurrido_at', ventana.hasta.toISOString())
    .order('ocurrido_at', { ascending: true })
  if (evErr) throw new Error(`solicitud_eventos: ${evErr.message}`)
  const movimientos = ((evs ?? []) as EventoMovimiento[]).filter(e => e.estado_nuevo && e.estado_previo !== e.estado_nuevo)

  // 1b. Reagendamientos del admin (2026-10-22): no cambian el estado (evento
  //     `nota_admin` con payload.origen = 'reagendamiento_admin'), pero sí fijan
  //     una fecha de visita → cuentan para "cerrar para abrir después" (MABE).
  const { data: reagAdmin, error: reagErr } = await supabase
    .from('solicitud_eventos')
    .select('solicitud_id, tipo, estado_previo, estado_nuevo, actor, ocurrido_at, payload')
    .eq('tipo', 'nota_admin')
    .eq('payload->>origen', ORIGEN_REAGENDAMIENTO_ADMIN)
    .gt('ocurrido_at', ventana.desde.toISOString())
    .lte('ocurrido_at', ventana.hasta.toISOString())
    .order('ocurrido_at', { ascending: true })
  if (reagErr) console.warn('[resumen-movimientos] reagendamientos admin no disponibles:', reagErr.message)
  const eventos: EventoMovimiento[] = [...movimientos, ...((reagAdmin ?? []) as EventoMovimiento[])]

  // 2. Solicitudes involucradas + repuestos + técnicos (una query cada una).
  const solicitudIds = [...new Set(eventos.map(e => e.solicitud_id))]
  let solicitudes: SolicitudResumen[] = []
  let repuestos: RepuestoResumen[] = []
  const tecnicos = new Map<string, string>()
  if (solicitudIds.length > 0) {
    const { data: sols, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, es_garantia, numero_serie_factura, estado, tecnico_asignado_id, fecha_visita_at, cotizacion')
      .in('id', solicitudIds)
    if (solErr) throw new Error(`solicitudes_servicio: ${solErr.message}`)
    solicitudes = (sols ?? []).map(s => ({
      id: s.id,
      cliente_nombre: s.cliente_nombre,
      tipo_equipo: s.tipo_equipo,
      marca_equipo: s.marca_equipo,
      ciudad_pueblo: s.ciudad_pueblo,
      es_garantia: s.es_garantia,
      numero_serie_factura: s.numero_serie_factura,
      estado: s.estado,
      tecnico_asignado_id: s.tecnico_asignado_id,
      fecha_visita_at: s.fecha_visita_at,
    }))

    // Repuestos solo de los servicios que tocaron el ciclo de repuesto.
    const idsRepuesto = new Set<string>()
    for (const s of sols ?? []) if (s.estado && ESTADOS_REPUESTO.has(s.estado)) idsRepuesto.add(s.id)
    for (const e of eventos) if (e.estado_nuevo && ESTADOS_REPUESTO.has(e.estado_nuevo)) idsRepuesto.add(e.solicitud_id)
    if (idsRepuesto.size > 0) {
      const { data: reps } = await supabase
        .from('repuestos_pendientes')
        .select('solicitud_id, sku, descripcion, cantidad, estado')
        .in('solicitud_id', [...idsRepuesto])
        .neq('estado', 'cancelado')
        .order('solicitado_at', { ascending: true })
      repuestos = (reps ?? []) as RepuestoResumen[]
      // Fallback: productos_necesarios de la cotización (JSONB) si la tabla no tiene filas.
      const conFila = new Set(repuestos.map(r => r.solicitud_id))
      for (const s of sols ?? []) {
        if (!idsRepuesto.has(s.id) || conFila.has(s.id)) continue
        const productos = (s.cotizacion as { productos_necesarios?: Array<{ sku?: string; descripcion?: string; cantidad?: number }> } | null)
          ?.productos_necesarios
        for (const p of Array.isArray(productos) ? productos : []) {
          repuestos.push({
            solicitud_id: s.id,
            sku: p.sku ?? null,
            descripcion: p.descripcion ?? null,
            cantidad: typeof p.cantidad === 'number' ? p.cantidad : null,
            estado: null,
          })
        }
      }
    }

    const tecnicoIds = [...new Set(solicitudes.map(s => s.tecnico_asignado_id).filter((x): x is string => !!x))]
    if (tecnicoIds.length > 0) {
      const { data: tecs } = await supabase.from('tecnicos').select('id, nombre_completo').in('id', tecnicoIds)
      for (const t of tecs ?? []) tecnicos.set(t.id, t.nombre_completo)
    }
  }

  return { eventos, solicitudes, repuestos, tecnicos }
}

/**
 * Envía la plantilla `supervisor_resumen_diario_v1` (resumen en una línea +
 * botón al portal). Lanza si Meta la rechaza. `filtered` = bloqueada por
 * BAIRD_TEST_PHONE_WHITELIST.
 */
export async function enviarPlantillaResumen(
  sup: SupervisorResumen,
  resumen: ResumenSupervisor,
  fechaYMD: string,
): Promise<{ filtered: boolean }> {
  const components: Record<string, unknown>[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: sup.nombre.trim().split(/\s+/)[0] || sup.nombre },
        { type: 'text', text: fechaCortaResumen(fechaYMD) },
        { type: 'text', text: resumen.conteo },
        { type: 'text', text: resumen.lineaCompacta },
      ],
    },
  ]
  if (sup.portal_token) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: sup.portal_token }],
    })
  }
  const r = await enviarPlantilla(sup.whatsapp, PLANTILLA_RESUMEN_SUPERVISOR, 'es', components)
  return { filtered: !!r.filtered }
}

export type ResultadoReintento =
  | 'no_es_supervisor'
  | 'sin_resumen_reciente'
  | 'ya_reintentado'
  | 'plantilla'
  | 'filtrado'
  | 'error'

/**
 * Reenvía por plantilla el resumen de hoy a un supervisor cuyo texto libre
 * Meta no entregó (status=failed 131047). Nunca lanza: el webhook debe
 * responder 200 a Meta pase lo que pase.
 */
export async function reintentarResumenPorPlantilla(params: {
  /** `recipient_id` del status de Meta (dígitos con país). */
  destinatario: string
  /** Momento del status=failed. */
  statusAt: Date
  /** Detalle de Meta para la bitácora. */
  detalle: string
}): Promise<ResultadoReintento> {
  const tag = '[resumen-movimientos/reintento]'
  try {
    const digits = phoneToDigits(params.destinatario)
    const { data: sups, error: supErr } = await supabase
      .from('supervisores')
      .select(SELECT_SUPERVISOR_RESUMEN)
      .eq('activo', true)
    if (supErr) throw new Error(`supervisores: ${supErr.message}`)
    const sup = ((sups ?? []) as SupervisorResumen[]).find(s => s.whatsapp && phoneToDigits(s.whatsapp) === digits)
    if (!sup) return 'no_es_supervisor'

    // Resumen enviado por texto poco antes del fallo.
    const rango = rangoBusquedaResumenFallido(params.statusAt)
    const { data: fila, error: filaErr } = await supabase
      .from('supervisor_resumenes')
      .select('id, desde_at, corte_at')
      .eq('supervisor_id', sup.id)
      .eq('canal', 'texto')
      .gte('enviado_at', rango.desde.toISOString())
      .lte('enviado_at', rango.hasta.toISOString())
      .order('enviado_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (filaErr) throw new Error(`supervisor_resumenes: ${filaErr.message}`)
    if (!fila) return 'sin_resumen_reciente'

    // Reclamo atómico: solo el primer status=failed de este resumen reenvía.
    const motivo = `Texto libre no entregado por Meta (${params.detalle || '131047'}); reenviado por plantilla desde el webhook.`
    const { data: reclamada, error: claimErr } = await supabase
      .from('supervisor_resumenes')
      .update({ canal: 'plantilla', error: motivo })
      .eq('id', fila.id)
      .eq('canal', 'texto')
      .select('id')
    if (claimErr) throw new Error(`reclamar bitácora: ${claimErr.message}`)
    if (!reclamada || reclamada.length === 0) return 'ya_reintentado'

    try {
      const ventana = ventanaDesdeBitacora(fila)
      const datos = await cargarDatosResumen(ventana)
      const resumen = armarResumenSupervisor({
        supervisor: sup,
        ventana,
        ...datos,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      })
      const r = await enviarPlantillaResumen(sup, resumen, ventana.fechaYMD)
      if (r.filtered) {
        await supabase.from('supervisor_resumenes')
          .update({ canal: 'filtrado', error: `${motivo} Plantilla filtrada por BAIRD_TEST_PHONE_WHITELIST.` })
          .eq('id', fila.id)
        return 'filtrado'
      }
      console.log(`${tag} ${sup.nombre}: texto no entregado (${params.detalle}); reenviado por plantilla`)
      return 'plantilla'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`${tag} plantilla a ${sup.nombre} falló: ${msg}`)
      await supabase.from('supervisor_resumenes')
        .update({ canal: 'error', error: `Texto no entregado (${params.detalle}) | Plantilla: ${msg}` })
        .eq('id', fila.id)
      return 'error'
    }
  } catch (err) {
    console.error(`${tag} error:`, err)
    return 'error'
  }
}
