import type { TipoEquipo } from '@/types/solicitud'

/**
 * Maps "Familia" values from Mabe/GE BITÁCORA Excel to our tipo_equipo enum.
 * Keys are uppercase for case-insensitive matching.
 */
const FAMILIA_A_TIPO_EQUIPO: Record<string, TipoEquipo> = {
  'ESTUFAS':               'Estufa',
  'REFRIGERADORES':        'Nevera',
  'AIRES ACONDICIONADOS':  'Aire Acondicionado',
  'CENTRO DE LAVADO':      'Lavadora',
  'LAVAVAJILLAS':          'Lavavajillas',
  'LAVADORAS':             'Lavadora',
  'SECADORAS':             'Secadora',
  'HORNOS':                'Horno',
  'BOILERS':               'Horno',        // Calentadores → closest match
  'NEVECONES':             'Nevecón',
  'NEVERAS':               'Nevera',
}

export interface ExcelRow {
  fila: number
  orden: string
  cliente_nombre: string
  tipo_servicio: string
  telefono: string
  direccion_completa: string
  modelo: string
  familia: string
  retorno: string
  dias_abierta: string
  sintoma: string
  diagnostico: string
}

export interface MappedSolicitud {
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  ciudad_pueblo: string
  zona_servicio: string
  marca_equipo: string
  modelo_equipo: string
  tipo_equipo: TipoEquipo
  tipo_solicitud: 'Reparación'
  novedades_equipo: string
  es_garantia: boolean
  numero_serie_factura: string
  pago_tecnico: number
  horario_visita_1: string
  horario_visita_2: string
}

export interface ParsedRow {
  fila: number
  raw: ExcelRow
  mapped: MappedSolicitud | null
  errors: string[]
  warnings: string[]
}

/**
 * Parses the top-section header row to find column indices.
 * The Mabe BITÁCORA format has headers at a row containing "N°", "ORDEN", etc.
 */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]
    if (!row) continue
    const joined = row.map(c => String(c ?? '').trim().toUpperCase()).join('|')
    if (joined.includes('ORDEN') && joined.includes('NOMBRE') && joined.includes('TELEFONO')) {
      return i
    }
  }
  return -1
}

/**
 * Extracts data rows from the top section of the BITÁCORA format.
 * Data rows have a numeric N° in column B and an ORDEN number.
 */
function extractDataRows(rows: unknown[][], headerIdx: number): ExcelRow[] {
  const result: ExcelRow[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    // Col B (index 1) = N°, Col C (index 2) = ORDEN
    const num = String(row[1] ?? '').trim()
    const orden = String(row[2] ?? '').trim()

    // Stop at empty rows (N° is empty or non-numeric)
    if (!num || isNaN(Number(num)) || !orden) continue

    result.push({
      fila: i + 1, // 1-based for user display
      orden,
      cliente_nombre: String(row[3] ?? '').trim(),
      tipo_servicio: String(row[5] ?? '').trim(),
      telefono: String(row[6] ?? '').trim(),
      direccion_completa: String(row[7] ?? '').trim(),
      modelo: String(row[8] ?? '').trim(),
      familia: String(row[9] ?? '').trim(),
      retorno: String(row[10] ?? '').trim(),
      dias_abierta: String(row[11] ?? '').trim(),
      sintoma: String(row[12] ?? '').trim(),
      diagnostico: String(row[17] ?? '').trim(),
    })
  }

  return result
}

/**
 * Parses compound address: "BOGOTA / CL 21 81B 30 INT 10 / MODELIA/FONTIBON / Detail"
 */
function parseAddress(raw: string): { ciudad: string; direccion: string; zona: string } {
  const parts = raw.split(' / ').map(p => p.trim())

  if (parts.length >= 3) {
    return {
      ciudad: parts[0],
      direccion: parts[1],
      zona: parts[2],
    }
  }
  if (parts.length === 2) {
    return { ciudad: parts[0], direccion: parts[1], zona: '' }
  }
  return { ciudad: '', direccion: raw, zona: '' }
}

/**
 * Extracts phone number from formats like "3005640184 / " or " / 3123420354"
 */
function parsePhone(raw: string): string {
  const cleaned = raw.replace(/\s/g, '')
  // Split by / and find the part with digits
  const parts = cleaned.split('/')
  for (const part of parts) {
    const digits = part.replace(/\D/g, '')
    if (digits.length >= 7) return digits
  }
  // Fallback: extract all digits
  const allDigits = cleaned.replace(/\D/g, '')
  return allDigits
}

/**
 * Extracts brand from model description: "PM6042GV0 / CUBIERTA EMPOTRE 60 CM MABE NEG" → "MABE"
 */
function extractBrand(modelo: string): string {
  const upper = modelo.toUpperCase()
  const brands = ['MABE', 'GE', 'GENERAL ELECTRIC', 'SAMSUNG', 'LG', 'WHIRLPOOL', 'HACEB']
  for (const brand of brands) {
    if (upper.includes(brand)) return brand
  }
  // Fallback: return everything after " / " if present
  const parts = modelo.split(' / ')
  if (parts.length >= 2) return parts[1].trim()
  return modelo
}

