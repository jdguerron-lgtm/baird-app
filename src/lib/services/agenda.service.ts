import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { FRANJAS_HORARIO, MAX_RESERVAS_POR_FRANJA, MAX_SERVICIOS_TECNICO_POR_FRANJA, fechaCerradaAReservas } from '@/lib/constants/franjas'
import {
  parsearFechaVisita,
  fechaColombiaYMD,
  fechaColombiaMasDias,
  validarFechaVisita,
  formatearFechaLargaCO,
  DIAS_MINIMOS_RESERVA_CLIENTE,
} from '@/lib/utils/fecha-visita'
import { slotDesdeFechaVisita } from '@/lib/utils/agenda-slots'

/**
 * agenda.service.ts — disponibilidad de slots (día + franja) para agendar.
 *
 * La identidad de un "slot" es el timestamp `fecha_visita_at` que materializa
 * parsearFechaVisita(): mismo día + misma franja ⇒ mismo timestamp (la hora de
 * inicio de la franja, en hora Colombia). Contar reservas de un slot =
 * contar solicitudes activas (estado fuera de ESTADOS_TERMINALES) con ese
 * `fecha_visita_at` exacto.
 *
 * Usado por las TRES vías por las que un cliente fija fecha:
 *   - confirmarHorarioSolicitud      (POST /api/confirmar-horario + Dapta)
 *   - reprogramarRepuestoSolicitud   (POST /api/reprogramar-repuesto)
 *   - procesarReagendamientoCliente  (self-service /servicio)
 * y por GET /api/disponibilidad-horario (la UI desactiva franjas llenas).
 *
 * Módulo neutral a propósito: whatsapp.service y transiciones.service lo
 * importan; este no importa a ninguno de los dos (evita ciclos).
 *
 * ⚠️ Best-effort ante carreras: el chequeo de cupo es read-then-write sin
 * lock — dos confirmaciones simultáneas del mismo slot pueden colarse ambas
 * (quedarían 3). Al volumen actual es aceptable; si crece, mover el conteo a
 * una función SQL con SELECT ... FOR UPDATE. Ante error de BD el chequeo es
 * fail-open: nunca bloquea el agendamiento por una falla del conteo.
 */

const ESTADOS_TERMINALES_IN = `(${[...ESTADOS_TERMINALES].join(',')})`

/** Reservas activas en el slot exacto. null si el conteo falló (fail-open). */
async function contarReservasSlot(fechaVisitaAt: string, excluirSolicitudId?: string): Promise<number | null> {
  let query = supabase
    .from('solicitudes_servicio')
    .select('id', { count: 'exact', head: true })
    .eq('fecha_visita_at', fechaVisitaAt)
    .not('estado', 'in', ESTADOS_TERMINALES_IN)
  if (excluirSolicitudId) query = query.neq('id', excluirSolicitudId)

  const { count, error } = await query
  if (error) {
    console.error('[agenda] Error contando reservas del slot:', error.message)
    return null
  }
  return count ?? 0
}

export type ValidacionAgenda =
  | { ok: true; fechaVisitaAt: string | null }
  | { ok: false; error: string }

/**
 * Valida que un horario elegido por el cliente sea agendable:
 *   1. `validarFechaVisita` (utils/fecha-visita): NO anterior a hoy CO y no
 *      más de MAX_DIAS_FECHA_VISITA_ADELANTE hacia adelante. Desde 2026-10-22
 *      `parsearFechaVisita` ya NO rota una fecha pasada al año siguiente
 *      (salvo el cruce diciembre → enero), así que una opción vencida del
 *      cliente ("29 de agosto" aceptada en septiembre, orden 9415568723) se
 *      rechaza aquí en vez de quedar agendada un año después.
 *   2. Anticipación mínima (TZ Colombia): por defecto
 *      DIAS_MINIMOS_RESERVA_CLIENTE (2 = desde pasado mañana, 2026-10-27) para
 *      todo lo que elige el cliente; la aceptación del técnico pasa
 *      `diasMinimos: 1` (una opción del cliente puede haber quedado para mañana).
 *   3. El slot (día + franja) debe tener cupo (< MAX_RESERVAS_POR_FRANJA).
 *
 * Texto no parseable (sugerencias libres del formulario) → ok con
 * fechaVisitaAt null: no hay slot que validar; el admin coordina manualmente.
 *
 * @param excluirSolicitudId la propia solicitud no cuenta contra su cupo
 *        (reagendamientos: su fila ya puede tener un fecha_visita_at previo).
 */
