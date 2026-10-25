/**
 * Atribución del lead: de dónde vino el cliente que envió /solicitar
 * (2026-10-24).
 *
 * Al llegar a una página pública se guarda en localStorage un "toque" con los
 * parámetros de campaña (gclid, utm_*, …), el dominio que lo refirió y la
 * landing. /solicitar lo manda junto con el formulario y /api/solicitar lo
 * guarda en `solicitudes_servicio.origen` (JSONB) con el canal ya clasificado.
 * Con eso se puede contar cuántos servicios pagados trajo cada canal y, más
 * adelante, subir a Google Ads conversiones offline por gclid.
 *
 * Modelo:
 * - `primera`: el primer toque registrado (primer contacto con el sitio).
 * - `ultima`: el último toque NO directo. Una visita directa (sin campaña ni
 *   referrer externo) no pisa el último toque: es el modelo "last non-direct
 *   click" que usan GA4 y Ads.
 * - Los toques vencen a los 90 días (vida útil del gclid en Ads).
 *
 * Privacidad: del referrer se guarda solo el dominio, nunca la ruta. No hay
 * datos personales.
 *
 * Las funciones puras (sin window) se usan también en el servidor.
 */

import { PARAMS_CAMPANA, sanitizarRuta, type ParamCampana } from './rutas'

export const ATRIBUCION_STORAGE_KEY = 'baird_atribucion'
export const ATRIBUCION_VIGENCIA_DIAS = 90
const MAX_LARGO_VALOR = 200

export type Toque = {
  /** ISO 8601 del momento de la visita. */
  ts: string
  /** Ruta de llegada (sin query). */
  landing: string
  /** Dominio externo que refirió la visita (sin ruta). */
  referrer?: string
} & Partial<Record<ParamCampana, string>>

export interface Atribucion {
  v: 1
  primera: Toque
  ultima: Toque
}

export type Canal =
  | 'google_ads'
  | 'meta_ads'
  | 'pago_otro'
  | 'campana'
  | 'organico_buscador'
  | 'social'
  | 'whatsapp'
  | 'referido'
  | 'directo'

/**
 * Construye el toque de una visita. `hostPropio` es el host del sitio: un
 * referrer del mismo sitio (navegación interna) no cuenta como referrer.
 */
export function construirToque(url: URL, referrer: string, ahora: Date, hostPropio: string): Toque {
  const toque: Toque = {
    ts: ahora.toISOString(),
    landing: sanitizarRuta(url.pathname).slice(0, MAX_LARGO_VALOR),
  }
  for (const p of PARAMS_CAMPANA) {
    const v = url.searchParams.get(p)
    if (v) toque[p] = v.slice(0, MAX_LARGO_VALOR)
  }
  const refHost = hostDeReferrer(referrer)
  if (refHost && refHost !== hostPropio.toLowerCase()) toque.referrer = refHost
  return toque
}

function hostDeReferrer(referrer: string): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** true si la visita trae campaña o un referrer externo (no es "directa"). */
export function esToqueNoDirecto(t: Toque): boolean {
  if (t.referrer) return true
  return PARAMS_CAMPANA.some(p => Boolean(t[p]))
}

function vencido(t: Toque, ahora: Date): boolean {
  const ms = ahora.getTime() - new Date(t.ts).getTime()
  return !Number.isFinite(ms) || ms > ATRIBUCION_VIGENCIA_DIAS * 24 * 60 * 60 * 1000
}

/**
 * Combina la atribución guardada con la visita actual.
 * - Sin nada guardado (o vencido): la visita es primera y última.
 * - Visita no directa: pasa a ser la última.
 * - Visita directa: no cambia nada.
 */
export function combinarAtribucion(prev: Atribucion | null, toque: Toque, ahora: Date): Atribucion {
  const vigente = prev && prev.v === 1 && prev.primera && prev.ultima ? prev : null
  if (!vigente || vencido(vigente.primera, ahora)) {
    return { v: 1, primera: toque, ultima: toque }
  }
  if (vencido(vigente.ultima, ahora)) {
    return { v: 1, primera: vigente.primera, ultima: toque }
  }
  if (esToqueNoDirecto(toque)) {
    return { v: 1, primera: vigente.primera, ultima: toque }
  }
  return vigente
}

// Por dominio registrado (con o sin subdominio): `www.google.com.co`,
// `l.facebook.com`, `t.co`. Anclado al final para que `microsoft.com` no
// matchee `t.co`.
const BUSCADORES = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia)(\.[a-z]{2,3}){1,2}$|(^|\.)search\.brave\.com$/
const REDES = /(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|twitter\.com|x\.com|linkedin\.com|lnkd\.in|tiktok\.com|youtube\.com|pinterest\.com)$/
const WHATSAPP = /(^|\.)(wa\.me|whatsapp\.com|whatsapp\.net)$/
const MEDIOS_PAGOS = ['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'display', 'cpm']
const FUENTES_META = ['facebook', 'fb', 'instagram', 'ig', 'meta']

/** Canal de un toque, para reportar por origen sin reinterpretar cada vez. */
export function clasificarCanal(t: Toque | null | undefined): Canal {
  if (!t) return 'directo'
  if (t.gclid || t.gbraid || t.wbraid || t.gad_source) return 'google_ads'
  if (t.fbclid) return 'meta_ads'

  const fuente = (t.utm_source ?? '').toLowerCase()
  const medio = (t.utm_medium ?? '').toLowerCase()
  if (fuente) {
    const pago = MEDIOS_PAGOS.includes(medio)
    if (pago && fuente.includes('google')) return 'google_ads'
    if (pago && FUENTES_META.includes(fuente)) return 'meta_ads'
    if (pago) return 'pago_otro'
    if (fuente.includes('whatsapp')) return 'whatsapp'
    return 'campana'
  }

  const ref = t.referrer ?? ''
  if (ref) {
    if (BUSCADORES.test(ref)) return 'organico_buscador'
    if (WHATSAPP.test(ref)) return 'whatsapp'
    if (REDES.test(ref)) return 'social'
    return 'referido'
  }
  return 'directo'
}

// ─── Navegador ──────────────────────────────────────────────────────────────

/** Registra la visita actual. Seguro en modo privado (localStorage puede lanzar). */
export function registrarVisita(): void {
  if (typeof window === 'undefined') return
  try {
    const toque = construirToque(
      new URL(window.location.href),
      document.referrer,
      new Date(),
      window.location.hostname,
    )
    const nueva = combinarAtribucion(leerAtribucion(), toque, new Date())
    window.localStorage.setItem(ATRIBUCION_STORAGE_KEY, JSON.stringify(nueva))
  } catch {
    // Sin storage no hay atribución: el lead se crea igual.
  }
}

/** Atribución guardada, o null si no hay / no se puede leer. */
export function leerAtribucion(): Atribucion | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ATRIBUCION_STORAGE_KEY)
    if (!raw) return null
    const a = JSON.parse(raw) as Atribucion
    return a && a.v === 1 && a.primera && a.ultima ? a : null
  } catch {
    return null
  }
}
