// Sube el PDF del resumen a Supabase Storage (bucket público) y devuelve una URL para verlo.
// Uso: node --env-file=.env.local scripts/subir-resumen-link.mjs [ruta.pdf]
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PDF = process.argv[2] || 'Resumen_Semanal_Baird_2026-06-21.pdf'
const BUCKET = 'evidencias-servicio'

if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'); process.exit(1) }
if (!existsSync(PDF)) { console.error('No existe el PDF:', PDF); process.exit(1) }

const supabase = createClient(url, key)
const rand = Math.random().toString(36).slice(2, 8)
const path = `informes/Resumen_Semanal_2026-06-21_${rand}.pdf`
const buf = readFileSync(PDF)

const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
  contentType: 'application/pdf', cacheControl: '3600', upsert: false,
})
if (error) { console.error('Upload error:', error.message); process.exit(1) }

const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
console.log('PATH:', path)
console.log('URL :', data.publicUrl)
