import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { esEmailAdmin } from '@/lib/auth/adminEmails'

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
