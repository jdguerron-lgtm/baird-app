/**
 * penalizacion.service.ts — datos para la penalización por incumplimiento y
 * el bloqueo por tipo de servicio de los técnicos (2026-10-26). Reglas puras
 * en `src/lib/utils/penalizacion-oferta.ts`. Migración:
 * `20261026_restricciones_penalizacion_tecnicos.sql`.
 *
 * Todo es FAIL-SOFT: si la migración no está aplicada o una lectura falla,
 * no hay bloqueos ni penalización y las ofertas salen como siempre.
 *
 * Qué cuenta como incumplimiento (ventana `dias`, default 30):
 *  - reserva propia evaluada como `vencida` o `tarde` (misma regla que
 *    /admin/incumplidos, `evaluarReserva`);
 *  - el admin lo liberó ("Liberar técnico y reofertar", evento
 *    `tecnico_liberado` con `motivo='admin'`);
 *  - el admin lo cambió por otro marcando "cuenta como incumplimiento"
 *    (`nota_admin` con `origen='cambio_tecnico'`, `cuenta_incumplimiento`).
 * "No alcanzo" desde su portal NO cuenta: avisar a tiempo es lo que se busca.
 * Se cuenta una vez por técnico + servicio.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { fechaColombiaYMD, fechaColombiaMasDias } from '@/lib/utils/fecha-visita'
import { medianocheColombiaIso } from '@/lib/utils/agenda-slots'
import {
  evaluarReserva,
  type EvidenciaIncumplidos,
  type PingIncumplidos,
  type SolicitudIncumplidos,
} from '@/lib/services/incumplidos.service'
import {
  CONFIG_PENALIZACION_DEFAULT,
  minutosPenalizacion,
  type ConfigPenalizacion,
} from '@/lib/utils/penalizacion-oferta'

export interface BloqueoTecnico {
  garantia: boolean
  particular: boolean
  nota: string | null
}

/** Config de penalización (columnas nuevas de config_reparto). Sin migración → inactiva. */
export async function obtenerConfigPenalizacion(): Promise<ConfigPenalizacion> {
  try {
    const { data, error } = await supabase
      .from('config_reparto')
      .select('penalizacion_activa, penalizacion_minutos, penalizacion_dias, penalizacion_max_minutos')
      .eq('id', 1)
      .limit(1)
    const fila = Array.isArray(data) ? data[0] : null
    if (error || !fila) return { ...CONFIG_PENALIZACION_DEFAULT }
    return {
      activa: fila.penalizacion_activa === true,
      minutosPorIncumplimiento: Number(fila.penalizacion_minutos) || CONFIG_PENALIZACION_DEFAULT.minutosPorIncumplimiento,
      dias: Number(fila.penalizacion_dias) || CONFIG_PENALIZACION_DEFAULT.dias,
      maxMinutos: Number(fila.penalizacion_max_minutos) || CONFIG_PENALIZACION_DEFAULT.maxMinutos,
    }
  } catch {
    return { ...CONFIG_PENALIZACION_DEFAULT }
  }
}

/** Bloqueos por tipo de servicio. Sin migración / error → mapa vacío (nadie bloqueado). */
export async function obtenerBloqueos(tecnicoIds: string[]): Promise<Map<string, BloqueoTecnico>> {
  const out = new Map<string, BloqueoTecnico>()
  if (tecnicoIds.length === 0) return out
  try {
    const { data, error } = await supabase
      .from('tecnicos')
      .select('id, bloqueado_garantia, bloqueado_particular, bloqueo_nota')
      .in('id', tecnicoIds)
    if (error) return out
    for (const t of (data ?? []) as Array<{ id: string; bloqueado_garantia: boolean | null; bloqueado_particular: boolean | null; bloqueo_nota: string | null }>) {
      out.set(t.id, {
        garantia: t.bloqueado_garantia === true,
        particular: t.bloqueado_particular === true,
        nota: t.bloqueo_nota ?? null,
      })
    }
  } catch {
    // fail-soft
  }
  return out
}

export interface IncumplimientoDetalle {
  solicitud_id: string
  motivo: 'vencida' | 'tarde' | 'liberado_admin' | 'cambiado_admin'
}

/**
 * Incumplimientos de cada técnico en los últimos `dias` días. Los técnicos sin
 * incumplimientos quedan con lista vacía. Si algo falla, devuelve lo que pudo
 * contar (nunca lanza).
 */
