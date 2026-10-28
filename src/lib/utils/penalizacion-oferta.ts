/**
 * penalizacion-oferta.ts — reglas puras (sin I/O) de la penalización por
 * incumplimiento de agenda y del bloqueo por tipo de servicio (2026-10-26).
 *
 * Penalización: cada incumplimiento reciente del técnico (ver
 * `penalizacion.service.ts`) = `minutosPorIncumplimiento` (5) de espera antes
 * de recibir una oferta, con tope `maxMinutos`. Los técnicos retenidos quedan
 * en `solicitudes_servicio.oferta_pendientes` y el cron
 * /api/cron/oferta-escalonada les libera la oferta cuando se cumple su hora.
 */

export interface ConfigPenalizacion {
  activa: boolean
  minutosPorIncumplimiento: number
  dias: number
  maxMinutos: number
}

export const CONFIG_PENALIZACION_DEFAULT: ConfigPenalizacion = {
  activa: false,
  minutosPorIncumplimiento: 5,
  dias: 30,
  maxMinutos: 60,
}

export const LIMITES_PENALIZACION = {
  minutos: { min: 1, max: 60 },
  dias: { min: 1, max: 180 },
  maxMinutos: { min: 1, max: 720 },
} as const

export interface OfertaPendiente {
  tecnico_id: string
  liberar_at: string
}

/**
 * Una retención vencida hace más de esto ya no cuenta como "pena cumplida":
 * es de una ola vieja (alguien aceptó, luego se liberó el servicio) y la
 * penalización se vuelve a calcular. El cron corre cada minuto, así que una
 * retención vigente se procesa mucho antes.
 */
export const GRACIA_PENDIENTE_MS = 10 * 60_000

export function minutosPenalizacion(incumplimientos: number, cfg: ConfigPenalizacion): number {
  if (!cfg.activa || incumplimientos <= 0) return 0
  return Math.min(incumplimientos * cfg.minutosPorIncumplimiento, cfg.maxMinutos)
}

/** Normaliza lo que venga en la columna JSONB (null, basura, filas viejas). */
export function parsearPendientes(raw: unknown): OfertaPendiente[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is OfertaPendiente =>
    !!p && typeof p === 'object'
    && typeof (p as OfertaPendiente).tecnico_id === 'string'
    && typeof (p as OfertaPendiente).liberar_at === 'string'
    && !Number.isNaN(Date.parse((p as OfertaPendiente).liberar_at)))
}

/**
 * Decide a quién se le envía YA la oferta y a quién se le retiene.
 *
 * - Retención vigente con hora futura → sigue esperando.
 * - Retención vigente ya vencida (dentro de la gracia) → pena cumplida: se
 *   envía ahora sin volver a penalizar.
 * - Sin retención vigente → minutos = `penalizacion.get(id)`; > 0 se retiene.
 *
 * Las retenciones futuras de técnicos que no están en `candidatos` se
 * conservan (p. ej. la primera ola del reparto escalonado no los incluye).
 */
export function planificarOferta(params: {
  candidatos: string[]
  pendientes: OfertaPendiente[]
  penalizacion: Map<string, number>
  ahora?: Date
}): { enviarAhora: string[]; pendientes: OfertaPendiente[]; proximoAt: string | null } {
  const ahoraMs = (params.ahora ?? new Date()).getTime()
  const vigentes = new Map<string, number>()
  for (const p of params.pendientes) {
    const t = Date.parse(p.liberar_at)
    if (t > ahoraMs - GRACIA_PENDIENTE_MS) vigentes.set(p.tecnico_id, t)
  }

  const enviarAhora: string[] = []
  const retenidos = new Map<string, number>()
  const enCandidatos = new Set(params.candidatos)

  for (const id of params.candidatos) {
    const t = vigentes.get(id)
    if (t !== undefined) {
      if (t > ahoraMs) retenidos.set(id, t)
      else enviarAhora.push(id)
      continue
    }
    const min = params.penalizacion.get(id) ?? 0
    if (min > 0) retenidos.set(id, ahoraMs + min * 60_000)
    else enviarAhora.push(id)
  }
  for (const [id, t] of vigentes) {
    if (!enCandidatos.has(id) && t > ahoraMs) retenidos.set(id, t)
  }

  const pendientes = [...retenidos.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([tecnico_id, t]) => ({ tecnico_id, liberar_at: new Date(t).toISOString() }))
  return { enviarAhora, pendientes, proximoAt: pendientes[0]?.liberar_at ?? null }
}

/** El más temprano de dos ISO (null = no hay). */
export function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) <= Date.parse(b) ? a : b
}

/** ¿El bloqueo del técnico le impide recibir este tipo de servicio? */
export function bloqueadoParaServicio(
  bloqueo: { garantia: boolean; particular: boolean } | undefined,
  esGarantia: boolean,
): boolean {
  if (!bloqueo) return false
  return esGarantia ? bloqueo.garantia : bloqueo.particular
}
