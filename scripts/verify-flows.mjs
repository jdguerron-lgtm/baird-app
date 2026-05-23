// scripts/verify-flows.mjs
//
// Smoke test de flujos críticos contra Supabase usando el anon key. Sirve
// para validar **antes y después** de cambios en RLS o Storage policies —
// si algún check falla, un flujo de la app está roto.
//
// Uso:
//   node --env-file=.env.local scripts/verify-flows.mjs
//
// Lo que verifica (todo con `anon_key`, sin sesión autenticada):
//   1. SELECT anon en cada tabla pública crítica (los flujos cliente/técnico
//      hacen SELECTs así desde el browser → si falla, esos flujos no cargan).
//   2. INSERT anon en Storage bucket `evidencias-servicio` (es exactamente
//      la operación del técnico subiendo evidencia desde el portal).
//   3. Lectura pública del objeto subido (cómo lo ve el admin/cliente).
//   4. Limpieza del objeto de prueba.
//
// No escribe en ninguna tabla, no modifica datos reales — solo storage de
// prueba que se borra al final. Salida: exit 0 si todo OK, 1 si algo falla.
//
// LIMITACIÓN: no simula el caso "admin logueado en mismo navegador → rol
// authenticated". Ese caso requiere las credenciales reales y se prueba
// manualmente desde el browser después del fix de Storage policies.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('❌  Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.')
  console.error('    Corré con: node --env-file=.env.local scripts/verify-flows.mjs')
  process.exit(2)
}

const sb = createClient(url, key)
const results = []

function record(name, ok, info) {
  results.push({ name, ok, info })
  const icon = ok ? '✅' : '❌'
  const suffix = info ? ` — ${info}` : ''
  console.log(`${icon}  ${name}${suffix}`)
}

// ─── 1. SELECT anon por tabla ───
console.log('── SELECT anon (lecturas que hace la app desde el browser) ──')
const tablas = [
  'solicitudes_servicio',
  'tecnicos',
  'evidencias_servicio',
  'notificaciones_whatsapp',
  'especialidades_tecnico',
  'solicitud_eventos',
  'repuestos_pendientes',
  'gps_pings',
]
for (const t of tablas) {
  try {
    const { error, count } = await sb.from(t).select('*', { count: 'exact', head: true })
    record(`SELECT anon ${t}`, !error, error?.message ?? `count=${count ?? 'n/a'}`)
  } catch (e) {
    record(`SELECT anon ${t}`, false, e.message)
  }
}

// ─── 2-4. Storage: upload + read + delete ───
console.log('\n── Storage anon (subida de evidencia del técnico) ──')
const bucket = 'evidencias-servicio'
const testPath = `_smoke_test/verify-flows-${Date.now()}.txt`
const testContent = new Blob([`smoke test ${new Date().toISOString()}`], { type: 'text/plain' })

let uploadOK = false
try {
  const { error } = await sb.storage.from(bucket).upload(testPath, testContent, { upsert: false })
  uploadOK = !error
  record(`INSERT anon storage:${bucket}`, !error, error?.message)
} catch (e) {
  record(`INSERT anon storage:${bucket}`, false, e.message)
}

if (uploadOK) {
  try {
    const { data } = sb.storage.from(bucket).getPublicUrl(testPath)
    const res = await fetch(data.publicUrl)
    record(`GET público storage:${bucket}`, res.ok, `HTTP ${res.status}`)
  } catch (e) {
    record(`GET público storage:${bucket}`, false, e.message)
  }

  try {
    const { error } = await sb.storage.from(bucket).remove([testPath])
    record(`DELETE anon storage:${bucket} (cleanup)`, !error, error?.message)
  } catch (e) {
    record(`DELETE anon storage:${bucket} (cleanup)`, false, e.message)
  }
} else {
  console.log('   (Skipping GET/DELETE — el upload falló)')
}

// ─── Resumen ───
const failed = results.filter(r => !r.ok)
console.log()
if (failed.length === 0) {
  console.log(`✅  Todos los checks pasaron (${results.length}/${results.length}). Los flujos críticos están operativos.`)
  process.exit(0)
} else {
  console.log(`❌  ${failed.length}/${results.length} checks fallaron:`)
  for (const f of failed) console.log(`   - ${f.name}: ${f.info}`)
  console.log('\n   Si esto corre después de un cambio de RLS/Storage policies, REVERTÍ el cambio antes de que se rompan flujos en prod.')
  process.exit(1)
}
