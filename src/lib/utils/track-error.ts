/**
 * Telemetría client-side de errores de conexión/carga.
 *
 * Diseño:
 * - Fire-and-forget. Nunca lanza, nunca espera. Si el server está caído
 *   también, no importa.
 * - Usa navigator.sendBeacon cuando está disponible — sobrevive a
 *   navigate-away (el usuario cierra la pestaña tras el error).
 * - Captura info de red del browser (Network Information API) cuando
 *   está disponible. En iOS Safari no existe — se loguea null.
 *
 * Llamar desde:
 * - useEffect catch blocks cuando todas las queries fallan
 * - Botones "Reintentar" (para saber que el usuario LO VIO)
 * - withRetry.onRetry callback (para medir cuán seguido el retry rescata)
 */

interface NetworkConnection {
  effectiveType?: string
  downlink?: number
  rtt?: number
}

export type ConnectionErrorType =
  | 'query_retry'      // un intento individual reintentó (informativo)
  | 'query_failed'     // todos los reintentos agotados (acción requerida)
  | 'page_load_error'  // la página falló al cargar (acción requerida)
  | 'fetch_failed'     // error fetch genérico
  | 'unknown'

export type Actor = 'tecnico' | 'cliente' | 'admin' | 'desconocido'

export interface TrackErrorPayload {
  error_type: ConnectionErrorType
  error_message?: string
  attempt_number?: number
  actor?: Actor
}

export function trackError(payload: TrackErrorPayload): void {
  // Solo client-side
  if (typeof window === 'undefined') return

  try {
    const conn = (navigator as Navigator & { connection?: NetworkConnection }).connection
    const data = {
      url: window.location.pathname,
      error_type: payload.error_type,
      error_message: payload.error_message,
      attempt_number: payload.attempt_number,
      online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
      network_effective_type: conn?.effectiveType ?? null,
      network_downlink: typeof conn?.downlink === 'number' ? conn.downlink : null,
      network_rtt: typeof conn?.rtt === 'number' ? conn.rtt : null,
      actor: payload.actor ?? 'desconocido',
    }

    const body = JSON.stringify(data)

    // sendBeacon sobrevive a unload (mejor para mobile flaky). Si no está
    // disponible, fallback a fetch con keepalive.
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/log-error', blob)
      return
    }

    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Telemetría no debe romper la UX — silently ignore
    })
  } catch {
    // Tampoco propagamos si algo en la captura misma falla
  }
}
