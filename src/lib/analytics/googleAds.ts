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
 * Corresponde a la acción "Solicitud de servicio (formulario web)" creada en
 * Google Ads (cuenta 262-918-6921) el 2026-07-11: categoría "Envío de
 * formulario para clientes potenciales", fuente Evento sobre el Google tag
 * AW-18163777075, conteo "Una", acción principal. Su fragmento de evento es
 * `gtag('event','conversion',{send_to:'AW-18163777075/8Gx0CJye7s4cELP8lNVD'})`.
 *
 * El label es PÚBLICO (viaja en el JS del cliente), igual que GOOGLE_ADS_ID, así
 * que va hardcodeado como default. Se puede sobreescribir por env
 * (`NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL`) sin tocar código; acepta el label
 * completo (`AW-18163777075/xxxx`) o solo el segmento tras la barra.
 *
 * ⚠️ NO reutilizar otras conversiones de la cuenta:
 *   - "Formulario de contacto - Enviar" → fuente "En páginas alojadas en Google"
 *     (lead form del anuncio, no del sitio).
 *   - Compra / Inclusión en el carrito / Tramitación → son de la tienda Shopify.
 */
const LEAD_CONVERSION_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL ?? '8Gx0CJye7s4cELP8lNVD'

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