export async function validarHorarioAgendable(
  horarioTexto: string,
  excluirSolicitudId?: string,
  opts: { diasMinimos?: number } = {},
): Promise<ValidacionAgenda> {
  const fechaVisitaAt = parsearFechaVisita(horarioTexto)
  if (!fechaVisitaAt) return { ok: true, fechaVisitaAt: null }

  const fecha = validarFechaVisita(fechaVisitaAt)
  if (!fecha.ok) return { ok: false, error: fecha.error }
  const diasMinimos = opts.diasMinimos ?? DIAS_MINIMOS_RESERVA_CLIENTE
  if (fechaColombiaYMD(new Date(fechaVisitaAt)) < fechaColombiaMasDias(diasMinimos)) {
    return {
      ok: false,
      error: diasMinimos >= 2
        ? `Necesitamos al menos ${diasMinimos} días de anticipación para organizar la visita. Elige una fecha a partir del ${formatearFechaLargaCO(fechaColombiaMasDias(diasMinimos))}.`
        : 'Por ahora no agendamos para el mismo día. Elige una fecha a partir de mañana.',
    }
  }

  // Día cerrado a reservas nuevas (FECHAS_SIN_RESERVAS_NUEVAS): lo ya agendado
  // ese día se mantiene, pero no entra nada nuevo.
  if (fechaCerradaAReservas(fechaColombiaYMD(new Date(fechaVisitaAt)))) {
    return {
      ok: false,
      error: 'Ese día ya no tiene cupo para nuevas visitas. Por favor elige otro día.',
    }
  }

  const reservas = await contarReservasSlot(fechaVisitaAt, excluirSolicitudId)
  if (reservas !== null && reservas >= MAX_RESERVAS_POR_FRANJA) {
    return {
      ok: false,
      error: 'Esa franja ya está llena para ese día. Por favor elige otra franja u otro día.',
    }
  }

  return { ok: true, fechaVisitaAt }
}

/**
 * Ocupación de UN técnico en un slot (día + franja): servicios Baird activos
 * asignados con ese `fecha_visita_at` + bloqueos externos que registró en su
 * agenda (`agenda_tecnico_bloqueos`, mismo día + franja). `cerrado` = algún
 * bloqueo con `bloquea_franja`.
 *
 * Fail-open por componente: si una de las dos consultas falla, ese componente
 * cuenta 0 (nunca bloquea una aceptación por una falla del conteo).
 */
export interface OcupacionTecnicoSlot {
  servicios: number
  bloqueos: number
  cerrado: boolean
  total: number
}

export async function ocupacionTecnicoEnSlot(
  tecnicoId: string,
  fechaVisitaAt: string,
  excluirSolicitudId?: string,
): Promise<OcupacionTecnicoSlot> {
  let query = supabase
    .from('solicitudes_servicio')
    .select('id', { count: 'exact', head: true })
    .eq('tecnico_asignado_id', tecnicoId)
    .eq('fecha_visita_at', fechaVisitaAt)
    .not('estado', 'in', ESTADOS_TERMINALES_IN)
  if (excluirSolicitudId) query = query.neq('id', excluirSolicitudId)

  const { count, error } = await query
  if (error) console.error('[agenda] Error verificando agenda del técnico:', error.message)
  const servicios = error ? 0 : (count ?? 0)

  let bloqueos = 0
  let cerrado = false
  const slot = slotDesdeFechaVisita(fechaVisitaAt)
  if (slot) {
    const { data, error: errB } = await supabase
      .from('agenda_tecnico_bloqueos')
      .select('bloquea_franja')
      .eq('tecnico_id', tecnicoId)
      .eq('fecha', slot.fecha)
      .eq('franja', slot.franja)
    if (errB) {
      console.error('[agenda] Error leyendo bloqueos del técnico:', errB.message)
    } else {
      const filas = (data ?? []) as { bloquea_franja: boolean | null }[]
      bloqueos = filas.length
      cerrado = filas.some(f => f.bloquea_franja === true)
    }
  }

  return { servicios, bloqueos, cerrado, total: servicios + bloqueos }
}

