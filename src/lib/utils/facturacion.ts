/**
 * Facturación — helpers PUROS para armar la información que contabilidad
 * necesita en Siigo (factura de venta al cliente particular, factura a la
 * marca en garantía, ledger de pagos Wompi y documento soporte del técnico).
 *
 * Doc canónico: docs/FACTURACION.md. No toca BD ni red — lo consume
 * `/api/admin/liquidaciones` (tipo 'facturacion' y hoja "Documento soporte").
 *
 * Los IDs de Siigo fueron verificados contra la API el 2026-08-23 (ver
 * docs/FACTURACION.md § "IDs de Siigo"). Si contabilidad cambia el tipo de
 * comprobante o la forma de pago, actualizar SOLO estas constantes.
 */

import { IVA_TARIFA, calcularBaseSinIva } from '@/types/solicitud'

// ─────────────────────────────────────────
// IDs de Siigo (cuenta Baird Service SAS)
// ─────────────────────────────────────────

export const SIIGO = {
  /** Tipos de comprobante de factura de venta. */
  DOC_FV_ELECTRONICA: 28908,      // FV-2 electrónica — servicios / manual
  DOC_FV_NO_ELECTRONICA: 8183,    // Factura NO electrónica
  DOC_FV_MERCADO_LIBRE: 29783,    // FV-3 — la usa la tienda (Mercado Libre)
  /** Ítem genérico de servicio: "Servicios profesionales / técnicos / otros". */
  ITEM_SERVICIO_CODIGO: '2',
  /** IVA 19% (el que usan todas las FV). */
  IMPUESTO_IVA_19: 4399,
  /** Formas de pago. */
  PAGO_BANCOS: 1885,
  PAGO_CREDITO: 1883,
  PAGO_CONTADO: 1882,
  /** Vendedor que firma las FV-2 (impuestos@). */
  SELLER_FV2: 802,
  /** Consumidor final (ya existe como tercero en Siigo). */
  CONSUMIDOR_FINAL_NIT: '222222222222',
  /** Códigos DIAN de tipo de identificación. */
  ID_TYPE_CEDULA: '13',
  ID_TYPE_NIT: '31',
} as const

// ─────────────────────────────────────────
// Identificación del cliente
// ─────────────────────────────────────────

export interface IdentificacionCliente {
  /** Código DIAN del tipo de documento ('13' CC, '31' NIT). */
  tipoCodigo: string
  tipoNombre: 'Cédula' | 'NIT' | 'Consumidor final'
  identificacion: string
  /** true cuando el tipo se infirió por la forma del número — contabilidad debe confirmar. */
  verificar: boolean
}

/**
 * Deduce cómo facturar al cliente a partir de la cédula/NIT capturada en
 * /solicitar. Sin documento → consumidor final (NIT 222222222222).
 *
 * Heurística NIT: 9 dígitos que empiezan por 8 o 9 (NITs de personas
 * jurídicas). Todo lo demás se trata como cédula. Es una inferencia —
 * el formulario no pregunta el tipo de documento — por eso `verificar`.
 */
export function identificacionCliente(cedula: string | null | undefined): IdentificacionCliente {
  const digits = (cedula ?? '').replace(/\D/g, '')
  if (!digits) {
    return { tipoCodigo: SIIGO.ID_TYPE_CEDULA, tipoNombre: 'Consumidor final', identificacion: SIIGO.CONSUMIDOR_FINAL_NIT, verificar: false }
  }
  const pareceNit = digits.length === 9 && /^[89]/.test(digits)
  if (pareceNit) {
    return { tipoCodigo: SIIGO.ID_TYPE_NIT, tipoNombre: 'NIT', identificacion: digits, verificar: true }
  }
  return { tipoCodigo: SIIGO.ID_TYPE_CEDULA, tipoNombre: 'Cédula', identificacion: digits, verificar: false }
}

// ─────────────────────────────────────────
// Número de servicio legible
// ─────────────────────────────────────────

/**
 * Código corto y legible del servicio para contabilidad: "BS-EDCF13A6".
 * Son los primeros 8 hex del UUID — el mismo prefijo que ya aparece en el
 * admin y en las referencias Wompi (`anticipo-{uuid}`), así un pago se
 * cruza con su servicio buscando estos 8 caracteres.
 */
export function codigoServicio(solicitudId: string): string {
  return `BS-${solicitudId.slice(0, 8).toUpperCase()}`
}

// ─────────────────────────────────────────
// Ítems de la factura al cliente particular
// ─────────────────────────────────────────

export interface ItemFactura {
  codigo: string
  descripcion: string
  cantidad: number
  /** Base gravable (sin IVA), COP. */
  base: number
  iva: number
  /** Total con IVA, COP. */
  total: number
}

export interface DatosItemsFactura {
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  cotizacion?: { diagnostico_cliente?: unknown; servicio_cliente?: unknown } | null
}

