/**
 * fecha-visita.ts — Parser de `horario_confirmado` (texto libre) → timestamptz.
 *
 * Usado al confirmar horario en POST /api/confirmar-horario para poblar la
 * columna `fecha_visita_at`, que permite filtrar el mapa admin por día.
 *
 * Formato canónico generado por HorarioSelector (modo custom):
 *   "lunes, 6 de mayo · 8am-12pm"
 *   "martes, 7 de mayo · 12pm-3pm"
 *
 * Modo sugerencia: usa horario_visita_1 o _2 (texto libre del cliente al crear
 * la solicitud). Puede ser cualquier cosa — si no matchea, retorna null.
 *
 * Estrategia conservadora:
 *   - SI matchea "D de MES" → extrae día/mes
 *   - SI matchea "Nam-Mpm" o "N:00 am-..." → extrae hora de inicio
 *   - Año: el de la referencia. Si la fecha ya pasó (más de ~1 día atrás) Y
 *     la misma fecha del año siguiente queda a menos de 180 días de la
 *     referencia, se asume el año siguiente (cruce de diciembre → enero).
 *     Si no, se conserva el año de la referencia aunque la fecha quede en el
 *     pasado: los call-sites (validarHorarioAgendable) la rechazan. Ver
 *     `resolverAñoFechaVisita` — antes del 2026-10-22 se sumaba +1 año
 *     siempre que la fecha hubiera pasado y una opción vencida ("29 de
 *     agosto" confirmada en septiembre) quedaba agendada un año después.
 *   - SI NO matchea ninguno → null (admin lo edita si quiere)
 */

const MESES_ES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

/**
 * Extrae día y mes (0-indexed) de un texto como "6 de mayo" o "lunes 6 de Mayo".
 * Devuelve también el tramo matcheado (`matchTexto`) para poder removerlo
 * antes de buscar la hora. Retorna null si no matchea.
 */
function extraerDiaMes(texto: string): { dia: number; mes: number; matchTexto: string } | null {
  const t = texto.toLowerCase()
  // Match "D de MES" donde D es 1-2 dígitos y MES es uno de los meses ES.
  const m = t.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)/i)
  if (!m) return null

  const dia = parseInt(m[1], 10)
  const mesNombre = m[2]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const mes = MESES_ES[mesNombre]
  if (mes === undefined) return null
  if (dia < 1 || dia > 31) return null

  return { dia, mes, matchTexto: m[0] }
}

/**
 * Extrae la hora de inicio (0-23) de un texto como "8am-12pm", "12pm-3pm",
 * "8:00 am - 12:00 pm". Retorna null si no matchea.
 *
 * Convención: si no hay am/pm, asume formato 24h.
 */
function extraerHoraInicio(texto: string): number | null {
  const t = texto.toLowerCase().replace(/\s+/g, '')
  // Match: dígitos opcionalmente con :MM, opcionalmente am/pm
  // Ejemplos: "8am", "12pm", "8:00am", "14:00"
  const m = t.match(/(\d{1,2})(?::(\d{2}))?(am|pm)?/)
  if (!m) return null

  let hora = parseInt(m[1], 10)
  const ampm = m[3]

  if (hora < 0 || hora > 23) return null

  if (ampm === 'pm' && hora < 12) hora += 12
  if (ampm === 'am' && hora === 12) hora = 0

  return hora
}

/**
 * Parsea un texto `horario_confirmado` a ISO timestamp.
 * Si el texto no contiene fecha o hora reconocible → null.
 *
 * @param horarioTexto Ej: "lunes, 6 de mayo · 8am-12pm"
 * @param referenciaUTC Fecha de referencia para resolver el año (default: ahora).
 *                      Ver `resolverAñoFechaVisita`: solo se asume el año
 *                      siguiente cuando la fecha pasó Y el año siguiente la
 *                      deja a menos de MAX_DIAS_ROLLOVER_AÑO de la referencia.
 * @returns ISO timestamp en UTC, o null si no se pudo parsear.
 */
export function parsearFechaVisita(horarioTexto: string, referenciaUTC: Date = new Date()): string | null {
  if (!horarioTexto || typeof horarioTexto !== 'string') return null

  const dm = extraerDiaMes(horarioTexto)
  if (!dm) return null

  // FIX 2026-06-12: quitar el tramo de fecha ANTES de extraer la hora. En
  // "lunes, 14 de junio · 8am-12pm" el primer número del texto completo es el
  // DÍA (14) y extraerHoraInicio lo tomaba como hora de inicio (14:00) en vez
  // del 8am real de la franja. La hora es la identidad del slot para el cupo
  // por franja (agenda.service), así que tiene que salir de la franja.
  const textoSinFecha = horarioTexto.toLowerCase().replace(dm.matchTexto, ' ')
  const hora = extraerHoraInicio(textoSinFecha) ?? 8 // default 8am si no hay hora reconocible

  // Construimos en hora local Colombia (UTC-5). Como Node corre en UTC en Vercel,
  // sumamos 5h al construir el Date para que represente las hh:00 hora local.
  const año = resolverAñoFechaVisita(dm.mes, dm.dia, hora, referenciaUTC)
  return new Date(Date.UTC(año, dm.mes, dm.dia, hora + 5, 0, 0)).toISOString()
}

