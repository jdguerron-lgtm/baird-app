// Sube un PDF de MUESTRA a Meta (Resumable Upload API) y devuelve el header_handle
// necesario para crear una plantilla con header de DOCUMENTO.
// Uso: node --env-file=.env.local scripts/wa-doc-handle.mjs [ruta.pdf]
import { readFileSync, existsSync, statSync } from 'node:fs'

const API = 'https://graph.facebook.com/v22.0'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const PDF = process.argv[2] || 'Resumen_Semanal_Baird_2026-06-21.pdf'

if (!TOKEN) { console.error('Falta WHATSAPP_API_TOKEN'); process.exit(1) }
if (!existsSync(PDF)) { console.error('No existe el PDF:', PDF); process.exit(1) }

// 1. App ID desde el propio token
let appId = process.env.WHATSAPP_APP_ID
if (!appId) {
  const r = await fetch(`${API}/debug_token?input_token=${encodeURIComponent(TOKEN)}&access_token=${encodeURIComponent(TOKEN)}`)
  const b = await r.json()
  appId = b?.data?.app_id
  if (!appId) { console.error('No pude obtener app_id via debug_token:', JSON.stringify(b)); process.exit(1) }
  console.log('app_id:', appId)
}

const buf = readFileSync(PDF)
const size = statSync(PDF).size

// 2. Crear sesión de subida
const cs = await fetch(`${API}/${appId}/uploads?file_name=resumen_muestra.pdf&file_length=${size}&file_type=application%2Fpdf&access_token=${encodeURIComponent(TOKEN)}`, { method: 'POST' })
const csb = await cs.json()
if (!cs.ok || !csb.id) { console.error('Crear sesión falló:', cs.status, JSON.stringify(csb)); process.exit(1) }
console.log('session:', csb.id)

// 3. Subir bytes (Authorization: OAuth <token>, file_offset: 0)
const up = await fetch(`${API}/${csb.id}`, {
  method: 'POST',
  headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' },
  body: buf,
})
const upb = await up.json()
if (!up.ok || !upb.h) { console.error('Subir bytes falló:', up.status, JSON.stringify(upb)); process.exit(1) }
console.log('HANDLE:', upb.h)
