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
import { MARGEN_BAIRD_BONO, RECARGO_FIN_DE_SEMANA, esFinDeSemana } from './mabe'

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

// ──────────────────────────────────────────────────────────────────
// Recargo de fin de semana / festivo — PARTICULAR (cambio 2026-07-21)
//
// Si el horario confirmado por el cliente cae sábado, domingo o festivo
// colombiano, aplica un recargo con el MISMO reparto que garantía MABE:
// Baird captura 10%, el técnico recibe el 90%. Como particular no tiene
// complejidad, se usa la tarifa MEDIA del tarifario de garantía ($6.000).
//
// A diferencia de garantía (donde el recargo lo paga MABE), aquí lo paga
// el CLIENTE: el recargo entra a la base gravable y el cliente paga
// recargo + IVA. El cliente lo ve avisado desde el formulario /solicitar
// al elegir un horario de fin de semana.
//
//   Cliente paga:  $6.000 × 1.19 = $7.140  (recargo + IVA)
//   Técnico:       $6.000 × 0.90 = $5.400
//   Baird:         $6.000 × 0.10 = $600
//
// Se persiste en `solicitudes_servicio.recargo_weekend_aplicado` (bruto,
// 0 o 6000) cuando se confirma/reagenda la fecha de visita, y
// `pago_tecnico` ya incluye la parte del técnico. Aplica UNA vez por
// solicitud, a todo tipo de servicio particular (tarifa fija, visita de
// diagnóstico y reparación cotizada).
// ──────────────────────────────────────────────────────────────────

/** Recargo bruto (base gravable) — igual a la tarifa MEDIA de garantía MABE. */
export const RECARGO_FIN_DE_SEMANA_PARTICULAR = RECARGO_FIN_DE_SEMANA.media

/** Parte del técnico: 90% del bruto (mismo reparto que garantía). */
export const RECARGO_FIN_DE_SEMANA_PARTICULAR_TECNICO = Math.round(
  RECARGO_FIN_DE_SEMANA_PARTICULAR * (1 - MARGEN_BAIRD_BONO),
)

/** Lo que paga el cliente: recargo bruto + IVA 19%. */
export const RECARGO_FIN_DE_SEMANA_PARTICULAR_CLIENTE = Math.round(
  RECARGO_FIN_DE_SEMANA_PARTICULAR * (1 + IVA_TARIFA),
)

/**
 * Recargo bruto que corresponde a un horario de visita particular.
 * Acepta ISO (`fecha_visita_at`), Date o el texto canónico español de
 * `horario_confirmado` — `esFinDeSemana` (mabe.ts) resuelve ambos e incluye
 * festivos colombianos.
 *
 * @returns 0 si no aplica; RECARGO_FIN_DE_SEMANA_PARTICULAR si aplica.
 */
export function recargoParticularParaHorario(
  horario: string | Date | null | undefined,
): number {
  return esFinDeSemana(horario) ? RECARGO_FIN_DE_SEMANA_PARTICULAR : 0
}

/** Parte del técnico (90%) de un recargo bruto persistido. 0-safe. */
export function recargoTecnicoDesdeBruto(recargoBruto: number | null | undefined): number {
  if (!recargoBruto || recargoBruto <= 0) return 0
  return Math.round(recargoBruto * (1 - MARGEN_BAIRD_BONO))
}

/** Lo que paga el cliente (bruto + IVA) de un recargo bruto persistido. 0-safe. */
export function recargoClienteDesdeBruto(recargoBruto: number | null | undefined): number {
  if (!recargoBruto || recargoBruto <= 0) return 0
  return Math.round(recargoBruto * (1 + IVA_TARIFA))
}

export interface TarifaParticularResultado {
  costoTecnico: number       // lo que ingresa el técnico (sin recargo)
  margenBaird: number        // utilidad Baird = 13% del costoTecnico + 10% del recargo
  recargoBruto: number       // recargo finde/festivo (base) — 0 si no aplica
  recargoTecnico: number     // 90% del recargo — parte del técnico
  pagoTecnicoTotal: number   // costoTecnico + recargoTecnico
  baseVenta: number          // costoTecnico + utilidad + recargoBruto — base gravable DIAN
  ivaCliente: number         // 19% sobre la baseVenta
  totalCliente: number       // baseVenta + ivaCliente
}

/**
 * Calcula el reparto de pagos para un servicio particular.
 *
 * Ejemplo: costoTecnico = 100,000 (sin recargo)
 *   - margenBaird = 13,000  (13% del costo)
 *   - baseVenta   = 113,000 (base gravable para factura DIAN)
 *   - ivaCliente  = 21,470  (19% sobre la base de venta)
 *   - totalCliente = 134,470
 *
 * Con recargo finde/festivo (recargoBruto = 6,000):
 *   - baseVenta   = 113,000 + 6,000 = 119,000
 *   - ivaCliente  = 22,610
 *   - totalCliente = 141,610 (= 134,470 + 7,140)
 *   - técnico     = 100,000 + 5,400; Baird = 13,000 + 600
 *
 * El técnico recibe íntegro su `costoTecnico` (+ 90% del recargo). El IVA se
 * calcula sobre la venta completa (costo + utilidad + recargo), así la
 * factura electrónica cuadra sin ajustes del contador.
 */
export function calcularTarifaParticular(params: {
  costoTecnico: number
  /** Recargo finde/festivo BRUTO ya determinado para la solicitud (0 si no aplica). */
  recargoBruto?: number
}): TarifaParticularResultado {
  const costoTecnico = Math.max(0, Math.round(params.costoTecnico))
  const recargoBruto = Math.max(0, Math.round(params.recargoBruto ?? 0))
  const recargoTecnico = recargoTecnicoDesdeBruto(recargoBruto)
  const utilidadBaird = Math.round(costoTecnico * MARGEN_BAIRD_PARTICULAR)
  const margenBaird = utilidadBaird + (recargoBruto - recargoTecnico)
  const baseVenta = costoTecnico + utilidadBaird + recargoBruto
  const ivaCliente = Math.round(baseVenta * IVA_TARIFA)
  const totalCliente = baseVenta + ivaCliente
  return {
    costoTecnico,
    margenBaird,
    recargoBruto,
    recargoTecnico,
    pagoTecnicoTotal: costoTecnico + recargoTecnico,
    baseVenta,
    ivaCliente,
    totalCliente,
  }
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
