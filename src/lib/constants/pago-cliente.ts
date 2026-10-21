/**
 * Estado de PAGO del cliente — capa PARALELA a la máquina de estados.
 *
 * No es un estado del flujo (`solicitudes_servicio.estado` no cambia): se
 * deriva de las columnas denormalizadas que marca `registrarPagoWompi()`
 * (pagos.service.ts) al aprobar una transacción online:
 *   - `anticipo_pagado_at` → el cliente pagó el 50% de reserva (cubre la
 *     visita de diagnóstico).
 *   - `saldo_pagado_at`    → el cliente pagó el resto tras aprobar la
 *     cotización — servicio totalmente pagado en línea.
 *
 * Solo aplica a servicios PARTICULARES (`es_garantia = false`): en garantía
 * paga la marca y la capa entera es null.
 *
 * OJO: refleja únicamente el recaudo ONLINE (Wompi). Un pago en sitio con el
 * QR Bre-B no se registra automáticamente — por eso "pendiente" se lee como
 * "sin pago online registrado", no como deuda confirmada.
 */

import { precioClienteServicio } from '@/types/solicitud'
import { montoAnticipo, montoAbonoRepuestos, cotizacionTieneRepuestos } from '@/lib/constants/pagos'
import { descuentoDeSolicitud, montoDescuento } from '@/lib/constants/descuentos'

export type EstadoPagoCliente = 'pagado' | 'anticipo_pagado' | 'pendiente'

/** Estados donde nunca hubo visita: sin pago no hay nada que cobrar ni mostrar. */
const ESTADOS_SIN_COBRO = ['cancelada', 'sin_agendar']

/**
 * Deriva el estado de pago de una solicitud. `null` = no aplica badge
 * (garantía, o servicio muerto sin ningún pago registrado).
 */
export function estadoPagoCliente(sol: {
  es_garantia: boolean | null
  anticipo_pagado_at?: string | null
  saldo_pagado_at?: string | null
  estado?: string | null
}): EstadoPagoCliente | null {
  if (sol.es_garantia) return null
  if (sol.saldo_pagado_at) return 'pagado'
  if (sol.anticipo_pagado_at) return 'anticipo_pagado'
  if (sol.estado && ESTADOS_SIN_COBRO.includes(sol.estado)) return null
  return 'pendiente'
}

export const PAGO_CLIENTE_LABELS: Record<EstadoPagoCliente, string> = {
  pagado: '✅ Pagado',
  anticipo_pagado: '💰 Anticipo pagado',
  pendiente: 'Pago pendiente',
}

export const PAGO_CLIENTE_ESTILOS: Record<EstadoPagoCliente, string> = {
  pagado: 'bg-emerald-100 text-emerald-800',
  anticipo_pagado: 'bg-blue-100 text-blue-800',
  pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
}

export const PAGO_CLIENTE_HINT: Record<EstadoPagoCliente, string> = {
  pagado: 'El cliente pagó anticipo y saldo en línea (Wompi). No cobrar nada en sitio.',
  anticipo_pagado: 'El cliente pagó el 50% de reserva en línea (cubre la visita de diagnóstico). El saldo queda pendiente.',
  pendiente: 'Sin pago online registrado (Wompi). Un pago en sitio con QR no aparece aquí.',
}

// ─────────────────────────────────────────────────────────────────
// ETAPA de pago (2026-10-11) — "¿en qué pago va el cliente?"
//
// Más fina que `estadoPagoCliente`: distingue los 3 momentos de cobro de un
// servicio particular y cuál está en curso, con montos:
//
//   1. ANTICIPO  50% del precio — link al aceptar el técnico (reserva).
//   2. ABONO     50% del saldo  — solo si la cotización aprobada lleva
//                repuestos (financia la compra del repuesto).
//   3. SALDO     lo que falte   — link al aprobar una cotización SIN
//                repuestos, o al completar el servicio.
//
// Se deriva SOLO de columnas de `solicitudes_servicio` (la tabla `pagos` está
// cerrada al browser): `anticipo_pagado_at`, `abono_pagado_at`,
// `saldo_pagado_at` y `monto_pagado_online` los mantiene
// pagos.service → registrarPagoWompi (migración 20261011_resumen_pago_solicitud).
//
// Pura y client-safe: la usan admin, portal del técnico (sin montos — no debe
// ver el precio al cliente), portal del supervisor y el correo de facturación.
// ─────────────────────────────────────────────────────────────────

