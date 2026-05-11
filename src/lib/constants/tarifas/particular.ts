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
 * Display string para el cliente: "Total: $130.900 (incluye IVA)".
 * NO desglosa costo técnico ni margen Baird (información comercial).
 */
export function formatTotalParaCliente(totalCliente: number): string {
  return `${totalCliente.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
