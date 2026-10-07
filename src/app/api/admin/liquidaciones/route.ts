import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { calcularTarifaMABE, type ComplejidadServicio } from '@/lib/constants/tarifas/mabe'
import { precioClienteServicio, IVA_TARIFA } from '@/types/solicitud'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'
import {
  SIIGO,
  codigoServicio,
  identificacionCliente,
  itemsFacturaParticular,
  formaPagoSugerida,
  desglosarIva,
  superaBaseRetefuente,
  RETEFUENTE_SERVICIOS_BASE_MINIMA,
} from '@/lib/utils/facturacion'

/**
 * NIT de la marca a la que se factura la garantía (MABE). Se configura por
 * env var para no hardcodear un tercero fiscal en el código; si falta, la
 * hoja "FV MABE" lo deja explícito para que contabilidad lo complete.
 */
const FACTURACION_MABE_NIT = process.env.FACTURACION_MABE_NIT?.trim() || ''
const FACTURACION_MABE_NOMBRE = process.env.FACTURACION_MABE_NOMBRE?.trim() || 'MABE COLOMBIA S.A.S.'

export const maxDuration = 60

/**
 * POST /api/admin/liquidaciones
 *
 * Genera un Excel descargable con la liquidación de servicios COMPLETADOS
 * en un rango de fechas (corte por fecha de cierre, TZ America/Bogota):
 *
 *   - tipo 'tecnicos':   cuánto debe pagarle Baird a cada técnico.
 *   - tipo 'mabe':       cuánto debe facturarle Baird a MABE (garantías).
 *   - tipo 'particular': ventas a clientes particulares (base/IVA/recaudo).
 *   - tipo 'facturacion': paquete para CONTABILIDAD (Siigo) — ver
 *     docs/FACTURACION.md: renglones de FV por cliente particular (tercero,
 *     ítem, base, IVA, forma de pago), FV consolidada a MABE con su relación
 *     de órdenes, ledger de TODOS los pagos Wompi del período (cada pago ↔
 *     su servicio) y checklist de datos faltantes.
 *
 * La hoja "Documento soporte" del tipo 'tecnicos' resume por técnico lo que
 * contabilidad necesita para el documento soporte DIAN (no obligados a
 * facturar) y marca si el pago supera la base mínima de retefuente.
 *
 * Fecha de cierre de cada servicio = evidencias.completado_at →
 * evidencias.confirmado_at → diagnosticado_at → created_at (fallbacks para
 * no dejar servicios por fuera silenciosamente; la columna "Fecha cierre"
 * siempre muestra la usada).
 *
 * Garantía MABE — reconstrucción con calcularTarifaMABE (misma fórmula del
 * diagnóstico y del detalle admin), pero con datos REALES del cierre:
 *   - cumple_encuesta: el cliente confirmó en /confirmar/{token} dejando
 *     calificación ("Calificacion: N/10" en evidencias.cliente_comentario).
 *   - días de solución: creación → cierre, pausando la espera de repuesto
 *     (siguiente_paso_at → repuesto_recibido_at) según docs/TARIFAS.md.
 *   - cumple_ta: columna dedicada (mig 20260513_tracking_ta).
 * El `pago_tecnico` persistido es la PROYECCIÓN del diagnóstico (asume
 * encuesta contestada); acá se muestran ambos: proyectado y consolidado.
 *
 * Body: { tipo, desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD', tecnico_id? }
 */

const bodySchema = z
  .object({
    tipo: z.enum(['tecnicos', 'mabe', 'particular', 'facturacion']),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
    tecnico_id: z.string().uuid().optional(),
    /**
     * Ficha por servicio (docs/FACTURACION.md § 3): con solicitud_id el corte
     * es esa sola solicitud, en cualquier estado, sin filtro de fechas — la
     * venta al cliente es un registro independiente por servicio.
     */
    solicitud_id: z.string().uuid().optional(),
  })
  .refine((b) => b.solicitud_id || (b.desde && b.hasta), { message: 'desde y hasta son requeridos' })

type Row = Record<string, unknown>

const CALIFICACION_RE = /Calificacion:\s*(\d{1,2})\/10/

const MS_DIA = 24 * 60 * 60 * 1000

function fmtFecha(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return String(value)
  }
}

interface Evidencia {
  solicitud_id: string
  completado_at: string | null
  confirmado: boolean | null
  confirmado_at: string | null
  cliente_comentario: string | null
}

interface SolicitudLiquidacion {
  id: string
  created_at: string
  es_garantia: boolean
  cliente_nombre: string
  cliente_telefono: string
  cliente_cedula: string | null
  ciudad_pueblo: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  numero_serie_factura: string | null
  direccion: string | null
  estado: string
  pago_tecnico: number | null
  tecnico_asignado_id: string | null
  triaje_resultado: Record<string, unknown> | null
  cotizacion: Record<string, unknown> | null
  recargo_weekend_aplicado: number | null
  cumple_ta: boolean | null
  diagnosticado_at: string | null
  siguiente_paso: string | null
  siguiente_paso_at: string | null
  repuesto_recibido_at: string | null
  anticipo_pagado_at: string | null
  saldo_pagado_at: string | null
}

