#!/usr/bin/env node
// scripts/conectividad.mjs — verifica la conectividad con cada servicio externo. SOLO LECTURA.
//
// Ninguna llamada crea, envía ni cobra nada: health checks, lecturas de configuración y listados.
// Lo que no tiene credencial en el env donde se corre se marca "sin credencial aquí" (no es fallo).
//
// Uso:
//   node --env-file=.env.local scripts/conectividad.mjs                       # producción (credenciales locales)
//   node --env-file=.env.local --env-file=.env.staging-seed scripts/conectividad.mjs   # + staging
//   node --env-file=.env.local scripts/conectividad.mjs --json
//
// Sale con código 1 si falla un servicio CRÍTICO (app, Supabase, WhatsApp, Wompi).

import tls from 'node:tls'

const JSON_OUT = process.argv.includes('--json')
const APP = (process.env.CONECTIVIDAD_APP_URL ?? 'https://lineablanca.bairdservice.com').replace(/\/$/, '')
const res = []

async function check(servicio, critico, fn) {
  const t0 = Date.now()
  try {
    const r = await fn()
    if (r === null) res.push({ servicio, critico, estado: 'omitido', ms: 0, detalle: 'sin credencial aquí' })
    else res.push({ servicio, critico, estado: 'ok', ms: Date.now() - t0, detalle: r })
  } catch (e) {
    res.push({ servicio, critico, estado: 'falla', ms: Date.now() - t0, detalle: e?.message ?? String(e) })
  }
}
async function getJson(url, init = {}) {
  const ctl = AbortSignal.timeout(15_000)
  const r = await fetch(url, { ...init, signal: ctl })
  const txt = await r.text()
  let j = null; try { j = JSON.parse(txt) } catch { /* no JSON */ }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(j?.error?.message ?? j?.message ?? txt).toString().slice(0, 140)}`)
  return j ?? txt
}
function certDias(host) {
  return new Promise((ok, mal) => {
    const s = tls.connect(443, host, { servername: host, timeout: 10_000 }, () => {
      const c = s.getPeerCertificate(); s.end()
      ok(Math.floor((new Date(c.valid_to) - Date.now()) / 86_400_000))
    })
    s.on('error', mal); s.on('timeout', () => { s.destroy(); mal(new Error('timeout TLS')) })
  })
}

// ── App y dominio ───────────────────────────────────────────────────────────
await check('App producción (/api/health)', true, async () => {
  const j = await getJson(`${APP}/api/health`)
  if (j?.status !== 'healthy') throw new Error(JSON.stringify(j))
  return 'healthy (incluye lectura real a Supabase con service_role)'
})
await check('Certificado TLS del dominio', true, async () => {
  const host = new URL(APP).hostname
  const d = await certDias(host)
  if (d < 14) throw new Error(`vence en ${d} días`)
  return `${host} vence en ${d} días (Vercel lo renueva solo)`
})

// ── Supabase ────────────────────────────────────────────────────────────────
async function supabase(nombre, url, key) {
  if (!url || !key) return null
  const h = { apikey: key, authorization: `Bearer ${key}` }
  const auth = await getJson(`${url}/auth/v1/health`, { headers: { apikey: key } })
  const buckets = await getJson(`${url}/storage/v1/bucket`, { headers: h })
  const rest = await fetch(`${url}/rest/v1/tecnicos?select=id&limit=1`, { headers: h, signal: AbortSignal.timeout(15_000) })
  if (!rest.ok) throw new Error(`REST HTTP ${rest.status}`)
  return `Auth ${auth?.name ?? 'ok'} · REST ok · Storage ${Array.isArray(buckets) ? buckets.length : '?'} buckets`
}
await check('Supabase producción (Auth, REST, Storage)', true, () =>
  supabase('prod', process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY))
await check('Supabase staging (Auth, REST, Storage)', false, () =>
  supabase('staging', process.env.STAGING_SUPABASE_URL, process.env.STAGING_SERVICE_ROLE_KEY))

// ── WhatsApp (Meta Cloud API) ───────────────────────────────────────────────
await check('WhatsApp · número y calidad (Meta)', true, async () => {
  const id = process.env.WHATSAPP_PHONE_ID, tok = process.env.WHATSAPP_API_TOKEN
  if (!id || !tok) return null
  const j = await getJson(`https://graph.facebook.com/v22.0/${id}?fields=display_phone_number,verified_name,quality_rating,status,name_status,messaging_limit_tier,throughput`, { headers: { authorization: `Bearer ${tok}` } })
  const alerta = j.quality_rating && j.quality_rating !== 'GREEN' ? ` ⚠️ calidad ${j.quality_rating}` : ''
  return `${j.display_phone_number} · ${j.verified_name} · calidad ${j.quality_rating ?? '?'} · estado ${j.status ?? '?'} · límite ${j.messaging_limit_tier ?? '?'}${alerta}`
})

