/**
 * Eventos del embudo hacia GA4 (2026-10-24). Van SOLO a las propiedades GA4
 * (`send_to` explícito), nunca al tag de Google Ads: las conversiones de Ads
 * se disparan aparte y a propósito (ver googleAds.ts).
 *
 * Eventos que manda el sitio:
 *
 * | Evento                  | Dónde                                   | Para qué |
 * |-------------------------|-----------------------------------------|----------|
 * | `generate_lead`         | /solicitar, envío exitoso               | Lead (evento clave) — googleAnalytics.ts |
 * | `form_start`            | /solicitar, primer campo tocado         | Denominador del embudo |
 * | `form_error`            | /solicitar, validación o error del API  | Dónde se rinde la gente |
 * | `begin_checkout`        | (retirado 2026-10-29: /solicitar ya no ofrece pagar; el anticipo se cobra con técnico asignado desde WhatsApp) | — |
 * | `whatsapp_click`        | Cualquier link a wa.me (botón flotante) | Contacto que no pasa por el formulario |
 * | `phone_click`           | Cualquier link tel:                     | Ídem por llamada |
 * | `cta_click`             | Links a /solicitar, /registro, tienda   | Qué CTA mueve más gente |
 * | `sign_up`               | /registro, registro de técnico exitoso  | Reclutamiento (NO es lead de cliente) |
 * | `aprobar_cotizacion`    | /cotizacion/{token}, aprobación         | Venta de la reparación |
 * | `experiment_impression` | Home, una vez por sesión                | Denominador del A/B del hero |
 *
 * Ninguno lleva datos personales. Seguro de llamar siempre: no-op en server,
 * sin gtag o en portales internos.
 */

import { GA_LINEABLANCA_ID, GA_MEASUREMENT_ID } from './googleAnalytics'
import { rutaSinMedicion } from './rutas'

export type ParamsEvento = Record<string, string | number | boolean | undefined | object[]>

export function trackEvento(nombre: string, params: ParamsEvento = {}): void {
  if (typeof window === 'undefined') return
  if (rutaSinMedicion(window.location.pathname)) return
  const w = window as unknown as { gtag?: (...args: unknown[]) => void }
  if (typeof w.gtag !== 'function') return

  const limpios: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') limpios[k] = v
  }
  w.gtag('event', nombre, { send_to: [GA_MEASUREMENT_ID, GA_LINEABLANCA_ID], ...limpios })
}

/** Texto corto y sin saltos para usar como parámetro (máx. 100 chars de GA4). */
export function textoParaEvento(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
}