/** Fecha de cierre efectiva del servicio (con fallbacks explícitos). */
function fechaCierre(sol: SolicitudLiquidacion, ev: Evidencia | undefined): { iso: string; origen: string } {
  if (ev?.completado_at) return { iso: ev.completado_at, origen: 'completado' }
  if (ev?.confirmado_at) return { iso: ev.confirmado_at, origen: 'confirmación cliente' }
  if (sol.diagnosticado_at) return { iso: sol.diagnosticado_at, origen: 'diagnóstico' }
  return { iso: sol.created_at, origen: 'creación' }
}

/**
 * Días de solución para el bono MABE: creación → cierre, restando la pausa
 * de espera de repuesto (diagnóstico con esperar_repuesto → repuesto recibido).
 * Fallback: dias_transcurridos registrados en el diagnóstico.
 */
function diasSolucion(sol: SolicitudLiquidacion, cierreIso: string): number {
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
  const dias = (fin - inicio - pausaMs) / MS_DIA
  return Math.max(0, Math.round(dias * 10) / 10)
}

function encuestaDeEvidencia(ev: Evidencia | undefined): { contestada: boolean; calificacion: number | null } {
  const match = ev?.cliente_comentario?.match(CALIFICACION_RE)
  if (ev?.confirmado === true && match) {
    return { contestada: true, calificacion: Number(match[1]) }
  }
  return { contestada: false, calificacion: null }
}

