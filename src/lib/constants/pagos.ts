/**
 * Recaudo de Baird Service.
 *
 * Pasarela única: **Wompi** (Bancolombia) — ver `src/lib/wompi.ts` y
 * `src/lib/services/pagos.service.ts`. La tienda Shopify queda solo para
 * repuestos (decisión 2026-08-18; reemplaza el plan de draft orders de
 * `docs/mejoras-futuras/pagos-shopify/`).
 *
 * Este archivo define además el recaudo en sitio (QR Bre-B) como respaldo.
 */

/**
 * Porcentaje del total del servicio que se cobra por anticipado para
 * CONFIRMAR la reserva de la visita (servicios particulares).
 *
 * El anticipo se cobra DESPUÉS de que el técnico acepta y confirma el horario
 * — así el cliente paga sabiendo quién lo atiende y cuándo (ver
 * `procesarAceptacion` en whatsapp.service.ts). Se abona al total del
 * servicio; no es un cargo adicional.
 */
export const ANTICIPO_PORCENTAJE = 0.5

/**
 * Anticipo (COP) que corresponde a un precio de servicio al cliente.
 * 0 si el precio no es válido — el caller decide si omite el cobro.
 */
export function montoAnticipo(precioCliente: number): number {
  if (!Number.isFinite(precioCliente) || precioCliente <= 0) return 0
  return Math.round(precioCliente * ANTICIPO_PORCENTAJE)
}

/**
 * Saldo pendiente de un servicio: total cotizado menos lo ya pagado como
 * anticipo. Nunca negativo (si el anticipo cubrió de más, el saldo es 0 y el
 * ajuste se maneja manualmente). 0 si el total no es válido.
 */
export function saldoPendiente(totalCliente: number, anticiposPagados: number): number {
  if (!Number.isFinite(totalCliente) || totalCliente <= 0) return 0
  const abonado = Number.isFinite(anticiposPagados) && anticiposPagados > 0 ? anticiposPagados : 0
  return Math.max(0, Math.round(totalCliente) - Math.round(abonado))
}

/**
 * Descuento que Baird le da al TÉCNICO sobre el precio público de la tienda
 * al cotizar un repuesto (decisión comercial 2026-08-18).
 *
 * El técnico ve en su portal el precio de tienda y, al lado, su precio con
 * descuento — que es el que debe usar al armar el costo de la cotización.
 * El cliente nunca ve este desglose: paga un total único "todo incluido".
 */
export const DESCUENTO_REPUESTO_TECNICO = 0.15

/** Precio del repuesto para el técnico: precio público − 15%. 0-safe. */
export function precioRepuestoTecnico(precioTienda: number | null | undefined): number | null {
  if (typeof precioTienda !== 'number' || !Number.isFinite(precioTienda) || precioTienda <= 0) return null
  return Math.round(precioTienda * (1 - DESCUENTO_REPUESTO_TECNICO))
}

/**
 * Recaudo en sitio — QR de pagos de Baird Service (medio bancario Bre-B).
 *
 * El QR lo genera el banco (app empresarial) y se sube como imagen estática
 * a /public. El portal del técnico lo muestra para que el cliente pague a
 * BAIRD (nunca efectivo al técnico — coherente con TyC y plantillas).
 *
 * Configuración:
 *   1. Exportar el QR desde la app del banco y guardarlo como
 *      public/qr-pagos-baird.png (la tarjeta del portal aparece sola;
 *      si el archivo no existe, la tarjeta se oculta).
 *   2. (Opcional) Poner la llave Bre-B en LLAVE_BREB_BAIRD para que el
 *      técnico pueda dictarla/copiarla si el cliente no puede escanear.
 */

export const QR_PAGOS_BAIRD_URL = '/qr-pagos-baird.png'

/** Llave Bre-B de Baird Service (ej: "@bairdservice" o el celular llave). Vacía = no se muestra. */
export const LLAVE_BREB_BAIRD = ''
