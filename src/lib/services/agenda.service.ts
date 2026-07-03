import { supabase } from '@/lib/supabase'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { FRANJAS_HORARIO, MAX_RESERVAS_POR_FRANJA } from '@/lib/constants/franjas'
import { parsearFechaVisita, fechaColombiaYMD, fechaColombiaMasDias } from '@/lib/utils/fecha-visita'

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
 *   1. La fecha debe ser a partir de MAÑANA (TZ Colombia) — no mismo día.
 *   2. El slot (día + franja) debe tener cupo (< MAX_RESERVAS_POR_FRANJA).
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
): Promise<ValidacionAgenda> {
  const fechaVisitaAt = parsearFechaVisita(horarioTexto)
  if (!fechaVisitaAt) return { ok: true, fechaVisitaAt: null }

  if (fechaColombiaYMD(new Date(fechaVisitaAt)) < fechaColombiaMasDias(1)) {
    return {
      ok: false,
      error: 'Por ahora no agendamos para el mismo día. Elige una fecha a partir de mañana.',
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
