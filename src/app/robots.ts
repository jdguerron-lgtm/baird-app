import type { MetadataRoute } from 'next'

// Dominio canónico fijo a propósito: robots/sitemap deben apuntar SIEMPRE al
// dominio oficial para SEO, aunque el deployment también responda por el alias
// baird-app.vercel.app. No usar NEXT_PUBLIC_APP_URL aquí (puede ser el alias).
const BASE_URL = 'https://lineablanca.bairdservice.com'

/**
 * robots.txt generado por Next. Permite indexar el sitio público de marketing,
 * pero excluye explícitamente el panel admin, la API y todas las páginas privadas
 * con token en la URL (contienen PII / accesos por link, no deben salir en Google).
 * El refuerzo por header `X-Robots-Tag: noindex` vive en src/middleware.ts.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/aceptar/',
        '/tecnico/',
        '/confirmar/',
        '/horario/',
        '/cotizacion/',
        '/servicio/',
        '/verificar-paso/',
        '/reprogramar-repuesto/',
        '/supervisor/',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