export type EtapaPagoCliente =
  | 'sin_cobro'           // aún no hay técnico → todavía no sale ningún link
  | 'anticipo_pendiente'  // link del anticipo enviado, sin pagar
  | 'anticipo_pagado'     // reserva pagada; esperando diagnóstico/cotización/cierre
  | 'abono_pendiente'     // cotización con repuestos aprobada, abono sin pagar
  | 'abono_pagado'        // abono pagado; el saldo se cobra al completar
  | 'saldo_pendiente'     // link del saldo enviado, sin pagar
  | 'pagado'              // pagó el total en línea
  | 'cerrado_con_pago'    // servicio terminado sin reparación/cancelado, con algo pagado
  | 'sin_pago_online'     // ya hubo visita y no hay pagos online (pudo pagar en sitio con QR, o es previo a Wompi)

/** Servicios con precio fijo de catálogo (sin cotización): el total ES el catálogo. */
export const TIPOS_PRECIO_FIJO = ['Mantenimiento', 'Cambio de filtro'] as const

/**
 * true si el servicio PARTICULAR es de tarifa fija (Mantenimiento / Cambio de
 * filtro). Regla de negocio (2026-10-11): en estos servicios el precio al
 * cliente y el pago al técnico quedan prometidos desde la solicitud — el
 * técnico NO diagnostica ni cotiza (no hay cotización abierta como en
 * Diagnóstico/Reparación): va directo a "Completar servicio". Garantía nunca
 * es precio fijo (paga la marca por complejidad).
 */
export function esServicioPrecioFijo(sol: { es_garantia?: boolean | null; tipo_solicitud?: string | null }): boolean {
  if (sol.es_garantia) return false
  return Boolean(sol.tipo_solicitud) && (TIPOS_PRECIO_FIJO as readonly string[]).includes(sol.tipo_solicitud as string)
}

/** Estados donde ya no se cobra nada más (el servicio no siguió o terminó sin reparar). */
const ESTADOS_CERRADOS_SIN_COBRO = new Set([
  'cancelada',
  'sin_agendar',
  'no_show_cliente',
  'cotizacion_rechazada',
  'reparacion_rechazada',
  'finalizado_sin_reparacion',
])

export interface SolicitudParaEtapaPago {
  es_garantia: boolean | null
  estado?: string | null
  tipo_solicitud?: string | null
  tipo_equipo?: string | null
  tecnico_asignado_id?: string | null
  cotizacion?: unknown
  recargo_weekend_aplicado?: number | null
  anticipo_pagado_at?: string | null
  abono_pagado_at?: string | null
  saldo_pagado_at?: string | null
  monto_pagado_online?: number | null
  // Snapshot del código de descuento (2026-10-19, migración
  // 20261019_codigos_descuento). Solo particular; se aplica en el saldo final.
  descuento_codigo?: string | null
  descuento_tipo?: string | null
  descuento_valor?: number | string | null
}

/**
 * Total BRUTO (COP, IVA incl.) que el cliente le debe a Baird por el servicio,
 * ANTES del código de descuento, para efectos de COBRO: total de la
 * cotización si existe; si no, precio de catálogo SOLO en servicios de precio
 * fijo (Mantenimiento / Cambio de filtro). En Diagnóstico/Reparación sin
 * cotización devuelve 0 = "aún no se sabe" (el diagnóstico solo, si el
 * cliente no repara, no genera saldo).
 *
 * Sobre este bruto se calculan el abono de repuestos y el % del descuento;
 * el saldo final usa `totalClienteNetoParaCobro`.
 */
export function totalClienteParaCobro(sol: SolicitudParaEtapaPago): number {
  if (sol.es_garantia) return 0
  const cot = sol.cotizacion as { total?: unknown } | null | undefined
  if (typeof cot?.total === 'number' && cot.total > 0) return Math.round(cot.total)
  if (!sol.tipo_solicitud || !(TIPOS_PRECIO_FIJO as readonly string[]).includes(sol.tipo_solicitud)) return 0
  if (!sol.tipo_equipo) return 0
  return precioClienteServicio(sol.tipo_equipo, sol.tipo_solicitud, false, null, sol.recargo_weekend_aplicado ?? null)
}

/**
 * Monto (COP) del código de descuento de la solicitud sobre su total bruto
 * (`totalClienteParaCobro`). 0 si no hay código, garantía o total aún
 * indefinido. Nunca supera el total. ÚNICO punto que calcula el descuento de
 * una solicitud: lo consumen `calcularMontoSaldo` (pagos.service), la etapa
 * de pago, /pago/saldo, finanzas y facturación.
 */
export function descuentoClienteParaCobro(sol: SolicitudParaEtapaPago): number {
  return montoDescuento(totalClienteParaCobro(sol), descuentoDeSolicitud(sol))
}

