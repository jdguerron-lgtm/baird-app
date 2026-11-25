import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { ESTADOS_CANCELABLES_POR_CLIENTE } from '@/types/solicitud'
import { normalizeForMatch } from '@/lib/utils/format'

/**
 * Clientes y órdenes duplicadas — 2026-10-28 (Fase 1).
 *
 * El cliente se identifica por `cliente_telefono` (el trigger BD
 * `normalizar_telefono_co()` lo deja en dígitos con 57, así que es comparable
 * tal cual). El teléfono SOLO no basta: un mismo cliente puede tener lavadora,
 * secadora y nevera dañadas a la vez (legítimo). Un posible duplicado es:
 *
 *   - otra orden ABIERTA del mismo teléfono y el mismo tipo de equipo, o
 *   - otra orden (abierta o cerrada hace ≤ 30 días) con el mismo número de
 *     orden / serie de la marca.
 *
 * Esto es solo para AVISAR al admin; nada se cancela solo. Lógica pura
 * (sin BD) para poder testearla.
 */

export const DIAS_VENTANA_MISMA_ORDEN = 30

/** Estados desde los que el admin puede cancelar una orden como duplicado. */
export const ESTADOS_CANCELABLES_DUPLICADO: ReadonlySet<string> = ESTADOS_CANCELABLES_POR_CLIENTE

export interface SolicitudCliente {
  id: string
  cliente_telefono: string | null
  cliente_nombre: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  es_garantia: boolean | null
  estado: string | null
  numero_serie_factura: string | null
  tecnico_asignado_id: string | null
  created_at: string
}

export type MotivoDuplicado = 'mismo_equipo_abierto' | 'misma_orden'

export interface PosibleDuplicado {
  id: string
  motivo: MotivoDuplicado
}

export function esActiva(estado: string | null | undefined): boolean {
  return !!estado && !ESTADOS_TERMINALES.has(estado)
}

export function claveEquipo(tipo: string | null | undefined): string {
  return normalizeForMatch(tipo ?? '')
}

/** Número de orden comparable: sin espacios/símbolos; vacío o muy corto = no se compara. */
export function claveOrden(orden: string | null | undefined): string {
  const limpio = (orden ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
  return limpio.length >= 5 ? limpio : ''
}

function diasEntre(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}

/**
 * Otras órdenes del mismo cliente que podrían ser duplicado de `sol`.
 * `otras` debe venir ya filtrada al mismo teléfono (se ignora la propia).
 */
export function posiblesDuplicadosDe(sol: SolicitudCliente, otras: SolicitudCliente[]): PosibleDuplicado[] {
  const out: PosibleDuplicado[] = []
  const equipo = claveEquipo(sol.tipo_equipo)
  const orden = claveOrden(sol.numero_serie_factura)
  const activa = esActiva(sol.estado)
  for (const o of otras) {
    if (o.id === sol.id) continue
    if (sol.cliente_telefono && o.cliente_telefono && o.cliente_telefono !== sol.cliente_telefono) continue
    const otraOrden = claveOrden(o.numero_serie_factura)
    const ambasActivas = activa && esActiva(o.estado)
    if (orden && otraOrden === orden && (ambasActivas || diasEntre(sol.created_at, o.created_at) <= DIAS_VENTANA_MISMA_ORDEN)) {
      // Solo cuenta si al menos una sigue abierta: dos cerradas con la misma orden ya no molestan.
      if (activa || esActiva(o.estado)) out.push({ id: o.id, motivo: 'misma_orden' })
      continue
    }
    if (ambasActivas && equipo && claveEquipo(o.tipo_equipo) === equipo) {
      out.push({ id: o.id, motivo: 'mismo_equipo_abierto' })
    }
  }
  return out
}

export interface ResumenCliente {
  telefono: string
  nombre: string
  total: number
  activas: number
  equipos: string[]
  /** Órdenes abiertas que tienen al menos un posible duplicado. */
  conPosibleDuplicado: number
  ultimaAt: string
  garantia: boolean
  particular: boolean
}

/** Agrupa por teléfono. Más reciente primero; nombre = el de la orden más reciente. */
export function agruparPorCliente(solicitudes: SolicitudCliente[]): ResumenCliente[] {
  const grupos = new Map<string, SolicitudCliente[]>()
  for (const s of solicitudes) {
    const tel = (s.cliente_telefono ?? '').trim()
    if (!tel) continue
    const g = grupos.get(tel)
    if (g) g.push(s)
    else grupos.set(tel, [s])
  }
  const out: ResumenCliente[] = []
  for (const [telefono, sols] of grupos) {
    sols.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const equipos = [...new Set(sols.map((s) => (s.tipo_equipo ?? '').trim()).filter(Boolean))]
    const conPosibleDuplicado = sols.filter((s) => esActiva(s.estado) && posiblesDuplicadosDe(s, sols).length > 0).length
    out.push({
      telefono,
      nombre: sols.find((s) => s.cliente_nombre?.trim())?.cliente_nombre?.trim() ?? 'Sin nombre',
      total: sols.length,
      activas: sols.filter((s) => esActiva(s.estado)).length,
      equipos,
      conPosibleDuplicado,
      ultimaAt: sols[0].created_at,
      garantia: sols.some((s) => s.es_garantia === true),
      particular: sols.some((s) => s.es_garantia === false),
    })
  }
  return out.sort((a, b) => b.ultimaAt.localeCompare(a.ultimaAt))
}

export const MOTIVO_DUPLICADO_LABELS: Record<MotivoDuplicado, string> = {
  mismo_equipo_abierto: 'Mismo equipo, ambas abiertas',
  misma_orden: 'Mismo número de orden',
}

/** Texto que queda en `motivo_cancelacion` y en el evento. */
export function motivoCancelacionDuplicado(originalId: string, detalle?: string | null): string {
  const base = `Duplicado de la orden #${originalId.slice(0, 8)}`
  const extra = (detalle ?? '').trim()
  return (extra ? `${base}: ${extra}` : base).slice(0, 500)
}
