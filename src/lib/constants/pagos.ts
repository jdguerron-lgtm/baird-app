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
