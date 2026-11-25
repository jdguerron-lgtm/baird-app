#!/usr/bin/env node
// scripts/smoke.mjs — smoke test de SOLO LECTURA contra un despliegue.
//
// Se corre después de cada deploy (producción o preview) y en cada ronda del
// monitoreo de 15 minutos del protocolo de despliegue (docs/FLUJO-DESARROLLO.md § 6).
// No crea, modifica ni borra datos: solo GET, más dos POST que deben ser
// rechazados con 401 antes de tocar la base (webhook sin firma, admin sin token).
//
// Uso:
//   node scripts/smoke.mjs                                   # producción
//   node scripts/smoke.mjs https://<preview>.vercel.app      # preview
//   node scripts/smoke.mjs <url> --bypass=<token>            # preview protegida por Vercel Authentication
//                                                           #   (Settings → Deployment Protection → Protection Bypass for Automation)
//   node scripts/smoke.mjs <url> --json                      # salida JSON (para CI o bitácora)
//
// Sale con código 1 si algún check falla.

const args = process.argv.slice(2)
const base = (args.find(a => !a.startsWith('--')) ?? 'https://lineablanca.bairdservice.com').replace(/\/$/, '')
const bypass = args.find(a => a.startsWith('--bypass='))?.split('=')[1] ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const json = args.includes('--json')

const headersBase = bypass ? { 'x-vercel-protection-bypass': bypass } : {}
const resultados = []

async function check(nombre, fn) {
  const t0 = Date.now()
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, ms: Date.now() - t0, detalle })
  } catch (e) {
    resultados.push({ nombre, ok: false, ms: Date.now() - t0, detalle: e?.message ?? String(e) })
  }
}

async function pedir(path, init = {}) {
  return fetch(base + path, { redirect: 'manual', ...init, headers: { ...headersBase, ...(init.headers ?? {}) } })
}

function esperar(cond, msg) { if (!cond) throw new Error(msg) }

// 1. Salud: hace un select real a Supabase con service_role.
await check('GET /api/health → healthy', async () => {
  const r = await pedir('/api/health')
  const body = await r.text()
  esperar(r.status === 200, `status ${r.status}${r.status === 302 || r.status === 401 ? ' (¿preview protegida? usa --bypass o VERCEL_AUTOMATION_BYPASS_SECRET)' : ''}`)
  esperar(body.includes('"healthy"'), `body ${body.slice(0, 80)}`)
  return 'healthy'
})

// 2. Páginas públicas y de entrada que deben responder 200.
for (const p of ['/', '/solicitar', '/registro', '/admin/login', '/servicios/reparacion-neveras-bogota', '/terminos', '/politica-privacidad', '/robots.txt', '/sitemap.xml']) {
  await check(`GET ${p} → 200`, async () => {
    const r = await pedir(p)
    esperar(r.status === 200, `status ${r.status}${r.status === 302 || r.status === 401 ? ' (¿preview protegida? usa --bypass)' : ''}`)
    return `${r.status}`
  })
}

// 3. Headers de seguridad (middleware) y noindex en rutas privadas.
await check('Headers de seguridad en /', async () => {
  const r = await pedir('/')
  const faltan = ['strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']
    .filter(h => !r.headers.get(h))
  esperar(faltan.length === 0, `faltan: ${faltan.join(', ')}`)
  return 'completos'
})
await check('X-Robots-Tag noindex en /admin/login', async () => {
  const r = await pedir('/admin/login')
  const v = r.headers.get('x-robots-tag') ?? ''
  esperar(v.includes('noindex'), `x-robots-tag="${v}"`)
  return v
})

// 4. Token inexistente en un portal: 404, nunca 500.
await check('Portal con token inexistente → 404', async () => {
  const r = await pedir('/servicio/00000000-0000-0000-0000-000000000000')
  esperar(r.status === 404, `status ${r.status}`)
  return '404'
})

// 5. Rechazos de autorización: deben cortar con 401 sin tocar datos.
await check('POST /api/whatsapp/webhook sin firma → 401', async () => {
  const r = await pedir('/api/whatsapp/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  esperar(r.status === 401, `status ${r.status}`)
  return '401'
})
await check('POST /api/admin/cambiar-estado sin token → 401', async () => {
  const r = await pedir('/api/admin/cambiar-estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  esperar(r.status === 401, `status ${r.status}`)
  return '401'
})

// ── Salida ─────────────────────────────────────────────────────────────────
const fallos = resultados.filter(r => !r.ok)
if (json) {
  console.log(JSON.stringify({ base, fecha: new Date().toISOString(), ok: fallos.length === 0, resultados }, null, 2))
} else {
  console.log(`Smoke test · ${base} · ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`)
  for (const r of resultados) console.log(`${r.ok ? '✅' : '❌'}  ${r.nombre.padEnd(48)} ${String(r.ms).padStart(5)} ms  ${r.detalle}`)
  console.log(fallos.length === 0 ? `\n✅  ${resultados.length}/${resultados.length} checks OK` : `\n❌  ${fallos.length} de ${resultados.length} checks fallaron`)
}
process.exit(fallos.length === 0 ? 0 : 1)
