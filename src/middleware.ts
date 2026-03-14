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

// Rate limit configs per API route
const RATE_LIMITS: { path: string; limit: number; windowMs: number }[] = [
  { path: '/api/triaje', limit: 10, windowMs: 60_000 },
  { path: '/api/whatsapp/notify', limit: 5, windowMs: 60_000 },
  { path: '/api/whatsapp/accept', limit: 20, windowMs: 60_000 },
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rate limiting — only on API routes
  if (pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

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

  const response = NextResponse.next()

  // Security headers on all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico)$).*)',
  ],
}
