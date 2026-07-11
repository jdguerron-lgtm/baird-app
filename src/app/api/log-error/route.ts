import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * Telemetría de errores de conexión desde el cliente.
 *
 * POST /api/log-error
 * Body: { url, error_type, error_message?, attempt_number?, online?,
 *         network_effective_type?, network_downlink?, network_rtt?, actor? }
 *
 * Diseño:
 * - Fire-and-forget. Nunca lanza al cliente — siempre retorna 200 (incluso
 *   si el insert falla), porque esto es telemetría y NO debe romper la UX
 *   del técnico que ya está sufriendo un error de red.
 * - Logueamos también a stderr con prefijo [ConnectionError] para que
 *   aparezca en Vercel Runtime Logs y se pueda filtrar/grepear desde el
 *   dashboard de Vercel sin esperar al panel admin.
 * - Sanitiza inputs (longitudes, enums) para no llenar la BD con basura.
 */

const ERROR_TYPES = ['query_retry', 'query_failed', 'page_load_error', 'fetch_failed', 'unknown'] as const
const ACTORS = ['tecnico', 'cliente', 'admin', 'desconocido'] as const

type ErrorType = typeof ERROR_TYPES[number]
type Actor = typeof ACTORS[number]

function isErrorType(v: unknown): v is ErrorType {
  return typeof v === 'string' && (ERROR_TYPES as readonly string[]).includes(v)
}
function isActor(v: unknown): v is Actor {
  return typeof v === 'string' && (ACTORS as readonly string[]).includes(v)
}

function strOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  return v.slice(0, maxLen)
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v)
  return n !== null ? Math.floor(n) : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()?.slice(0, 100) ?? null
    const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null

    const row = {
      url: strOrNull(body.url, 500) ?? 'unknown',
      error_type: isErrorType(body.error_type) ? body.error_type : 'unknown',
      error_message: strOrNull(body.error_message, 1000),
      attempt_number: intOrNull(body.attempt_number),
      user_agent: userAgent,
      network_effective_type: strOrNull(body.network_effective_type, 20),
      network_downlink: numOrNull(body.network_downlink),
      network_rtt: intOrNull(body.network_rtt),
      online: typeof body.online === 'boolean' ? body.online : null,
      actor: isActor(body.actor) ? body.actor : 'desconocido',
      ip,
    }

    // Log a stderr para que aparezca en Vercel Runtime Logs (filtrable
    // por "[ConnectionError]" desde el dashboard de Vercel).
    console.error('[ConnectionError]', JSON.stringify(row))

    // Insert sin esperar ni propagar errores — si Supabase está caído o
    // la red interna falla, el cliente ya tuvo un problema, no le agreguemos
    // otro. Best-effort.
    const { error } = await supabase.from('connection_errors').insert(row)
    if (error) {
      console.error('[ConnectionError][insert-failed]', error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Catch-all. Nunca propagamos al cliente.
    console.error('[ConnectionError][handler-failed]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
