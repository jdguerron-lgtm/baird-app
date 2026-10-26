/**
 * Línea de atención por WhatsApp para clientes (2026-10-25).
 *
 * Es la línea de soporte que contesta una persona, DISTINTA del número de
 * WhatsApp Business que usan los flujos automáticos (plantillas). Los mensajes
 * llegan directo al teléfono; no pasan por el webhook.
 *
 * La usan el botón flotante y los CTA "Escríbenos por WhatsApp" de las
 * landings. Los clics se miden en GA4 como `whatsapp_click` (AnaliticaCliente
 * los detecta por el href wa.me; la ubicación sale de `data-rastreo`).
 */

/** Dígitos con código de país, formato wa.me (sin +, espacios ni guiones). */
export const WHATSAPP_ATENCION = '573153019192'

/** Link wa.me con mensaje prellenado. */
export function urlWhatsAppAtencion(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_ATENCION}?text=${encodeURIComponent(mensaje)}`
}