const MS_DIA = 24 * 60 * 60 * 1000

/**
 * Tope para "rotar" al año siguiente: la fecha del año siguiente tiene que
 * quedar a menos de esta distancia de la referencia. Cubre el único caso
 * legítimo (el cliente escribe "5 de enero" el 20 de diciembre) y descarta
 * inventar visitas a 10–12 meses vista, que es lo que pasaba con una opción
 * vencida confirmada semanas después (orden 9415568723: "29 de agosto"
 * confirmada en septiembre de 2026 quedó como 2027-08-29).
 */
export const MAX_DIAS_ROLLOVER_AÑO = 180

/**
 * Año que corresponde a un "D de MES" sin año explícito, dado un instante de
 * referencia. Regla (2026-10-22):
 *   1. Candidato = la fecha en el año de la referencia.
 *   2. Si el candidato NO pasó (o pasó hace menos de 1 día — margen por TZ)
 *      → año de la referencia.
 *   3. Si pasó Y la misma fecha del año siguiente queda a menos de
 *      MAX_DIAS_ROLLOVER_AÑO de la referencia → año siguiente.
 *   4. Si no → año de la referencia (la fecha queda en el pasado y quien la
 *      consume debe rechazarla; nunca inventamos un año a más de 6 meses).
 *
 * @param mes 0-indexed · @param dia 1-31 · @param hora inicio de franja (hora CO)
 */
export function resolverAñoFechaVisita(mes: number, dia: number, hora: number, referenciaUTC: Date): number {
  const añoRef = referenciaUTC.getUTCFullYear()
  const candidato = Date.UTC(añoRef, mes, dia, hora + 5, 0, 0)
  const ayer = referenciaUTC.getTime() - MS_DIA
  if (candidato >= ayer) return añoRef

  const siguiente = Date.UTC(añoRef + 1, mes, dia, hora + 5, 0, 0)
  const diasHastaSiguiente = (siguiente - referenciaUTC.getTime()) / MS_DIA
  if (diasHastaSiguiente < MAX_DIAS_ROLLOVER_AÑO) return añoRef + 1

  return añoRef
}

// ──────────────────────────────────────────────────────────────────
// Helpers de día calendario en TZ Colombia (America/Bogota).
//
// Node corre en UTC en Vercel y el navegador del cliente está en CO; ambos
// necesitan razonar sobre "hoy / mañana / ¿ya pasó?" en hora local Colombia.
// Usamos `en-CA` porque formatea como YYYY-MM-DD, que ordena lexicográficamente
// igual que cronológicamente — así la comparación con `<`/`>` es válida.
// ──────────────────────────────────────────────────────────────────

