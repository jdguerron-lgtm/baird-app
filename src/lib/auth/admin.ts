import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { esEmailAdmin, obtenerRolAdmin, type RolAdmin } from '@/lib/auth/adminEmails'

/**
 * Verifica que la request venga de un admin autenticado Y autorizado.
 *
 * Espera header `Authorization: Bearer {access_token}` donde
 * access_token es el JWT que Supabase Auth devuelve en `session.access_token`
 * tras `signInWithPassword`. El frontend admin lo obtiene con
 * `supabase.auth.getSession()`.
 *
 * Retorna `true` solo si el token resuelve a un user de Supabase **cuyo email
 * está en la allowlist admin** (`src/lib/auth/adminEmails.ts`).
 *
 * SEGURIDAD (2026-07-06): antes bastaba con estar autenticado. Como el self-signup
 * de Supabase Auth estaba abierto, eso permitía a cualquiera registrarse y quedar
 * como admin. La allowlist cierra ese hueco (defensa en profundidad, independiente
 * de si el signup vuelve a abrirse por error).
 */
export async function verificarAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return esEmailAdmin(user?.email)
}

/**
 * Igual que `verificarAdmin`, pero devuelve el email del admin autorizado
 * (o `null` si la request no está autorizada). Útil cuando el endpoint
 * necesita registrar QUIÉN hizo la acción (p.ej. `actor` en el audit log
 * `solicitud_eventos`), no solo si puede hacerla.
 */
export async function obtenerEmailAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!esEmailAdmin(user?.email)) return null
  return user!.email ?? 'admin'
}

/**
 * Rol del usuario que firma la request (`'admin'` | `'lectura'`) junto con su
 * email, o `null` si no está autenticado o su email no está en ninguna allowlist.
 *
 * Úsalo en endpoints de SOLO LECTURA (exports, listados) que logística también
 * debe poder consumir. Los endpoints que escriben siguen con `verificarAdmin` /
 * `obtenerEmailAdmin`, que rechazan al rol lectura por construcción.
 */
export async function obtenerRolRequest(
  req: NextRequest,
): Promise<{ email: string; rol: RolAdmin } | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  const rol = obtenerRolAdmin(user?.email)
  if (!rol || !user?.email) return null
  return { email: user.email, rol }
}

/**
 * `true` si la request viene de un admin O de una cuenta de solo lectura
 * (logística). Solo para handlers que no modifican nada.
 */
export async function verificarLectura(req: NextRequest): Promise<boolean> {
  return (await obtenerRolRequest(req)) !== null
}
