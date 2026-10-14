// Crea (si no existe) una cuenta de Supabase Auth para el panel /admin SIN
// contraseña. La persona fija su clave desde el correo de acceso
// (/admin/accesos → "Enviar correo" o "¿Olvidaste tu contraseña?" en el login).
//
// Uso: node --env-file=.env.local scripts/crear-usuario-panel.mjs correo@dominio.com
// Requiere SUPABASE_SERVICE_ROLE_KEY. El email debe estar en ADMIN_EMAILS o
// LECTURA_EMAILS (ver docs/SEGURIDAD.md) para que el login lo deje entrar.
import { createClient } from '@supabase/supabase-js'

const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Uso: node --env-file=.env.local scripts/crear-usuario-panel.mjs correo@dominio.com')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: lista, error: e1 } = await admin.auth.admin.listUsers({ perPage: 200 })
if (e1) throw e1
const existente = lista.users.find((u) => (u.email ?? '').toLowerCase() === email)
if (existente) {
  console.log(`YA_EXISTE ${existente.id} confirmado=${!!existente.email_confirmed_at} ultimo_login=${existente.last_sign_in_at ?? 'nunca'}`)
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  console.log(`CREADO ${data.user.id} confirmado=${!!data.user.email_confirmed_at} (sin contraseña: debe fijarla desde el correo)`)
}
