/**
 * geocoding.service.ts — Geocoding de direcciones colombianas vía Google Maps API.
 *
 * Usado por:
 *   - POST /api/solicitar          (al crear la solicitud, fire-and-forget vía after())
 *   - POST /api/admin/editar-solicitud (cuando admin cambia direccion/ciudad)
 *   - scripts/backfill-geocoding.mjs   (one-shot para filas existentes)
 *
 * Estrategia:
 *   1. Llamar Google Geocoding API con "direccion, ciudad_pueblo, Colombia"
 *   2. Si retorna OK con result → guardar lat/lng exactas (aproximada=false)
 *   3. Si falla (ZERO_RESULTS, error, timeout) → caer al centro de la ciudad
 *      conocida (aproximada=true). Si la ciudad tampoco está en el mapa,
 *      cae al centroide de Colombia.
 *
 * Idempotente: marca direccion_geocodificada_at en cada intento (exitoso o no).
 * El caller decide si re-intentar (ej. backfill puede saltarse los ya intentados
 * recientemente para no quemar quota).
 */

import { supabase } from '@/lib/supabase'

const GOOGLE_API_BASE = 'https://maps.googleapis.com/maps/api/geocode/json'
const REQUEST_TIMEOUT_MS = 5_000

export interface GeocodingResult {
  lat: number
  lng: number
  aproximada: boolean
  ciudad_usada?: string
}

/**
 * Centros de las principales ciudades colombianas (lat, lng).
 * Usados como fallback cuando el geocoding no encuentra resultados exactos.
 * Match por substring case-insensitive contra el campo `ciudad_pueblo`.
 */
const CENTROS_CIUDADES_CO: Array<{ match: string; lat: number; lng: number }> = [
  { match: 'bogota',       lat: 4.7110,  lng: -74.0721 },
  { match: 'medellin',     lat: 6.2476,  lng: -75.5658 },
  { match: 'cali',         lat: 3.4516,  lng: -76.5320 },
  { match: 'barranquilla', lat: 10.9685, lng: -74.7813 },
  { match: 'cartagena',    lat: 10.3910, lng: -75.4794 },
  { match: 'cucuta',       lat: 7.8939,  lng: -72.5078 },
  { match: 'bucaramanga',  lat: 7.1193,  lng: -73.1227 },
  { match: 'pereira',      lat: 4.8133,  lng: -75.6961 },
  { match: 'manizales',    lat: 5.0703,  lng: -75.5138 },
  { match: 'santa marta',  lat: 11.2408, lng: -74.1990 },
  { match: 'ibague',       lat: 4.4389,  lng: -75.2322 },
  { match: 'pasto',        lat: 1.2136,  lng: -77.2811 },
  { match: 'monteria',     lat: 8.7479,  lng: -75.8814 },
  { match: 'villavicencio',lat: 4.1420,  lng: -73.6266 },
  { match: 'neiva',        lat: 2.9273,  lng: -75.2819 },
  { match: 'armenia',      lat: 4.5339,  lng: -75.6811 },
  { match: 'sincelejo',    lat: 9.3047,  lng: -75.3978 },
  { match: 'soacha',       lat: 4.5875,  lng: -74.2147 },
  { match: 'soledad',      lat: 10.9170, lng: -74.7642 },
  { match: 'chia',         lat: 4.8612,  lng: -74.0581 },
]

/** Centroide aproximado de Colombia (último fallback). */
const CENTRO_COLOMBIA = { lat: 4.5709, lng: -74.2973 }

/** Quita tildes y normaliza a lowercase para matching. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Resuelve el centro de la ciudad colombiana usando substring match.
 * Si no matchea nada → centroide de Colombia.
 */
function centroDeCiudad(ciudad: string | null | undefined): { lat: number; lng: number; nombre: string } {
  if (!ciudad) return { ...CENTRO_COLOMBIA, nombre: 'Colombia' }
  const ciudadNorm = normalizar(ciudad)
  for (const c of CENTROS_CIUDADES_CO) {
    if (ciudadNorm.includes(c.match)) {
      return { lat: c.lat, lng: c.lng, nombre: c.match }
    }
  }
  return { ...CENTRO_COLOMBIA, nombre: 'Colombia' }
}

