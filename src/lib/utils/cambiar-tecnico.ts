import { ESTADOS_TERMINALES } from '@/lib/constants/estados'

/**
 * Estados en que el admin puede cambiar/asignar el técnico a mano
 * (2026-10-26): vivos y con horario ya acordado (no `pendiente_horario`).
 * Vive en utils (sin supabase-admin) para que la ficha admin lo importe.
 */
export function puedeCambiarTecnico(estado: string | null | undefined): boolean {
  if (!estado) return false
  if (ESTADOS_TERMINALES.has(estado)) return false
  return estado !== 'pendiente_horario'
}