/**
 * ¿El técnico ya NO cabe en ese slot exacto (día + franja)?
 *
 * El cupo de `validarHorarioAgendable` es GLOBAL (MAX_RESERVAS_POR_FRANJA para
 * toda la plataforma) y no mira quién atiende. Este chequeo es por técnico y se
 * aplica al aceptar un servicio: true si ya tiene
 * MAX_SERVICIOS_TECNICO_POR_FRANJA compromisos (servicios Baird + bloqueos
 * externos) en el slot, o si cerró la franja desde su agenda. Hasta el
 * 2026-10-11 el tope era 1 (cualquier servicio activo en el slot bloqueaba).
 *
 * Fail-open igual que el resto del módulo (ver ocupacionTecnicoEnSlot).
 *
 * @param excluirSolicitudId la propia solicitud no cuenta (reagendamientos).
 */
export async function tecnicoOcupadoEnSlot(
  tecnicoId: string,
  fechaVisitaAt: string,
  excluirSolicitudId?: string,
): Promise<boolean> {
  const o = await ocupacionTecnicoEnSlot(tecnicoId, fechaVisitaAt, excluirSolicitudId)
  return o.cerrado || o.total >= MAX_SERVICIOS_TECNICO_POR_FRANJA
}

/**
 * ISO timestamp del slot (inicio de franja, hora Colombia) para un día
 * YYYY-MM-DD. Espeja la construcción de parsearFechaVisita (hora local + 5).
 */
function isoDeSlot(fechaYMD: string, horaInicio: number): string {
  const [y, m, d] = fechaYMD.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, horaInicio + 5, 0, 0)).toISOString()
}

/**
 * `fecha_visita_at` (ISO) para un día YYYY-MM-DD + una franja (`value` de
 * FRANJAS_HORARIO). Produce el MISMO timestamp que `parsearFechaVisita` para ese
 * día+franja, así que cuenta contra el mismo slot de cupo. A diferencia de
 * `parsearFechaVisita`, NO infiere el año (recibe el YMD explícito), por lo que
 * no rota a +1 año en fechas cercanas — pensado para el calendario del admin,
 * donde la fecha se elige sin ambigüedad. null si la franja no está en el
 * catálogo o el YMD está mal formado.
 */
export function materializarFechaVisita(fechaYMD: string, franjaValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYMD)) return null
  const franja = FRANJAS_HORARIO.find(f => f.value === franjaValue)
  if (!franja) return null
  return isoDeSlot(fechaYMD, franja.horaInicio)
}

/**
 * Franjas SIN cupo para un día dado (YYYY-MM-DD). Para que la UI las
 * desactive antes de que el cliente intente confirmar. Ante error de BD
 * devuelve [] (fail-open — el guard real es validarHorarioAgendable).
 */
export async function franjasLlenasParaFecha(fechaYMD: string): Promise<string[]> {
  // Día cerrado a reservas nuevas → todas las franjas se muestran llenas.
  if (fechaCerradaAReservas(fechaYMD)) return FRANJAS_HORARIO.map(f => f.value)

  const slots = FRANJAS_HORARIO.map(f => ({ value: f.value, iso: isoDeSlot(fechaYMD, f.horaInicio) }))

  const { data, error } = await supabase
    .from('solicitudes_servicio')
    .select('fecha_visita_at')
    .in('fecha_visita_at', slots.map(s => s.iso))
    .not('estado', 'in', ESTADOS_TERMINALES_IN)

  if (error) {
    console.error('[agenda] Error consultando franjas llenas:', error.message)
    return []
  }

  const conteo = new Map<string, number>()
  for (const row of data ?? []) {
    if (!row.fecha_visita_at) continue
    const iso = new Date(row.fecha_visita_at).toISOString()
    conteo.set(iso, (conteo.get(iso) ?? 0) + 1)
  }

  return slots.filter(s => (conteo.get(s.iso) ?? 0) >= MAX_RESERVAS_POR_FRANJA).map(s => s.value)
}