/**
 * Maps a Familia string to our tipo_equipo enum value.
 */
function mapFamilia(familia: string): TipoEquipo | null {
  const key = familia.trim().toUpperCase()
  return FAMILIA_A_TIPO_EQUIPO[key] ?? null
}

/**
 * Maps an extracted Excel row to a SolicitudFormData-compatible object.
 */
function mapRow(raw: ExcelRow, defaultPago: number, defaultHorario1: string, defaultHorario2: string): ParsedRow {
  const errors: string[] = []
  const warnings: string[] = []

  // Parse fields
  const { ciudad, direccion, zona } = parseAddress(raw.direccion_completa)
  const phone = parsePhone(raw.telefono)
  const tipoEquipo = mapFamilia(raw.familia)
  const marca = extractBrand(raw.modelo)
  const _esGarantia = raw.tipo_servicio.toUpperCase().includes('GARANTÍA') || raw.tipo_servicio.toUpperCase().includes('GARANTIA')

  // Extract model code (e.g., "PM6042GV0" from "PM6042GV0 / CUBIERTA EMPOTRE 60 CM MABE NEG")
  const modeloParts = raw.modelo.split(' / ')
  const _modeloCodigo = modeloParts[0]?.trim() || raw.modelo.trim()
  const _modeloDescripcion = modeloParts.length >= 2 ? modeloParts.slice(1).join(' / ').trim() : ''
  const modeloCompleto = raw.modelo.trim()

  // Build problem description from symptom + diagnostic
  let novedades = raw.sintoma
  if (raw.diagnostico && raw.diagnostico !== raw.sintoma) {
    novedades = `${raw.sintoma} — ${raw.diagnostico}`
  }

  // Validate
  if (!raw.cliente_nombre || raw.cliente_nombre.length < 3) {
    errors.push('Nombre del cliente muy corto o vacío')
  }
  if (!phone || phone.length < 7) {
    errors.push('Teléfono inválido')
  }
  if (!direccion) {
    errors.push('Dirección vacía')
  }
  if (!ciudad) {
    warnings.push('Ciudad no detectada en dirección, usando "BOGOTA"')
  }
  if (!tipoEquipo) {
    errors.push(`Familia "${raw.familia}" no tiene mapeo a tipo de equipo`)
  }
  if (novedades.length < 20) {
    // Pad short descriptions with model info
    novedades = `${novedades} - Modelo: ${raw.modelo}`
    if (novedades.length < 20) {
      warnings.push('Descripción del problema muy corta, se complementó con modelo')
    }
  }

  if (errors.length > 0) {
    return { fila: raw.fila, raw, mapped: null, errors, warnings }
  }

  // Prepend model info to novedades for display
  const novedadesConModelo = modeloCompleto
    ? `[Modelo: ${modeloCompleto}] ${novedades}`
    : novedades

  const mapped: MappedSolicitud = {
    cliente_nombre: raw.cliente_nombre,
    cliente_telefono: `57|${phone}`,
    direccion: direccion || raw.direccion_completa,
    ciudad_pueblo: ciudad || 'BOGOTA',
    zona_servicio: zona || 'Sin especificar',
    marca_equipo: marca,
    modelo_equipo: modeloCompleto,
    tipo_equipo: tipoEquipo!,
    tipo_solicitud: 'Reparación',
    novedades_equipo: novedadesConModelo.slice(0, 1000),
    es_garantia: true, // Carga masiva siempre es garantía MABE
    numero_serie_factura: raw.orden,
    pago_tecnico: defaultPago,
    horario_visita_1: defaultHorario1,
    horario_visita_2: defaultHorario2,
  }

  return { fila: raw.fila, raw, mapped, errors, warnings }
}

/**
 * Main entry point: parses a 2D array from xlsx and returns mapped solicitudes.
 */
export function parseExcelData(
  rows: unknown[][],
  options: {
    defaultPago?: number
    defaultHorario1?: string
    defaultHorario2?: string
  } = {}
): { parsed: ParsedRow[]; sheetName?: string; totalRawRows: number } {
  const {
    defaultPago = 80000,
    defaultHorario1 = 'Lunes a Viernes 8:00 AM - 12:00 PM',
    defaultHorario2 = 'Lunes a Viernes 2:00 PM - 5:00 PM',
  } = options

  const headerIdx = findHeaderRow(rows)

  if (headerIdx === -1) {
    return { parsed: [], totalRawRows: 0 }
  }

  const dataRows = extractDataRows(rows, headerIdx)

  const parsed = dataRows.map(raw => mapRow(raw, defaultPago, defaultHorario1, defaultHorario2))

  return { parsed, totalRawRows: dataRows.length }
}

export { FAMILIA_A_TIPO_EQUIPO }
