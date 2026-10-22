/**
 * incumplidos.service.ts — Cumplimiento de la fecha de reserva.
 *
 * Responde "¿atendimos la visita el día que el cliente la reservó?" para cada
 * solicitud con `fecha_visita_at` (identidad del slot día + franja, hora CO).
 *
 * Evidencia de atención (cualquiera vale, se toma la más temprana que caiga
 * en el día de la reserva o después):
 *   - ping GPS del técnico (`gps_pings`, cualquier fase)
 *   - `diagnosticado_at` / `siguiente_paso_at` (técnico envió el diagnóstico)
 *   - `evidencias_servicio.completado_at` (cierre; en tarifa fija no hay diagnóstico)
 *
 * Resultado por reserva (día calendario Colombia):
 *   - `cumplida`           evidencia el mismo día de la reserva
 *   - `tarde`              evidencia días después de la reserva
 *   - `vencida`            reserva pasada, técnico asignado, sin evidencia y la
 *                          solicitud sigue abierta (incluye 2ª visita tras repuesto:
 *                          el diagnóstico quedó ANTES de la nueva fecha)
 *   - `sin_tecnico`        reserva pasada y nadie aceptó (`notificada`)
 *   - `cerrada_sin_visita` reserva pasada, sin evidencia, estado terminal
 *                          (cancelada, sin_agendar, no_show sin ping, …)
 *   - `sin_evidencia`      estado posterior a la visita pero sin ningún marcador
 *                          (datos históricos previos a `diagnosticado_at`, 2026-05-13)
 *   - `futura`             el día de la reserva es hoy o después (no se evalúa:
 *                          misma regla que `esFechaVisitaPasada`)
 *
 * Incumplimiento = `vencida` + `sin_tecnico` + `tarde`. Puro (sin I/O) para
 * poder testearlo; la carga vive en GET /api/admin/incumplidos.
 *
 * Priorización (2026-10-21): cada reserva lleva `reagendamientos` (máximo entre
 * `reagendamientos_count` y los eventos `reagendamiento` / `nota_admin` con
 * `origen='reagendamiento_admin'`, porque "reagendar vencido" solo deja evento),
 * `dias_desde_solicitud` (hoy − día CO de `created_at`) y un nivel `prioridad`.
 * `items` sale ordenado por `ordenarPorPrioridad`: más reagendada primero,
 * luego la solicitud más antigua, luego el resultado más grave y el retraso.
 */

import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

export interface SolicitudIncumplidos {
  id: string
  estado: string | null
  es_garantia: boolean | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  ciudad_pueblo: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  tipo_solicitud: string | null
  numero_serie_factura: string | null
  horario_confirmado: string | null
  fecha_visita_at: string | null
  diagnosticado_at: string | null
  siguiente_paso_at: string | null
  tecnico_asignado_id: string | null
  reagendamientos_count: number | null
  created_at: string
}

export interface EvidenciaIncumplidos {
  solicitud_id: string
  completado_at: string | null
}

export interface PingIncumplidos {
  solicitud_id: string
  capturado_at: string | null
}

/** Un evento de reagendamiento (cliente, admin o reagendar-vencido). */
export interface ReagendamientoIncumplidos {
  solicitud_id: string
}

export type PrioridadReserva = 'alta' | 'media' | 'baja'

/** Umbrales del nivel de prioridad (reagendamientos / días desde la solicitud). */
export const PRIORIDAD_UMBRALES = {
  alta: { reagendamientos: 2, dias: 15 },
  media: { reagendamientos: 1, dias: 7 },
} as const

export const PRIORIDAD_LABELS: Record<PrioridadReserva, string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  baja: 'Prioridad baja',
}

export type ResultadoReserva =
  | 'cumplida'
  | 'tarde'
  | 'vencida'
  | 'sin_tecnico'
  | 'cerrada_sin_visita'
  | 'sin_evidencia'
  | 'futura'

export type EvidenciaAtencion = 'gps' | 'diagnostico' | 'completado'

export interface ReservaEvaluada {
  solicitud_id: string
  cliente_nombre: string
  cliente_telefono: string | null
  ciudad: string | null
  equipo: string
  tipo_solicitud: string | null
  numero_orden: string | null
  es_garantia: boolean
  estado: string
  tecnico_id: string | null
  tecnico_nombre: string | null
  horario_confirmado: string | null
  fecha_visita_at: string
  /** Día calendario CO de la reserva (YYYY-MM-DD). */
  dia_reserva: string
  resultado: ResultadoReserva
  /** Primer marcador de atención en el día de la reserva o después. */
  atendida_at: string | null
  dia_atencion: string | null
  evidencia: EvidenciaAtencion | null
  /** Días de retraso: tarde = atención − reserva; vencida/sin_tecnico = hoy − reserva. */
  dias_retraso: number
  /** Veces reagendada (máximo entre el contador y los eventos de reagendamiento). */
  reagendamientos: number
  /** Cuándo entró la solicitud (ISO). */
  creada_at: string
  /** Días calendario CO desde que entró la solicitud hasta hoy. */
  dias_desde_solicitud: number
  /** Nivel derivado de reagendamientos y antigüedad (ver PRIORIDAD_UMBRALES). */
  prioridad: PrioridadReserva
}

