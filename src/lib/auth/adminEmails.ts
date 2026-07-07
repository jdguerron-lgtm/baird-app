/**
 * Allowlist de emails con acceso admin.
 *
 * CONTEXTO DE SEGURIDAD (2026-07-06): el gate anterior (`verificarAdmin`) trataba
 * a *cualquier* usuario autenticado en Supabase Auth como admin. Como el self-signup
 * de Supabase estaba habilitado, cualquiera podía registrarse con su propio email,
 * confirmarlo y quedar como admin total. Esta allowlist cierra ese hueco: aunque
 * exista una cuenta de Supabase Auth, solo los emails de esta lista son admin.
 *
 * Fuentes (en orden de prioridad; se unen las que estén definidas):
 *   - `ADMIN_EMAILS`             — server-only (API routes). CSV de emails.
 *   - `NEXT_PUBLIC_ADMIN_EMAILS` — visible en el bundle (guard del layout admin). CSV.
 *   - Default hardcodeado        — se usa solo si NINGUNA env var está definida,
 *                                  para que producción no se rompa antes de setearlas.
 *
 * Los emails no son secretos (el secreto es la contraseña); exponerlos en el bundle
 * cliente vía NEXT_PUBLIC es aceptable y necesario para el guard client-side.
 */

const DEFAULT_ADMIN_EMAILS = ['jdguerron@bairdservice.com']

function parseList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Lista efectiva de emails admin (normalizada a minúsculas, sin duplicados). */
export function obtenerAdminEmails(): string[] {
  const desdeEnv = [
    ...parseList(process.env.ADMIN_EMAILS),
    ...parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS),
  ]
  const lista = desdeEnv.length > 0 ? desdeEnv : DEFAULT_ADMIN_EMAILS
  return Array.from(new Set(lista.map((e) => e.toLowerCase())))
}

/** `true` si el email pertenece a la allowlist admin. Case-insensitive. */
export function esEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return obtenerAdminEmails().includes(email.toLowerCase())
}
