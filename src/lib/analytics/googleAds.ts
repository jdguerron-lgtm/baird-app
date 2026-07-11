/**
 * Google Ads (gtag) — capa de conversiones del sitio.
 *
 * El tag global de gtag se carga en `src/app/layout.tsx` con este mismo
 * GOOGLE_ADS_ID. La cuenta (AW-18163777075) es COMPARTIDA con la tienda Shopify
 * (tienda.bairdservice.com), que dispara sus propias conversiones (Compra,
 * Carrito, Tramitación) desde su propio deployment.
 *
 * ⚠️ Para no afectar la tienda, aquí SOLO disparamos la conversión del envío
 * del formulario de /solicitar, usando SU PROPIO label (distinto de los de la
 * tienda). Nunca disparar una conversión "genérica" de cuenta.
 */

export const GOOGLE_ADS_ID = 'AW-18163777075'

/**
 * Label de la acción de conversión de TIPO SITIO WEB para el envío del
 * formulario de /solicitar.
 *
 * Se inyecta por env (`NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL`) para configurarla sin
 * redeploy de código. Acepta el label completo (`AW-18163777075/AbCdEfg123`) o
 * solo el segmento tras la barra (`AbCdEfg123`).
 *
 * Mientras esté vacío, `trackLeadConversion()` es no-op (no rompe nada).
 *
 * ⚠️ Este label debe salir de una acción de conversión de SITIO WEB creada en
 * Google Ads. NO reutilizar:
 *   - "Formulario de contacto - Enviar" → fuente "En páginas alojadas en Google"
 *     (lead form del anuncio, no del sitio).
 *   - Compra / Inclusión en el carrito / Tramitación → son de la tienda Shopify.
 */
const LEAD_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL ?? ''

type GtagFn = (...args: unknown[]) => void

/**
 * Dispara la conversión de Google Ads del envío del formulario de solicitud.
 * Llamar UNA vez, en la pantalla de éxito de /solicitar.
 *
 * Seguro para llamar siempre: si gtag no está cargado o el label no está
 * configurado, no hace nada. Solo corre en el navegador (client component).
 */
export function trackLeadConversion(): void {
  if (!LEAD_CONVERSION_LABEL) return
  if (typeof window === 'undefined') return

  const w = window as unknown as { gtag?: GtagFn }
  if (typeof w.gtag !== 'function') return

  const sendTo = LEAD_CONVERSION_LABEL.includes('/')
    ? LEAD_CONVERSION_LABEL
    : `${GOOGLE_ADS_ID}/${LEAD_CONVERSION_LABEL}`

  w.gtag('event', 'conversion', { send_to: sendTo })
}
