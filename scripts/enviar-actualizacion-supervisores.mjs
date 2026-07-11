// Envía las NOVEDADES / mejoras de la plataforma a los SUPERVISORES activos
// vía plantilla supervisor_actualizaciones_v1 (con botón a la Guía del
// Supervisor). Canal recurrente: editar NOVEDADES abajo en cada envío.
//
// Uso:
//   node --env-file=.env.local scripts/enviar-actualizacion-supervisores.mjs [--dry] [--force]
//   --dry   : no envía, solo muestra a quién iría y el texto
//   --force : intenta enviar aunque la plantilla no figure APPROVED
//
// ⚠️ Los parámetros de plantilla de Meta NO aceptan saltos de línea:
//    NOVEDADES debe ser UNA sola línea con las mejoras separadas por " • ".
import { createClient } from '@supabase/supabase-js'

const API = 'https://graph.facebook.com/v22.0'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const WABA_ID = process.env.WABA_ID || '2354953275016882'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const TEMPLATE = 'supervisor_actualizaciones_v1'

// ── EDITAR EN CADA ENVÍO ─────────────────────────────────────────────────────
// Una sola línea, mejoras separadas por " • " (sin saltos de línea).
const NOVEDADES =
  'Nuevo panel de supervisión con tu acceso personal en tiempo real (llega con cada informe semanal) • ' +
  'Etiquetas de estado renombradas y simplificadas: ahora cada una te dice quién debe actuar • ' +
  'Nueva Guía del Supervisor con el paso a paso de cada etapa (botón abajo) • ' +
  'El informe semanal en PDF ahora incluye el link a la guía'
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const DRY = args.includes('--dry')

if (!TOKEN || !PHONE_ID) { console.error('Faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID'); process.exit(1) }
if (!SB_URL || !SB_KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'); process.exit(1) }
if (/[\r\n]/.test(NOVEDADES)) { console.error('NOVEDADES contiene saltos de línea — Meta los rechaza. Usá " • ".'); process.exit(1) }

function normalizeCO(raw) {
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) d = '57' + d
  return d
}

// 1. Verificar estado de la plantilla
const tr = await fetch(`${API}/${WABA_ID}/message_templates?name=${TEMPLATE}&limit=5`, { headers: { Authorization: `Bearer ${TOKEN}` } })
const tb = await tr.json()
const status = (tb.data || []).find(t => t.name === TEMPLATE)?.status || 'NO_EXISTE'
console.log(`Plantilla ${TEMPLATE}: ${status}`)
if (status !== 'APPROVED' && !FORCE) {
  console.error('Aún no está APPROVED. Esperá la aprobación de Meta y volvé a correr el script (o usá --force).')
  process.exit(1)
}

// 2. Supervisores activos
const supabase = createClient(SB_URL, SB_KEY)
const { data: sups, error: supErr } = await supabase
  .from('supervisores')
  .select('nombre, whatsapp, activo')
  .eq('activo', true)
if (supErr) { console.error('Query supervisores falló:', supErr.message); process.exit(1) }
console.log(`Supervisores activos: ${sups.length}`)
console.log(`Novedades: ${NOVEDADES}\n`)

async function enviar(sup) {
  const to = normalizeCO(sup.whatsapp)
  const primerNombre = String(sup.nombre || '').trim().split(/\s+/)[0] || 'supervisor'
  if (DRY) { console.log(`[dry] ${sup.nombre} → ${to}`); return }
  const payload = {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name: TEMPLATE, language: { code: 'es' },
      components: [
        { type: 'body', parameters: [
          { type: 'text', text: primerNombre },
          { type: 'text', text: NOVEDADES },
        ] },
      ],
    },
  }
  const r = await fetch(`${API}/${PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const b = await r.json()
  if (!r.ok || b.error) { console.error(`❌ ${sup.nombre} (${to}):`, JSON.stringify(b.error || b)); return }
  console.log(`✅ ${sup.nombre} (${to}) → ${b.messages?.[0]?.id}`)
}

for (const s of sups) { await enviar(s); await new Promise(r => setTimeout(r, 400)) }
console.log('Listo.')
