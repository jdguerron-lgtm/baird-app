/**
 * Salud de los servicios externos — 2026-10-26.
 *
 * Revisa desde el SERVIDOR (con las credenciales reales de Vercel) que cada integración responda.
 * Solo lectura: health checks, lecturas de configuración y un token de Siigo. Nunca envía, cobra
 * ni crea nada. Lo usa `GET /api/cron/salud-servicios` (cron diario 7 am Bogotá) y alerta a
 * WHATSAPP_ALERT_PHONE si algún servicio CONFIGURADO falla.
 *
 * Diseño testeable: `revisarServicios` recibe `fetch`, `env` y el ping de Supabase inyectados.
 */

export type EstadoServicio = 'ok' | 'falla' | 'sin_configurar'

export interface ResultadoServicio {
  servicio: string
  estado: EstadoServicio
  ms: number
  detalle?: string
}

export interface DependenciasSalud {
  fetch: typeof fetch
  env: Record<string, string | undefined>
  /** Lectura mínima a Supabase con service_role. Debe lanzar si falla. */
  pingSupabase: () => Promise<void>
  timeoutMs?: number
}

const TIMEOUT_MS = 10_000

async function medir(
  servicio: string,
  configurado: boolean,
  fn: () => Promise<string | undefined>,
): Promise<ResultadoServicio> {
  if (!configurado) return { servicio, estado: 'sin_configurar', ms: 0 }
  const t0 = Date.now()
  try {
    const detalle = await fn()
    return { servicio, estado: 'ok', ms: Date.now() - t0, detalle }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { servicio, estado: 'falla', ms: Date.now() - t0, detalle: msg.slice(0, 160) }
  }
}

async function pedirJson(
  f: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const r = await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  let j: Record<string, unknown> = {}
  try { j = (await r.json()) as Record<string, unknown> } catch { /* sin cuerpo JSON */ }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return j
}

export async function revisarServicios(deps: DependenciasSalud): Promise<ResultadoServicio[]> {
  const { env } = deps
  const f = deps.fetch
  const t = deps.timeoutMs ?? TIMEOUT_MS

  const conTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${t} ms`)), t))])

  return Promise.all([
    medir('supabase', true, async () => { await conTimeout(deps.pingSupabase()); return undefined }),

    medir('whatsapp', Boolean(env.WHATSAPP_PHONE_ID && env.WHATSAPP_API_TOKEN), async () => {
      const j = await pedirJson(f,
        `https://graph.facebook.com/v22.0/${env.WHATSAPP_PHONE_ID}?fields=display_phone_number,quality_rating,status`,
        { headers: { authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` } }, t)
      const calidad = String(j.quality_rating ?? 'UNKNOWN')
      // Calidad distinta de GREEN = Meta puede limitar o pausar los envíos: se trata como falla.
      if (calidad !== 'GREEN') throw new Error(`calidad del número ${calidad} (estado ${String(j.status ?? '?')})`)
      return `calidad ${calidad}`
    }),

    medir('wompi', Boolean(env.WOMPI_PUBLIC_KEY), async () => {
      const pub = String(env.WOMPI_PUBLIC_KEY)
      const base = pub.startsWith('pub_test_') ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1'
      const j = await pedirJson(f, `${base}/merchants/${pub}`, {}, t)
      const data = (j.data ?? {}) as Record<string, unknown>
      return pub.startsWith('pub_test_') ? `sandbox · ${String(data.name ?? '?')}` : `producción · ${String(data.name ?? '?')}`
    }),

    medir('siigo', Boolean(env.SIIGO_USERNAME && env.SIIGO_ACCESS_KEY), async () => {
      const j = await pedirJson(f, 'https://api.siigo.com/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Partner-Id': env.SIIGO_PARTNER_ID ?? 'BairdApp' },
        body: JSON.stringify({ username: env.SIIGO_USERNAME, access_key: env.SIIGO_ACCESS_KEY }),
      }, t)
      if (!j.access_token) throw new Error('respuesta sin token')
      return 'token emitido'
    }),

    medir('resend', Boolean(env.RESEND_API_KEY), async () => {
      const j = await pedirJson(f, 'https://api.resend.com/domains', { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } }, t)
      const dominios = Array.isArray(j.data) ? (j.data as Array<{ name?: string; status?: string }>) : []
      return dominios.map(d => `${d.name}:${d.status}`).join(', ') || 'sin dominios'
    }),

    medir('google_maps', Boolean(env.GOOGLE_MAPS_API_KEY), async () => {
      const j = await pedirJson(f,
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Carrera 80C 24D-74, Bogotá')}&key=${env.GOOGLE_MAPS_API_KEY}`,
        {}, t)
      if (j.status !== 'OK') throw new Error(`geocode ${String(j.status)}`)
      return 'geocode OK'
    }),
  ])
}

/** Servicios configurados que fallaron (los `sin_configurar` no cuentan: son kill-switches). */
export function fallasDe(resultados: ResultadoServicio[]): ResultadoServicio[] {
  return resultados.filter(r => r.estado === 'falla')
}

/** Texto del WhatsApp al equipo. Nunca incluye secretos: solo nombre, estado y el detalle del error. */
export function textoAlerta(resultados: ResultadoServicio[], ahora = new Date()): string {
  const fallas = fallasDe(resultados)
  const hora = ahora.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
  const lineas = fallas.map(r => `❌ ${r.servicio}: ${r.detalle ?? 'sin detalle'}`)
  const okCount = resultados.filter(r => r.estado === 'ok').length
  return [
    `🚨 Baird · salud de servicios (${hora})`,
    `${fallas.length} servicio(s) con falla, ${okCount} OK.`,
    ...lineas,
    'Revisar en Vercel → Logs y el panel del proveedor. Detalle: GET /api/cron/salud-servicios?dry=1',
  ].join('\n')
}
