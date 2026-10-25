/**
 * Arranque de gtag.js (Google Ads + las dos propiedades GA4) desde el
 * navegador (2026-10-24).
 *
 * Antes se cargaba con dos <Script> en el root layout, en TODAS las rutas.
 * Ahora lo inicia `AnaliticaCliente` tras hidratar (mismo momento que
 * `afterInteractive`) y decide con la URL real:
 *
 * - Portal interno (`rutaSinMedicion`): no carga nada.
 * - URL con token o query no permitida (`urlNecesitaSaneo`): configura los
 *   destinos con `send_page_view: false` y manda el page_view a mano con la
 *   URL saneada como parámetro DEL EVENTO (no con `gtag('set')`, que quedaría
 *   pegado a las vistas siguientes de la navegación interna).
 * - URL pública limpia: medición estándar, igual que antes. Las vistas de la
 *   navegación interna las sigue mandando la "Medición mejorada" de GA4
 *   (cambios de historial).
 *
 * En la navegación interna hacia un portal interno se apaga el envío con el
 * opt-out oficial `window['ga-disable-<ID>'] = true` (ver `actualizarRutaGtag`).
 */

import { GOOGLE_ADS_ID } from './googleAds'
import { GA_LINEABLANCA_ID, GA_MEASUREMENT_ID } from './googleAnalytics'
import { rutaSinMedicion, sanitizarUrl, urlNecesitaSaneo } from './rutas'

type GtagWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  __bairdGtagIniciado?: boolean
  __bairdAdsConfigurado?: boolean
} & Record<string, unknown>

const DESTINOS = [GOOGLE_ADS_ID, GA_MEASUREMENT_ID, GA_LINEABLANCA_ID]
const DESTINOS_GA = [GA_MEASUREMENT_ID, GA_LINEABLANCA_ID]

/**
 * Inicia gtag una sola vez por pestaña. No-op en portales internos (se
 * reintenta en la siguiente navegación, por si el usuario pasa a una página
 * pública sin recargar).
 */
export function iniciarGtag(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as GtagWindow
  if (w.__bairdGtagIniciado) return
  if (rutaSinMedicion(window.location.pathname)) return
  w.__bairdGtagIniciado = true

  w.dataLayer = w.dataLayer || []
  // gtag exige el objeto `arguments`, no un array: así lo define el snippet oficial.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  const gtag = w.gtag

  const href = window.location.href
  const referrer = document.referrer
  const referrerPropio = (() => {
    try {
      return Boolean(referrer) && new URL(referrer).origin === window.location.origin
    } catch {
      return false
    }
  })()
  // Referrer-Policy deja pasar la ruta completa en la navegación del mismo
  // sitio: si se viene de una página con token, el referrer también se sanea.
  const referrerSucio = referrerPropio && urlNecesitaSaneo(referrer)
  const manual = urlNecesitaSaneo(href) || referrerSucio

  gtag('js', new Date())
  if (manual) {
    // GA4: sin page_view automático; se manda abajo con la URL saneada.
    for (const id of DESTINOS_GA) gtag('config', id, { send_page_view: false })
    // Ads NO se configura aquí: aun con send_page_view:false y page_location
    // el Google tag manda un hit de aterrizaje (ccm/collect) con la ruta real,
    // token incluido (verificado 2026-10-24). En estas páginas no hay
    // conversiones de Ads; se configura al pasar a una página pública
    // (ver `actualizarRutaGtag`).
  } else {
    for (const id of DESTINOS) gtag('config', id)
    w.__bairdAdsConfigurado = true
  }

  if (manual) {
    gtag('event', 'page_view', {
      send_to: DESTINOS_GA,
      page_location: sanitizarUrl(href),
      ...(referrer ? { page_referrer: referrerSucio ? sanitizarUrl(referrer) : referrer } : {}),
    })
  }

  // El loader sirve para todos los destinos configurados; se pide con el ID
  // de un destino que sí se configuró en esta carga.
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${manual ? GA_MEASUREMENT_ID : GOOGLE_ADS_ID}`
  document.head.appendChild(script)
}

/**
 * Llamar en cada cambio de ruta. En portales internos apaga el envío de todos
 * los destinos; en el resto lo vuelve a encender. Si la pestaña arrancó en una
 * página con token (Ads sin configurar) y pasa a una pública limpia, configura
 * Ads ahí.
 */
export function actualizarRutaGtag(pathname: string): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as GtagWindow
  const apagar = rutaSinMedicion(pathname)
  for (const id of DESTINOS) w[`ga-disable-${id}`] = apagar

  if (
    w.__bairdGtagIniciado &&
    !w.__bairdAdsConfigurado &&
    typeof w.gtag === 'function' &&
    !apagar &&
    !urlNecesitaSaneo(window.location.href)
  ) {
    w.gtag('config', GOOGLE_ADS_ID)
    w.__bairdAdsConfigurado = true
  }
}
