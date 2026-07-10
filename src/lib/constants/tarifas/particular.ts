/**
 * Tarifas de servicios particulares (post-garantía, multi-marca).
 *
 * Doc canónico: docs/TARIFAS.md § "Particular".
 *
 * Modelo (2026-07-05): el técnico ingresa lo que quiere ganar (mano de obra
 * + repuestos). Baird agrega su utilidad del 13% sobre ese costo y el IVA
 * 19% se aplica sobre la venta completa (costo + utilidad), como exige la
 * DIAN para facturación.
 *
 * Cliente paga = (costo_técnico × 1.13) × 1.19 = costo_técnico × 1.3447
 * Cliente VE solo "Total: $X (incluye IVA)" sin desglose.
 *
 * Modelo anterior (2026-05-12 → 2026-07-05): IVA sobre el costo y margen
 * 10% sobre el subtotal con IVA (factor 1.309). Las solicitudes creadas
 * antes del cambio conservan sus valores históricos en BD.
 */

import { IVA_TARIFA } from '@/types/solicitud'

/** Utilidad Baird sobre el costo que ingresa el técnico (antes de IVA). */
export const MARGEN_BAIRD_PARTICULAR = 0.13

/**
 * Multiplicador total aplicado al costo del técnico para llegar al precio final del cliente.
 * Equivale a (1 + MARGEN_BAIRD_PARTICULAR) × (1 + IVA_TARIFA) = 1.3447.
 */
export const MULTIPLICADOR_PARTICULAR = (1 + MARGEN_BAIRD_PARTICULAR) * (1 + IVA_TARIFA)

/**
 * Pago FIJO al técnico por una visita de diagnóstico particular
 * (tipo_solicitud Diagnóstico o Reparación antes de cotizar).
 *
 * NO sale de la fórmula: el cliente paga TARIFA_DIAGNOSTICO ($84.000,
 * `src/types/solicitud.ts`) y Baird le ofrece al técnico este monto fijo
 * (decisión comercial 2026-07-05; antes era catálogo ÷ multiplicador).
 * Si el cliente aprueba la cotización de reparación, `pago_tecnico` se
 * sobreescribe con el costo cotizado en /api/diagnostico.
 */
export const PAGO_TECNICO_DIAGNOSTICO = 35000

/**
 * Factor aplicado al neto del técnico en servicios de TARIFA FIJA del catálogo
 * (Mantenimiento, Cambio de filtro): recibe el 80% del neto teórico
 * (catálogo ÷ multiplicador) — ajuste −20% del 2026-07-09.
 *
 * NO aplica a: diagnóstico (fijo PAGO_TECNICO_DIAGNOSTICO), cotización libre
 * (el técnico recibe íntegro lo que cotiza) ni garantía MABE (tarifario propio).
 * El precio al cliente NO cambia — la diferencia queda para Baird.
 */
export const FACTOR_PAGO_TECNICO_TARIFA_FIJA = 0.8

export interface TarifaParticularResultado {
  costoTecnico: number       // lo que ingresa el técnico (lo que va a recibir)
  margenBaird: number        // utilidad Baird = 13% del costoTecnico
  baseVenta: number          // costoTecnico + margenBaird — base gravable DIAN
  ivaCliente: number         // 19% sobre la baseVenta
  totalCliente: number       // baseVenta + ivaCliente
}

/**
 * Calcula el reparto de pagos para un servicio particular.
 *
 * Ejemplo: costoTecnico = 100,000
 *   - margenBaird = 13,000  (13% del costo)
 *   - baseVenta   = 113,000 (base gravable para factura DIAN)
 *   - ivaCliente  = 21,470  (19% sobre la base de venta)
 *   - totalCliente = 134,470
 *
 * El técnico recibe íntegro su `costoTecnico`. El IVA se calcula sobre la
 * venta completa (costo + utilidad), así la factura electrónica cuadra sin
 * ajustes del contador.
 */
export function calcularTarifaParticular(params: { costoTecnico: number }): TarifaParticularResultado {
  const costoTecnico = Math.max(0, Math.round(params.costoTecnico))
  const margenBaird = Math.round(costoTecnico * MARGEN_BAIRD_PARTICULAR)
  const baseVenta = costoTecnico + margenBaird
  const ivaCliente = Math.round(baseVenta * IVA_TARIFA)
  const totalCliente = baseVenta + ivaCliente
  return { costoTecnico, margenBaird, baseVenta, ivaCliente, totalCliente }
}

/**
 * Pago NETO al técnico para un servicio particular de TARIFA FIJA del catálogo
 * (Mantenimiento, Cambio de filtro), a partir del precio de catálogo al
 * cliente (IVA incluido).
 *
 * Parte de la inversa de `calcularTarifaParticular` (el cliente paga
 *   precioCliente = costoTecnico × MULTIPLICADOR_PARTICULAR, 1.13 utilidad × 1.19 IVA)
 * y aplica el FACTOR_PAGO_TECNICO_TARIFA_FIJA (80%, ajuste 2026-07-09):
 *   neto = precioCliente ÷ MULTIPLICADOR_PARTICULAR × 0.8
 * Reusa las MISMAS constantes que el cálculo directo para que utilidad + IVA
 * queden siempre sincronizados (si cambia uno, ambos sentidos cambian juntos).
 *
 * Ejemplos (catálogo → neto técnico):
 *   $180.000 (cambio de filtro) → $107.087
 *   $126.000 (mant. lavadora)   → $74.961
 *
 * ⚠️ Diagnóstico/Reparación NO usan esta inversa: el técnico recibe el fijo
 * PAGO_TECNICO_DIAGNOSTICO ($35.000) — ver /api/solicitar.
 *
 * Garantía: el precio de catálogo es 0 (la marca paga vía MABE), así que
 * devuelve 0. Ver docs/TARIFAS.md § "Particular · servicios de tarifa fija".
 */
export function pagoNetoTecnicoTarifaFija(precioCliente: number): number {
  if (!Number.isFinite(precioCliente) || precioCliente <= 0) return 0
  return Math.round((precioCliente / MULTIPLICADOR_PARTICULAR) * FACTOR_PAGO_TECNICO_TARIFA_FIJA)
}

/**
 * Display string para el cliente: "Total: $134.470 (incluye IVA)".
 * NO desglosa costo técnico ni margen Baird (información comercial).
 */
export function formatTotalParaCliente(totalCliente: number): string {
  return `${totalCliente.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
