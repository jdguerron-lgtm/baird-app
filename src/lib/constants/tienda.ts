/**
 * Tienda oficial Baird Service (Shopify) — tienda.bairdservice.com.
 *
 * Además de repuestos, la tienda funciona como canal de RECAUDO online:
 * productos de servicio con precio fijo cuyo checkout cobra al cliente
 * (tarjeta/PSE según los medios habilitados en Shopify).
 */

export const TIENDA_URL = 'https://tienda.bairdservice.com'

/**
 * Producto "Diagnostico Linea Blanca (Anticipo)" — $42.000 COP.
 * Corresponde al anticipo del 50% de TARIFA_DIAGNOSTICO ($84.000, ver
 * src/types/solicitud.ts). Si cambia la tarifa de diagnóstico, hay que
 * actualizar el precio del producto en Shopify a mano (no hay sync).
 *
 * Producto Shopify: gid://shopify/Product/9164370706606 (variante 48046766850222).
 */
export const URL_PAGO_ANTICIPO_DIAGNOSTICO = `${TIENDA_URL}/products/diagnostico-linea-blanca-copia`
