import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Verifica que la request venga de un admin autenticado.
 *
 * Espera header `Authorization: Bearer {access_token}` donde
 * access_token es el JWT que Supabase Auth devuelve en `session.access_token`
 * tras `signInWithPassword`. El frontend admin lo obtiene con
 * `supabase.auth.getSession()`.
 *
 * Retorna `true` si el token es válido y resuelve a un user de Supabase.
 *
 * NOTE: Por ahora *cualquier* user autenticado en Supabase Auth se considera
 * admin — el proyecto solo tiene cuentas creadas manualmente en el dashboard
 * de Supabase. Si en el futuro se abren registros públicos, hay que añadir
 * un claim/role check aquí.
 */
export async function verificarAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return !!user
}

/**
 * Igual que `verificarAdmin`, pero devuelve el email del admin autenticado
 * (o `null` si la request no está autorizada). Útil cuando el endpoint
 * necesita registrar QUIÉN hizo la acción (p.ej. `actor` en el audit log
 * `solicitud_eventos`), no solo si puede hacerla.
 */
export async function obtenerEmailAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null
  return user.email ?? 'admin'
}
