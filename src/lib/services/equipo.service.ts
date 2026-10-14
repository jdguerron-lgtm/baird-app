/**
 * equipo.service.ts — acceso server-side (service_role) a `tecnico_auxiliares`
 * y al equipo por servicio (`solicitudes_servicio.auxiliares_ids`). 2026-10-13.
 *
 * Todo es FAIL-SOFT: si la migración 20261013_tecnico_auxiliares.sql no está
 * aplicada (o la lectura falla), las funciones devuelven "sin equipo" y el
 * sistema se comporta como antes de la funcionalidad. Nunca lanzan.
 *
 * Reglas puras (quién es visible, texto WhatsApp, etc.) en utils/equipo.ts.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  AUXILIAR_SELECT,
  auxiliaresPorDefecto,
  construirCarnetAuxiliar,
  resolverEquipoServicio,
  type AuxiliarRow,
  type CarnetAuxiliarData,
} from '@/lib/utils/equipo'

export interface ListaAuxiliares {
  rows: AuxiliarRow[]
  /** false = la tabla no existe / la lectura falló (migración sin aplicar). */
  disponible: boolean
}

/** Todos los auxiliares de un técnico (activos e inactivos), más recientes primero. */
export async function listarAuxiliaresTecnico(tecnicoId: string): Promise<ListaAuxiliares> {
  try {
    const { data, error } = await supabase
      .from('tecnico_auxiliares')
      .select(AUXILIAR_SELECT)
      .eq('tecnico_id', tecnicoId)
      .order('activo', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[equipo.service] listarAuxiliaresTecnico falló (¿migración 20261013 sin aplicar?):', error.message)
      return { rows: [], disponible: false }
    }
    return { rows: (data ?? []) as unknown as AuxiliarRow[], disponible: true }
  } catch (err) {
    console.warn('[equipo.service] listarAuxiliaresTecnico threw:', err instanceof Error ? err.message : err)
    return { rows: [], disponible: false }
  }
}

export interface SolicitudConEquipo {
  tecnico_asignado_id?: string | null
  auxiliares_ids?: string[] | null
}

/**
 * Equipo VISIBLE AL CLIENTE de un servicio: los `auxiliares_ids` que siguen
 * siendo auxiliares activos y verificados del técnico asignado. Devuelve
 * tarjetas con documento enmascarado (nunca el número completo).
 */
export async function equipoDeServicio(sol: SolicitudConEquipo | null | undefined): Promise<CarnetAuxiliarData[]> {
  if (!sol?.tecnico_asignado_id || !sol.auxiliares_ids || sol.auxiliares_ids.length === 0) return []
  const { rows } = await listarAuxiliaresTecnico(sol.tecnico_asignado_id)
  return resolverEquipoServicio(sol.auxiliares_ids, rows).map(construirCarnetAuxiliar)
}

/** Igual que `equipoDeServicio` pero leyendo la solicitud por id. */
export async function equipoDeServicioPorId(solicitudId: string): Promise<CarnetAuxiliarData[]> {
  try {
    const { data, error } = await supabase
      .from('solicitudes_servicio')
      .select('tecnico_asignado_id, auxiliares_ids')
      .eq('id', solicitudId)
      .maybeSingle()
    if (error || !data) return []
    return equipoDeServicio(data as SolicitudConEquipo)
  } catch {
    return []
  }
}

/**
 * Al ACEPTAR un servicio: copia a `auxiliares_ids` los auxiliares del técnico
 * marcados "me acompaña por defecto" (solo activos + verificados). Devuelve
 * las filas elegidas para que el caller arme los mensajes sin otra lectura.
 * Si no hay ninguno escribe `{}` ("va solo", decisión explícita) — salvo que
 * la columna no exista, caso en que no escribe nada.
 */
export async function fijarEquipoPorDefecto(solicitudId: string, tecnicoId: string): Promise<AuxiliarRow[]> {
  const { rows, disponible } = await listarAuxiliaresTecnico(tecnicoId)
  if (!disponible) return []
  const elegidos = auxiliaresPorDefecto(rows)
  try {
    const { error } = await supabase
      .from('solicitudes_servicio')
      .update({ auxiliares_ids: elegidos.map(a => a.id) })
      .eq('id', solicitudId)
    if (error) {
      console.warn('[equipo.service] fijarEquipoPorDefecto no pudo escribir auxiliares_ids:', error.message)
      return []
    }
  } catch (err) {
    console.warn('[equipo.service] fijarEquipoPorDefecto threw:', err instanceof Error ? err.message : err)
    return []
  }
  return elegidos
}
