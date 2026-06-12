/**
 * Tarifas de servicios particulares (post-garantía, multi-marca).
 *
 * Doc canónico: docs/TARIFAS.md § "Particular".
 *
 * Modelo: el técnico ingresa su costo (mano de obra + repuestos).
 * El sistema multiplica por 1.19 (IVA Colombia) y luego por 1.10
 * (margen Baird del 10% sobre el subtotal con IVA).
 *
 * Cliente paga = costo_técnico × 1.309
 * Cliente VE solo "Total: $X (incluye IVA)" sin desglose.
 */

import { calcularBaseSinIva, calcularIvaIncluido, IVA_TARIFA } from '@/types/solicitud'

/** Margen Baird sobre el subtotal con IVA. */
export const MARGEN_BAIRD_PARTICULAR = 0.10

/**
 * Multiplicador total aplicado al costo del técnico para llegar al precio final del cliente.
 * Equivale a (1 + IVA_TARIFA) × (1 + MARGEN_BAIRD_PARTICULAR).
 */
export const MULTIPLICADOR_PARTICULAR = (1 + IVA_TARIFA) * (1 + MARGEN_BAIRD_PARTICULAR)

export interface TarifaParticularResultado {
  costoTecnico: number       // lo que ingresa el técnico (lo que va a recibir)
  subtotalConIva: number     // costoTecnico × 1.19
  margenBaird: number        // 10% del subtotalConIva (bruto)
  totalCliente: number       // subtotalConIva × 1.10
  ivaCliente: number         // IVA contenido en el totalCliente
  baseCliente: number        // totalCliente sin IVA
}

/**
 * Calcula el reparto de pagos para un servicio particular.
 *
 * Ejemplo: costoTecnico = 100,000
 *   - subtotalConIva = 119,000
 *   - margenBaird = 11,900
 *   - totalCliente = 130,900
 *   - ivaCliente ≈ 20,898 (IVA contenido en el total)
 *   - baseCliente ≈ 110,002 (subtotal sin IVA visible al cliente)
 *
 * El técnico recibe íntegro su `costoTecnico`. Baird debe remitir el IVA
 * a la DIAN, por lo que su margen NETO es ~$10,000 después de remitir el
 * IVA sobre su comisión. Para efectos de display y P&L se reporta el
 * margen bruto (antes de IVA sobre comisión).
 */
export function calcularTarifaParticular(params: { costoTecnico: number }): TarifaParticularResultado {
  const costoTecnico = Math.max(0, Math.round(params.costoTecnico))
  const subtotalConIva = Math.round(costoTecnico * (1 + IVA_TARIFA))
  const margenBaird = Math.round(subtotalConIva * MARGEN_BAIRD_PARTICULAR)
  const totalCliente = subtotalConIva + margenBaird
  return {
    costoTecnico,
    subtotalConIva,
    margenBaird,
    totalCliente,
    ivaCliente: calcularIvaIncluido(totalCliente),
    baseCliente: calcularBaseSinIva(totalCliente),
  }
}

/**
 * Pago NETO al técnico para un servicio particular de TARIFA FIJA del catálogo
 * (Mantenimiento, Cambio de filtro, Diagnóstico, Reparación), a partir del
 * precio de catálogo al cliente (IVA incluido).
 *
 * Es la inversa de `calcularTarifaParticular`: el cliente paga
 *   precioCliente = costoTecnico × MULTIPLICADOR_PARTICULAR (1.19 IVA × 1.10 margen),
 * así que el neto del técnico es `precioCliente ÷ MULTIPLICADOR_PARTICULAR`.
 * Reusa la MISMA constante que el cálculo directo para que IVA + margen queden
 * siempre sincronizados (si cambia uno, ambos sentidos cambian juntos).
 *
 * Ejemplos (catálogo → neto técnico):
 *   $180.000 (cambio de filtro) → $137.510
 *   $126.000 (mant. lavadora)   → $96.257
 *   $84.000  (diagnóstico)      → $64.171
 *
 * Garantía: el precio de catálogo es 0 (la marca paga vía MABE), así que
 * devuelve 0. Ver docs/TARIFAS.md § "Particular · servicios de tarifa fija".
 */
export function pagoNetoTecnicoTarifaFija(precioCliente: number): number {
  if (!Number.isFinite(precioCliente) || precioCliente <= 0) return 0
  return Math.round(precioCliente / MULTIPLICADOR_PARTICULAR)
}

/**
 * Display string para el cliente: "Total: $130.900 (incluye IVA)".
 * NO desglosa costo técnico ni margen Baird (información comercial).
 */
export function formatTotalParaCliente(totalCliente: number): string {
  return `${totalCliente.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
