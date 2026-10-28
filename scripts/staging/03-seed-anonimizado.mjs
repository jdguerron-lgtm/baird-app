#!/usr/bin/env node
// scripts/staging/03-seed-anonimizado.mjs
//
// Copia un subconjunto de PRODUCCIÓN a STAGING anonimizando PII y regenerando tokens.
// Sobre prod SOLO ejecuta SELECT. Se niega a escribir si el destino es prod.
//
// Uso:
//   # Ensayo: lee prod y anonimiza, NO escribe nada; muestra conteos, auditoría de fugas y una fila de muestra.
//   node --env-file=.env.local scripts/staging/03-seed-anonimizado.mjs --dry [--solicitudes=40]
//   # Seed real hacia staging:
//   node --env-file=.env.local --env-file=.env.staging-seed scripts/staging/03-seed-anonimizado.mjs --confirmo-staging [--solicitudes=40]
//
// Env (ver scripts/staging/README.md § 5):
//   PROD_SUPABASE_URL / PROD_SERVICE_ROLE_KEY  (si faltan, usa NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY del .env.local)
//   STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY  (solo para el seed real)

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const PROD_REF = 'ceblicvdmephhktedsyv'
const PLACEHOLDER_IMG = 'https://placehold.co/800x600?text=evidencia+de+prueba'

// ── Argumentos y guardas ─────────────────────────────────────────────────
const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const N_SOLICITUDES = Number(args.get('solicitudes') ?? 40)
const DRY = Boolean(args.get('dry'))

const prodUrl = process.env.PROD_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const prodKey = process.env.PROD_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const stUrl = process.env.STAGING_SUPABASE_URL
const stKey = process.env.STAGING_SERVICE_ROLE_KEY

function abortar(msg) { console.error(`❌  ${msg}`); process.exit(1) }

if (!prodUrl || !prodKey) abortar('Faltan las credenciales de lectura de prod (PROD_* o NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).')
if (!DRY) {
  if (!args.get('confirmo-staging')) abortar('Falta --confirmo-staging (confirmación explícita de que el destino es staging). Para ensayar sin escribir: --dry.')
  if (!stUrl || !stKey) abortar('Faltan STAGING_SUPABASE_URL / STAGING_SERVICE_ROLE_KEY.')
  if (stUrl.replace(/\/$/, '') === prodUrl.replace(/\/$/, '')) abortar('STAGING_SUPABASE_URL es igual a la URL de prod. Me niego.')
  if (stUrl.includes(PROD_REF)) abortar(`STAGING_SUPABASE_URL contiene el ref de producción (${PROD_REF}). Me niego.`)
}
if (!Number.isInteger(N_SOLICITUDES) || N_SOLICITUDES < 1 || N_SOLICITUDES > 500) abortar('--solicitudes debe ser un entero entre 1 y 500.')

const prod = createClient(prodUrl, prodKey, { auth: { persistSession: false, autoRefreshToken: false } })
const st = DRY ? null : createClient(stUrl, stKey, { auth: { persistSession: false, autoRefreshToken: false } })

// ── Anonimización ────────────────────────────────────────────────────────
let contador = 0
const siguiente = () => String(++contador).padStart(6, '0')
const telefonoFicticio = () => '573000' + siguiente()          // 12 dígitos, formato móvil CO válido, inexistente
const correoFicticio = () => `staging+${siguiente()}@example.com`
const documentoFicticio = () => '1000' + siguiente()

const RE_NOMBRE = /(^|_)(nombre|nombres|apellido|apellidos|nombre_completo|full_name|legal_name)($|_)/i
const RE_NOMBRE_EXCLUIR = /equipo|archivo|producto|modelo|marca|plantilla|empresa|banco|template|falla|tipo/i
const RE_TEL = /telefono|whatsapp|celular|phone/i
const RE_EMAIL = /email|correo/i
const RE_DIR = /direccion|address/i
const RE_DIR_EXCLUIR = /lat|lng|geocod/i
const RE_BARRIO = /barrio|indicaciones|referencia_direccion|apto|apartamento|edificio/i
const RE_DOC = /(^|_)(documento|cedula|nit|legal_id|numero_documento)($|_)/i
const RE_DOC_EXCLUIR = /tipo_documento|_url|_path|legal_id_type/i
const RE_TOKEN = /token$/i
const RE_COORD = /(_lat|_lng|latitude|longitude)$/i

