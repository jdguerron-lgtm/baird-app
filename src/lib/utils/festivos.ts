/**
 * festivos.ts — Festivos oficiales de Colombia (Ley 51 de 1983, "Ley Emiliani").
 *
 * Usado para el recargo de fin de semana/festivo: si la visita confirmada cae
 * sábado, domingo o festivo, el técnico recibe recargo (garantía y particular).
 * Ver docs/TARIFAS.md § "Recargo fin de semana".
 *
 * Tres clases de festivo:
 *   1. Fijos: se celebran el día que caen (1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic).
 *   2. Emiliani: se trasladan al lunes siguiente si no caen lunes
 *      (6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov).
 *   3. Relativos a Pascua:
 *      - Sin traslado: Jueves Santo (Pascua−3), Viernes Santo (Pascua−2).
 *      - Con traslado a lunes: Ascensión (Pascua+43), Corpus Christi (Pascua+64),
 *        Sagrado Corazón (Pascua+71). (+39/+60/+68 caen jueves/viernes; el
 *        traslado Emiliani los deja en el lunes siguiente = +43/+64/+71.)
 *
 * Todo se computa sobre día calendario YYYY-MM-DD en TZ America/Bogota —
 * sin depender de la TZ del runtime (Vercel corre en UTC).
 */

import { fechaColombiaYMD } from './fecha-visita'

/** Pascua (domingo de Resurrección) para un año — computus de Butcher/Meeus. */
function domingoPascua(year: number): { mes: number; dia: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31) // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { mes, dia }
}

/** YMD de una fecha UTC pura (construida con Date.UTC — sin drift de TZ). */
function ymdUTC(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/** Suma días a una fecha UTC pura. */
function masDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime())
  copia.setUTCDate(copia.getUTCDate() + dias)
  return copia
}

/** Traslada al lunes siguiente si no cae lunes (regla Emiliani). */
function alLunes(fecha: Date): Date {
  const dow = fecha.getUTCDay() // 0=dom, 1=lun
  if (dow === 1) return fecha
  return masDias(fecha, (8 - dow) % 7)
}

/** Festivos fijos (mes 1-indexed, día). */
const FIJOS: Array<[number, number]> = [
  [1, 1],   // Año Nuevo
  [5, 1],   // Día del Trabajo
  [7, 20],  // Independencia
  [8, 7],   // Batalla de Boyacá
  [12, 8],  // Inmaculada Concepción
  [12, 25], // Navidad
]

/** Festivos con traslado Emiliani (mes 1-indexed, día). */
const EMILIANI: Array<[number, number]> = [
  [1, 6],   // Reyes Magos
  [3, 19],  // San José
  [6, 29],  // San Pedro y San Pablo
  [8, 15],  // Asunción de la Virgen
  [10, 12], // Día de la Raza
  [11, 1],  // Todos los Santos
  [11, 11], // Independencia de Cartagena
]

const cacheFestivos = new Map<number, Set<string>>()

/** Set de festivos (YYYY-MM-DD) de un año. Cacheado por año. */
export function festivosColombia(year: number): Set<string> {
  const cached = cacheFestivos.get(year)
  if (cached) return cached

  const festivos = new Set<string>()

  for (const [mes, dia] of FIJOS) {
    festivos.add(ymdUTC(new Date(Date.UTC(year, mes - 1, dia))))
  }
  for (const [mes, dia] of EMILIANI) {
    festivos.add(ymdUTC(alLunes(new Date(Date.UTC(year, mes - 1, dia)))))
  }

  const { mes: mesPascua, dia: diaPascua } = domingoPascua(year)
  const pascua = new Date(Date.UTC(year, mesPascua - 1, diaPascua))
  festivos.add(ymdUTC(masDias(pascua, -3))) // Jueves Santo
  festivos.add(ymdUTC(masDias(pascua, -2))) // Viernes Santo
  festivos.add(ymdUTC(alLunes(masDias(pascua, 39)))) // Ascensión → lunes (+43)
  festivos.add(ymdUTC(alLunes(masDias(pascua, 60)))) // Corpus Christi → lunes (+64)
  festivos.add(ymdUTC(alLunes(masDias(pascua, 68)))) // Sagrado Corazón → lunes (+71)

  cacheFestivos.set(year, festivos)
  return festivos
}

/** true si el día calendario (YYYY-MM-DD) es festivo en Colombia. */
export function esFestivoColombiaYMD(ymd: string): boolean {
  const year = Number(ymd.slice(0, 4))
  if (!Number.isFinite(year)) return false
  return festivosColombia(year).has(ymd)
}

/**
 * true si la fecha (ISO timestamptz o Date) cae en festivo colombiano,
 * evaluada como día calendario en TZ America/Bogota.
 */
export function esFestivoColombia(fecha: string | Date | null | undefined): boolean {
  if (!fecha) return false
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return false
  return esFestivoColombiaYMD(fechaColombiaYMD(d))
}