export interface ResumenCumplimiento {
  reservas: number
  cumplidas: number
  tarde: number
  vencidas: number
  sin_tecnico: number
  cerradas_sin_visita: number
  sin_evidencia: number
  /** Incumplidas = vencidas + sin_tecnico + tarde. */
  incumplidas: number
  /** cumplidas / (cumplidas + incumplidas). null si no hay base. */
  cumplimiento_pct: number | null
}

export interface CumplimientoTecnico extends ResumenCumplimiento {
  tecnico_id: string | null
  tecnico_nombre: string
}

export interface ReporteCumplimiento {
  hoy: string
  desde: string
  hasta: string
  resumen: ResumenCumplimiento
  por_tecnico: CumplimientoTecnico[]
  items: ReservaEvaluada[]
}

/** Estados que solo se alcanzan después de que el técnico estuvo en la visita. */
const ESTADOS_POST_VISITA = new Set([
  'aprobacion_paso_pendiente',
  'cotizacion_enviada',
  'cotizacion_rechazada',
  'esperando_repuesto',
  'repuesto_en_camino',
  'repuesto_recibido',
  'pendiente_pricing',
  'finalizado_sin_reparacion',
  'reparacion_rechazada',
  'en_proceso',
  'confirmacion_pendiente',
  'completada',
  'en_disputa',
])

export const RESULTADO_LABELS: Record<ResultadoReserva, string> = {
  cumplida: 'Atendida a tiempo',
  tarde: 'Atendida tarde',
  vencida: 'Vencida sin atender',
  sin_tecnico: 'Vencida sin técnico',
  cerrada_sin_visita: 'Cerrada sin visita',
  sin_evidencia: 'Sin evidencia (histórico)',
  futura: 'Pendiente (futura)',
}

