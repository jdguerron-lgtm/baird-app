/**
 * Resumen financiero del negocio para /admin/finanzas.
 *
 * Cálculo PURO (sin BD) sobre servicios COMPLETADOS, agrupado por mes de
 * cierre (TZ America/Bogota) y partido por flujo (`es_garantia`). Mismo
 * criterio que el export de liquidaciones (/api/admin/liquidaciones):
 *
 *   - Fecha de cierre: evidencias.completado_at → confirmado_at →
 *     diagnosticado_at → created_at.
 *   - Garantía: venta = total a facturar a MABE (tarifa Tipo D + bono +
 *     recargo finde, tratado como base ANTES de IVA), reconstruido con
 *     `calcularTarifaMABE` y datos reales del cierre (encuesta, TA, días).
 *     Costo = pago consolidado al técnico. Sin complejidad en el diagnóstico
 *     se cae al `pago_tecnico` proyectado y la venta se estima como
 *     pago / (1 − 22%), marcando el servicio como "estimado".
 *   - Particular: venta = base gravable (total al cliente sin IVA; si la
 *     cotización persistió `base_venta` se usa, si no se deriva del total).
 *     Costo = `pago_tecnico` persistido (costo cotizado + recargo).
 *   - Utilidad = venta neta − pago técnico. "Gastos" acá son SOLO el costo
 *     directo del técnico: la plataforma no registra gastos de operación
 *     (Meta, Vercel, Wompi, nómina), eso vive en contabilidad (Siigo).
 */

import { calcularTarifaMABE, MARGEN_BAIRD_GARANTIA, type ComplejidadServicio } from '@/lib/constants/tarifas/mabe'
import { precioClienteServicio, IVA_TARIFA } from '@/types/solicitud'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'
import { descuentoDeSolicitud, montoDescuento } from '@/lib/constants/descuentos'

export interface SolicitudFinanzas {
  id: string
  created_at: string
  es_garantia: boolean
  tipo_equipo: string
  tipo_solicitud: string
  estado: string
  pago_tecnico: number | null
  triaje_resultado: Record<string, unknown> | null
  cotizacion: Record<string, unknown> | null
  recargo_weekend_aplicado: number | null
  cumple_ta: boolean | null
  diagnosticado_at: string | null
  siguiente_paso: string | null
  siguiente_paso_at: string | null
  repuesto_recibido_at: string | null
  // Código de descuento (2026-10-19): Baird lo asume → baja la venta, no el
  // pago al técnico. Opcionales para no romper constructores/tests existentes.
  descuento_codigo?: string | null
  descuento_tipo?: string | null
  descuento_valor?: number | string | null
}

export interface EvidenciaFinanzas {
  solicitud_id: string
  completado_at: string | null
  confirmado: boolean | null
  confirmado_at: string | null
  cliente_comentario: string | null
}

/** Pago Wompi aprobado (para el indicador de recaudo online en particular). */
export interface PagoFinanzas {
  solicitud_id: string
  monto: number | null
}

/** Cifras de un flujo (garantía o particular) en un período. */
export interface CifrasFlujo {
  servicios: number
  /** Venta neta (sin IVA): total a facturar a MABE / base gravable particular. */
  ventas: number
  /** Venta con IVA 19% (lo que paga el cliente / lo que se factura a MABE con IVA). */
  ventasConIva: number
  /** Costo directo: pago al técnico. */
  pagoTecnicos: number
  /** ventas − pagoTecnicos. */
  utilidad: number
  /** utilidad / ventas (0–1); 0 si no hay ventas. */
  margen: number
  /** Servicios cuya venta se estimó (garantía sin complejidad en diagnóstico). */
  estimados: number
  /** Recaudo online Wompi aprobado sobre estos servicios (solo particular). */
  recaudadoOnline: number
}

export interface CifrasPeriodo {
  garantia: CifrasFlujo
  particular: CifrasFlujo
  total: CifrasFlujo
  /** Participación de cada flujo sobre el total (0–1). */
  mix: {
    serviciosGarantia: number
    serviciosParticular: number
    ventasGarantia: number
    ventasParticular: number
    utilidadGarantia: number
    utilidadParticular: number
  }
}

export interface ResumenFinanciero {
  desde: string
  hasta: string
  periodo: CifrasPeriodo
  /** Un registro por mes (YYYY-MM) con cierres en el rango, ascendente. */
  meses: Array<{ mes: string } & CifrasPeriodo>
}

const CALIFICACION_RE = /Calificacion:\s*(\d{1,2})\/10/
const MS_DIA = 24 * 60 * 60 * 1000