// ── Wompi ───────────────────────────────────────────────────────────────────
await check('Wompi · comercio (llave pública)', true, async () => {
  const pub = process.env.WOMPI_PUBLIC_KEY
  if (!pub) return null
  const base = pub.startsWith('pub_test_') ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1'
  const j = await getJson(`${base}/merchants/${pub}`)
  const d = j?.data ?? {}
  return `${d.name ?? '?'} · ${pub.startsWith('pub_test_') ? 'sandbox' : 'producción'} · métodos ${(d.accepted_payment_methods ?? []).join(', ') || '?'}`
})

// ── Integraciones que suelen vivir solo en Vercel ───────────────────────────
await check('Siigo · autenticación', false, async () => {
  const u = process.env.SIIGO_USERNAME, k = process.env.SIIGO_ACCESS_KEY
  if (!u || !k) return null
  const j = await getJson('https://api.siigo.com/auth', { method: 'POST', headers: { 'content-type': 'application/json', 'Partner-Id': process.env.SIIGO_PARTNER_ID ?? 'BairdApp' }, body: JSON.stringify({ username: u, access_key: k }) })
  return j?.access_token ? `token emitido (expira en ${j.expires_in ?? '?'} s)` : 'sin token'
})
await check('Resend · dominios de correo', false, async () => {
  const k = process.env.RESEND_API_KEY
  if (!k) return null
  const j = await getJson('https://api.resend.com/domains', { headers: { authorization: `Bearer ${k}` } })
  return (j?.data ?? []).map(d => `${d.name}:${d.status}`).join(', ') || 'sin dominios'
})
await check('Google Maps · geocoding', false, async () => {
  const k = process.env.GOOGLE_MAPS_API_KEY
  if (!k) return null
  const j = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Carrera 80C 24D-74, Bogotá')}&key=${k}`)
  if (j.status !== 'OK') throw new Error(j.status)
  return 'OK'
})
await check('Gemini (triaje IA, apagado en la app)', false, async () => {
  const k = process.env.GEMINI_API_KEY
  if (!k) return null
  const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${k}`)
  return `clave válida (${(j?.models ?? []).length ? 'responde' : 'sin modelos'})`
})

// ── Salida ──────────────────────────────────────────────────────────────────
const criticosCaidos = res.filter(r => r.critico && r.estado === 'falla')
if (JSON_OUT) {
  console.log(JSON.stringify({ fecha: new Date().toISOString(), ok: criticosCaidos.length === 0, resultados: res }, null, 2))
} else {
  console.log(`Conectividad · ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`)
  const icono = { ok: '✅', falla: '❌', omitido: '⏭️ ' }
  for (const r of res) console.log(`${icono[r.estado]} ${r.critico ? '[crítico] ' : '          '}${r.servicio.padEnd(42)} ${String(r.ms).padStart(5)} ms  ${r.detalle}`)
  console.log(criticosCaidos.length === 0 ? '\n✅  Servicios críticos alcanzables' : `\n❌  ${criticosCaidos.length} servicio(s) crítico(s) con falla`)
}
process.exit(criticosCaidos.length === 0 ? 0 : 1)
