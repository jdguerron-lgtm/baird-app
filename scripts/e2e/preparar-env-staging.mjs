#!/usr/bin/env node
// scripts/e2e/preparar-env-staging.mjs — arma el .env.local de un WORKTREE para correr la app
// contra baird-staging (nunca contra producción).
//
// Uso (desde el worktree donde se va a correr `npm run dev`):
//   node scripts/e2e/preparar-env-staging.mjs \
//     --base="C:/Users/Juan Guerron/Documents/baird-app/.env.local" \
//     --staging="C:/Users/Juan Guerron/Documents/baird-app/.env.staging-seed" \
//     [--puerto=3100]
//
// Qué hace:
//   - Toma del .env.local base solo lo que es seguro reutilizar (WhatsApp con whitelist cerrada,
//     allowlists de admin, Google Maps) y descarta todo lo de producción que escribe o cobra.
//   - Apunta Supabase a staging (URL, anon y service_role de staging).
//   - Apaga Wompi, Siigo, Resend, Dapta y Gemini (kill-switch por env vacía).
//   - Fija BAIRD_TEST_PHONE_WHITELIST a un número inexistente: ningún WhatsApp sale.
//   - Genera un CRON_SECRET local aleatorio.
// Guardas: se niega si la URL de staging es la de prod, si el destino es el .env.local del repo
// principal, o si el directorio actual no es un worktree en .wt/.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const PROD_REF = 'ceblicvdmephhktedsyv'
const STAGING_REF = 'etsbzxnthpmyvuodrmrh'
// La anon key es pública por diseño (viaja en el bundle del navegador).
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c2J6eG50aHBteXZ1b2RybXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODU5MjUsImV4cCI6MjEwODU2MTkyNX0.35KcD2KznRzw2zJHZBK7Ry4g20R6JyMatljdyrNzw_4'

const args = new Map(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const abortar = (m) => { console.error(`❌  ${m}`); process.exit(1) }

const base = args.get('base'); const staging = args.get('staging'); const puerto = Number(args.get('puerto') ?? 3100)
if (!base || !staging) abortar('Faltan --base y --staging.')

const cwd = process.cwd().replace(/\\/g, '/')
if (!/\/\.wt\/[^/]+$/.test(cwd)) abortar(`Corre esto desde un worktree en .wt/<nombre>. Directorio actual: ${cwd}`)
const destino = path.join(process.cwd(), '.env.local')
if (path.resolve(destino) === path.resolve(base)) abortar('El destino sería el mismo .env.local base. Me niego.')

function leer(p) {
  const kv = {}
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) kv[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return kv
}
const b = leer(base); const s = leer(staging)

const url = s.STAGING_SUPABASE_URL ?? ''
const key = s.STAGING_SERVICE_ROLE_KEY ?? ''
if (!url.includes(STAGING_REF)) abortar(`STAGING_SUPABASE_URL no es baird-staging (${STAGING_REF}).`)
if (url.includes(PROD_REF)) abortar('La URL de staging contiene el ref de producción. Me niego.')
if (!key || key.includes('PEGA_AQUI')) abortar('STAGING_SERVICE_ROLE_KEY vacía o sin reemplazar.')

const reutilizar = ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_WEBHOOK_SECRET',
  'ADMIN_EMAILS', 'NEXT_PUBLIC_ADMIN_EMAILS', 'LECTURA_EMAILS', 'NEXT_PUBLIC_LECTURA_EMAILS', 'GOOGLE_MAPS_API_KEY']

const env = {
  '# GENERADO por scripts/e2e/preparar-env-staging.mjs': '',
  [`# ${new Date().toISOString()} — apunta a baird-staging; NO usar en producción`]: '',
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: STAGING_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: key,
  NEXT_PUBLIC_APP_URL: `http://localhost:${puerto}`,
  BAIRD_TEST_PHONE_WHITELIST: '570000000000',
  CRON_SECRET: crypto.randomBytes(24).toString('hex'),
  ENABLE_TEST_ENDPOINTS: 'true',
  AGENDA_TECNICOS_ENABLED: 'false',
  DAPTA_ENABLED: 'false',
  WOMPI_PUBLIC_KEY: '', WOMPI_INTEGRITY_SECRET: '', WOMPI_EVENTS_SECRET: '', WOMPI_PRIVATE_KEY: '',
  SIIGO_USERNAME: '', SIIGO_ACCESS_KEY: '',
  RESEND_API_KEY: '',
  GEMINI_API_KEY: '',
}
for (const k of reutilizar) if (b[k] !== undefined) env[k] = b[k]

// Cuenta admin de pruebas (la crea y rota su clave scripts/e2e/flujos.mjs en el Auth de staging).
const E2E_ADMIN = 'e2e-admin@baird-staging.test'
const conAdminE2e = (lista) => [...new Set([...(lista ?? 'jdguerron@bairdservice.com').split(',').map(e => e.trim()).filter(Boolean), E2E_ADMIN])].join(',')
env.ADMIN_EMAILS = conAdminE2e(b.ADMIN_EMAILS)
env.NEXT_PUBLIC_ADMIN_EMAILS = conAdminE2e(b.NEXT_PUBLIC_ADMIN_EMAILS)

const texto = Object.entries(env).map(([k, v]) => (k.startsWith('#') ? k : `${k}=${v}`)).join('\n') + '\n'
fs.writeFileSync(destino, texto)
console.log(`✅  ${destino} escrito → Supabase ${STAGING_REF}, puerto ${puerto}, WhatsApp bloqueado por whitelist, pagos/correo/Siigo/voz apagados.`)