function cifrasVacias(): CifrasFlujo {
  return { servicios: 0, ventas: 0, ventasConIva: 0, pagoTecnicos: 0, utilidad: 0, margen: 0, estimados: 0, recaudadoOnline: 0 }
}

/** Fecha de cierre efectiva del servicio (ISO), con los fallbacks de liquidaciones. */
export function fechaCierreServicio(sol: SolicitudFinanzas, ev: EvidenciaFinanzas | undefined): string {
  if (ev?.completado_at) return ev.completado_at
  if (ev?.confirmado_at) return ev.confirmado_at
  if (sol.diagnosticado_at) return sol.diagnosticado_at
  return sol.created_at
}

function diasSolucion(sol: SolicitudFinanzas, cierreIso: string): number {
  const inicio = new Date(sol.created_at).getTime()
  const fin = new Date(cierreIso).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) {
    return Number(sol.triaje_resultado?.dias_transcurridos ?? 0) || 0
  }
  let pausaMs = 0
  if (sol.siguiente_paso === 'esperar_repuesto' && sol.siguiente_paso_at && sol.repuesto_recibido_at) {
    const p0 = new Date(sol.siguiente_paso_at).getTime()
    const p1 = new Date(sol.repuesto_recibido_at).getTime()
    if (Number.isFinite(p0) && Number.isFinite(p1) && p1 > p0) pausaMs = p1 - p0
  }
  return Math.max(0, Math.round(((fin - inicio - pausaMs) / MS_DIA) * 10) / 10)
}

function encuestaContestada(ev: EvidenciaFinanzas | undefined): boolean {
  return ev?.confirmado === true && CALIFICACION_RE.test(ev.cliente_comentario ?? '')
}

export interface CifrasServicio {
  ventas: number
  ventasConIva: number
  pagoTecnico: number
  estimado: boolean
  /** Snapshot del cálculo (lo persiste la liquidación de técnicos). */
  detalle: Record<string, unknown>
}

/** Venta neta, venta con IVA y pago técnico de UN servicio completado. */
export function cifrasServicio(
  sol: SolicitudFinanzas,
  ev: EvidenciaFinanzas | undefined,
  cierreIso: string,
): CifrasServicio {
  if (sol.es_garantia) {
    const complejidad = sol.triaje_resultado?.complejidad as ComplejidadServicio | undefined
    if (complejidad && ['baja', 'media', 'alta'].includes(complejidad)) {
      const r = calcularTarifaMABE({
        complejidad,
        diasSolucion: diasSolucion(sol, cierreIso),
        cumpleTA: sol.cumple_ta ?? true,
        cumpleEncuesta: encuestaContestada(ev),
        esFinDeSemana: (sol.recargo_weekend_aplicado ?? 0) > 0,
      })
      return {
        ventas: r.totalMABE,
        ventasConIva: Math.round(r.totalMABE * (1 + IVA_TARIFA)),
        pagoTecnico: r.pagoTecnico,
        estimado: false,
        detalle: {
          flujo: 'garantia',
          complejidad,
          dias: diasSolucion(sol, cierreIso),
          encuesta: encuestaContestada(ev),
          ta: sol.cumple_ta ?? true,
          tarifaBase: r.tarifaBase,
          bono: r.bono,
          recargoWeekend: r.recargoWeekend,
        },
      }
    }
    // Sin complejidad: el pago proyectado es el 78% de la tarifa → se infiere la venta.
    const pago = Math.max(0, sol.pago_tecnico ?? 0)
    const ventas = Math.round(pago / (1 - MARGEN_BAIRD_GARANTIA))
    return {
      ventas,
      ventasConIva: Math.round(ventas * (1 + IVA_TARIFA)),
      pagoTecnico: pago,
      estimado: true,
      detalle: { flujo: 'garantia', estimado: true, origen: 'pago_tecnico proyectado (sin complejidad)' },
    }
  }

  const totalBruto = precioClienteServicio(
    sol.tipo_equipo,
    sol.tipo_solicitud,
    sol.es_garantia,
    sol.cotizacion as { total?: number | null } | null,
    sol.recargo_weekend_aplicado,
  )
  // Código de descuento (2026-10-19): Baird lo asume. La venta neta es
  // total − descuento; con descuento la base se deriva del neto (la
  // base_venta persistida en la cotización es la bruta).
  const descuento = montoDescuento(totalBruto, descuentoDeSolicitud(sol))
  const totalCliente = Math.max(0, totalBruto - descuento)
  const baseVenta = descuento === 0 && Number(sol.cotizacion?.base_venta ?? 0) > 0
    ? Number(sol.cotizacion?.base_venta)
    : Math.round(totalCliente / (1 + IVA_TARIFA))
  return {
    ventas: baseVenta,
    ventasConIva: totalCliente,
    pagoTecnico: Math.max(0, sol.pago_tecnico ?? 0),
    estimado: false,
    detalle: {
      flujo: 'particular',
      origen: 'pago_tecnico persistido (costo cotizado + recargo)',
      totalCliente,
      recargoWeekend: sol.recargo_weekend_aplicado ?? 0,
      ...(descuento > 0 ? { totalBruto, descuento, codigoDescuento: sol.descuento_codigo ?? null } : {}),
    },
  }
}

