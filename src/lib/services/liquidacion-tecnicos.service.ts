/**
 * Liquidación de pagos a técnicos — cuentas por pagar de Baird.
 *
 * Qué le debe Baird a cada técnico: servicios COMPLETADOS con técnico
 * asignado que todavía no están en ninguna liquidación viva
 * (`liquidaciones_tecnico_items`). El monto por servicio es el pago
 * consolidado (mismo cálculo que /admin/finanzas y el export de
 * liquidaciones: garantía reconstruida con encuesta/TA/días reales,
 * particular = `pago_tecnico` persistido).
 *
 * Ciclo de una liquidación: pendiente → pagada (con referencia del giro)
 * o → anulada (libera los servicios para volver a liquidar).
 *
 * Solo server-side (service_role). Migración: 20261013_liquidaciones_tecnico.sql.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  cifrasServicio,
  fechaCierreServicio,
  type EvidenciaFinanzas,
  type SolicitudFinanzas,
} from '@/lib/services/finanzas.service'

export type EstadoLiquidacion = 'pendiente' | 'pagada' | 'anulada'

export interface ServicioPorPagar {
  solicitud_id: string
  tecnico_id: string
  es_garantia: boolean
  cliente_nombre: string
  ciudad_pueblo: string
  equipo: string
  tipo_solicitud: string
  fecha_cierre: string
  monto: number
  estimado: boolean
  detalle: Record<string, unknown>
}

export interface CuentaPorPagarTecnico {
  tecnico_id: string
  nombre_completo: string
  whatsapp: string
  numero_documento: string | null
  servicios: ServicioPorPagar[]
  total: number
  garantia: number
  particular: number
  /** Cierre más antiguo sin liquidar (ISO). */
  mas_antiguo: string | null
}

export interface LiquidacionTecnico {
  id: string
  tecnico_id: string
  tecnico_nombre: string
  estado: EstadoLiquidacion
  servicios: number
  total: number
  nota: string | null
  referencia_pago: string | null
  pagada_at: string | null
  anulada_at: string | null
  creada_por: string | null
  pagada_por: string | null
  created_at: string
}

export interface LiquidacionItem {
  solicitud_id: string
  es_garantia: boolean
  monto: number
  fecha_cierre: string | null
  detalle: Record<string, unknown> | null
  cliente_nombre?: string
  equipo?: string
}

type SolicitudPorPagarRow = SolicitudFinanzas & {
  tecnico_asignado_id: string | null
  cliente_nombre: string
  ciudad_pueblo: string
  marca_equipo: string
}

const SELECT_SOLICITUD =
  'id, created_at, es_garantia, tipo_equipo, marca_equipo, tipo_solicitud, estado, pago_tecnico, tecnico_asignado_id, cliente_nombre, ciudad_pueblo, triaje_resultado, cotizacion, recargo_weekend_aplicado, cumple_ta, diagnosticado_at, siguiente_paso, siguiente_paso_at, repuesto_recibido_at'

