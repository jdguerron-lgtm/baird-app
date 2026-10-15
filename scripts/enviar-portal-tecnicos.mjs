// Envía a cada TÉCNICO el link de SU portal (/tecnico/{portal_token}) por
// WhatsApp con la plantilla `tecnico_portal_v1` (botón URL dinámico con el
// portal_token; funciona fuera de la ventana de 24h). 2026-10-15.
//
// Uso:
//   node --env-file=.env.local scripts/enviar-portal-tecnicos.mjs [flags]
//   --dry                 : no envía, solo lista destinatarios y links
//   --force               : envía aunque la plantilla no figure APPROVED
//   --solo-verificados    : solo técnicos con estado_verificacion='verificado'
//   --incluir-rechazados  : por defecto se omiten los 'rechazado'
//   --to 573001234567     : enviar SOLO a ese número (prueba); varios separados por coma
//   --ignorar-whitelist   : envío real a todos aunque .env.local tenga BAIRD_TEST_PHONE_WHITELIST
//
// Por defecto omite: rechazados, cuentas de prueba (nombre con "prueba"),
// registros no verificados cuyo celular ya tiene uno verificado (duplicados),
// técnicos sin portal_token y celulares que no son móvil colombiano.
// Respeta BAIRD_TEST_PHONE_WHITELIST (misma semántica que la app).
import { createClient } from '@supabase/supabase-js'

const API = 'https://graph.facebook.com/v22.0'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const WABA_ID = process.env.WABA_ID || '2354953275016882'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Solo para el log: el botón real lo arma Meta con la URL fija de la plantilla.
const APP_URL = 'https://lineablanca.bairdservice.com'
const WHITELIST = args0().includes('--ignorar-whitelist') ? [] : (process.env.BAIRD_TEST_PHONE_WHITELIST || '')
  .split(',').map(s => s.trim()).filter(Boolean)

const TEMPLATE = 'tecnico_portal_v1'
function args0() { return process.argv.slice(2) }

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const FORCE = args.includes('--force')
const SOLO_VERIFICADOS = args.includes('--solo-verificados')
const INCLUIR_RECHAZADOS = args.includes('--incluir-rechazados')
const toIdx = args.indexOf('--to')
const SOLO_A = toIdx !== -1 && args[toIdx + 1] ? args[toIdx + 1].split(',').map(normalizeCO) : null

if (!TOKEN || !PHONE_ID) { console.error('Faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID'); process.exit(1) }
if (!SB_URL || !SB_KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

function normalizeCO(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) d = '57' + d
  return d
}
const esMovilCO = d => /^573\d{9}$/.test(d)

// 1. Estado de la plantilla
const tr = await fetch(`${API}/${WABA_ID}/message_templates?name=${TEMPLATE}&limit=5`, { headers: { Authorization: `Bearer ${TOKEN}` } })
const tb = await tr.json()
const status = (tb.data || []).find(t => t.name === TEMPLATE)?.status || 'NO_EXISTE'
console.log(`Plantilla ${TEMPLATE}: ${status}`)
if (status !== 'APPROVED' && !FORCE && !DRY) {
  console.error(`Aún no está APPROVED. Subila con \`node --env-file=.env.local scripts/upload-templates.mjs ${TEMPLATE}\`, esperá la aprobación y volvé a correr (o --force).`)
  process.exit(1)
}

// 2. Técnicos
const supabase = createClient(SB_URL, SB_KEY)
const { data: tecnicos, error } = await supabase
  .from('tecnicos')
  .select('id, nombre_completo, whatsapp, portal_token, estado_verificacion')
  .order('created_at', { ascending: true })
if (error) { console.error('Query tecnicos falló:', error.message); process.exit(1) }

// Celulares con al menos un registro VERIFICADO: sus registros no verificados
// son duplicados o cuentas de prueba (p.ej. Carlos Mauricio Bonilla tiene un
// duplicado 'pendiente' con portal vacío) → no se le manda ese link.
const celularesVerificados = new Set(
  tecnicos.filter(t => t.estado_verificacion === 'verificado').map(t => normalizeCO(t.whatsapp)),
)

const omitidos = []
const destinatarios = tecnicos.filter(t => {
  const d = normalizeCO(t.whatsapp)
  if (t.estado_verificacion !== 'verificado' && celularesVerificados.has(d)) { omitidos.push([t, 'duplicado: ese celular ya tiene un registro verificado']); return false }
  if (!t.portal_token) { omitidos.push([t, 'sin portal_token']); return false }
  if (!esMovilCO(d)) { omitidos.push([t, `whatsapp inválido "${t.whatsapp}"`]); return false }
  if (/prueba/i.test(t.nombre_completo || '')) { omitidos.push([t, 'cuenta de prueba']); return false }
  if (!INCLUIR_RECHAZADOS && t.estado_verificacion === 'rechazado') { omitidos.push([t, 'rechazado']); return false }
  if (SOLO_VERIFICADOS && t.estado_verificacion !== 'verificado') { omitidos.push([t, `no verificado (${t.estado_verificacion})`]); return false }
  if (SOLO_A && !SOLO_A.includes(d)) { omitidos.push([t, 'fuera de --to']); return false }
  if (WHITELIST.length > 0 && !WHITELIST.includes(d)) { omitidos.push([t, 'fuera de BAIRD_TEST_PHONE_WHITELIST']); return false }
  return true
})

console.log(`\n${tecnicos.length} técnicos en BD → ${destinatarios.length} destinatarios, ${omitidos.length} omitidos`)
for (const [t, motivo] of omitidos) console.log(`  ⏭️  ${String(t.nombre_completo).padEnd(32)} ${motivo}`)
console.log('')
for (const t of destinatarios) {
  console.log(`  📨 ${String(t.nombre_completo).padEnd(32)} ${normalizeCO(t.whatsapp)}  [${t.estado_verificacion}]  ${APP_URL}/tecnico/${t.portal_token}`)
}
if (DRY) { console.log('\n--dry: no se envió nada.'); process.exit(0) }
if (destinatarios.length === 0) { console.log('Nada que enviar.'); process.exit(0) }

// 3. Envío
let ok = 0, fail = 0
for (const t of destinatarios) {
  const nombre = String(t.nombre_completo).trim().split(/\s+/)[0] || 'técnico'
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizeCO(t.whatsapp),
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: 'es' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: nombre }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: t.portal_token }] },
      ],
    },
  }
  const r = await fetch(`${API}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const b = await r.json().catch(() => ({}))
  if (r.ok && b.messages?.[0]?.id) {
    ok++
    console.log(`  ✅ ${t.nombre_completo} → ${b.messages[0].id}`)
  } else {
    fail++
    console.log(`  ❌ ${t.nombre_completo} → ${JSON.stringify(b.error || b)}`)
  }
  await new Promise(res => setTimeout(res, 400))
}
console.log(`\nListo: ${ok} enviados, ${fail} fallidos.`)
