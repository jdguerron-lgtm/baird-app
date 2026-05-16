/**
 * Retry helpers para hacer al sistema resiliente a conexiones lentas e
 * intermitentes (4G/3G, WiFi débil) que son la norma en campo.
 *
 * Patrón típico: el técnico abre un link de WhatsApp en mitad de la calle,
 * el primer GET a Supabase falla con fetch error transitorio, y antes el
 * usuario veía "Enlace inválido" o spinner infinito. Con retry el sistema
 * intenta de nuevo automáticamente con backoff antes de rendirse.
 *
 * NO confundir errores transitorios con definitivos:
 * - PGRST116 (no rows) = real "no existe" → NO retry, propagar como null/error.
 * - Otros errores Supabase / fetch errors = posibles transitorios → retry.
 */

/** Opciones para withRetry. Defaults pensados para conexiones móviles flaky. */
export interface RetryOptions {
  /** Reintentos adicionales (default 2 → 3 intentos totales). */
  retries?: number
  /** Backoff en ms por intento. Default [800, 2400] (≈3.2s peor caso). */
  backoffMs?: number[]
  /** Filtro opcional — si retorna false NO reintenta. Default: reintenta todo. */
  shouldRetry?: (err: unknown) => boolean
  /** Callback de telemetría — útil para loguear cuántas veces reintentamos. */
  onRetry?: (attempt: number, err: unknown) => void
}

/**
 * Reintenta una función async con backoff exponencial.
 *
 * Re-lanza el último error después de agotar los reintentos. Si un intento
 * lanza un error que `shouldRetry(err) === false`, se propaga inmediatamente.
 *
 * Ejemplo:
 *   const data = await withRetry(async () => {
 *     const { data, error } = await supabase.from(...).select(...).single()
 *     if (error && error.code !== 'PGRST116') throw error
 *     return data
 *   })
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { retries = 2, backoffMs = [800, 2400], shouldRetry, onRetry } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      // Filtro de errores definitivos (ej. 4xx, código PGRST conocido)
      if (shouldRetry && !shouldRetry(err)) throw err
      if (attempt < retries) {
        onRetry?.(attempt + 1, err)
        const delay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 2000
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

/** Shape mínimo de un resultado Supabase. Compatible con `.single()`, `.maybeSingle()`, etc. */
export interface SupabaseLikeResult<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

/**
 * Wrapper conveniente para llamadas Supabase con `.single()` o `.maybeSingle()`.
 *
 * Trata `PGRST116` (no rows) como un resultado válido `{ data: null, error }`
 * — no reintenta — y reintenta cualquier otro error (transitorio en red).
 *
 * Acepta `PromiseLike` porque el query builder de Supabase es thenable pero
 * no implementa `Promise` completo (le falta `catch`, `finally`).
 *
 * El genérico TResult captura todo el shape del resultado de Supabase
 * (incluyendo data tipado por el `.select(...)` del query builder), así
 * el caller no pierde inferencia.
 */
export async function querySupabase<TResult extends SupabaseLikeResult<unknown>>(
  fn: () => PromiseLike<TResult>,
  opts: Omit<RetryOptions, 'shouldRetry'> = {}
): Promise<TResult> {
  let lastResult: TResult = { data: null, error: null } as TResult
  return withRetry(
    async () => {
      lastResult = await fn()
      // Errores definitivos que NO deben reintentarse
      if (lastResult.error && lastResult.error.code !== 'PGRST116') {
        throw lastResult.error
      }
      return lastResult
    },
    {
      ...opts,
      shouldRetry: (err) => {
        const code = (err as { code?: string })?.code
        // No reintentar errores de aplicación conocidos
        if (code === 'PGRST116') return false
        if (code === '42501') return false // RLS denied — no se va a arreglar
        return true
      },
    }
  ).catch(() => lastResult) // Si todos los intentos fallan, retornamos el último error
}
