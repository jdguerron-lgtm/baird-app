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
 *   - Año: el actual; si la fecha resultante ya pasó, +1 año
 *   - SI NO matchea ninguno → null (admin lo edita si quiere)
 */

const MESES_ES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

/**
 * Extrae día y mes (0-indexed) de un texto como "6 de mayo" o "lunes 6 de Mayo".
 * Retorna null si no matchea.
 */
function extraerDiaMes(texto: string): { dia: number; mes: number } | null {
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

  return { dia, mes }
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
 *                      Si la fecha parseada ya pasó respecto a esto, se asume
 *                      el año siguiente.
 * @returns ISO timestamp en UTC, o null si no se pudo parsear.
 */
export function parsearFechaVisita(horarioTexto: string, referenciaUTC: Date = new Date()): string | null {
  if (!horarioTexto || typeof horarioTexto !== 'string') return null

  const dm = extraerDiaMes(horarioTexto)
  if (!dm) return null

  const hora = extraerHoraInicio(horarioTexto) ?? 8 // default 8am si no hay hora reconocible

  // Año: el actual de la referencia. Si la fecha resultante ya pasó (más de 1
  // día atrás para evitar drift por TZ), asumimos año siguiente.
  let año = referenciaUTC.getUTCFullYear()
  // Construimos en hora local Colombia (UTC-5). Como Node corre en UTC en Vercel,
  // restamos 5h al construir el Date para que represente las hh:00 hora local.
  const candidato = new Date(Date.UTC(año, dm.mes, dm.dia, hora + 5, 0, 0))

  const ayer = new Date(referenciaUTC.getTime() - 24 * 60 * 60 * 1000)
  if (candidato.getTime() < ayer.getTime()) {
    año += 1
    return new Date(Date.UTC(año, dm.mes, dm.dia, hora + 5, 0, 0)).toISOString()
  }

  return candidato.toISOString()
}
