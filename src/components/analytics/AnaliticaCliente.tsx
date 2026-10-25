'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { actualizarRutaGtag, iniciarGtag } from '@/lib/analytics/gtag'
import { registrarVisita } from '@/lib/analytics/atribucion'
import { textoParaEvento, trackEvento } from '@/lib/analytics/eventos'
import { getHeroVariante } from '@/lib/analytics/experimentoHero'
import { rutaConToken, rutaSinMedicion, sanitizarUrl, urlNecesitaSaneo } from '@/lib/analytics/rutas'

/**
 * Toda la analítica del sitio en un solo lugar (2026-10-24). Se monta una vez
 * en el root layout.
 *
 * - Inicia gtag (Ads + GA4) fuera de los portales internos y con la URL
 *   saneada en las páginas con token — ver src/lib/analytics/gtag.ts.
 * - Registra el origen de la visita (gclid, utm, referrer) en las páginas
 *   públicas — ver src/lib/analytics/atribucion.ts.
 * - Mide clics en WhatsApp, teléfono y CTAs con un solo listener delegado:
 *   la home y las landings son Server Components y no pueden llevar onClick.
 * - Registra la exposición al A/B del hero en la home.
 * - Monta Vercel Analytics y Speed Insights con el mismo criterio de rutas.
 */
export default function AnaliticaCliente() {
  const pathname = usePathname() ?? ''

  useEffect(() => {
    // Orden: primero apagar/encender por ruta, después iniciar (si la pestaña
    // arrancó en un portal interno, gtag se inicia al pasar a una pública).
    actualizarRutaGtag(pathname)
    iniciarGtag()

    if (rutaSinMedicion(pathname) || rutaConToken(pathname)) return
    registrarVisita()
    if (pathname === '/') registrarExposicionHero()
  }, [pathname])

  useEffect(() => {
    document.addEventListener('click', alHacerClic, { capture: true })
    return () => document.removeEventListener('click', alHacerClic, { capture: true })
  }, [])

  return (
    <>
      <Analytics beforeSend={limpiarEventoVercel} />
      <SpeedInsights beforeSend={limpiarEventoVercel} />
    </>
  )
}

function limpiarEventoVercel<T extends { url: string }>(evento: T): T | null {
  try {
    if (rutaSinMedicion(new URL(evento.url).pathname)) return null
  } catch {
    return null
  }
  return urlNecesitaSaneo(evento.url) ? { ...evento, url: sanitizarUrl(evento.url) } : evento
}

const CLAVE_EXPOSICION = 'baird_hero_expuesto'

/**
 * Una exposición por sesión. El atributo data-hero ya lo escribió el script
 * inline del <head>, y gtag quedó definido en el mismo efecto (los eventos se
 * encolan en dataLayer hasta que carga gtag.js).
 */
function registrarExposicionHero(): void {
  const variante = getHeroVariante()
  if (!variante) return
  try {
    if (window.sessionStorage.getItem(CLAVE_EXPOSICION) === variante) return
    window.sessionStorage.setItem(CLAVE_EXPOSICION, variante)
  } catch {
    // Sin sessionStorage se manda igual (puede repetirse en la sesión).
  }
  trackEvento('experiment_impression', { experiment_id: 'hero_movil', variant_id: variante })
}

function alHacerClic(e: MouseEvent): void {
  const objetivo = e.target as Element | null
  const link = objetivo?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!link) return

  const href = link.getAttribute('href') ?? ''
  const ubicacion = link.dataset.rastreo || undefined
  const texto = textoParaEvento(link.textContent || link.getAttribute('aria-label'))

  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) {
    trackEvento('whatsapp_click', { ubicacion: ubicacion ?? 'link', link_text: texto })
    return
  }
  if (href.startsWith('tel:')) {
    trackEvento('phone_click', { ubicacion: ubicacion ?? 'link', link_text: texto })
    return
  }

  let destino: string | null = null
  try {
    const url = new URL(href, window.location.href)
    if (url.origin === window.location.origin) {
      if (url.pathname === '/solicitar') destino = 'solicitar'
      else if (url.pathname === '/registro') destino = 'registro'
    } else if (url.hostname === 'tienda.bairdservice.com') {
      destino = 'tienda'
    }
  } catch {
    return
  }
  if (destino) trackEvento('cta_click', { destino, ubicacion, link_text: texto })
}
