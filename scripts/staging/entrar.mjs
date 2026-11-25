#!/usr/bin/env node
// scripts/staging/entrar.mjs — puertas de entrada al ambiente de pruebas (baird-staging).
//
// Imprime los links para entrar a mano a cada portal de la app corriendo contra staging:
//   · Panel admin: link de un solo uso para fijar la clave de una cuenta admin (la crea si no existe).
//   · Portal del técnico, del supervisor y del cliente: links con tokens tomados del seed.
//   · Una solicitud por estado, para abrir su ficha en /admin/solicitudes/{id}.
//
// Uso (desde un worktree cuyo .env.local apunta a staging — scripts/e2e/preparar-env-staging.mjs):
//   npm run staging:entrar                          # usa el primer correo de ADMIN_EMAILS
//   npm run staging:entrar -- --email=otro@correo   # debe estar en ADMIN_EMAILS o LECTURA_EMAILS
//   npm run staging:entrar -- --base=https://<preview>.vercel.app
//   npm run staging:entrar -- --sin-admin           # solo los links de portales
//
// Guardas: se niega si la base no es baird-staging o si --base apunta al dominio de producción.
// No envía correos ni WhatsApp. La clave la escribe la persona en el navegador; este script no la ve.

import { createClient } from '@supabase/supabase-js'

const STAGING_REF = 'etsbzxnthpmyvuodrmrh'
const PROD_HOSTS = ['lineablanca.bairdservice.com', 'baird-app.vercel.app']

const args = new Map(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true] }))
const BASE = String(args.get('base') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3100').replace(/\/$/, '')
const SIN_ADMIN = Boolean(args.get('sin-admin'))

const abortar = (m) => { console.error(`❌  ${m}`); process.exit(2) }
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!sbUrl.includes(STAGING_REF)) abortar(`La base no es baird-staging (${STAGING_REF}). NEXT_PUBLIC_SUPABASE_URL=${sbUrl || '(vacía)'}`)
if (PROD_HOSTS.some(h => BASE.includes(h))) abortar(`--base apunta a producción (${BASE}). Me niego.`)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) abortar('Falta SUPABASE_SERVICE_ROLE_KEY (de staging) en .env.local.')

const csv = (v) => (v ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const permitidos = [...csv(process.env.ADMIN_EMAILS), ...csv(process.env.LECTURA_EMAILS)]
const email = String(args.get('email') ?? csv(process.env.ADMIN_EMAILS)[0] ?? '').trim().toLowerCase()

const db = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

console.log(`\n🧪 Ambiente de pruebas — base ${STAGING_REF} · app ${BASE}\n`)

// ── Panel admin ──────────────────────────────────────────────────────────────
if (!SIN_ADMIN) {
  if (!email) abortar('No hay correo: pasa --email=… o define ADMIN_EMAILS en .env.local.')
  if (!permitidos.includes(email)) abortar(`${email} no está en ADMIN_EMAILS / LECTURA_EMAILS del .env.local: el panel no lo dejaría entrar.`)

  const { data: lista, error: e1 } = await db.auth.admin.listUsers({ perPage: 200 })
  if (e1) abortar(`No pude listar usuarios de Auth: ${e1.message}`)
  if (!lista.users.some(u => (u.email ?? '').toLowerCase() === email)) {
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (error) abortar(`No pude crear la cuenta ${email}: ${error.message}`)
    console.log(`   (cuenta ${email} creada en Auth de staging)`)
  }
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data?.properties?.hashed_token) abortar(`No pude generar el link: ${error?.message ?? 'sin token'}`)

  console.log('🔐 Panel admin')
  console.log(`   Cuenta: ${email}`)
  console.log(`   1ª vez o clave olvidada (link de un solo uso, fija tu clave y entra):`)
  console.log(`   ${BASE}/admin/establecer-clave?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`)
  console.log(`   Después: ${BASE}/admin/login con ese correo y la clave que fijaste.\n`)
}

// ── Portales con token ───────────────────────────────────────────────────────
const uno = async (q) => { const { data } = await q.limit(1).maybeSingle(); return data }

const tec = await uno(db.from('tecnicos').select('nombre_completo, portal_token').not('portal_token', 'is', null).eq('estado_verificacion', 'verificado'))
  ?? await uno(db.from('tecnicos').select('nombre_completo, portal_token').not('portal_token', 'is', null))
const sup = await uno(db.from('supervisores').select('nombre, portal_token').not('portal_token', 'is', null).eq('activo', true))

console.log('🧑‍🔧 Portales')
if (tec) console.log(`   Técnico (${tec.nombre_completo}):  ${BASE}/tecnico/${tec.portal_token}`)
if (sup) console.log(`   Supervisor (${sup.nombre}):  ${BASE}/supervisor/${sup.portal_token}`)
console.log(`   Cliente nuevo:  ${BASE}/solicitar`)
console.log(`   Registro de técnico:  ${BASE}/registro\n`)

// ── Una solicitud por estado ─────────────────────────────────────────────────
const { data: sols, error: e2 } = await db.from('solicitudes_servicio')
  .select('id, estado, es_garantia, cliente_token, created_at').order('created_at', { ascending: false }).limit(500)
if (e2) abortar(`No pude leer solicitudes: ${e2.message}`)

const vistos = new Set()
console.log('📋 Una solicitud por estado (ficha admin · portal del cliente)')
for (const s of sols ?? []) {
  const clave = `${s.estado}|${s.es_garantia}`
  if (vistos.has(clave)) continue
  vistos.add(clave)
  console.log(`   ${s.estado.padEnd(28)} ${s.es_garantia ? 'garantía  ' : 'particular'}  ${BASE}/admin/solicitudes/${s.id}`)
  if (s.cliente_token) console.log(`   ${''.padEnd(28)}             ${BASE}/servicio/${s.cliente_token}`)
}
console.log(`\n   Total en staging: ${sols?.length ?? 0} solicitudes. Los datos son ficticios (seed anonimizado).`)
console.log('   WhatsApp, pagos, correo, Siigo y voz están apagados o bloqueados por whitelist en este ambiente.\n')
