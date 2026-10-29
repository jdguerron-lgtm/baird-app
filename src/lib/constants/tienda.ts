/**
 * Tienda oficial Baird Service (Shopify) — tienda.bairdservice.com.
 *
 * Solo repuestos. El recaudo de servicios va por Wompi (docs/WOMPI.md).
 */

export const TIENDA_URL = 'https://tienda.bairdservice.com'

// (2026-10-29) Se retiró `URL_PAGO_ANTICIPO_DIAGNOSTICO` (producto Shopify
// "Diagnostico Linea Blanca (Anticipo)", $42.000): el anticipo se cobra solo
// con técnico asignado, por el checkout Wompi de /pago/anticipo/{token}. La
// tienda queda únicamente para repuestos (docs/WOMPI.md).
