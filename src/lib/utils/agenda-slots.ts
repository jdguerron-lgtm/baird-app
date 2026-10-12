/**
 * agenda-slots.ts — helpers PUROS (sin Supabase, sin Intl) para razonar sobre
 * slots de agenda (día YYYY-MM-DD en hora Colombia + franja del catálogo).
 *
 * Los usan tanto el server (agenda.service, /api/tecnico/agenda) como el
 * browser (/tecnico/{token}/agenda), así que NO puede importar nada server-only.
 *
 * Colombia es UTC-5 fijo (sin DST): un `fecha_visita_at` ISO se convierte a
 * (día CO, franja) restando 5 h y buscando la franja cuyo `horaInicio` coincide
 * con la hora local. `fecha_visita_at` siempre se materializa con la hora de
 * INICIO de la franja (parsearFechaVisita / materializarFechaVisita), así que
 * el match exacto es la regla; el fallback por rango cubre filas históricas
 * cargadas a mano (carga masiva) con horas intermedias.
 */
import { FRANJAS_HORARIO, type FranjaHorario } from '@/lib/constants/franjas'

export interface SlotAgenda {
  /** Día calendario en hora Colombia, YYYY-MM-DD */
  fecha: string
  franja: FranjaHorario
}

const OFFSET_CO_MS = 5 * 60 * 60 * 1000

/** Franja para una hora local Colombia (0-23). Match exacto por horaInicio, luego por rango. */
export function franjaPorHoraCO(hora: number): FranjaHorario {
  const exacta = FRANJAS_HORARIO.find(f => f.horaInicio === hora)
  if (exacta) return exacta.value
  // Rango: la última franja cuyo inicio sea ≤ hora; antes de la primera → primera.
  let elegida: FranjaHorario = FRANJAS_HORARIO[0].value
  for (const f of FRANJAS_HORARIO) if (hora >= f.horaInicio) elegida = f.value
  return elegida
}

/** (día CO, franja) de un `fecha_visita_at` ISO. null si el ISO es inválido. */
export function slotDesdeFechaVisita(iso: string | null | undefined): SlotAgenda | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const local = new Date(t - OFFSET_CO_MS)
  const fecha = local.toISOString().slice(0, 10)
  return { fecha, franja: franjaPorHoraCO(local.getUTCHours()) }
}

/** YMD + n días (aritmética sobre YMD puro, sin TZ). */
export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

/** Lunes de la semana que contiene `ymd`. */
export function inicioSemanaYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return addDaysYMD(ymd, -((dow + 6) % 7))
}

/** Instante UTC de la medianoche Colombia de `ymd` (para acotar fetches por rango). */
export function medianocheColombiaIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00-05:00`).toISOString()
}

export function esFranjaValida(valor: unknown): valor is FranjaHorario {
  return typeof valor === 'string' && FRANJAS_HORARIO.some(f => f.value === valor)
}

export function esYMDValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))
}

export function claveSlot(fecha: string, franja: string): string {
  return `${fecha}|${franja}`
}
