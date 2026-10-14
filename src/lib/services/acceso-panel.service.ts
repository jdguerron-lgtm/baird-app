import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase as supabaseAnon } from '@/lib/supabase'
import { enviarEmail, emailHabilitado } from '@/lib/services/email.service'
import { obtenerAdminEmails, obtenerLecturaEmails, obtenerRolAdmin, type RolAdmin } from '@/lib/auth/adminEmails'

/**
 * Acceso al panel /admin — alta y recuperación de contraseña — 2026-10-13.
 *
 * Problema que resuelve: las cuentas del panel se crean SIN contraseña (script
 * `scripts/crear-usuario-panel.mjs` o `auth.admin.createUser`) y la persona
 * fija la suya desde un link de un solo uso. Así nadie (ni el admin) conoce ni
 * transporta claves por WhatsApp.
 *
 * El link NO depende del "Site URL" ni de la allowlist de redirects de
 * Supabase: se arma con el `hashed_token` que devuelve `generateLink` y la
 * página `/admin/establecer-clave` lo canjea con `verifyOtp({ token_hash })`.
 * Caduca según "Email OTP expiry" del proyecto (default 1 h) y es de un solo uso.
 *
 * Envío: si hay `RESEND_API_KEY`, el correo sale por Resend (plantilla propia).
 * Si no, se cae a `resetPasswordForEmail` de Supabase (SMTP de Supabase, que
 * por defecto solo entrega a miembros del equipo del proyecto — por eso el
 * admin también puede copiar el link desde /admin/accesos y mandarlo a mano).
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://lineablanca.bairdservice.com').replace(/\/+$/, '')

export interface CuentaPanel {
  email: string
  rol: RolAdmin
  existe: boolean
  /** Mejor señal disponible: GoTrue no expone si hay clave, pero sí el último login. */
  haIngresado: boolean
  ultimoLogin: string | null
  creadaEn: string | null
}

/** Allowlist completa (admin + lectura) cruzada con auth.users. */
export async function listarCuentasPanel(): Promise<CuentaPanel[]> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 })
  if (error) throw new Error(error.message)
  const porEmail = new Map(data.users.map((u) => [(u.email ?? '').toLowerCase(), u]))
  const emails: Array<[string, RolAdmin]> = [
    ...obtenerAdminEmails().map((e): [string, RolAdmin] => [e, 'admin']),
    ...obtenerLecturaEmails().map((e): [string, RolAdmin] => [e, 'lectura']),
  ]
  return emails.map(([email, rol]) => {
    const u = porEmail.get(email)
    return {
      email,
      rol,
      existe: !!u,
      haIngresado: !!u?.last_sign_in_at,
      ultimoLogin: u?.last_sign_in_at ?? null,
      creadaEn: u?.created_at ?? null,
    }
  })
}

export interface ResultadoLinkClave {
  ok: boolean
  /** Link de un solo uso para fijar la clave. Solo debe devolverse a un admin. */
  link?: string
  enviadoPorCorreo: boolean
  via?: 'resend' | 'supabase'
  error?: string
}

/**
 * Genera el link de "fijar contraseña" para un email de la allowlist y lo
 * envía por correo (Resend → fallback Supabase). El caller público debe
 * responder genérico para no revelar qué emails tienen cuenta.
 */
export async function generarYEnviarLinkClave(emailRaw: string): Promise<ResultadoLinkClave> {
  const email = emailRaw.trim().toLowerCase()
  if (!obtenerRolAdmin(email)) {
    return { ok: false, enviadoPorCorreo: false, error: 'El email no está en la allowlist del panel' }
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data?.properties?.hashed_token) {
    return { ok: false, enviadoPorCorreo: false, error: error?.message ?? 'No se pudo generar el link' }
  }

  const link = `${APP_URL}/admin/establecer-clave?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`

  if (emailHabilitado()) {
    const r = await enviarEmail({
      to: email,
      subject: 'Tu acceso al panel de Baird Service',
      html: htmlCorreoAcceso(link),
    })
    return { ok: true, link, enviadoPorCorreo: r.ok, via: 'resend', error: r.ok ? undefined : r.error }
  }

  // Fallback: SMTP de Supabase. Genera OTRO token (el de arriba sigue siendo
  // válido como copia manual del admin hasta que alguno se use o venza).
  const { error: e2 } = await supabaseAnon.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/admin/establecer-clave`,
  })
  return { ok: true, link, enviadoPorCorreo: !e2, via: 'supabase', error: e2?.message }
}

function htmlCorreoAcceso(link: string): string {
  return `
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <h2 style="margin:0 0 12px">Acceso al panel de Baird Service</h2>
  <p>Hola. Te habilitamos una cuenta para consultar el panel de servicios de Baird Service
  (casos, pagos y repuestos).</p>
  <p>Para crear tu contraseña haz clic en el botón. El link es personal, de un solo uso y
  vence en aproximadamente una hora.</p>
  <p style="margin:24px 0">
    <a href="${link}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700;display:inline-block">Crear mi contraseña</a>
  </p>
  <p style="font-size:12px;color:#64748b">Si el botón no abre, copia este enlace en el navegador:<br>${link}</p>
  <p style="font-size:12px;color:#64748b">Si el link venció, en <a href="${APP_URL}/admin/login">${APP_URL}/admin/login</a>
  usa "¿Olvidaste tu contraseña?" para recibir uno nuevo. Si no esperabas este correo, ignóralo.</p>
</div>`
}
