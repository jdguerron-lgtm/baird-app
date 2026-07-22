import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limiter — best-effort on serverless (state is per-isolate).
// For production scale, replace with Upstash Redis (@upstash/ratelimit).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const MAX_MAP_SIZE = 1000

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  // Lazy cleanup: purge expired entry
  if (entry && now > entry.resetAt) {
    rateLimitMap.delete(key)
  }

  // Cap map size to prevent unbounded growth
  if (rateLimitMap.size >= MAX_MAP_SIZE) {
    const firstKey = rateLimitMap.keys().next().value
    if (firstKey !== undefined) rateLimitMap.delete(firstKey)
  }

  const current = rateLimitMap.get(key)
  if (!current) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  current.count++
  return current.count > limit
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

// Rate limit configs per route (API + token pages)
const RATE_LIMITS: { path: string; limit: number; windowMs: number }[] = [
  { path: '/api/triaje', limit: 10, windowMs: 60_000 },
  { path: '/api/whatsapp/notify', limit: 5, windowMs: 60_000 },
  { path: '/api/whatsapp/accept', limit: 20, windowMs: 60_000 },
  { path: '/api/carga-masiva', limit: 5, windowMs: 60_000 },
  { path: '/api/completar-servicio', limit: 10, windowMs: 60_000 },
  { path: '/api/confirmar-servicio', limit: 10, windowMs: 60_000 },
  // Entrada pública del marketplace: un humano envía 1-2 veces; 8/min bloquea
  // loops de spam (cada solicitud dispara un WhatsApp = costo) sin afectar a un
  // cliente que reintenta tras un error de red.
  { path: '/api/solicitar', limit: 8, windowMs: 60_000 },
  // Telemetría fire-and-forget: tolera ráfagas de reintentos en redes flaky;
  // throttlearla solo descarta telemetría, no afecta UX.
  { path: '/api/log-error', limit: 30, windowMs: 60_000 },
  // Entrada OTP de supervisores: enviar-codigo dispara un WhatsApp (costo) y
  // revela si el número pertenece a un supervisor → límite estricto contra
  // enumeración. verificar-codigo ya tiene tope de 5 intentos por código;
  // el límite por IP frena el brute-force entre reenvíos.
  { path: '/api/supervisor/enviar-codigo', limit: 5, windowMs: 60_000 },
  { path: '/api/supervisor/verificar-codigo', limit: 10, windowMs: 60_000 },
]

// Token pages: prevent brute-force enumeration.
// 120/min por IP y por portal: una lista de ~50 solicitudes navegada rápido
// genera decenas de requests legítimos por minuto; un atacante enumerando
// UUIDs (122 bits) necesita órdenes de magnitud más que cualquier límite.
const TOKEN_PAGE_PREFIXES = ['/aceptar/', '/tecnico/', '/confirmar/', '/supervisor/']
const TOKEN_PAGE_LIMIT = 120  // requests per minute per IP per prefix
const TOKEN_PAGE_WINDOW = 60_000

// Rutas que NUNCA deben aparecer en Google: panel admin, API y páginas con
// token en la URL (privadas por diseño — contienen PII o accesos por link).
// robots.txt evita que el crawler las visite; X-Robots-Tag es el refuerzo que
// impide indexar si igual llegan por un link externo.
const NOINDEX_PREFIXES = [
  '/admin',
  '/api',
  '/aceptar/',
  '/tecnico/',
  '/confirmar/',
  '/horario/',
  '/cotizacion/',
  '/servicio/',
  '/verificar-paso/',
  '/reprogramar-repuesto/',
  // Sin slash final: cubre también la página pública de acceso OTP
  // (/supervisor) además de los portales con token (/supervisor/{token}).
  '/supervisor',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Rate limiting on API routes
  if (pathname.startsWith('/api/')) {
    for (const rl of RATE_LIMITS) {
      if (pathname === rl.path) {
        const key = `${ip}:${pathname}`
        if (isRateLimited(key, rl.limit, rl.windowMs)) {
          return new NextResponse(
            JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
          )
        }
        break
      }
    }
  }

  // Rate limiting on token-based pages (prevent enumeration).
  // Los prefetch nativos del browser (purpose/sec-purpose) no cuentan. OJO:
  // los prefetch de <Link> del App Router NO son detectables acá — Next 16
  // despoja los headers internos (rsc, next-router-prefetch) antes del
  // middleware (verificado 2026-07-17) — por eso el límite está dimensionado
  // para absorberlos y las listas grandes usan prefetch={false}.
  const esPrefetch =
    req.headers.get('purpose') === 'prefetch' ||
    req.headers.get('sec-purpose')?.includes('prefetch')
  const tokenPrefix = TOKEN_PAGE_PREFIXES.find(prefix => pathname.startsWith(prefix))
  if (tokenPrefix && !esPrefetch) {
    // Balde por portal: un técnico navegando su agenda ya no consume el
    // presupuesto de un cliente confirmando servicio desde la misma IP.
    const key = `${ip}:token-page:${tokenPrefix}`
    if (isRateLimited(key, TOKEN_PAGE_LIMIT, TOKEN_PAGE_WINDOW)) {
      return new NextResponse('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })
    }
  }

  const response = NextResponse.next()

  // Security headers on all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  // Impedir que Google indexe rutas privadas (admin, API, páginas con token)
  if (NOINDEX_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico)$).*)',
  ],
}