/**
 * Llama Google Maps Geocoding API con timeout.
 * Retorna null en cualquier error (la decisión de fallback la toma el caller).
 */
async function llamarGoogleGeocoding(
  direccion: string,
  ciudad: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = `${direccion}, ${ciudad}, Colombia`
  const url = new URL(GOOGLE_API_BASE)
  url.searchParams.set('address', query)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('region', 'co')
  url.searchParams.set('language', 'es')
  // Componente "country:CO" — restringe los resultados a Colombia exclusivamente.
  // Sin esto, una "Calle 50 #10-20" puede matchear ciudades de México o Argentina.
  url.searchParams.set('components', 'country:CO')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[geocoding] Google API HTTP ${res.status} para "${query}"`)
      return null
    }

    const body = (await res.json()) as {
      status: string
      results?: Array<{
        geometry?: { location?: { lat: number; lng: number } }
        partial_match?: boolean
      }>
      error_message?: string
    }

    if (body.status === 'OK' && body.results?.[0]?.geometry?.location) {
      const loc = body.results[0].geometry.location
      return { lat: loc.lat, lng: loc.lng }
    }

    if (body.status !== 'ZERO_RESULTS') {
      // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, etc. → loguear
      console.warn(`[geocoding] Google API status=${body.status} message=${body.error_message ?? ''} query="${query}"`)
    }
    return null
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[geocoding] timeout (>${REQUEST_TIMEOUT_MS}ms) para "${query}"`)
    } else {
      console.warn(`[geocoding] error inesperado para "${query}":`, err)
    }
    return null
  }
}

/**
 * Geocodifica una dirección. Si falla, cae al centro de la ciudad (aproximada=true).
 * Si la ciudad tampoco está reconocida, cae al centroide de Colombia.
 *
 * Si GOOGLE_MAPS_API_KEY no está configurada, va directo al fallback de ciudad
 * (útil para dev local sin quemar quota).
 */
export async function geocodificarDireccion(
  direccion: string,
  ciudad: string,
): Promise<GeocodingResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    console.warn('[geocoding] GOOGLE_MAPS_API_KEY no configurada — usando centro de ciudad')
    const centro = centroDeCiudad(ciudad)
    return { lat: centro.lat, lng: centro.lng, aproximada: true, ciudad_usada: centro.nombre }
  }

  const exact = await llamarGoogleGeocoding(direccion, ciudad, apiKey)
  if (exact) {
    return { ...exact, aproximada: false }
  }

  const centro = centroDeCiudad(ciudad)
  return { lat: centro.lat, lng: centro.lng, aproximada: true, ciudad_usada: centro.nombre }
}

/**
 * Geocodifica + actualiza la fila en la BD. Diseñada para fire-and-forget
 * desde routes API (via `after()` de Next.js) o para usarse en backfill scripts.
 *
 * Idempotente — siempre marca `direccion_geocodificada_at` con el momento del
 * intento, así backfill puede usarlo como filtro (no re-geocodificar si <30 días).
 */
export async function geocodificarYGuardar(solicitudId: string): Promise<void> {
  // 1. Leer solicitud
  const { data: sol, error: readErr } = await supabase
    .from('solicitudes_servicio')
    .select('id, direccion, ciudad_pueblo')
    .eq('id', solicitudId)
    .single()

  if (readErr || !sol) {
    console.warn(`[geocoding] solicitud ${solicitudId} no encontrada para geocodificar`)
    return
  }

  if (!sol.direccion || !sol.ciudad_pueblo) {
    console.warn(`[geocoding] solicitud ${solicitudId} sin direccion o ciudad_pueblo`)
    return
  }

  // 2. Geocodificar
  const result = await geocodificarDireccion(sol.direccion, sol.ciudad_pueblo)

  // 3. Guardar
  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      direccion_lat: result.lat,
      direccion_lng: result.lng,
      direccion_geocoding_aproximada: result.aproximada,
      direccion_geocodificada_at: new Date().toISOString(),
    })
    .eq('id', solicitudId)

  if (updErr) {
    console.error(`[geocoding] update falló para solicitud ${solicitudId}:`, updErr)
  }
}