/** Servicios completados sin liquidar, agrupados por técnico (orden: mayor deuda primero). */
export async function obtenerCuentasPorPagar(): Promise<CuentaPorPagarTecnico[]> {
  const { data: solsRaw, error } = await supabase
    .from('solicitudes_servicio')
    .select(SELECT_SOLICITUD)
    .eq('estado', 'completada')
    .not('tecnico_asignado_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) throw new Error(`Error cargando servicios completados: ${error.message}`)
  const sols = (solsRaw ?? []) as unknown as SolicitudPorPagarRow[]
  if (sols.length === 0) return []

  const ids = sols.map((s) => s.id)
  const [evRes, itemsRes] = await Promise.all([
    supabase
      .from('evidencias_servicio')
      .select('solicitud_id, completado_at, confirmado, confirmado_at, cliente_comentario')
      .in('solicitud_id', ids),
    supabase.from('liquidaciones_tecnico_items').select('solicitud_id').in('solicitud_id', ids),
  ])
  if (itemsRes.error) throw new Error(`Error cargando liquidaciones: ${itemsRes.error.message}`)

  const evidenciaMap = new Map<string, EvidenciaFinanzas>()
  for (const ev of (evRes.data ?? []) as EvidenciaFinanzas[]) {
    const previa = evidenciaMap.get(ev.solicitud_id)
    if (!previa || (!previa.completado_at && ev.completado_at)) evidenciaMap.set(ev.solicitud_id, ev)
  }
  const liquidados = new Set((itemsRes.data ?? []).map((i) => i.solicitud_id as string))

  const porTecnico = new Map<string, ServicioPorPagar[]>()
  for (const sol of sols) {
    if (!sol.tecnico_asignado_id || liquidados.has(sol.id)) continue
    const ev = evidenciaMap.get(sol.id)
    const cierre = fechaCierreServicio(sol, ev)
    const c = cifrasServicio(sol, ev, cierre)
    const lista = porTecnico.get(sol.tecnico_asignado_id) ?? []
    lista.push({
      solicitud_id: sol.id,
      tecnico_id: sol.tecnico_asignado_id,
      es_garantia: sol.es_garantia,
      cliente_nombre: sol.cliente_nombre,
      ciudad_pueblo: sol.ciudad_pueblo,
      equipo: `${sol.tipo_equipo} ${sol.marca_equipo}`.trim(),
      tipo_solicitud: sol.tipo_solicitud,
      fecha_cierre: cierre,
      monto: c.pagoTecnico,
      estimado: c.estimado,
      detalle: c.detalle,
    })
    porTecnico.set(sol.tecnico_asignado_id, lista)
  }
  if (porTecnico.size === 0) return []

  const { data: tecs } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, numero_documento')
    .in('id', [...porTecnico.keys()])
  const tecMap = new Map((tecs ?? []).map((t) => [t.id as string, t]))

  return [...porTecnico.entries()]
    .map(([tecnico_id, servicios]) => {
      servicios.sort((a, b) => a.fecha_cierre.localeCompare(b.fecha_cierre))
      const tec = tecMap.get(tecnico_id)
      return {
        tecnico_id,
        nombre_completo: (tec?.nombre_completo as string) ?? '(técnico sin ficha)',
        whatsapp: (tec?.whatsapp as string) ?? '',
        numero_documento: (tec?.numero_documento as string | null) ?? null,
        servicios,
        total: servicios.reduce((acc, s) => acc + s.monto, 0),
        garantia: servicios.filter((s) => s.es_garantia).length,
        particular: servicios.filter((s) => !s.es_garantia).length,
        mas_antiguo: servicios[0]?.fecha_cierre ?? null,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** Historial de liquidaciones (más recientes primero). */
export async function listarLiquidaciones(limit = 200): Promise<LiquidacionTecnico[]> {
  const { data, error } = await supabase
    .from('liquidaciones_tecnico')
    .select('id, tecnico_id, estado, servicios, total, nota, referencia_pago, pagada_at, anulada_at, creada_por, pagada_por, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Error cargando liquidaciones: ${error.message}`)
  const rows = data ?? []
  const tecIds = [...new Set(rows.map((r) => r.tecnico_id as string))]
  const tecMap = new Map<string, string>()
  if (tecIds.length > 0) {
    const { data: tecs } = await supabase.from('tecnicos').select('id, nombre_completo').in('id', tecIds)
    for (const t of tecs ?? []) tecMap.set(t.id as string, t.nombre_completo as string)
  }
  return rows.map((r) => ({
    ...(r as Omit<LiquidacionTecnico, 'tecnico_nombre'>),
    tecnico_nombre: tecMap.get(r.tecnico_id as string) ?? '(técnico sin ficha)',
  }))
}

/** Items de una liquidación con cliente/equipo para mostrarlos. */
export async function obtenerItemsLiquidacion(liquidacionId: string): Promise<LiquidacionItem[]> {
  const { data, error } = await supabase
    .from('liquidaciones_tecnico_items')
    .select('solicitud_id, es_garantia, monto, fecha_cierre, detalle')
    .eq('liquidacion_id', liquidacionId)
    .order('fecha_cierre', { ascending: true })
  if (error) throw new Error(`Error cargando items: ${error.message}`)
  const items = (data ?? []) as LiquidacionItem[]
  if (items.length === 0) return items
  const { data: sols } = await supabase
    .from('solicitudes_servicio')
    .select('id, cliente_nombre, tipo_equipo, marca_equipo')
    .in('id', items.map((i) => i.solicitud_id))
  const solMap = new Map((sols ?? []).map((s) => [s.id as string, s]))
  return items.map((i) => {
    const s = solMap.get(i.solicitud_id)
    return {
      ...i,
      cliente_nombre: (s?.cliente_nombre as string) ?? '',
      equipo: s ? `${s.tipo_equipo} ${s.marca_equipo}`.trim() : '',
    }
  })
}

/**
 * Crea una liquidación PENDIENTE con los servicios indicados del técnico.
 * Valida que cada servicio esté completado, sea de ese técnico y no esté
 * ya liquidado; el monto se recalcula server-side (no se confía en el cliente).
 */
export async function crearLiquidacion(params: {
  tecnicoId: string
  solicitudIds: string[]
  nota?: string | null
  actor: string
}): Promise<{ id: string; total: number; servicios: number }> {
  const { tecnicoId, nota, actor } = params
  const solicitudIds = [...new Set(params.solicitudIds)]
  if (solicitudIds.length === 0) throw new Error('Selecciona al menos un servicio')

  const cuentas = await obtenerCuentasPorPagar()
  const cuenta = cuentas.find((c) => c.tecnico_id === tecnicoId)
  if (!cuenta) throw new Error('El técnico no tiene servicios por liquidar')
  const porId = new Map(cuenta.servicios.map((s) => [s.solicitud_id, s]))
  const faltantes = solicitudIds.filter((id) => !porId.has(id))
  if (faltantes.length > 0) {
    throw new Error(`${faltantes.length} servicio(s) ya no están por pagar (¿liquidados en otra sesión?). Recarga la página.`)
  }
  const seleccion = solicitudIds.map((id) => porId.get(id)!)
  const total = seleccion.reduce((acc, s) => acc + s.monto, 0)

  const { data: cab, error: cabErr } = await supabase
    .from('liquidaciones_tecnico')
    .insert({
      tecnico_id: tecnicoId,
      estado: 'pendiente',
      servicios: seleccion.length,
      total,
      nota: nota?.trim() || null,
      creada_por: actor,
    })
    .select('id')
    .single()
  if (cabErr || !cab) throw new Error(`No se pudo crear la liquidación: ${cabErr?.message ?? 'sin id'}`)

  const { error: itemsErr } = await supabase.from('liquidaciones_tecnico_items').insert(
    seleccion.map((s) => ({
      liquidacion_id: cab.id,
      solicitud_id: s.solicitud_id,
      tecnico_id: tecnicoId,
      es_garantia: s.es_garantia,
      monto: s.monto,
      fecha_cierre: s.fecha_cierre,
      detalle: s.detalle,
    })),
  )
  if (itemsErr) {
    // Sin transacción: si los items fallan (p.ej. índice único por doble
    // liquidación concurrente) se retira la cabecera para no dejar basura.
    await supabase.from('liquidaciones_tecnico').delete().eq('id', cab.id)
    throw new Error(`No se pudo registrar los servicios: ${itemsErr.message}`)
  }

  await registrarEventos(seleccion.map((s) => s.solicitud_id), `Servicio incluido en liquidación ${codigoLiquidacion(cab.id)} al técnico (${seleccion.length} servicios, total $${total.toLocaleString('es-CO')})`, actor)

  return { id: cab.id as string, total, servicios: seleccion.length }
}

export async function marcarLiquidacionPagada(params: {
  id: string
  referencia?: string | null
  pagadaAt?: string | null
  actor: string
}): Promise<void> {
  const { id, referencia, pagadaAt, actor } = params
  const fecha = pagadaAt ? new Date(pagadaAt) : new Date()
  if (Number.isNaN(fecha.getTime())) throw new Error('Fecha de pago inválida')
  const { data, error } = await supabase
    .from('liquidaciones_tecnico')
    .update({
      estado: 'pagada',
      referencia_pago: referencia?.trim() || null,
      pagada_at: fecha.toISOString(),
      pagada_por: actor,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('estado', 'pendiente') // guard atómico: solo pendiente → pagada
    .select('id')
  if (error) throw new Error(`No se pudo marcar como pagada: ${error.message}`)
  if (!data || data.length === 0) throw new Error('La liquidación no está pendiente (ya pagada o anulada)')

  const { data: items } = await supabase.from('liquidaciones_tecnico_items').select('solicitud_id').eq('liquidacion_id', id)
  await registrarEventos(
    (items ?? []).map((i) => i.solicitud_id as string),
    `Pago al técnico girado — liquidación ${codigoLiquidacion(id)}${referencia ? ` (ref. ${referencia.trim()})` : ''}`,
    actor,
  )
}

/** Anula una liquidación PENDIENTE y libera sus servicios. */
export async function anularLiquidacion(params: { id: string; actor: string }): Promise<void> {
  const { id, actor } = params
  const { data: items, error: itemsErr } = await supabase
    .from('liquidaciones_tecnico_items')
    .select('solicitud_id')
    .eq('liquidacion_id', id)
  if (itemsErr) throw new Error(`Error cargando items: ${itemsErr.message}`)
  const solicitudIds = (items ?? []).map((i) => i.solicitud_id as string)

  const { data, error } = await supabase
    .from('liquidaciones_tecnico')
    .update({
      estado: 'anulada',
      anulada_at: new Date().toISOString(),
      anulada_por: actor,
      anulada_detalle: { solicitud_ids: solicitudIds },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('estado', 'pendiente') // una liquidación pagada NO se anula desde acá
    .select('id')
  if (error) throw new Error(`No se pudo anular: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Solo se puede anular una liquidación pendiente')

  const { error: delErr } = await supabase.from('liquidaciones_tecnico_items').delete().eq('liquidacion_id', id)
  if (delErr) throw new Error(`Liquidación anulada pero no se liberaron los servicios: ${delErr.message}`)

  await registrarEventos(solicitudIds, `Liquidación ${codigoLiquidacion(id)} anulada — el servicio vuelve a "por pagar"`, actor)
}

export function codigoLiquidacion(id: string): string {
  return `LQ-${id.slice(0, 8).toUpperCase()}`
}

/** Audit log por servicio (nota_admin); best-effort, no rompe la operación. */
async function registrarEventos(solicitudIds: string[], motivo: string, actor: string): Promise<void> {
  if (solicitudIds.length === 0) return
  const { data: sols } = await supabase.from('solicitudes_servicio').select('id, estado').in('id', solicitudIds)
  const estadoMap = new Map((sols ?? []).map((s) => [s.id as string, s.estado as string]))
  const { error } = await supabase.from('solicitud_eventos').insert(
    solicitudIds.map((solicitud_id) => ({
      solicitud_id,
      tipo: 'nota_admin',
      estado_previo: estadoMap.get(solicitud_id) ?? 'completada',
      estado_nuevo: estadoMap.get(solicitud_id) ?? 'completada',
      actor,
      motivo,
    })),
  )
  if (error) console.warn('[liquidacion-tecnicos] audit log falló:', error.message)
}
