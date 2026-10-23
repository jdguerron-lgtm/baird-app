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

const DEFAULT_ADMIN_EMAILS = ['jdguerron@bairdservice.com', 'hmosquera@encompasslatam.com']

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

// ─────────────────────────────────────────────────────────────────────────────
// Rol "lectura" (logística) — 2026-10-13
//
// Segunda allowlist, independiente de la admin. Un email de esta lista entra al
// shell `/admin/*` con la MISMA interfaz que el admin pero sin poder modificar
// nada: el servidor rechaza sus escrituras (`verificarAdmin` sigue exigiendo la
// lista admin) y el cliente instala un guard que bloquea cualquier request
// mutante (ver `src/lib/auth/soloLectura.ts`).
//
// Fuentes (mismo patrón que la lista admin):
//   - `LECTURA_EMAILS`             — server-only. CSV.
//   - `NEXT_PUBLIC_LECTURA_EMAILS` — cliente (guard del layout). CSV.
//   - Default hardcodeado          — solo si NINGUNA de las dos está definida.
//
// Si un email está en ambas listas, gana admin (es el rol más amplio y lo
// decidió quien configuró las env vars). La cuenta de Supabase Auth se crea a
// mano en el dashboard igual que la de un admin — ver docs/SEGURIDAD.md.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LECTURA_EMAILS = ['logistica@encompasslatam.com']

export type RolAdmin = 'admin' | 'lectura'

/** Lista efectiva de emails con acceso de solo lectura (sin los que son admin). */
export function obtenerLecturaEmails(): string[] {
  const desdeEnv = [
    ...parseList(process.env.LECTURA_EMAILS),
    ...parseList(process.env.NEXT_PUBLIC_LECTURA_EMAILS),
  ]
  const lista = desdeEnv.length > 0 ? desdeEnv : DEFAULT_LECTURA_EMAILS
  const admins = new Set(obtenerAdminEmails())
  return Array.from(new Set(lista.map((e) => e.toLowerCase()))).filter((e) => !admins.has(e))
}

/** `true` si el email tiene acceso de solo lectura (y NO es admin). Case-insensitive. */
export function esEmailLectura(email: string | null | undefined): boolean {
  if (!email) return false
  return obtenerLecturaEmails().includes(email.toLowerCase())
}

/**
 * Rol efectivo de un email dentro del panel admin, o `null` si no tiene acceso.
 * Única función que deben usar login, layout y gates de API para decidir el rol.
 */
export function obtenerRolAdmin(email: string | null | undefined): RolAdmin | null {
  if (esEmailAdmin(email)) return 'admin'
  if (esEmailLectura(email)) return 'lectura'
  return null
}

/** `true` si el email puede entrar al shell `/admin/*` (admin o lectura). */
export function tieneAccesoAdmin(email: string | null | undefined): boolean {
  return obtenerRolAdmin(email) !== null
}