/** Desglose base/IVA de un total con IVA incluido (mismo criterio de TARIFAS.md). */
export function desglosarIva(totalConIva: number): { base: number; iva: number; total: number } {
  const total = Math.max(0, Math.round(Number(totalConIva) || 0))
  const base = calcularBaseSinIva(total)
  return { base, iva: total - base, total }
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/**
 * Renglones de la factura de un servicio particular.
 *
 * Desde 2026-08-25 las cotizaciones discriminan `diagnostico_cliente` +
 * `servicio_cliente` (total = suma). Cuando existen y cuadran con el total,
 * la factura sale con DOS ítems (diagnóstico + reparación); si no, un solo
 * ítem por el total. La base de cada ítem se deriva de su total con IVA —
 * la suma de bases puede diferir en $1 de la base del total por redondeo.
 */
export function itemsFacturaParticular(sol: DatosItemsFactura, totalCliente: number): ItemFactura[] {
  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`.trim()
  const total = num(totalCliente)
  const diag = num(sol.cotizacion?.diagnostico_cliente)
  const serv = num(sol.cotizacion?.servicio_cliente)

  if (diag > 0 && serv > 0 && diag + serv === total) {
    return [
      { codigo: SIIGO.ITEM_SERVICIO_CODIGO, descripcion: `Visita de diagnóstico — ${equipo}`, cantidad: 1, ...desglosarIva(diag) },
      { codigo: SIIGO.ITEM_SERVICIO_CODIGO, descripcion: `Servicio técnico ${sol.tipo_solicitud} — ${equipo}`, cantidad: 1, ...desglosarIva(serv) },
    ]
  }
  return [
    { codigo: SIIGO.ITEM_SERVICIO_CODIGO, descripcion: `Servicio técnico ${sol.tipo_solicitud} — ${equipo}`, cantidad: 1, ...desglosarIva(total) },
  ]
}

// ─────────────────────────────────────────
// Forma de pago sugerida
// ─────────────────────────────────────────

export interface FormaPagoSugerida {
  id: number
  nombre: string
  /** Lo que queda por cobrar por fuera de la pasarela (0 si Wompi cubrió todo). */
  pendiente: number
}

/**
 * Forma de pago para la FV según lo recaudado online (Wompi APPROVED):
 *   - cubre el total → Bancos (la plata entró a la cuenta vía Wompi)
 *   - nada online     → Crédito (cobro por fuera: QR en sitio / transferencia)
 *   - parcial         → Bancos por lo recaudado + pendiente informado
 */
export function formaPagoSugerida(totalCliente: number, recaudadoOnline: number): FormaPagoSugerida {
  const total = num(totalCliente)
  const online = num(recaudadoOnline)
  const pendiente = Math.max(0, total - online)
  if (total > 0 && online >= total) return { id: SIIGO.PAGO_BANCOS, nombre: 'Bancos (Wompi)', pendiente: 0 }
  if (online === 0) return { id: SIIGO.PAGO_CREDITO, nombre: 'Crédito (cobro por fuera)', pendiente }
  return { id: SIIGO.PAGO_BANCOS, nombre: 'Bancos (Wompi) + saldo por fuera', pendiente }
}

// ─────────────────────────────────────────
// Quincenas (liquidación de técnicos cada 15 días)
// ─────────────────────────────────────────

export interface RangoFechas {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  etiqueta: string
}

function ultimoDiaMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate()
}

function ymd(anio: number, mes1a12: number, dia: number): string {
  return `${anio}-${String(mes1a12).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Quincena a la que pertenece una fecha (día Colombia en formato YYYY-MM-DD):
 * 1–15 o 16–fin de mes. `offset` = -1 devuelve la quincena anterior.
 */
export function quincenaDe(fechaYMD: string, offset = 0): RangoFechas {
  const [a, m, d] = fechaYMD.split('-').map(Number)
  // Índice absoluto de quincena: 2 por mes.
  let idx = (a * 12 + (m - 1)) * 2 + (d >= 16 ? 1 : 0) + offset
  if (idx < 0) idx = 0
  const anio = Math.floor(idx / 24)
  const resto = idx % 24
  const mes = Math.floor(resto / 2) + 1
  const segunda = resto % 2 === 1
  const desde = ymd(anio, mes, segunda ? 16 : 1)
  const hasta = ymd(anio, mes, segunda ? ultimoDiaMes(anio, mes) : 15)
  const etiqueta = `${segunda ? '2ª' : '1ª'} quincena ${ymd(anio, mes, 1).slice(0, 7)}`
  return { desde, hasta, etiqueta }
}

// ─────────────────────────────────────────
// Retención en la fuente (referencia, NO se aplica sola)
// ─────────────────────────────────────────

/** UVT 2026 — Resolución DIAN 000238 del 15 dic 2025 (docs/TARIFAS.md Apéndice A). */
export const UVT_2026 = 52374

/**
 * Base mínima de retefuente por SERVICIOS: 4 UVT por pago o abono en cuenta.
 * Se exporta solo como referencia en la hoja "Documento soporte"; la tarifa
 * (4% declarante / 6% no declarante) la decide contabilidad por técnico.
 */
export const RETEFUENTE_SERVICIOS_BASE_MINIMA = 4 * UVT_2026

export function superaBaseRetefuente(pagoCOP: number): boolean {
  return num(pagoCOP) >= RETEFUENTE_SERVICIOS_BASE_MINIMA
}

/** Re-export para que el route no dependa de dos módulos por el IVA. */
export { IVA_TARIFA }
