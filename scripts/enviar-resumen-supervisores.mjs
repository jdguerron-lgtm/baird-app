// Envía el resumen semanal (PDF) a los SUPERVISORES activos vía plantilla de documento.
// Requiere que la plantilla resumen_semanal_supervisores_v1 esté APPROVED en Meta.
//
// Uso:
//   node --env-file=.env.local scripts/enviar-resumen-supervisores.mjs [pdf] [--dry] [--force]
//   --dry   : no envía, solo muestra a quién iría
//   --force : intenta enviar aunque la plantilla no figure APPROVED
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const API = 'https://graph.facebook.com/v22.0'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const WABA_ID = process.env.WABA_ID || '2354953275016882'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const TEMPLATE = 'resumen_semanal_supervisores_v1'
const SEMANA = 'la semana del 15 al 21 de junio de 2026'   // {{2}} — actualizar cada semana
const DISPLAY = 'Resumen_Semanal_Baird_2026-06-21.pdf'      // nombre visible del adjunto

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const DRY = args.includes('--dry')
const PDF = args.find(a => !a.startsWith('--')) || 'Resumen_Semanal_Baird_2026-06-21.pdf'

if (!TOKEN || !PHONE_ID) { console.error('Faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID'); process.exit(1) }
if (!SB_URL || !SB_KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'); process.exit(1) }
if (!existsSync(PDF)) { console.error('No existe el PDF:', PDF); process.exit(1) }

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
  console.error('Aún no está APPROVED. Esperá la aprobación de Meta o usá --force.')
  process.exit(1)
}

// 2. Subir el PDF al Storage público (header.document.link)
const supabase = createClient(SB_URL, SB_KEY)
const rand = Math.random().toString(36).slice(2, 8)
const path = `informes/Resumen_Semanal_2026-06-21_${rand}.pdf`
const { error: upErr } = await supabase.storage.from('evidencias-servicio')
  .upload(path, readFileSync(PDF), { contentType: 'application/pdf', upsert: false })
if (upErr) { console.error('Upload Storage falló:', upErr.message); process.exit(1) }
const URL_PDF = supabase.storage.from('evidencias-servicio').getPublicUrl(path).data.publicUrl
console.log('PDF URL:', URL_PDF)

// 3. Supervisores activos
const { data: sups, error: supErr } = await supabase
  .from('supervisores').select('nombre, whatsapp, activo').eq('activo', true)
if (supErr) { console.error('Query supervisores falló:', supErr.message); process.exit(1) }
console.log(`Supervisores activos: ${sups.length}`)

async function enviar(sup) {
  const to = normalizeCO(sup.whatsapp)
  const primerNombre = String(sup.nombre || '').trim().split(/\s+/)[0] || 'supervisor'
  if (DRY) { console.log(`[dry] ${sup.nombre} → ${to}`); return }
  const payload = {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name: TEMPLATE, language: { code: 'es' },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { link: URL_PDF, filename: DISPLAY } }] },
        { type: 'body', parameters: [{ type: 'text', text: primerNombre }, { type: 'text', text: SEMANA }] },
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