function acumular(acc: CifrasFlujo, c: CifrasServicio, recaudado: number): void {
  acc.servicios += 1
  acc.ventas += c.ventas
  acc.ventasConIva += c.ventasConIva
  acc.pagoTecnicos += c.pagoTecnico
  acc.utilidad += c.ventas - c.pagoTecnico
  if (c.estimado) acc.estimados += 1
  acc.recaudadoOnline += recaudado
}

function cerrarPeriodo(g: CifrasFlujo, p: CifrasFlujo): CifrasPeriodo {
  const total: CifrasFlujo = {
    servicios: g.servicios + p.servicios,
    ventas: g.ventas + p.ventas,
    ventasConIva: g.ventasConIva + p.ventasConIva,
    pagoTecnicos: g.pagoTecnicos + p.pagoTecnicos,
    utilidad: g.utilidad + p.utilidad,
    margen: 0,
    estimados: g.estimados + p.estimados,
    recaudadoOnline: g.recaudadoOnline + p.recaudadoOnline,
  }
  for (const f of [g, p, total]) f.margen = f.ventas > 0 ? f.utilidad / f.ventas : 0
  const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0)
  return {
    garantia: g,
    particular: p,
    total,
    mix: {
      serviciosGarantia: share(g.servicios, p.servicios),
      serviciosParticular: share(p.servicios, g.servicios),
      ventasGarantia: share(g.ventas, p.ventas),
      ventasParticular: share(p.ventas, g.ventas),
      utilidadGarantia: share(g.utilidad, p.utilidad),
      utilidadParticular: share(p.utilidad, g.utilidad),
    },
  }
}

/**
 * Agrega los servicios completados cuyo cierre cae entre `desde` y `hasta`
 * (YYYY-MM-DD, día calendario Colombia, inclusive).
 */
export function calcularResumenFinanciero(params: {
  solicitudes: SolicitudFinanzas[]
  evidencias: EvidenciaFinanzas[]
  pagos?: PagoFinanzas[]
  desde: string
  hasta: string
}): ResumenFinanciero {
  const { solicitudes, evidencias, pagos = [], desde, hasta } = params

  const evidenciaMap = new Map<string, EvidenciaFinanzas>()
  for (const ev of evidencias) {
    const previa = evidenciaMap.get(ev.solicitud_id)
    if (!previa || (!previa.completado_at && ev.completado_at)) evidenciaMap.set(ev.solicitud_id, ev)
  }
  const recaudoMap = new Map<string, number>()
  for (const p of pagos) recaudoMap.set(p.solicitud_id, (recaudoMap.get(p.solicitud_id) ?? 0) + (p.monto ?? 0))

  const periodoG = cifrasVacias()
  const periodoP = cifrasVacias()
  const porMes = new Map<string, { g: CifrasFlujo; p: CifrasFlujo }>()

  for (const sol of solicitudes) {
    if (sol.estado !== 'completada') continue
    const ev = evidenciaMap.get(sol.id)
    const cierreIso = fechaCierreServicio(sol, ev)
    const ymd = fechaColombiaYMD(new Date(cierreIso))
    if (ymd < desde || ymd > hasta) continue

    const c = cifrasServicio(sol, ev, cierreIso)
    const recaudado = sol.es_garantia ? 0 : (recaudoMap.get(sol.id) ?? 0)
    const mes = ymd.slice(0, 7)
    const bucket = porMes.get(mes) ?? { g: cifrasVacias(), p: cifrasVacias() }
    porMes.set(mes, bucket)
    if (sol.es_garantia) {
      acumular(periodoG, c, recaudado)
      acumular(bucket.g, c, recaudado)
    } else {
      acumular(periodoP, c, recaudado)
      acumular(bucket.p, c, recaudado)
    }
  }

  const meses = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, { g, p }]) => ({ mes, ...cerrarPeriodo(g, p) }))

  return { desde, hasta, periodo: cerrarPeriodo(periodoG, periodoP), meses }
}