/** Día calendario (YYYY-MM-DD) de una fecha, en TZ Colombia. */
export function fechaColombiaYMD(fecha: Date = new Date()): string {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** Día calendario CO de hoy + `dias` (YYYY-MM-DD). `dias=1` → mañana. */
export function fechaColombiaMasDias(dias: number, ahora: Date = new Date()): string {
  const [y, m, d] = fechaColombiaYMD(ahora).split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

const DIAS_LARGOS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_LARGOS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Texto largo "lunes, 6 de mayo" (TZ Colombia) para un día YYYY-MM-DD. Es el
 * formato canónico que consume `parsearFechaVisita` ("D de MES") y el que arma
 * el HorarioSelector del cliente, así que el `horario_confirmado` que escribe
 * el admin desde el calendario queda idéntico al del flujo self-service.
 *
 * Determinístico sobre YMD puro (no usa Intl/locale del runtime): el día de la
 * semana sale de `getUTCDay()` de la fecha construida con `Date.UTC`, leyendo
 * los mismos campos UTC con los que se construye — sin drift de zona.
 */
export function formatearFechaLargaCO(fechaYMD: string): string {
  const [y, m, d] = fechaYMD.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const diaSemana = DIAS_LARGOS_ES[fecha.getUTCDay()]
  return `${diaSemana}, ${d} de ${MESES_LARGOS_ES[m - 1]}`
}

/**
 * true si la fecha de visita (ISO timestamptz) cae en un día calendario CO
 * estrictamente anterior a hoy. El mismo día NO cuenta como pasado (la franja
 * podría no haber arrancado). null/undefined → false (no se puede afirmar).
 */
export function esFechaVisitaPasada(fechaVisitaIso: string | null | undefined, ahora: Date = new Date()): boolean {
  if (!fechaVisitaIso) return false
  return fechaColombiaYMD(new Date(fechaVisitaIso)) < fechaColombiaYMD(ahora)
}

// ──────────────────────────────────────────────────────────────────
// Validación ÚNICA de una fecha de visita (2026-10-22, pedido de Juan:
// "pon una función de verificación de fechas y no permitas que se reserve en
// fechas que ya pasaron").
//
// La usan TODOS los puntos donde se reserva o cambia la fecha de visita:
//   - validarHorarioAgendable (agenda.service) → confirmar-horario del
//     cliente, aceptación del técnico eligiendo "el otro horario" del cliente,
//     reagendamiento por link (/servicio), reprogramación tras repuesto.
//   - POST /api/admin/reagendar-solicitud (y el min/max del input de la ficha).
//
// Reglas: formato (YYYY-MM-DD real o ISO timestamptz) → día calendario CO →
// NO anterior a hoy (nunca "+1 año") → NO más de MAX_DIAS_FECHA_VISITA_ADELANTE
// hacia adelante (un año mal tecleado). "Hoy" pasa aquí; cada caller decide
// si lo admite (el admin con aviso; los clientes no: "mínimo mañana").
//
// Casos reales que motivaron esto: órdenes 9415695001/9415696056 quedaron en
// 2006/2008 por un año mal tecleado en el admin; 9415568723 quedó en 2027
// porque el técnico aceptó con una opción del cliente ya vencida y
// parsearFechaVisita la rotaba al año siguiente.
// ──────────────────────────────────────────────────────────────────

/** Tope hacia adelante para cualquier fecha de visita (días desde hoy CO). */
export const MAX_DIAS_FECHA_VISITA_ADELANTE = 180

export type MotivoFechaVisitaInvalida = 'formato' | 'pasada' | 'fuera_de_rango'

export type ValidacionFechaVisita =
  | { ok: true; fechaYMD: string }
  | { ok: false; motivo: MotivoFechaVisitaInvalida; error: string }

/**
 * true si `fechaYMD` es un día calendario real (formato YYYY-MM-DD y que no
 * "ruede": "2026-02-30" o "2026-13-01" no lo son — Date.UTC los normalizaría
 * en silencio a otro día).
 */
export function esFechaYMDValida(fechaYMD: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYMD)) return false
  const [y, m, d] = fechaYMD.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
}

/**
 * Día calendario CO (YYYY-MM-DD) de una fecha recibida como YYYY-MM-DD (se
 * toma tal cual, validando que sea un día real) o como ISO timestamptz
 * (`fecha_visita_at`, se convierte a día CO). null si no es ninguna de las dos.
 */
function diaColombiaDeFecha(fecha: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return esFechaYMDValida(fecha) ? fecha : null
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  return fechaColombiaYMD(d)
}

/** `{ min, max }` (YYYY-MM-DD, día CO) admitidos por `validarFechaVisita`. */
export function rangoFechaVisita(ahora: Date = new Date()): { min: string; max: string } {
  return {
    min: fechaColombiaYMD(ahora),
    max: fechaColombiaMasDias(MAX_DIAS_FECHA_VISITA_ADELANTE, ahora),
  }
}

/**
 * Valida una fecha de visita antes de reservarla o cambiarla.
 *
 * @param fecha  'YYYY-MM-DD' (input del admin) o ISO timestamptz
 *               (`fecha_visita_at` materializado por parsearFechaVisita).
 * @param ahora  instante de referencia (tests).
 * @returns ok con el día CO normalizado, o `{ motivo, error }` listo para
 *          responder 400. `motivo`: 'formato' | 'pasada' | 'fuera_de_rango'.
 */
export function validarFechaVisita(fecha: string, ahora: Date = new Date()): ValidacionFechaVisita {
  const fechaYMD = typeof fecha === 'string' ? diaColombiaDeFecha(fecha.trim()) : null
  if (!fechaYMD) {
    return { ok: false, motivo: 'formato', error: 'fecha inválida (formato YYYY-MM-DD)' }
  }
  const { min, max } = rangoFechaVisita(ahora)
  if (fechaYMD < min) {
    return {
      ok: false,
      motivo: 'pasada',
      error: `Esa fecha ya pasó (${fechaYMD}). Elige una fecha a partir de mañana.`,
    }
  }
  if (fechaYMD > max) {
    return {
      ok: false,
      motivo: 'fuera_de_rango',
      error: `fecha fuera de rango: revisa el año (${fechaYMD}; se admite hasta ${max})`,
    }
  }
  return { ok: true, fechaYMD }
}
