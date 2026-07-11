import type { MetadataRoute } from 'next'
import { SERVICIOS_SEO } from '@/lib/constants/servicios-seo'

// Dominio canónico fijo a propósito (ver nota en robots.ts): el sitemap debe
// listar el dominio oficial, no el alias baird-app.vercel.app.
const BASE_URL = 'https://lineablanca.bairdservice.com'

/**
 * Sitemap solo con páginas PÚBLICAS e indexables. No incluir rutas admin, API
 * ni páginas con token (privadas — ver robots.ts y el noindex del middleware).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const rutas = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/solicitar', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/registro', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/servicios', priority: 0.8, changeFrequency: 'monthly' as const },
    // Landing pages SEO por electrodoméstico (src/lib/constants/servicios-seo.ts)
    ...SERVICIOS_SEO.map(({ slug }) => ({
      path: `/servicios/${slug}`,
      priority: 0.7,
      changeFrequency: 'monthly' as const,
    })),
    { path: '/terminos', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/politica-privacidad', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/eliminacion-datos', priority: 0.3, changeFrequency: 'yearly' as const },
  ]

  return rutas.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency,
    priority,
  }))
}