/**
 * Total NETO (bruto − descuento) que el cliente termina pagando. Es la cifra
 * contra la que se mide "pagado total" y de la que sale el saldo final.
 */
export function totalClienteNetoParaCobro(sol: SolicitudParaEtapaPago): number {
  const total = totalClienteParaCobro(sol)
  return Math.max(0, total - descuentoClienteParaCobro(sol))
}

export interface ResumenPagoCliente {
  etapa: EtapaPagoCliente
  /** Total BRUTO del servicio al cliente, antes de descuento (0 = aún no definido). */
  total: number
  /** Descuento por código aplicado al saldo final (0 = sin código). */
  descuento: number
  /** Total neto = total − descuento: lo que el cliente termina pagando. */
  totalNeto: number
  /** Pagado en línea (Wompi, APPROVED). */
  pagado: number
  /** Monto del cobro EN CURSO (anticipo/abono/saldo pendiente); 0 si ninguno. */
  porCobrar: number
}

/**
 * Deriva la etapa de pago de una solicitud. `null` = no aplica (garantía, o
 * servicio muerto sin ningún pago).
 */
export function etapaPagoCliente(sol: SolicitudParaEtapaPago): ResumenPagoCliente | null {
  if (sol.es_garantia) return null

  const total = totalClienteParaCobro(sol)
  const descuento = descuentoClienteParaCobro(sol)
  const totalNeto = Math.max(0, total - descuento)
  const pagado = Math.max(0, Math.round(sol.monto_pagado_online ?? 0))
  // Restante BRUTO: base del abono de repuestos (el descuento se aplica solo
  // en el saldo final). Restante NETO: lo que de verdad falta por pagar.
  const restante = Math.max(0, total - pagado)
  const restanteNeto = Math.max(0, totalNeto - pagado)
  const resumen = (etapa: EtapaPagoCliente, porCobrar = 0): ResumenPagoCliente =>
    ({ etapa, total, descuento, totalNeto, pagado, porCobrar })

  if (sol.saldo_pagado_at || (totalNeto > 0 && pagado >= totalNeto)) return resumen('pagado')

  if (sol.estado && ESTADOS_CERRADOS_SIN_COBRO.has(sol.estado)) {
    return pagado > 0 || sol.anticipo_pagado_at ? resumen('cerrado_con_pago') : null
  }

  if (!sol.anticipo_pagado_at) {
    if (!sol.tecnico_asignado_id) return resumen('sin_cobro')
    // El anticipo solo está "pendiente" ANTES de la visita. Después, sin pago
    // online, el cliente pudo pagar en sitio (QR) o el servicio es previo a
    // Wompi — no se le marca un anticipo pendiente que ya no aplica.
    if (!sol.estado || ESTADOS_PRE_VISITA.has(sol.estado)) {
      const precio = sol.tipo_equipo && sol.tipo_solicitud
        ? precioClienteServicio(
            sol.tipo_equipo,
            sol.tipo_solicitud,
            false,
            (sol.cotizacion as { total?: unknown } | null) ?? null,
            sol.recargo_weekend_aplicado ?? null,
          )
        : 0
      return resumen('anticipo_pendiente', montoAnticipo(precio))
    }
  }

  const cot = sol.cotizacion as { aprobado_at?: unknown } | null | undefined
  const cotAprobada = Boolean(cot?.aprobado_at)
  const conRepuestos = cotAprobada && cotizacionTieneRepuestos(sol.cotizacion)

  if (conRepuestos && !sol.abono_pagado_at) {
    return resumen('abono_pendiente', montoAbonoRepuestos(restante))
  }

  // El link del saldo sale al aprobar una cotización SIN repuestos, o al
  // completar el servicio (con repuestos, o precio fijo).
  // El saldo final es el único cobro donde entra el código de descuento.
  const cobroFinalEnCurso = sol.estado === 'completada' || (cotAprobada && !conRepuestos)
  if (cobroFinalEnCurso && restanteNeto > 0) return resumen('saldo_pendiente', restanteNeto)
  // El descuento cubrió todo lo que faltaba (código del 100% o valor ≥ saldo):
  // no hay nada más que cobrar.
  if (cobroFinalEnCurso && total > 0 && descuento > 0 && restanteNeto === 0) return resumen('pagado')

  if (sol.abono_pagado_at) return resumen('abono_pagado')
  if (sol.anticipo_pagado_at) return resumen('anticipo_pagado')
  return resumen('sin_pago_online')
}