/** Suma una fila TOTAL al final con la suma de las columnas numéricas dadas. */
function agregarTotales(rows: Row[], columnasSuma: string[], etiquetaCol: string): void {
  if (rows.length === 0) return
  const total: Row = { [etiquetaCol]: `TOTAL (${rows.length} servicios)` }
  for (const col of columnasSuma) {
    total[col] = rows.reduce((acc, r) => acc + (typeof r[col] === 'number' ? (r[col] as number) : 0), 0)
  }
  rows.push(total)
}

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos: tipo, desde y hasta (YYYY-MM-DD) son requeridos' }, { status: 400 })
    }
    const { tipo, tecnico_id, solicitud_id } = parsed.data
    const desde = parsed.data.desde ?? '0000-01-01'
    const hasta = parsed.data.hasta ?? '9999-12-31'
    if (desde > hasta) {
      return NextResponse.json({ error: '"desde" no puede ser posterior a "hasta"' }, { status: 400 })
    }
    const fichaServicio = Boolean(solicitud_id)

    // 1. Servicios completados (tope defensivo, mismo patrón que /api/admin/export)
    let solQuery = supabase
      .from('solicitudes_servicio')
      .select('id, created_at, es_garantia, cliente_nombre, cliente_telefono, cliente_cedula, ciudad_pueblo, tipo_equipo, marca_equipo, tipo_solicitud, numero_serie_factura, direccion, estado, pago_tecnico, tecnico_asignado_id, triaje_resultado, cotizacion, recargo_weekend_aplicado, cumple_ta, diagnosticado_at, siguiente_paso, siguiente_paso_at, repuesto_recibido_at, anticipo_pagado_at, saldo_pagado_at')
      .order('created_at', { ascending: false })
      .limit(5000)

    // Ficha por servicio: esa solicitud en cualquier estado (la hoja
    // Parámetros deja el estado explícito). Cortes de período: solo completadas.
    if (solicitud_id) solQuery = solQuery.eq('id', solicitud_id)
    else solQuery = solQuery.eq('estado', 'completada')
    if (tipo === 'mabe') solQuery = solQuery.eq('es_garantia', true)
    if (tipo === 'particular') solQuery = solQuery.eq('es_garantia', false)
    if (tecnico_id) solQuery = solQuery.eq('tecnico_asignado_id', tecnico_id)

    const { data: solicitudesRaw, error: solErr } = await solQuery
    if (solErr) {
      return NextResponse.json({ error: `Error cargando solicitudes: ${solErr.message}` }, { status: 500 })
    }
    const solicitudes = (solicitudesRaw ?? []) as unknown as SolicitudLiquidacion[]
    // 'facturacion' incluye el ledger de pagos, que puede tener movimientos
    // aunque no haya servicios completados en el rango — no se corta acá.
    if (solicitudes.length === 0 && tipo !== 'facturacion') {
      return NextResponse.json({ error: 'No hay servicios completados con esos filtros' }, { status: 404 })
    }

    const solIds = solicitudes.map((s) => s.id)

    // 2. Evidencias (fecha de completado + confirmación/encuesta del cliente)
    const { data: evidenciasRaw } = await supabase
      .from('evidencias_servicio')
      .select('solicitud_id, completado_at, confirmado, confirmado_at, cliente_comentario')
      .in('solicitud_id', solIds)

    const evidenciaMap = new Map<string, Evidencia>()
    for (const ev of (evidenciasRaw ?? []) as Evidencia[]) {
      // Si hay varias evidencias, gana la que tenga completado_at.
      const previa = evidenciaMap.get(ev.solicitud_id)
      if (!previa || (!previa.completado_at && ev.completado_at)) {
        evidenciaMap.set(ev.solicitud_id, ev)
      }
    }

    // 3. Filtrar por fecha de cierre (día calendario Colombia)
    const enRango = solicitudes
      .map((sol) => {
        const ev = evidenciaMap.get(sol.id)
        const cierre = fechaCierre(sol, ev)
        return { sol, ev, cierre, ymd: fechaColombiaYMD(new Date(cierre.iso)) }
      })
      .filter((x) => fichaServicio || (x.ymd >= desde && x.ymd <= hasta))
      .sort((a, b) => a.cierre.iso.localeCompare(b.cierre.iso))

    if (enRango.length === 0 && tipo !== 'facturacion') {
      return NextResponse.json({ error: `No hay servicios completados entre ${desde} y ${hasta}` }, { status: 404 })
    }

    // 4. Técnicos
    const tecnicoIds = [...new Set(enRango.map((x) => x.sol.tecnico_asignado_id).filter(Boolean))] as string[]
    const tecnicoMap = new Map<string, { nombre_completo: string; whatsapp: string; tipo_documento: string | null; numero_documento: string | null; ciudad_pueblo: string }>()
    if (tecnicoIds.length > 0) {
      const { data: tecs } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo, whatsapp, tipo_documento, numero_documento, ciudad_pueblo')
        .in('id', tecnicoIds)
      for (const t of tecs ?? []) tecnicoMap.set(t.id, t)
    }

    // 5. Reconstrucción garantía (compartida por 'tecnicos' y 'mabe')
    const garantiaConsolidada = (x: (typeof enRango)[number]) => {
      const { sol, ev, cierre } = x
      const complejidad = sol.triaje_resultado?.complejidad as ComplejidadServicio | undefined
      if (!complejidad || !['baja', 'media', 'alta'].includes(complejidad)) return null
      const encuesta = encuestaDeEvidencia(ev)
      const dias = diasSolucion(sol, cierre.iso)
      const r = calcularTarifaMABE({
        complejidad,
        diasSolucion: dias,
        // Sin tracking de TA (solicitudes viejas) se asume cumplido — mismo
        // criterio del detalle admin. La columna "TA" muestra el dato crudo.
        cumpleTA: sol.cumple_ta ?? true,
        cumpleEncuesta: encuesta.contestada,
        esFinDeSemana: (sol.recargo_weekend_aplicado ?? 0) > 0,
      })
      return { r, complejidad, dias, encuesta }
    }

    const wb = XLSX.utils.book_new()
    const rango = fichaServicio ? `servicio ${codigoServicio(solicitud_id!)}` : `${desde} a ${hasta}`

    // ─────────────────────────────────────────────────────────────
    // TIPO 1: Liquidación por técnico
    // ─────────────────────────────────────────────────────────────
    if (tipo === 'tecnicos') {
      const detalle: Row[] = enRango.map((x) => {
        const { sol, cierre } = x
        const tec = sol.tecnico_asignado_id ? tecnicoMap.get(sol.tecnico_asignado_id) : null
        const consolidado = sol.es_garantia ? garantiaConsolidada(x) : null
        const pagoProyectado = sol.pago_tecnico ?? 0
        // Garantía: el consolidado usa encuesta/días/TA reales del cierre.
        // Particular: el pago persistido ya es exacto (costo cotizado + recargo).
        const pagoAPagar = sol.es_garantia && consolidado ? consolidado.r.pagoTecnico : pagoProyectado
        return {
          'Fecha cierre': fmtFecha(cierre.iso),
          'Técnico': tec?.nombre_completo ?? '(sin asignar)',
          'Documento': tec?.numero_documento ?? '',
          'Cliente': sol.cliente_nombre,
          'Ciudad': sol.ciudad_pueblo,
          'Equipo': `${sol.tipo_equipo} ${sol.marca_equipo}`,
          'Flujo': sol.es_garantia ? 'Garantía' : 'Particular',
          'Tipo solicitud': sol.tipo_solicitud,
          'Pago proyectado BD (COP)': pagoProyectado,
          'Pago consolidado (COP)': pagoAPagar,
          'Nota': sol.es_garantia && !consolidado ? 'Garantía sin complejidad en diagnóstico — revisar' : '',
          'Solicitud ID': sol.id,
        }
      })

      // Resumen por técnico
      const porTecnico = new Map<string, { nombre: string; doc: string; whatsapp: string; garantia: number; particular: number; total: number }>()
      for (const x of enRango) {
        const key = x.sol.tecnico_asignado_id ?? 'sin-asignar'
        const tec = x.sol.tecnico_asignado_id ? tecnicoMap.get(x.sol.tecnico_asignado_id) : null
        const acc = porTecnico.get(key) ?? {
          nombre: tec?.nombre_completo ?? '(sin asignar)',
          doc: tec?.numero_documento ?? '',
          whatsapp: tec?.whatsapp ?? '',
          garantia: 0,
          particular: 0,
          total: 0,
        }
        const consolidado = x.sol.es_garantia ? garantiaConsolidada(x) : null
        const pago = x.sol.es_garantia && consolidado ? consolidado.r.pagoTecnico : (x.sol.pago_tecnico ?? 0)
        if (x.sol.es_garantia) acc.garantia += 1
        else acc.particular += 1
        acc.total += pago
        porTecnico.set(key, acc)
      }
      const resumen: Row[] = [...porTecnico.values()]
        .sort((a, b) => b.total - a.total)
        .map((t) => ({
          'Técnico': t.nombre,
          'Documento': t.doc,
          'WhatsApp': t.whatsapp,
          'Servicios garantía': t.garantia,
          'Servicios particular': t.particular,
          'Total servicios': t.garantia + t.particular,
          'Total a pagar (COP)': t.total,
        }))
      agregarTotales(resumen, ['Servicios garantía', 'Servicios particular', 'Total servicios', 'Total a pagar (COP)'], 'Técnico')
      agregarTotales(detalle, ['Pago proyectado BD (COP)', 'Pago consolidado (COP)'], 'Fecha cierre')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen por técnico')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle servicios')

      // Documento soporte DIAN (adquisiciones con no obligados a facturar):
      // una fila por técnico con lo que contabilidad captura en Siigo. La
      // retención NO se calcula acá (4% declarante / 6% no declarante la
      // decide contabilidad por técnico); solo se marca si el pago de la
      // quincena supera la base mínima de 4 UVT por servicios.
      const soporte: Row[] = [...porTecnico.entries()]
        .filter(([key]) => key !== 'sin-asignar')
        .map(([key, t]) => {
          const tec = tecnicoMap.get(key)
          const servicios = enRango.filter((x) => x.sol.tecnico_asignado_id === key)
          return {
            'Técnico (tercero)': t.nombre,
            'Tipo documento': tec?.tipo_documento ?? 'CC',
            'Número documento': t.doc,
            'Ciudad': tec?.ciudad_pueblo ?? '',
            'WhatsApp': t.whatsapp,
            'Concepto': `Servicios técnicos de reparación línea blanca — ${servicios.length} servicio(s) del ${rango}`,
            'Servicios (códigos)': servicios.map((x) => codigoServicio(x.sol.id)).join(', '),
            'Valor a pagar (COP)': t.total,
            'Supera base retefuente (4 UVT)': superaBaseRetefuente(t.total) ? 'Sí — aplicar tarifa según técnico' : 'No',
            'Base mínima retefuente (COP)': RETEFUENTE_SERVICIOS_BASE_MINIMA,
            'Retención aplicada (COP)': '',
            'Neto girado (COP)': '',
            'Fecha de pago': '',
            'Nota': 'Técnico persona natural no obligado a facturar → documento soporte electrónico en Siigo por cada pago. Completar retención/neto/fecha al girar.',
          }
        })
      if (soporte.length > 0) {
        agregarTotales(soporte, ['Valor a pagar (COP)'], 'Técnico (tercero)')
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(soporte), 'Documento soporte')
      }
    }

    // ─────────────────────────────────────────────────────────────
    // TIPO 2: Liquidación MABE (lo que la marca le debe a Baird)
    // ─────────────────────────────────────────────────────────────
    if (tipo === 'mabe') {
      const rows: Row[] = enRango.map((x) => {
        const { sol, cierre } = x
        const tec = sol.tecnico_asignado_id ? tecnicoMap.get(sol.tecnico_asignado_id) : null
        const consolidado = garantiaConsolidada(x)
        if (!consolidado) {
          return {
            'N° orden MABE': sol.numero_serie_factura ?? '',
            'Fecha cierre': fmtFecha(cierre.iso),
            'Cliente': sol.cliente_nombre,
            'Ciudad': sol.ciudad_pueblo,
            'Equipo': `${sol.tipo_equipo} ${sol.marca_equipo}`,
            'Técnico': tec?.nombre_completo ?? '',
            'Nota': 'Sin complejidad en diagnóstico — no se pudo liquidar, revisar manualmente',
            'Solicitud ID': sol.id,
          }
        }
        const { r, complejidad, dias, encuesta } = consolidado
        return {
          'N° orden MABE': sol.numero_serie_factura ?? '',
          'Fecha cierre': fmtFecha(cierre.iso),
          'Cliente': sol.cliente_nombre,
          'Ciudad': sol.ciudad_pueblo,
          'Equipo': `${sol.tipo_equipo} ${sol.marca_equipo}`,
          'Técnico': tec?.nombre_completo ?? '',
          'Complejidad': complejidad,
          'Días solución': dias,
          'TA cumplido': sol.cumple_ta === null ? '— (asumido sí)' : sol.cumple_ta ? 'Sí' : 'No',
          'Encuesta contestada': encuesta.contestada ? 'Sí' : 'No',
          'Calificación cliente': encuesta.calificacion ?? '',
          'Fin de semana/festivo': r.recargoWeekend > 0 ? 'Sí' : 'No',
          'Tarifa base (COP)': r.tarifaBase,
          'Bono (COP)': r.bono,
          'Recargo finde (COP)': r.recargoWeekend,
          'TOTAL A FACTURAR A MABE (COP)': r.totalMABE,
          'Pago técnico (COP)': r.pagoTecnico,
          'Margen Baird (COP)': r.margenBaird,
          'Nota': '',
          'Solicitud ID': sol.id,
        }
      })
      agregarTotales(rows, ['Tarifa base (COP)', 'Bono (COP)', 'Recargo finde (COP)', 'TOTAL A FACTURAR A MABE (COP)', 'Pago técnico (COP)', 'Margen Baird (COP)'], 'N° orden MABE')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Liquidación MABE')
    }

    // ─────────────────────────────────────────────────────────────
    // TIPO 3: Liquidación servicios particulares
    // ─────────────────────────────────────────────────────────────
    if (tipo === 'particular') {
      // Recaudo online (Wompi) — solo transacciones APPROVED
      const pagosPorSolicitud = new Map<string, { anticipo: number; abono: number; saldo: number }>()
      const { data: pagos } = await supabase
        .from('pagos')
        .select('solicitud_id, tipo, monto')
        .in('solicitud_id', enRango.map((x) => x.sol.id))
        .eq('estado', 'APPROVED')
      for (const p of pagos ?? []) {
        const acc = pagosPorSolicitud.get(p.solicitud_id) ?? { anticipo: 0, abono: 0, saldo: 0 }
        if (p.tipo === 'anticipo') acc.anticipo += p.monto ?? 0
        else if (p.tipo === 'abono') acc.abono += p.monto ?? 0
        else if (p.tipo === 'saldo') acc.saldo += p.monto ?? 0
        pagosPorSolicitud.set(p.solicitud_id, acc)
      }

      const rows: Row[] = enRango.map((x) => {
        const { sol, cierre } = x
        const tec = sol.tecnico_asignado_id ? tecnicoMap.get(sol.tecnico_asignado_id) : null
        const totalCliente = precioClienteServicio(
          sol.tipo_equipo,
          sol.tipo_solicitud,
          sol.es_garantia,
          sol.cotizacion as { total?: number | null } | null,
          sol.recargo_weekend_aplicado,
        )
        // Desglose DIAN: si la cotización persistió base/IVA se usan; si no,
        // se derivan del total (precio con IVA incluido) — mismo criterio
        // del detalle admin ("Cuentas del servicio").
        const cot = sol.cotizacion
        const baseVenta = Number(cot?.base_venta ?? 0) > 0
          ? Number(cot?.base_venta)
          : Math.round(totalCliente / (1 + IVA_TARIFA))
        const ivaVenta = Number(cot?.iva_venta ?? 0) > 0 ? Number(cot?.iva_venta) : totalCliente - baseVenta
        const pagoTec = sol.pago_tecnico ?? 0
        const online = pagosPorSolicitud.get(sol.id) ?? { anticipo: 0, abono: 0, saldo: 0 }
        const recaudado = online.anticipo + online.abono + online.saldo
        return {
          'Fecha cierre': fmtFecha(cierre.iso),
          'Cliente': sol.cliente_nombre,
          'Cédula/NIT': sol.cliente_cedula ?? '(consumidor final)',
          'Teléfono': sol.cliente_telefono,
          'Ciudad': sol.ciudad_pueblo,
          'Equipo': `${sol.tipo_equipo} ${sol.marca_equipo}`,
          'Tipo solicitud': sol.tipo_solicitud,
          'Técnico': tec?.nombre_completo ?? '',
          'Total cliente (COP)': totalCliente,
          'Base gravable (COP)': baseVenta,
          'IVA 19% (COP)': ivaVenta,
          'Pago técnico (COP)': pagoTec,
          'Margen Baird (COP)': Math.max(0, baseVenta - pagoTec),
          'Anticipo online (COP)': online.anticipo,
          'Abono repuestos online (COP)': online.abono,
          'Saldo online (COP)': online.saldo,
          'Recaudado online (COP)': recaudado,
          'Pendiente / por fuera (COP)': Math.max(0, totalCliente - recaudado),
          'Solicitud ID': sol.id,
        }
      })
      agregarTotales(rows, [
        'Total cliente (COP)', 'Base gravable (COP)', 'IVA 19% (COP)', 'Pago técnico (COP)',
        'Margen Baird (COP)', 'Anticipo online (COP)', 'Abono repuestos online (COP)',
        'Saldo online (COP)', 'Recaudado online (COP)', 'Pendiente / por fuera (COP)',
      ], 'Fecha cierre')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Liquidación particulares')
    }

    // ─────────────────────────────────────────────────────────────
    // TIPO 4: Paquete de facturación para contabilidad (Siigo)
    // ─────────────────────────────────────────────────────────────
    if (tipo === 'facturacion') {
      // Recaudo online por servicio completado (para forma de pago de la FV)
      const pagosPorSolicitud = new Map<string, number>()
      if (enRango.length > 0) {
        const { data: pagosCerrados } = await supabase
          .from('pagos')
          .select('solicitud_id, monto')
          .in('solicitud_id', enRango.map((x) => x.sol.id))
          .eq('estado', 'APPROVED')
        for (const p of pagosCerrados ?? []) {
          pagosPorSolicitud.set(p.solicitud_id, (pagosPorSolicitud.get(p.solicitud_id) ?? 0) + (p.monto ?? 0))
        }
      }

      // 4a. FV a clientes particulares — un renglón por ÍTEM de factura
      const fvParticular: Row[] = []
      const faltantes: Row[] = []
      for (const x of enRango.filter((x) => !x.sol.es_garantia)) {
        const { sol, cierre } = x
        const tec = sol.tecnico_asignado_id ? tecnicoMap.get(sol.tecnico_asignado_id) : null
        const totalCliente = precioClienteServicio(
          sol.tipo_equipo, sol.tipo_solicitud, sol.es_garantia,
          sol.cotizacion as { total?: number | null } | null, sol.recargo_weekend_aplicado,
        )
        const ident = identificacionCliente(sol.cliente_cedula)
        const recaudado = pagosPorSolicitud.get(sol.id) ?? 0
        const pago = formaPagoSugerida(totalCliente, recaudado)
        const items = itemsFacturaParticular(sol, totalCliente)
        const codigo = codigoServicio(sol.id)
        items.forEach((item, i) => {
          fvParticular.push({
            'Código servicio': codigo,
            'Fecha factura (cierre)': fechaColombiaYMD(new Date(cierre.iso)),
            'Tipo comprobante Siigo': `FV-2 electrónica (${SIIGO.DOC_FV_ELECTRONICA})`,
            'Tipo ID cliente': `${ident.tipoNombre} (${ident.tipoCodigo})${ident.verificar ? ' — verificar' : ''}`,
            'Identificación': ident.identificacion,
            'Nombre cliente': ident.tipoNombre === 'Consumidor final' ? `CONSUMIDOR FINAL (${sol.cliente_nombre})` : sol.cliente_nombre,
            'Teléfono': sol.cliente_telefono,
            'Email': '',
            'Dirección': sol.direccion ?? '',
            'Ciudad': sol.ciudad_pueblo,
            'Ítem #': i + 1,
            'Código ítem Siigo': item.codigo,
            'Descripción ítem': `${item.descripcion} · ${codigo}`,
            'Cantidad': item.cantidad,
            'Precio unitario base (sin IVA)': item.base,
            'Impuesto Siigo': `IVA 19% (${SIIGO.IMPUESTO_IVA_19})`,
            'Valor IVA': item.iva,
            'Total ítem (con IVA)': item.total,
            'Total factura (con IVA)': i === 0 ? totalCliente : '',
            'Forma de pago Siigo': i === 0 ? `${pago.nombre} (${pago.id})` : '',
            'Recaudado Wompi (COP)': i === 0 ? recaudado : '',
            'Pendiente por fuera (COP)': i === 0 ? pago.pendiente : '',
            'Vendedor Siigo': SIIGO.SELLER_FV2,
            'Observaciones': `${codigo} · ${sol.tipo_solicitud} ${sol.tipo_equipo} ${sol.marca_equipo} · Técnico: ${tec?.nombre_completo ?? '—'} · Ref. Wompi: *-${sol.id}`,
            'Solicitud ID': sol.id,
          })
        })
        const faltas: string[] = []
        if (!sol.cliente_cedula) faltas.push('Sin cédula/NIT → consumidor final')
        faltas.push('Sin email del cliente (no se captura) → factura electrónica sin envío al cliente')
        if (ident.verificar) faltas.push('Tipo de documento inferido como NIT — confirmar')
        if (items.length === 1 && sol.cotizacion) faltas.push('Cotización sin desglose diagnóstico/servicio (anterior a 2026-08-25) → 1 ítem')
        if (pago.pendiente > 0) faltas.push(`Saldo por fuera de Wompi: $${pago.pendiente} — confirmar cómo se cobró`)
        faltantes.push({
          'Código servicio': codigo,
          'Flujo': 'Particular',
          'Cliente': sol.cliente_nombre,
          'Pendientes para facturar': faltas.join(' | '),
          'Solicitud ID': sol.id,
        })
      }
      if (fvParticular.length > 0) {
        agregarTotales(fvParticular, ['Precio unitario base (sin IVA)', 'Valor IVA', 'Total ítem (con IVA)', 'Total factura (con IVA)', 'Recaudado Wompi (COP)', 'Pendiente por fuera (COP)'], 'Código servicio')
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(fvParticular.length > 0 ? fvParticular : [{ Nota: `Sin servicios particulares completados entre ${desde} y ${hasta}` }]),
        'FV particulares',
      )

      // 4b. FV consolidada a MABE + relación de órdenes (anexo)
      const relacionMABE: Row[] = []
      let totalMABEBase = 0
      for (const x of enRango.filter((x) => x.sol.es_garantia)) {
        const { sol, cierre } = x
        const tec = sol.tecnico_asignado_id ? tecnicoMap.get(sol.tecnico_asignado_id) : null
        const consolidado = garantiaConsolidada(x)
        const codigo = codigoServicio(sol.id)
        if (!consolidado) {
          faltantes.push({
            'Código servicio': codigo,
            'Flujo': 'Garantía',
            'Cliente': sol.cliente_nombre,
            'Pendientes para facturar': 'Sin complejidad en el diagnóstico → no se pudo liquidar la tarifa MABE',
            'Solicitud ID': sol.id,
          })
        }
        const total = consolidado?.r.totalMABE ?? 0
        totalMABEBase += total
        relacionMABE.push({
          'Código servicio': codigo,
          'N° orden MABE': sol.numero_serie_factura ?? '',
          'Fecha cierre': fechaColombiaYMD(new Date(cierre.iso)),
          'Cliente final': sol.cliente_nombre,
          'Ciudad': sol.ciudad_pueblo,
          'Equipo': `${sol.tipo_equipo} ${sol.marca_equipo}`,
          'Técnico': tec?.nombre_completo ?? '',
          'Complejidad': consolidado?.complejidad ?? '',
          'Tarifa base (COP)': consolidado?.r.tarifaBase ?? '',
          'Bono (COP)': consolidado?.r.bono ?? '',
          'Recargo finde (COP)': consolidado?.r.recargoWeekend ?? '',
          'Valor a facturar (COP)': total,
          'Nota': consolidado ? '' : 'Revisar manualmente',
          'Solicitud ID': sol.id,
        })
      }
      const ivaMABE = desglosarIva(Math.round(totalMABEBase * (1 + IVA_TARIFA)))
      const fvMABE: Row[] = [
        { Campo: 'Tipo comprobante Siigo', Valor: `FV-2 electrónica (${SIIGO.DOC_FV_ELECTRONICA})` },
        { Campo: 'Tercero (cliente)', Valor: FACTURACION_MABE_NOMBRE },
        { Campo: 'NIT', Valor: FACTURACION_MABE_NIT || '⚠️ Configurar FACTURACION_MABE_NIT (env) o completar a mano' },
        { Campo: 'Tipo ID', Valor: `NIT (${SIIGO.ID_TYPE_NIT})` },
        { Campo: 'Fecha factura', Valor: hasta },
        { Campo: 'Período facturado (fecha de cierre)', Valor: rango },
        { Campo: 'Código ítem Siigo', Valor: SIIGO.ITEM_SERVICIO_CODIGO },
        { Campo: 'Descripción ítem', Valor: `Servicios técnicos de garantía MABE — ${relacionMABE.length} orden(es) del ${rango} (relación anexa)` },
        { Campo: 'Cantidad', Valor: 1 },
        { Campo: 'Precio unitario base (sin IVA)', Valor: totalMABEBase },
        { Campo: 'Impuesto Siigo', Valor: `IVA 19% (${SIIGO.IMPUESTO_IVA_19})` },
        { Campo: 'Valor IVA', Valor: ivaMABE.iva },
        { Campo: 'Total factura (con IVA)', Valor: ivaMABE.total },
        { Campo: 'Forma de pago Siigo', Valor: `Crédito (${SIIGO.PAGO_CREDITO}) — MABE paga NET-30/60` },
        { Campo: 'Vendedor Siigo', Valor: SIIGO.SELLER_FV2 },
        { Campo: 'Observaciones', Valor: `Órdenes MABE: ${relacionMABE.map((r) => r['N° orden MABE']).filter(Boolean).join(', ') || '—'}` },
        { Campo: 'Nota', Valor: 'El tarifario MABE (Tipo D) se trata como base ANTES de IVA. Si MABE liquida con IVA incluido, usar la relación anexa como total y recalcular la base.' },
      ]
      if (relacionMABE.length > 0) {
        agregarTotales(relacionMABE, ['Tarifa base (COP)', 'Bono (COP)', 'Recargo finde (COP)', 'Valor a facturar (COP)'], 'Código servicio')
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fvMABE), 'FV MABE')
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(relacionMABE.length > 0 ? relacionMABE : [{ Nota: `Sin garantías completadas entre ${desde} y ${hasta}` }]),
        'Relación órdenes MABE',
      )

      // 4c. Ledger: TODOS los pagos Wompi del período (por fecha de pago, día
      // Colombia), estén o no completados los servicios — es lo que Wompi
      // liquida en la cuenta y contabilidad debe cruzar contra cada servicio.
      const margenUTC = 24 * 60 * 60 * 1000
      let pagosQuery = supabase
        .from('pagos')
        .select('id, solicitud_id, tipo, estado, monto, metodo, referencia, transaccion_id, pagado_at, created_at, raw')
        .order('created_at', { ascending: true })
        .limit(5000)
      if (solicitud_id) {
        pagosQuery = pagosQuery.eq('solicitud_id', solicitud_id)
      } else {
        pagosQuery = pagosQuery
          .gte('created_at', new Date(new Date(`${desde}T00:00:00Z`).getTime() - margenUTC).toISOString())
          .lte('created_at', new Date(new Date(`${hasta}T23:59:59Z`).getTime() + margenUTC).toISOString())
      }
      const { data: pagosPeriodo } = await pagosQuery

      const ledgerRaw = (pagosPeriodo ?? []).filter((p) => {
        if (fichaServicio) return true
        const ymd = fechaColombiaYMD(new Date(p.pagado_at ?? p.created_at))
        return ymd >= desde && ymd <= hasta
      })

      const solIdsLedger = [...new Set(ledgerRaw.map((p) => p.solicitud_id))]
      const solLedgerMap = new Map<string, SolicitudLiquidacion>()
      for (const s of solicitudes) solLedgerMap.set(s.id, s)
      const faltanIds = solIdsLedger.filter((id) => !solLedgerMap.has(id))
      if (faltanIds.length > 0) {
        const { data: extra } = await supabase
          .from('solicitudes_servicio')
          .select('id, created_at, es_garantia, cliente_nombre, cliente_telefono, cliente_cedula, ciudad_pueblo, tipo_equipo, marca_equipo, tipo_solicitud, numero_serie_factura, direccion, estado, pago_tecnico, tecnico_asignado_id, triaje_resultado, cotizacion, recargo_weekend_aplicado, cumple_ta, diagnosticado_at, siguiente_paso, siguiente_paso_at, repuesto_recibido_at, anticipo_pagado_at, saldo_pagado_at')
          .in('id', faltanIds)
        for (const s of (extra ?? []) as unknown as SolicitudLiquidacion[]) solLedgerMap.set(s.id, s)
      }

      const ledger: Row[] = ledgerRaw.map((p) => {
        const sol = solLedgerMap.get(p.solicitud_id)
        const raw = (p.raw ?? {}) as Record<string, unknown>
        const emailPagador = typeof raw.customer_email === 'string' ? raw.customer_email : ''
        const totalServicio = sol
          ? precioClienteServicio(sol.tipo_equipo, sol.tipo_solicitud, sol.es_garantia, sol.cotizacion as { total?: number | null } | null, sol.recargo_weekend_aplicado)
          : ''
        return {
          'Fecha pago': fmtFecha(p.pagado_at ?? p.created_at),
          'Código servicio': codigoServicio(p.solicitud_id),
          'Referencia Wompi': p.referencia,
          'Transacción Wompi': p.transaccion_id ?? '',
          'Concepto': p.tipo,
          'Estado': p.estado,
          'Monto (COP)': p.monto,
          'Método': p.metodo ?? '',
          'Email del pagador (Wompi)': emailPagador,
          'Cliente': sol?.cliente_nombre ?? '(solicitud no encontrada)',
          'Cédula/NIT': sol?.cliente_cedula ?? '',
          'Flujo': sol ? (sol.es_garantia ? 'Garantía' : 'Particular') : '',
          'Estado del servicio': sol?.estado ?? '',
          'Total del servicio (COP)': totalServicio,
          'Factura a la que aplica': `FV del servicio ${codigoServicio(p.solicitud_id)}`,
          'Solicitud ID': p.solicitud_id,
        }
      })
      if (ledger.length > 0) {
        const aprobados = ledger.filter((r) => r['Estado'] === 'APPROVED')
        const totalAprobado = aprobados.reduce((acc, r) => acc + (typeof r['Monto (COP)'] === 'number' ? (r['Monto (COP)'] as number) : 0), 0)
        ledger.push({ 'Fecha pago': `TOTAL APROBADO (${aprobados.length} de ${ledger.length} transacciones)`, 'Monto (COP)': totalAprobado })
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(ledger.length > 0 ? ledger : [{ Nota: `Sin pagos Wompi registrados entre ${desde} y ${hasta}` }]),
        'Pagos Wompi',
      )

      // 4d. Checklist de datos faltantes
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(faltantes.length > 0 ? faltantes : [{ Nota: 'Sin pendientes' }]),
        'Datos faltantes',
      )

      if (enRango.length === 0 && ledger.length === 0) {
        return NextResponse.json({ error: `No hay servicios completados ni pagos entre ${desde} y ${hasta}` }, { status: 404 })
      }
    }

    // Hoja de parámetros — deja constancia de cómo se generó el corte
    const meta: Row[] = [
      { Parámetro: 'Tipo de liquidación', Valor: tipo },
      { Parámetro: fichaServicio ? 'Ficha por servicio' : 'Rango (fecha de cierre, día Colombia)', Valor: rango },
      ...(fichaServicio
        ? [{ Parámetro: 'Estado actual del servicio', Valor: `${solicitudes[0]?.estado ?? '—'} — la FV se emite al completar; esta ficha es informativa en cualquier estado` }]
        : []),
      { Parámetro: 'Servicios incluidos', Valor: enRango.length },
      { Parámetro: 'Generado', Valor: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) },
      { Parámetro: 'Nota', Valor: 'Solo servicios en estado "completada". El recaudo online solo incluye transacciones Wompi APPROVED; pagos por fuera (transferencia/QR en sitio) no se registran automáticamente.' },
    ]
    if (tipo === 'facturacion') {
      meta.push(
        { Parámetro: 'Siigo — FV electrónica (document.id)', Valor: SIIGO.DOC_FV_ELECTRONICA },
        { Parámetro: 'Siigo — ítem servicio (code)', Valor: SIIGO.ITEM_SERVICIO_CODIGO },
        { Parámetro: 'Siigo — IVA 19% (tax id)', Valor: SIIGO.IMPUESTO_IVA_19 },
        { Parámetro: 'Siigo — forma de pago Bancos / Crédito / Contado', Valor: `${SIIGO.PAGO_BANCOS} / ${SIIGO.PAGO_CREDITO} / ${SIIGO.PAGO_CONTADO}` },
        { Parámetro: 'Siigo — vendedor FV-2', Valor: SIIGO.SELLER_FV2 },
        { Parámetro: 'Siigo — consumidor final', Valor: SIIGO.CONSUMIDOR_FINAL_NIT },
        { Parámetro: 'Cómo cruzar un pago', Valor: 'La referencia Wompi es "{anticipo|abono|saldo}-{uuid}"; los 8 primeros caracteres del uuid son el "Código servicio" (BS-XXXXXXXX) de todas las hojas.' },
        { Parámetro: 'Doc', Valor: 'docs/FACTURACION.md' },
      )
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Parámetros')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = fichaServicio
      ? `ficha-facturacion-${codigoServicio(solicitud_id!)}.xlsx`
      : `liquidacion-${tipo}-${desde}-a-${hasta}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[/api/admin/liquidaciones] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
