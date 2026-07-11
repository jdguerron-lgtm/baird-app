import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { normalizeForMatch } from '@/lib/utils/format'

/**
 * Autorización del portal de supervisores (solo lectura).
 *
 * SEGURIDAD: el alcance (ambito + marca) se impone AQUÍ, en el servidor. Las
 * páginas admin leen `solicitudes_servicio` directo con el anon key, que ve toda
 * la tabla (RLS off). Si el portal del supervisor filtrara en el cliente, el
 * supervisor podría pedir la tabla completa con el mismo anon key y saltarse su
 * alcance. Por eso el portal NUNCA consulta Supabase desde el browser: pasa por
 * /api/supervisor/* y este módulo resuelve el token y filtra.
 *
 * El predicado de alcance es el mismo que usa `notificarCambioEstado`
 * (whatsapp.service.ts) para decidir a qué supervisor avisar — mantenerlos en
 * sync si uno cambia.
 */

export interface SupervisorPortal {
  id: string
  nombre: string
  whatsapp: string
  ambito: 'todos' | 'garantia' | 'particular'
  marca: string | null
  estados: string[] | null
  activo: boolean
}

/** Campos mínimos de una solicitud para decidir alcance. */
export interface SolicitudAlcance {
  es_garantia: boolean | null
  marca_equipo: string | null
}

/**
 * Resuelve el supervisor activo dueño de un portal_token. Devuelve null si el
 * token no existe o el supervisor está inactivo (acceso revocado = inactivar).
 */
export async function resolverSupervisorPorToken(
  token: string | null | undefined,
): Promise<SupervisorPortal | null> {
  if (!token || typeof token !== 'string') return null

  const { data, error } = await supabase
    .from('supervisores')
    .select('id, nombre, whatsapp, ambito, marca, estados, activo')
    .eq('portal_token', token)
    .maybeSingle()

  if (error || !data || !data.activo) return null
  return data as SupervisorPortal
}

/**
 * ¿La solicitud cae dentro del alcance del supervisor? Espejo de la lógica de
 * `notificarCambioEstado`:
 *   - ambito:  'todos' → siempre | 'garantia' → solo es_garantia | 'particular' → solo !es_garantia
 *   - marca:   null → todas | string → solo si coincide con marca_equipo (normalizeForMatch)
 * (El filtro por `estados` es solo para AVISOS, no para visibilidad — un
 * supervisor ve todos los estados de las solicitudes dentro de su ámbito/marca.)
 */
export function solicitudEnAlcance(sup: SupervisorPortal, sol: SolicitudAlcance): boolean {
  const esGarantia = sol.es_garantia === true
  if (sup.ambito === 'garantia' && !esGarantia) return false
  if (sup.ambito === 'particular' && esGarantia) return false
  if (sup.marca && normalizeForMatch(sup.marca) !== normalizeForMatch(sol.marca_equipo ?? '')) {
    return false
  }
  return true
}

/**
 * Traduce el ámbito del supervisor a un filtro sobre `es_garantia` para acotar
 * la query en la BD (la marca se filtra en JS porque se compara normalizada).
 * Devuelve null cuando no hay que filtrar por es_garantia (ambito 'todos').
 */
export function filtroEsGarantia(sup: SupervisorPortal): boolean | null {
  if (sup.ambito === 'garantia') return true
  if (sup.ambito === 'particular') return false
  return null
}

// ─────────────────────────────────────────────────────────────────
// Entrada de autoservicio /supervisor — OTP por WhatsApp
// (migración 20260709_supervisor_codigo_acceso.sql)
// ─────────────────────────────────────────────────────────────────

/**
 * Hash del OTP que se persiste en supervisores.codigo_acceso_hash. Nunca se
 * guarda el código en claro: el anon key puede leer la tabla (policies laxas),
 * así que un código legible sería filtrable. Se sala con el id del supervisor
 * para que dos supervisores con el mismo código no compartan hash.
 */
export function hashCodigoSupervisor(supervisorId: string, codigo: string): string {
  return crypto.createHash('sha256').update(`${supervisorId}:${codigo}`).digest('hex')
}

/** Comparación en tiempo constante de dos hashes hex (evita timing attacks). */
export function compararHashCodigo(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