/** Estados previos a la visita: único momento en que el anticipo está "pendiente". */
const ESTADOS_PRE_VISITA = new Set(['pendiente_horario', 'notificada', 'asignada'])

export const ETAPA_PAGO_LABELS: Record<EtapaPagoCliente, string> = {
  sin_cobro: 'Sin cobro aún',
  anticipo_pendiente: '⏳ Anticipo pendiente',
  anticipo_pagado: '💰 Anticipo pagado',
  abono_pendiente: '⏳ Abono repuestos pendiente',
  abono_pagado: '🔩 Abono pagado',
  saldo_pendiente: '⏳ Saldo pendiente',
  pagado: '✅ Pagado total',
  cerrado_con_pago: '💰 Pago parcial · cerrado',
  sin_pago_online: 'Sin pago online',
}

export const ETAPA_PAGO_ESTILOS: Record<EtapaPagoCliente, string> = {
  sin_cobro: 'bg-gray-100 text-gray-500',
  anticipo_pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
  anticipo_pagado: 'bg-blue-100 text-blue-800',
  abono_pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
  abono_pagado: 'bg-indigo-100 text-indigo-800',
  saldo_pendiente: 'bg-orange-50 text-orange-700 border border-orange-200',
  pagado: 'bg-emerald-100 text-emerald-800',
  cerrado_con_pago: 'bg-slate-100 text-slate-700',
  sin_pago_online: 'bg-gray-100 text-gray-500',
}

export const ETAPA_PAGO_HINT: Record<EtapaPagoCliente, string> = {
  sin_cobro: 'Aún no hay técnico asignado: el link del anticipo sale cuando un técnico acepta.',
  anticipo_pendiente: 'Se envió el link del anticipo (50%) por WhatsApp. La reserva se confirma al pagarlo.',
  anticipo_pagado: 'Reserva pagada (50%). El siguiente cobro llega con la cotización aprobada o al completar el servicio.',
  abono_pendiente: 'La reparación lleva repuestos: se envió el link del abono (50% del saldo) para comprarlos.',
  abono_pagado: 'Abono de repuestos pagado. El saldo restante se cobra al completar el servicio.',
  saldo_pendiente: 'Se envió el link del saldo por WhatsApp. También puede pagarse con el QR de Baird.',
  pagado: 'El cliente pagó el total en línea (Wompi). No cobrar nada en sitio.',
  cerrado_con_pago: 'El servicio se cerró sin completar la reparación; el cliente pagó una parte en línea (revisar devolución o cobro).',
  sin_pago_online: 'No hay pagos online registrados. Pudo pagar en sitio con el QR de Baird (no aparece aquí) o el servicio es anterior a Wompi.',
}

/**
 * Paso del cobro en el que va el servicio, para el stepper "1 Anticipo →
 * 2 Abono → 3 Saldo". `aplicaAbono` = la cotización aprobada lleva repuestos
 * (o el abono ya se pagó).
 */
export function pasosPagoCliente(sol: SolicitudParaEtapaPago): {
  paso: 'anticipo' | 'abono' | 'saldo'
  estado: 'pagado' | 'pendiente' | 'futuro'
  fecha: string | null
}[] {
  const cot = sol.cotizacion as { aprobado_at?: unknown } | null | undefined
  const aplicaAbono = Boolean(sol.abono_pagado_at) ||
    (Boolean(cot?.aprobado_at) && cotizacionTieneRepuestos(sol.cotizacion))
  const resumen = etapaPagoCliente(sol)
  const etapa = resumen?.etapa
  const todoPagado = etapa === 'pagado'

  const pasos: { paso: 'anticipo' | 'abono' | 'saldo'; estado: 'pagado' | 'pendiente' | 'futuro'; fecha: string | null }[] = [
    {
      paso: 'anticipo',
      estado: sol.anticipo_pagado_at || todoPagado ? 'pagado' : etapa === 'anticipo_pendiente' ? 'pendiente' : 'futuro',
      fecha: sol.anticipo_pagado_at ?? null,
    },
  ]
  if (aplicaAbono) {
    pasos.push({
      paso: 'abono',
      estado: sol.abono_pagado_at || todoPagado ? 'pagado' : etapa === 'abono_pendiente' ? 'pendiente' : 'futuro',
      fecha: sol.abono_pagado_at ?? null,
    })
  }
  pasos.push({
    paso: 'saldo',
    estado: todoPagado ? 'pagado' : etapa === 'saldo_pendiente' ? 'pendiente' : 'futuro',
    fecha: sol.saldo_pagado_at ?? null,
  })
  return pasos
}
