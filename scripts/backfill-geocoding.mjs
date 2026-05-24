/**
 * backfill-geocoding.mjs — Geocodifica las solicitudes_servicio existentes
 * que aún no tienen coordenadas (o que tienen un intento muy viejo).
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-geocoding.mjs                # geocodifica todas las pendientes
 *   node --env-file=.env.local scripts/backfill-geocoding.mjs --limit 50    # solo las primeras 50
 *   node --env-file=.env.local scripts/backfill-geocoding.mjs --dry-run     # imprime qué haría sin escribir
 *   node --env-file=.env.local scripts/backfill-geocoding.mjs --force        # re-geocodifica incluso si ya tiene coords
 *
 * Requiere env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (bypassa RLS — debe estar en .env.local local;
 *                              en Vercel solo si necesitás correrlo desde CI)
 *   GOOGLE_MAPS_API_KEY
 *
 * Rate limit: Google Geocoding API permite ~50 req/seg. Por seguridad este
 * script va a ~10 req/seg (sleep de 100ms entre cada una). Si tenés muchas
 * solicitudes, podés subirlo bajando el sleep.
 *
 * El script reusará la lógica de fallback (centro de ciudad) si Google falla.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!GOOGLE_API_KEY) {
  console.warn('⚠️  GOOGLE_MAPS_API_KEY no configurada — usaré solo centros de ciudad (todas marcadas como aproximadas)')
}

const args = process.argv.slice(2)
const limit = (() => {
  const i = args.indexOf('--limit')
  return i >= 0 ? parseInt(args[i + 1] ?? '0', 10) : 0
})()
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SLEEP_MS = 100
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Centros de ciudades CO (mismo mapa que geocoding.service.ts) ───
const CENTROS_CIUDADES_CO = [
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
const CENTRO_COLOMBIA = { lat: 4.5709, lng: -74.2973 }

function normalizar(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function centroDeCiudad(ciudad) {
  if (!ciudad) return { ...CENTRO_COLOMBIA, nombre: 'Colombia' }
  const n = normalizar(ciudad)
  for (const c of CENTROS_CIUDADES_CO) {
    if (n.includes(c.match)) return { lat: c.lat, lng: c.lng, nombre: c.match }
  }
  return { ...CENTRO_COLOMBIA, nombre: 'Colombia' }
}

async function googleGeocode(direccion, ciudad) {
  if (!GOOGLE_API_KEY) return null
  const query = `${direccion}, ${ciudad}, Colombia`
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', query)
  url.searchParams.set('key', GOOGLE_API_KEY)
  url.searchParams.set('region', 'co')
  url.searchParams.set('language', 'es')
  url.searchParams.set('components', 'country:CO')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const body = await res.json()
    if (body.status === 'OK' && body.results?.[0]?.geometry?.location) {
      return body.results[0].geometry.location
    }
    if (body.status !== 'ZERO_RESULTS') {
      console.warn(`  [google] status=${body.status} ${body.error_message ?? ''}`)
    }
    return null
  } catch (err) {
    console.warn(`  [google] error: ${err.message}`)
    return null
  }
}

async function main() {
  console.log('📍 backfill-geocoding.mjs')
  console.log(`   dry-run: ${dryRun}, force: ${force}, limit: ${limit || 'sin límite'}`)
  console.log('')

  // Query: solicitudes con direccion + ciudad y (sin coords O re-geocoding forzado)
  let query = supabase
    .from('solicitudes_servicio')
    .select('id, direccion, ciudad_pueblo, direccion_lat, direccion_lng, direccion_geocodificada_at')
    .not('direccion', 'is', null)
    .not('ciudad_pueblo', 'is', null)
    .order('created_at', { ascending: true })

  if (!force) {
    query = query.is('direccion_lat', null)
  }

  if (limit > 0) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) {
    console.error('❌ Error consultando solicitudes:', error)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('✨ No hay solicitudes pendientes de geocodificar.')
    return
  }

  console.log(`📋 ${rows.length} solicitudes a procesar.\n`)

  let exitos = 0
  let aproximadas = 0
  let errores = 0

  for (const row of rows) {
    const tag = `[${row.id.slice(0, 8)}]`
    const desc = `${row.direccion} / ${row.ciudad_pueblo}`

    const exact = await googleGeocode(row.direccion, row.ciudad_pueblo)
    let lat, lng, aproximada, fuente

    if (exact) {
      lat = exact.lat
      lng = exact.lng
      aproximada = false
      fuente = 'google'
      exitos++
    } else {
      const centro = centroDeCiudad(row.ciudad_pueblo)
      lat = centro.lat
      lng = centro.lng
      aproximada = true
      fuente = `centro-${centro.nombre}`
      aproximadas++
    }

    console.log(`${tag} ${aproximada ? '~' : '✓'} ${desc.padEnd(60).slice(0, 60)} → (${lat.toFixed(4)}, ${lng.toFixed(4)}) [${fuente}]`)

    if (!dryRun) {
      const { error: updErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          direccion_lat: lat,
          direccion_lng: lng,
          direccion_geocoding_aproximada: aproximada,
          direccion_geocodificada_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (updErr) {
        console.error(`${tag} ❌ update falló:`, updErr.message)
        errores++
      }
    }

    await sleep(SLEEP_MS)
  }

  console.log('')
  console.log(`✨ Done. Exactas: ${exitos}, Aproximadas: ${aproximadas}, Errores: ${errores}`)
  if (dryRun) console.log('   (dry-run — no se escribió nada a la BD)')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
