// Envía el PDF del resumen semanal por WhatsApp (Meta Cloud API v22.0).
// 1) Sube el PDF como media -> obtiene media_id
// 2) Envía un mensaje type=document con ese id
//
// Uso: node --env-file=.env.local scripts/enviar-resumen-whatsapp.mjs [ruta.pdf] [telefono]
// Por defecto envía SOLO a Juan (prueba). Para más destinatarios, pasarlos por arg.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'

const WA_API_BASE = 'https://graph.facebook.com/v22.0'
const phoneId = process.env.WHATSAPP_PHONE_ID
const token = process.env.WHATSAPP_API_TOKEN

const PDF = process.argv[2] || 'Resumen_Semanal_Baird_2026-06-21.pdf'
// Normaliza a móvil colombiano con prefijo 57 (igual que phoneToDigits del app):
// acepta "3183723213" o "573183723213" y siempre resuelve a "573183723213".
function normalizeCO(raw) {
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) d = '57' + d
  return d
}
const TARGET = normalizeCO(process.argv[3] || '573183723213') // Juan (prueba)
const TARGET_OK = /^573\d{9}$/.test(TARGET)
const CAPTION = 'Borrador — Resumen Semanal Baird (corte 21-jun). Prueba de envío.'

if (!phoneId || !token) {
  console.error('Faltan WHATSAPP_PHONE_ID / WHATSAPP_API_TOKEN. Corré con: node --env-file=.env.local ...')
  process.exit(1)
}
if (!existsSync(PDF)) {
  console.error('No existe el PDF:', PDF)
  process.exit(1)
}
if (!TARGET_OK) {
  console.error('Destino no parece móvil colombiano válido (573XXXXXXXXX):', TARGET)
  process.exit(1)
}
console.log('Destino normalizado:', TARGET)

const filename = basename(PDF)

async function subirMedia() {
  const buf = readFileSync(PDF)
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', new Blob([buf], { type: 'application/pdf' }), filename)

  const res = await fetch(`${WA_API_BASE}/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    throw new Error(`Upload media falló (HTTP ${res.status}): ${JSON.stringify(body.error ?? body)}`)
  }
  return body.id
}

async function enviarDocumento(mediaId) {
  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TARGET,
      type: 'document',
      document: { id: mediaId, filename, caption: CAPTION },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    throw new Error(`Envío documento falló (HTTP ${res.status}): ${JSON.stringify(body.error ?? body)}`)
  }
  return body
}

try {
  console.log(`Subiendo "${filename}" a Meta...`)
  const mediaId = await subirMedia()
  console.log('  media_id =', mediaId)
  console.log(`Enviando documento a ${TARGET}...`)
  const out = await enviarDocumento(mediaId)
  const msg = out.messages?.[0]
  console.log('  message_id =', msg?.id ?? '(desconocido)')
  console.log('  message_status =', msg?.message_status ?? '(no reportado)')
  console.log('OK — enviado.')
} catch (e) {
  console.error('ERROR:', e.message)
  process.exit(1)
}
