import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * Reparto escalonado de ofertas (2026-10-19).
 *
 * Problema: la oferta a técnicos es "el primero que acepte gana" y un solo
 * técnico (el más rápido) se quedaba con casi todo — Germán y Néstor recibían
 * la oferta pero el link ya estaba anulado cuando la abrían.
 *
 * Regla: en la PRIMERA oferta de una solicitud, los candidatos con menos de
 * `max_servicios_semana` servicios aceptados en los últimos 7 días la reciben
 * primero. Si en `minutos_ventaja` minutos nadie la acepta, el cron
 * `/api/cron/oferta-escalonada` la abre al resto (`oferta_abierta_at`).
 *
 * Si todos o ninguno quedan en prioridad, la oferta sale a todos de una vez
 * (no tiene sentido hacer esperar a nadie). Se configura desde
 * `/admin/reparto` (tabla `config_reparto`, una sola fila).
 */

export interface ConfigReparto {
  activo: boolean
  minutos_ventaja: number
  max_servicios_semana: number
  updated_at?: string | null
  updated_by?: string | null
}

export const CONFIG_REPARTO_DEFAULT: ConfigReparto = {
  activo: false,
  minutos_ventaja: 10,
  max_servicios_semana: 3,
}

/** Días hacia atrás que cuentan para "servicios de la semana". */
export const VENTANA_DIAS_REPARTO = 7

export const LIMITES_REPARTO = {
  minutos: { min: 1, max: 120 },
  servicios: { min: 1, max: 50 },
} as const

/**
 * Lee la configuración. Si la tabla no existe todavía (migración sin aplicar)
 * o falla la lectura, devuelve la config por defecto con `activo: false`:
 * el reparto vuelve al comportamiento de siempre, nunca bloquea una oferta.
 */
export async function obtenerConfigReparto(): Promise<ConfigReparto> {
  try {
    const { data, error } = await supabase
      .from('config_reparto')
      .select('activo, minutos_ventaja, max_servicios_semana, updated_at, updated_by')
      .eq('id', 1)
      .limit(1)
    const fila = Array.isArray(data) ? data[0] : null
    if (error || !fila) return { ...CONFIG_REPARTO_DEFAULT }
    return {
      activo: fila.activo === true,
      minutos_ventaja: Number(fila.minutos_ventaja) || CONFIG_REPARTO_DEFAULT.minutos_ventaja,
      max_servicios_semana: Number(fila.max_servicios_semana) || CONFIG_REPARTO_DEFAULT.max_servicios_semana,
      updated_at: fila.updated_at ?? null,
      updated_by: fila.updated_by ?? null,
    }
  } catch {
    return { ...CONFIG_REPARTO_DEFAULT }
  }
}

/**
 * Servicios aceptados por cada técnico en los últimos `dias` días (ofertas
 * con estado 'aceptado' en `notificaciones_whatsapp`). Los técnicos sin
 * aceptaciones quedan con 0.
 */
export async function contarServiciosRecientes(
  tecnicoIds: string[],
  dias: number = VENTANA_DIAS_REPARTO,
): Promise<Map<string, number>> {
  const conteos = new Map<string, number>(tecnicoIds.map(id => [id, 0]))
  if (tecnicoIds.length === 0) return conteos
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notificaciones_whatsapp')
    .select('tecnico_id')
    .in('tecnico_id', tecnicoIds)
    .eq('estado', 'aceptado')
    .gte('respondido_at', desde)
  for (const fila of (data ?? []) as { tecnico_id: string }[]) {
    conteos.set(fila.tecnico_id, (conteos.get(fila.tecnico_id) ?? 0) + 1)
  }
  return conteos
}

/**
 * Parte los candidatos en "prioridad" (menos de `maxServicios` en la semana)
 * y "resto". Si alguno de los dos grupos queda vacío no hay nada que
 * escalonar: todos van en `prioritarios` y `resto` queda vacío.
 */
export function dividirPorPrioridad<T extends { id: string }>(
  tecnicos: T[],
  conteos: Map<string, number>,
  maxServicios: number,
): { prioritarios: T[]; resto: T[] } {
  const prioritarios = tecnicos.filter(t => (conteos.get(t.id) ?? 0) < maxServicios)
  const resto = tecnicos.filter(t => (conteos.get(t.id) ?? 0) >= maxServicios)
  if (prioritarios.length === 0 || resto.length === 0) {
    return { prioritarios: tecnicos, resto: [] }
  }
  return { prioritarios, resto }
}
