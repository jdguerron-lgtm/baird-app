/**
 * Google Analytics 4 (gtag) — medición de tráfico y eventos del sitio.
 *
 * El tag global de gtag se carga UNA sola vez desde `src/lib/analytics/gtag.ts`
 * (mismo loader que Google Ads, lo inicia AnaliticaCliente en el root layout).
 * Mide todas las páginas públicas y las del cliente con token (URL saneada);
 * NO carga en los portales internos (ver rutas.ts). El flujo de datos es "Baird1"
 * (propiedad "Baird Serice S.A.S", cuenta 322082684) con URL raíz
 * https://bairdservice.com — los subdominios (lineablanca.) reportan al mismo
 * flujo, que es el comportamiento estándar de GA4.
 *
 * Además, lineablanca tiene su PROPIA propiedad para verla separada de la web
 * principal: "Línea Blanca - lineablanca.bairdservice.com" (misma cuenta
 * 322082684), flujo "Línea Blanca web" → GA_LINEABLANCA_ID. El sitio envía a
 * las DOS propiedades en paralelo; Baird1 conserva el histórico.
 *
 * Vistas de página en navegación SPA (App Router): las cubre la "Medición
 * mejorada" del flujo (page_view en cambios de history), que está ACTIVADA.
 *
 * ⚠️ La propiedad "Tienda Baird" (512864883) es de la tienda Shopify y tiene
 * su propio tag en su propio deployment — no tocarla desde aquí.
 */

import { getHeroVariante } from './experimentoHero'

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-DXSC4J9RGF'

/**
 * Propiedad propia de lineablanca ("Línea Blanca - lineablanca.bairdservice.com",
 * flujo "Línea Blanca web"). Se configura en paralelo a GA_MEASUREMENT_ID.
 */
export const GA_LINEABLANCA_ID =
  process.env.NEXT_PUBLIC_GA_LINEABLANCA_ID ?? 'G-ZPGP3D68XP'

type GtagFn = (...args: unknown[]) => void

/**
 * Dispara el evento GA4 del envío exitoso del formulario de /solicitar.
 * Usa el nombre recomendado `generate_lead` (marcado como evento clave en la
 * propiedad). Llamar UNA vez, junto a `trackLeadConversion()` de Google Ads.
 *
 * Seguro para llamar siempre: no-op si gtag no está cargado o corre en server.
 * `send_to` va explícito para no duplicar el evento hacia el tag de Ads.
 */
export function trackGaLead(params?: {
  es_garantia?: boolean
  tipo_solicitud?: string
  tipo_equipo?: string
  /** Valor esperado del lead en COP (mismo que la conversión de Ads). */
  valor?: number
  /** Canal del origen guardado (atribucion.ts), para cruzar con la fuente de GA4. */
  canal?: string
  /** 'agendada' (visita fijada al enviar) | 'sin_horario' (falta elegir horario). */
  reserva?: 'agendada' | 'sin_horario'
}): void {
  if (typeof window === 'undefined') return

  const w = window as unknown as { gtag?: GtagFn }
  if (typeof w.gtag !== 'function') return

  // Variante del experimento del hero (ver experimentoHero.ts). Se omite si no
  // se pudo asignar, para no meter una categoría falsa en el análisis.
  const heroVariante = getHeroVariante()

  w.gtag('event', 'generate_lead', {
    send_to: [GA_MEASUREMENT_ID, GA_LINEABLANCA_ID],
    ...(params?.tipo_solicitud ? { tipo_solicitud: params.tipo_solicitud } : {}),
    ...(typeof params?.es_garantia === 'boolean'
      ? { es_garantia: params.es_garantia ? 'garantia' : 'particular' }
      : {}),
    ...(params?.tipo_equipo ? { tipo_equipo: params.tipo_equipo } : {}),
    ...(params?.canal ? { canal: params.canal } : {}),
    ...(params?.reserva ? { reserva: params.reserva } : {}),
    ...(typeof params?.valor === 'number' && params.valor > 0
      ? { value: params.valor, currency: 'COP' }
      : {}),
    ...(heroVariante ? { hero_variante: heroVariante } : {}),
  })
}
