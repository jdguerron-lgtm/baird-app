/**
 * Google Analytics 4 (gtag) — medición de tráfico y eventos del sitio.
 *
 * El tag global de gtag se carga UNA sola vez en `src/app/layout.tsx` (mismo
 * loader que Google Ads) y ahí se hace `gtag('config', GA_MEASUREMENT_ID)`,
 * así que TODAS las páginas quedan medidas. El flujo de datos es "Baird1"
 * (propiedad "Baird Serice S.A.S", cuenta 322082684) con URL raíz
 * https://bairdservice.com — los subdominios (lineablanca.) reportan al mismo
 * flujo, que es el comportamiento estándar de GA4.
 *
 * Vistas de página en navegación SPA (App Router): las cubre la "Medición
 * mejorada" del flujo (page_view en cambios de history), que está ACTIVADA.
 *
 * ⚠️ La propiedad "Tienda Baird" (512864883) es de la tienda Shopify y tiene
 * su propio tag en su propio deployment — no tocarla desde aquí.
 */

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-DXSC4J9RGF'

type GtagFn = (...args: unknown[]) => void

/**
 * Dispara el evento GA4 del envío exitoso del formulario de /solicitar.
 * Usa el nombre recomendado `generate_lead` (marcado como evento clave en la
 * propiedad). Llamar UNA vez, junto a `trackLeadConversion()` de Google Ads.
 *
 * Seguro para llamar siempre: no-op si gtag no está cargado o corre en server.
 * `send_to` va explícito para no duplicar el evento hacia el tag de Ads.
 */
export function trackGaLead(params?: { es_garantia?: boolean; tipo_solicitud?: string }): void {
  if (typeof window === 'undefined') return

  const w = window as unknown as { gtag?: GtagFn }
  if (typeof w.gtag !== 'function') return

  w.gtag('event', 'generate_lead', {
    send_to: GA_MEASUREMENT_ID,
    ...(params?.tipo_solicitud ? { tipo_solicitud: params.tipo_solicitud } : {}),
    ...(typeof params?.es_garantia === 'boolean'
      ? { es_garantia: params.es_garantia ? 'garantia' : 'particular' }
      : {}),
  })
}