/** Días calendario entre dos YYYY-MM-DD (b − a). */
export function diasEntreYMD(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

interface Marcador {
  at: string
  tipo: EvidenciaAtencion
}

function fechaValida(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : iso
}

/** Nivel de prioridad: la peor de las dos señales (reagendamientos, antigüedad). */
export function nivelPrioridad(reagendamientos: number, diasDesdeSolicitud: number): PrioridadReserva {
  if (reagendamientos >= PRIORIDAD_UMBRALES.alta.reagendamientos || diasDesdeSolicitud >= PRIORIDAD_UMBRALES.alta.dias) return 'alta'
  if (reagendamientos >= PRIORIDAD_UMBRALES.media.reagendamientos || diasDesdeSolicitud >= PRIORIDAD_UMBRALES.media.dias) return 'media'
  return 'baja'
}

const PESO_RESULTADO: Record<ResultadoReserva, number> = {
  vencida: 0, sin_tecnico: 1, tarde: 2, cerrada_sin_visita: 3, sin_evidencia: 4, cumplida: 5, futura: 6,
}

/**
 * Orden de atención: más reagendada primero, luego la solicitud más antigua,
 * luego el resultado más grave (vencida > sin técnico > tarde > …) y, a
 * igualdad, la de mayor retraso. Devuelve una copia ordenada.
 */
export function ordenarPorPrioridad(items: ReservaEvaluada[]): ReservaEvaluada[] {
  return [...items].sort((a, b) => {
    if (b.reagendamientos !== a.reagendamientos) return b.reagendamientos - a.reagendamientos
    if (b.dias_desde_solicitud !== a.dias_desde_solicitud) return b.dias_desde_solicitud - a.dias_desde_solicitud
    if (PESO_RESULTADO[a.resultado] !== PESO_RESULTADO[b.resultado]) return PESO_RESULTADO[a.resultado] - PESO_RESULTADO[b.resultado]
    if (b.dias_retraso !== a.dias_retraso) return b.dias_retraso - a.dias_retraso
    return b.dia_reserva.localeCompare(a.dia_reserva)
  })
}

/**
 * Orden por urgencia del resultado (el que tenía la vista hasta 2026-10-21):
 * vencidas por retraso desc, luego sin técnico, luego tarde, luego el resto por
 * fecha de reserva desc. Devuelve una copia ordenada.
 */
export function ordenarPorUrgencia(items: ReservaEvaluada[]): ReservaEvaluada[] {
  return [...items].sort((a, b) => {
    if (PESO_RESULTADO[a.resultado] !== PESO_RESULTADO[b.resultado]) return PESO_RESULTADO[a.resultado] - PESO_RESULTADO[b.resultado]
    if (a.resultado === 'vencida' || a.resultado === 'sin_tecnico') return b.dias_retraso - a.dias_retraso
    return b.dia_reserva.localeCompare(a.dia_reserva)
  })
}

/**
 * Evalúa una reserva. Retorna null si la solicitud no tiene `fecha_visita_at`
 * (nunca se agendó: no hay fecha que cumplir).
 */
export function evaluarReserva(
  sol: SolicitudIncumplidos,
  opts: {
    evidencias?: EvidenciaIncumplidos[]
    pings?: PingIncumplidos[]
    /** Eventos de reagendamiento de la solicitud (se toma el máximo con el contador). */
    reagendamientos?: ReagendamientoIncumplidos[]
    tecnicoNombre?: string | null
    ahora?: Date
  } = {},
): ReservaEvaluada | null {
  const fechaVisita = fechaValida(sol.fecha_visita_at)
  if (!fechaVisita) return null

  const ahora = opts.ahora ?? new Date()
  const hoy = fechaColombiaYMD(ahora)
  const diaReserva = fechaColombiaYMD(new Date(fechaVisita))
  const estado = sol.estado ?? 'pendiente_horario'

  const marcadores: Marcador[] = []
  for (const p of opts.pings ?? []) {
    const at = fechaValida(p.capturado_at)
    if (at) marcadores.push({ at, tipo: 'gps' })
  }
  const diag = fechaValida(sol.diagnosticado_at) ?? fechaValida(sol.siguiente_paso_at)
  if (diag) marcadores.push({ at: diag, tipo: 'diagnostico' })
  for (const e of opts.evidencias ?? []) {
    const at = fechaValida(e.completado_at)
    if (at) marcadores.push({ at, tipo: 'completado' })
  }

  // Primer marcador que cae en el día de la reserva o después.
  const enOdespues = marcadores
    .filter((m) => fechaColombiaYMD(new Date(m.at)) >= diaReserva)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const atencion = enOdespues[0] ?? null

  let resultado: ResultadoReserva
  let diasRetraso = 0
  let diaAtencion: string | null = null

  if (atencion) {
    diaAtencion = fechaColombiaYMD(new Date(atencion.at))
    diasRetraso = diasEntreYMD(diaReserva, diaAtencion)
    resultado = diasRetraso === 0 ? 'cumplida' : 'tarde'
  } else if (diaReserva >= hoy) {
    resultado = 'futura'
  } else if (marcadores.length === 0 && ESTADOS_POST_VISITA.has(estado)) {
    // Estado que implica visita, pero sin ningún timestamp: dato histórico.
    resultado = 'sin_evidencia'
  } else if (ESTADOS_TERMINALES.has(estado)) {
    resultado = 'cerrada_sin_visita'
    diasRetraso = diasEntreYMD(diaReserva, hoy)
  } else if (!sol.tecnico_asignado_id) {
    resultado = 'sin_tecnico'
    diasRetraso = diasEntreYMD(diaReserva, hoy)
  } else {
    resultado = 'vencida'
    diasRetraso = diasEntreYMD(diaReserva, hoy)
  }

  const equipo = [sol.tipo_equipo, sol.marca_equipo].filter(Boolean).join(' · ') || '—'

  const reagendamientos = Math.max(sol.reagendamientos_count ?? 0, opts.reagendamientos?.length ?? 0)
  const creadaAt = fechaValida(sol.created_at) ?? fechaVisita
  const diasDesdeSolicitud = Math.max(0, diasEntreYMD(fechaColombiaYMD(new Date(creadaAt)), hoy))

  return {
    solicitud_id: sol.id,
    cliente_nombre: sol.cliente_nombre ?? '—',
    cliente_telefono: sol.cliente_telefono,
    ciudad: sol.ciudad_pueblo,
    equipo,
    tipo_solicitud: sol.tipo_solicitud,
    numero_orden: sol.numero_serie_factura,
    es_garantia: sol.es_garantia === true,
    estado,
    tecnico_id: sol.tecnico_asignado_id,
    tecnico_nombre: opts.tecnicoNombre ?? null,
    horario_confirmado: sol.horario_confirmado,
    fecha_visita_at: fechaVisita,
    dia_reserva: diaReserva,
    resultado,
    atendida_at: atencion?.at ?? null,
    dia_atencion: diaAtencion,
    evidencia: atencion?.tipo ?? null,
    dias_retraso: diasRetraso,
    reagendamientos,
    creada_at: creadaAt,
    dias_desde_solicitud: diasDesdeSolicitud,
    prioridad: nivelPrioridad(reagendamientos, diasDesdeSolicitud),
  }
}

function resumenVacio(): ResumenCumplimiento {
  return {
    reservas: 0,
    cumplidas: 0,
    tarde: 0,
    vencidas: 0,
    sin_tecnico: 0,
    cerradas_sin_visita: 0,
    sin_evidencia: 0,
    incumplidas: 0,
    cumplimiento_pct: null,
  }
}

function acumular(r: ResumenCumplimiento, item: ReservaEvaluada): void {
  r.reservas += 1
  switch (item.resultado) {
    case 'cumplida': r.cumplidas += 1; break
    case 'tarde': r.tarde += 1; break
    case 'vencida': r.vencidas += 1; break
    case 'sin_tecnico': r.sin_tecnico += 1; break
    case 'cerrada_sin_visita': r.cerradas_sin_visita += 1; break
    case 'sin_evidencia': r.sin_evidencia += 1; break
    case 'futura': break
  }
}

function cerrar<T extends ResumenCumplimiento>(r: T): T {
  r.incumplidas = r.vencidas + r.sin_tecnico + r.tarde
  const base = r.cumplidas + r.incumplidas
  r.cumplimiento_pct = base > 0 ? r.cumplidas / base : null
  return r
}

/**
 * Evalúa todas las reservas del período (por día de reserva, inclusive) y
 * agrega el resumen global y por técnico. Las reservas futuras se excluyen.
 */
export function calcularReporteCumplimiento(input: {
  solicitudes: SolicitudIncumplidos[]
  evidencias: EvidenciaIncumplidos[]
  pings: PingIncumplidos[]
  /** Eventos de reagendamiento (opcional: sin ellos vale el contador de la solicitud). */
  reagendamientos?: ReagendamientoIncumplidos[]
  tecnicos: Record<string, string>
  desde: string
  hasta: string
  ahora?: Date
}): ReporteCumplimiento {
  const ahora = input.ahora ?? new Date()
  const hoy = fechaColombiaYMD(ahora)

  const evPorSol = new Map<string, EvidenciaIncumplidos[]>()
  for (const e of input.evidencias) {
    const lista = evPorSol.get(e.solicitud_id) ?? []
    lista.push(e)
    evPorSol.set(e.solicitud_id, lista)
  }
  const pingsPorSol = new Map<string, PingIncumplidos[]>()
  for (const p of input.pings) {
    const lista = pingsPorSol.get(p.solicitud_id) ?? []
    lista.push(p)
    pingsPorSol.set(p.solicitud_id, lista)
  }

  const reagPorSol = new Map<string, ReagendamientoIncumplidos[]>()
  for (const r of input.reagendamientos ?? []) {
    const lista = reagPorSol.get(r.solicitud_id) ?? []
    lista.push(r)
    reagPorSol.set(r.solicitud_id, lista)
  }

  const evaluadas: ReservaEvaluada[] = []
  for (const sol of input.solicitudes) {
    const item = evaluarReserva(sol, {
      evidencias: evPorSol.get(sol.id),
      pings: pingsPorSol.get(sol.id),
      reagendamientos: reagPorSol.get(sol.id),
      tecnicoNombre: sol.tecnico_asignado_id ? input.tecnicos[sol.tecnico_asignado_id] ?? null : null,
      ahora,
    })
    if (!item) continue
    if (item.resultado === 'futura') continue
    if (item.dia_reserva < input.desde || item.dia_reserva > input.hasta) continue
    evaluadas.push(item)
  }

  // Prioridad de atención: reagendamientos desc → antigüedad de la solicitud
  // desc → gravedad del resultado → retraso (2026-10-21).
  const items = ordenarPorPrioridad(evaluadas)

  const resumen = resumenVacio()
  const porTecnico = new Map<string, CumplimientoTecnico>()
  for (const item of items) {
    acumular(resumen, item)
    const clave = item.tecnico_id ?? '__sin_tecnico__'
    let t = porTecnico.get(clave)
    if (!t) {
      t = {
        ...resumenVacio(),
        tecnico_id: item.tecnico_id,
        tecnico_nombre: item.tecnico_id ? item.tecnico_nombre ?? 'Técnico sin nombre' : 'Sin técnico',
      }
      porTecnico.set(clave, t)
    }
    acumular(t, item)
  }

  const por_tecnico = [...porTecnico.values()].map(cerrar).sort((a, b) => {
    if (b.incumplidas !== a.incumplidas) return b.incumplidas - a.incumplidas
    return b.reservas - a.reservas
  })

  return {
    hoy,
    desde: input.desde,
    hasta: input.hasta,
    resumen: cerrar(resumen),
    por_tecnico,
    items,
  }
}