const RE_STORAGE_PROD = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/[^\s"']+/g
const RE_TEL_TEXTO = /\b573\d{9}\b/g
const RE_EMAIL_TEXTO = /[\w.+-]+@[\w-]+\.[\w.-]+/g

function limpiarTexto(s) {
  return s
    .replace(RE_STORAGE_PROD, PLACEHOLDER_IMG)
    .replace(RE_TEL_TEXTO, '573000000000')
    .replace(RE_EMAIL_TEXTO, 'staging@example.com')
}

/** Anonimiza un valor según el nombre de su clave. Recursivo para JSONB. */
function anonimizar(clave, valor, tabla) {
  if (valor === null || valor === undefined) return valor
  const k = String(clave)

  if (Array.isArray(valor)) return valor.map(v => anonimizar(k, v, tabla))
  if (typeof valor === 'object') {
    const out = {}
    for (const [kk, vv] of Object.entries(valor)) out[kk] = anonimizar(kk, vv, tabla)
    return out
  }
  if (typeof valor === 'number') {
    if (RE_COORD.test(k)) return Math.round(valor * 100) / 100
    return valor
  }
  if (typeof valor !== 'string') return valor

  if (RE_TOKEN.test(k)) return randomUUID()
  if (RE_TEL.test(k)) return telefonoFicticio()
  if (RE_EMAIL.test(k)) return correoFicticio()
  if (RE_DOC.test(k) && !RE_DOC_EXCLUIR.test(k)) return documentoFicticio()
  if (RE_NOMBRE.test(k) && !RE_NOMBRE_EXCLUIR.test(k)) return `Prueba ${tabla} ${siguiente()}`
  if (RE_DIR.test(k) && !RE_DIR_EXCLUIR.test(k)) return 'Calle 1 # 2-3 (dato de prueba)'
  if (RE_BARRIO.test(k)) return 'Barrio de prueba'
  return limpiarTexto(valor)
}

function anonimizarFila(fila, tabla) {
  const out = {}
  for (const [k, v] of Object.entries(fila)) out[k] = anonimizar(k, v, tabla)
  return out
}

// ── Lectura (prod) y escritura (staging) ─────────────────────────────────
async function leer(tabla, modificar) {
  let q = prod.from(tabla).select('*')
  if (modificar) q = modificar(q)
  const { data, error } = await q
  if (error) abortar(`Leyendo ${tabla} en prod: ${error.message}`)
  return data ?? []
}

async function escribir(tabla, filas) {
  if (filas.length === 0) { console.log(`   ${tabla}: 0 filas`); return }
  const tieneId = Object.prototype.hasOwnProperty.call(filas[0], 'id')
  for (let i = 0; i < filas.length; i += 100) {
    const lote = filas.slice(i, i + 100)
    const { error } = tieneId
      ? await st.from(tabla).upsert(lote, { onConflict: 'id' })
      : await st.from(tabla).insert(lote)
    if (error) abortar(`Escribiendo ${tabla} en staging (lote ${i / 100 + 1}): ${error.message}`)
  }
  console.log(`   ${tabla}: ${filas.length} filas`)
}

async function main() {
  console.log(DRY
    ? `→ ENSAYO (--dry): lee prod y anonimiza, no escribe nada (últimas ${N_SOLICITUDES} solicitudes)`
    : `→ Seed anonimizado: prod → ${stUrl} (últimas ${N_SOLICITUDES} solicitudes)`)

  if (!DRY) {
    // Sanidad del destino: debe existir el schema (tabla principal).
    const { count, error: errCount } = await st.from('solicitudes_servicio').select('id', { count: 'exact', head: true })
    if (errCount) abortar(`Staging no responde o no tiene el schema aplicado: ${errCount.message}`)
    console.log(`   staging tiene hoy ${count ?? 0} solicitudes`)
  }

  // 1. Técnicos y especialidades (todos; son pocos).
  const tecnicos = (await leer('tecnicos')).map(f => anonimizarFila(f, 'tecnico'))
  const especialidades = await leer('especialidades_tecnico')
  // 2. Supervisores (teléfonos ficticios → ningún aviso real desde staging).
  const supervisores = (await leer('supervisores')).map(f => anonimizarFila(f, 'supervisor'))

  // 3. Últimas N solicitudes + satélites.
  const solicitudes = (await leer('solicitudes_servicio', q => q.order('created_at', { ascending: false }).limit(N_SOLICITUDES)))
    .map(f => {
      const a = anonimizarFila(f, 'cliente')
      if ('codigo_descuento_id' in a) a.codigo_descuento_id = null   // tabla no copiada
      if ('auxiliares_ids' in a) a.auxiliares_ids = null              // tabla no copiada
      return a
    })
  const ids = solicitudes.map(s => s.id)
  const porSolicitud = q => q.in('solicitud_id', ids)

  const notificaciones = (await leer('notificaciones_whatsapp', porSolicitud)).map(f => anonimizarFila(f, 'notificacion'))
  const evidencias = (await leer('evidencias_servicio', porSolicitud)).map(f => anonimizarFila(f, 'evidencia'))
  const repuestos = (await leer('repuestos_pendientes', porSolicitud)).map(f => anonimizarFila(f, 'repuesto'))
  const eventos = (await leer('solicitud_eventos', porSolicitud)).map(f => anonimizarFila(f, 'evento'))
  const pagos = (await leer('pagos', porSolicitud)).map(f => anonimizarFila(f, 'pago'))
  const pings = (await leer('gps_pings', porSolicitud)).map(f => anonimizarFila(f, 'ping'))

  if (DRY) {
    const lotes = { tecnicos, especialidades, supervisores, solicitudes, notificaciones, evidencias, repuestos, eventos, pagos, pings }
    for (const [k, v] of Object.entries(lotes)) console.log(`   ${k.padEnd(16)} ${v.length} filas`)
    // Auditoría de fugas sobre TODO lo anonimizado: móviles reales, correos y URLs de Storage de prod.
    const blob = JSON.stringify(lotes)
    const tel = (blob.match(/\b573(?!000)\d{9}\b/g) ?? []).length
    const mail = (blob.match(/[\w.+-]+@(?!example\.com)[\w-]+\.[\w.-]+/g) ?? []).length
    const urls = (blob.match(/supabase\.co\/storage\/v1\/object/g) ?? []).length
    console.log(`   fugas detectadas → teléfonos: ${tel} · correos: ${mail} · URLs de Storage de prod: ${urls}`)
    const m = solicitudes[0] ?? {}
    const muestra = Object.fromEntries(['cliente_nombre', 'cliente_telefono', 'cliente_email', 'direccion', 'cliente_token', 'estado', 'es_garantia']
      .filter(k => k in m).map(k => [k, m[k]]))
    console.log('   muestra de solicitud anonimizada:', JSON.stringify(muestra))
    console.log(tel + mail + urls === 0
      ? '✅  Ensayo OK: sin fugas detectadas. Nada se escribió.'
      : '⚠️  Revisar las reglas de anonimización antes del seed real. Nada se escribió.')
    return
  }

  console.log('→ Escribiendo en staging (orden por FK):')
  await escribir('tecnicos', tecnicos)
  await escribir('especialidades_tecnico', especialidades)
  await escribir('supervisores', supervisores)
  await escribir('solicitudes_servicio', solicitudes)
  await escribir('notificaciones_whatsapp', notificaciones)
  await escribir('evidencias_servicio', evidencias)
  await escribir('repuestos_pendientes', repuestos)
  await escribir('solicitud_eventos', eventos)
  await escribir('pagos', pagos)
  await escribir('gps_pings', pings)

  console.log('✅  Seed terminado. Recuerda: fotos = placeholders; textos libres sin anonimizar; whitelist obligatoria en Preview.')
}

main().catch(e => abortar(e?.message ?? String(e)))