export async function incumplimientosRecientes(
  tecnicoIds: string[],
  dias: number,
  ahora: Date = new Date(),
): Promise<Map<string, IncumplimientoDetalle[]>> {
  const porTecnico = new Map<string, Map<string, IncumplimientoDetalle>>(tecnicoIds.map(id => [id, new Map()]))
  const resultado = () => new Map([...porTecnico.entries()].map(([id, m]) => [id, [...m.values()]]))
  if (tecnicoIds.length === 0) return resultado()

  const agregar = (tecId: string | null | undefined, d: IncumplimientoDetalle) => {
    if (!tecId) return
    const m = porTecnico.get(tecId)
    if (m && !m.has(d.solicitud_id)) m.set(d.solicitud_id, d)
  }

  const desdeYMD = fechaColombiaMasDias(-dias, ahora)
  const desdeIso = medianocheColombiaIso(desdeYMD)
  const hoyIso = medianocheColombiaIso(fechaColombiaYMD(ahora))

  // 1. Reservas propias vencidas / atendidas tarde.
  try {
    const { data: solRaw } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cliente_nombre, cliente_telefono, ciudad_pueblo, tipo_equipo, marca_equipo, tipo_solicitud, numero_serie_factura, horario_confirmado, fecha_visita_at, diagnosticado_at, siguiente_paso_at, tecnico_asignado_id, reagendamientos_count, created_at')
      .in('tecnico_asignado_id', tecnicoIds)
      .gte('fecha_visita_at', desdeIso)
      .lt('fecha_visita_at', hoyIso)
      .limit(2000)
    const sols = (solRaw ?? []) as unknown as SolicitudIncumplidos[]
    if (sols.length > 0) {
      const ids = sols.map(s => s.id)
      const [{ data: ev }, { data: pings }] = await Promise.all([
        supabase.from('evidencias_servicio').select('solicitud_id, completado_at').in('solicitud_id', ids),
        supabase.from('gps_pings').select('solicitud_id, capturado_at').in('solicitud_id', ids),
      ])
      const evPor = new Map<string, EvidenciaIncumplidos[]>()
      for (const e of (ev ?? []) as EvidenciaIncumplidos[]) evPor.set(e.solicitud_id, [...(evPor.get(e.solicitud_id) ?? []), e])
      const pingPor = new Map<string, PingIncumplidos[]>()
      for (const p of (pings ?? []) as PingIncumplidos[]) pingPor.set(p.solicitud_id, [...(pingPor.get(p.solicitud_id) ?? []), p])
      for (const s of sols) {
        const r = evaluarReserva(s, { evidencias: evPor.get(s.id), pings: pingPor.get(s.id), ahora })
        if (r && (r.resultado === 'vencida' || r.resultado === 'tarde')) {
          agregar(s.tecnico_asignado_id, { solicitud_id: s.id, motivo: r.resultado })
        }
      }
    }
  } catch (err) {
    console.warn('[penalizacion] reservas no evaluadas:', err instanceof Error ? err.message : err)
  }

  // 2. Liberaciones y cambios de técnico hechos por el admin.
  try {
    const { data: eventos } = await supabase
      .from('solicitud_eventos')
      .select('solicitud_id, tipo, payload')
      .gte('ocurrido_at', desdeIso)
      .or('and(tipo.eq.tecnico_liberado,payload->>motivo.eq.admin),and(tipo.eq.nota_admin,payload->>origen.eq.cambio_tecnico)')
      .limit(2000)
    for (const e of (eventos ?? []) as Array<{ solicitud_id: string; tipo: string; payload: Record<string, unknown> | null }>) {
      const p = e.payload ?? {}
      if (e.tipo === 'tecnico_liberado') {
        agregar(p.tecnico_id as string, { solicitud_id: e.solicitud_id, motivo: 'liberado_admin' })
      } else if (p.cuenta_incumplimiento === true) {
        agregar(p.tecnico_anterior_id as string, { solicitud_id: e.solicitud_id, motivo: 'cambiado_admin' })
      }
    }
  } catch (err) {
    console.warn('[penalizacion] eventos no leídos:', err instanceof Error ? err.message : err)
  }

  return resultado()
}

/** Minutos de espera por técnico (solo los que tienen > 0). Inactiva → mapa vacío. */
export async function minutosPenalizacionTecnicos(
  tecnicoIds: string[],
  cfg: ConfigPenalizacion,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!cfg.activa || tecnicoIds.length === 0) return out
  const inc = await incumplimientosRecientes(tecnicoIds, cfg.dias)
  for (const [id, lista] of inc) {
    const min = minutosPenalizacion(lista.length, cfg)
    if (min > 0) out.set(id, min)
  }
  return out
}
