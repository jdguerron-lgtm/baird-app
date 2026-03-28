import { describe, it, expect } from 'vitest'
import { parseExcelData, FAMILIA_A_TIPO_EQUIPO } from '@/lib/utils/excel-mapping'

// ── Helper: build a mock BITÁCORA Excel structure ──────────────────────
function buildMockSheet(dataRows: unknown[][]): unknown[][] {
  // Header rows (mimicking the real format)
  const headers: unknown[][] = [
    [],  // row 0: empty
    [],  // row 1: FORMATO
    [],  // row 2: BITÁCORA
    [],  // row 3: F-SERV-05
    [],  // row 4: empty
    [],  // row 5: NIVEL 5
    [],  // row 6: empty
    // row 7: column headers
    [
      '', 'N°', 'ORDEN', 'Nombre del consumidor', '',
      'Tipo de Servicio', 'Telefonos de Contacto', 'Direccion',
      'Modelo', 'Familia', 'Retorno', 'Total Dias Abierta',
      'Sintoma/Notas', '', '', '', '',
      '¿Cuál fue el pre diagnóstico?',
    ],
    [],  // row 8: empty separator
  ]
  return [...headers, ...dataRows]
}

function buildDataRow(overrides: Partial<{
  num: number
  orden: string
  nombre: string
  servicio: string
  telefono: string
  direccion: string
  modelo: string
  familia: string
  retorno: string
  dias: string
  sintoma: string
  diagnostico: string
}> = {}): unknown[] {
  const d = {
    num: 1,
    orden: '9415091231',
    nombre: 'EDNA MILENA CORREDOR RIAÑO',
    servicio: 'GARANTÍA DE FÁBRICA',
    telefono: '3005640184 / ',
    direccion: 'BOGOTA / CL 21 81B 30 INT 10 / MODELIA/FONTIBON / Residencial Portal',
    modelo: 'PM6042GV0 / CUBIERTA EMPOTRE 60 CM MABE NEG',
    familia: 'ESTUFAS',
    retorno: 'NO RETORNO',
    dias: '1',
    sintoma: 'NO GENERA CHISPA - CHISPA DEBIL / NO GENERA CHISPA',
    diagnostico: 'FOGON MAS GRANDE DEMORA EN ENCENDER',
    ...overrides,
  }
  return [
    '', d.num, d.orden, d.nombre, '',
    d.servicio, d.telefono, d.direccion,
    d.modelo, d.familia, d.retorno, d.dias,
    d.sintoma, '', '', '', '',
    d.diagnostico,
  ]
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FAMILIA_A_TIPO_EQUIPO mapping', () => {
  it('maps ESTUFAS to Estufa', () => {
    expect(FAMILIA_A_TIPO_EQUIPO['ESTUFAS']).toBe('Estufa')
  })

  it('maps REFRIGERADORES to Nevera', () => {
    expect(FAMILIA_A_TIPO_EQUIPO['REFRIGERADORES']).toBe('Nevera')
  })

  it('maps AIRES ACONDICIONADOS to Aire Acondicionado', () => {
    expect(FAMILIA_A_TIPO_EQUIPO['AIRES ACONDICIONADOS']).toBe('Aire Acondicionado')
  })

  it('maps CENTRO DE LAVADO to Lavadora', () => {
    expect(FAMILIA_A_TIPO_EQUIPO['CENTRO DE LAVADO']).toBe('Lavadora')
  })

  it('maps LAVAVAJILLAS to Lavavajillas', () => {
    expect(FAMILIA_A_TIPO_EQUIPO['LAVAVAJILLAS']).toBe('Lavavajillas')
  })
})

describe('parseExcelData', () => {
  it('returns empty when no header row found', () => {
    const rows = [['random', 'data'], ['more', 'data']]
    const result = parseExcelData(rows)
    expect(result.parsed).toEqual([])
    expect(result.totalRawRows).toBe(0)
  })

  it('parses a valid single row', () => {
    const rows = buildMockSheet([buildDataRow()])
    const result = parseExcelData(rows)

    expect(result.totalRawRows).toBe(1)
    expect(result.parsed).toHaveLength(1)
    expect(result.parsed[0].mapped).not.toBeNull()
    expect(result.parsed[0].errors).toHaveLength(0)
  })

  it('maps fields correctly from a valid row', () => {
    const rows = buildMockSheet([buildDataRow()])
    const { parsed } = parseExcelData(rows)
    const mapped = parsed[0].mapped!

    expect(mapped.cliente_nombre).toBe('EDNA MILENA CORREDOR RIAÑO')
    expect(mapped.cliente_telefono).toBe('57|3005640184')
    expect(mapped.ciudad_pueblo).toBe('BOGOTA')
    expect(mapped.direccion).toBe('CL 21 81B 30 INT 10')
    expect(mapped.zona_servicio).toBe('MODELIA/FONTIBON')
    expect(mapped.tipo_equipo).toBe('Estufa')
    expect(mapped.marca_equipo).toBe('MABE')
    expect(mapped.es_garantia).toBe(true)
    expect(mapped.numero_serie_factura).toBe('9415091231')
    expect(mapped.tipo_solicitud).toBe('Reparación')
  })

  it('parses multiple rows', () => {
    const rows = buildMockSheet([
      buildDataRow({ num: 1, orden: '111', nombre: 'Cliente 1', familia: 'ESTUFAS' }),
      buildDataRow({ num: 2, orden: '222', nombre: 'Cliente 2', familia: 'REFRIGERADORES' }),
      buildDataRow({ num: 3, orden: '333', nombre: 'Cliente 3', familia: 'LAVAVAJILLAS' }),
    ])
    const result = parseExcelData(rows)

    expect(result.totalRawRows).toBe(3)
    expect(result.parsed).toHaveLength(3)
    expect(result.parsed[0].mapped!.tipo_equipo).toBe('Estufa')
    expect(result.parsed[1].mapped!.tipo_equipo).toBe('Nevera')
    expect(result.parsed[2].mapped!.tipo_equipo).toBe('Lavavajillas')
  })

  it('skips empty rows but continues parsing after them', () => {
    const rows = buildMockSheet([
      buildDataRow({ num: 1, orden: '111' }),
      ['', '', '', '', ''],  // empty row — skipped
      buildDataRow({ num: 3, orden: '333' }),  // still parsed
    ])
    const result = parseExcelData(rows)
    expect(result.totalRawRows).toBe(2)
  })

  it('uses custom defaults for pago and horarios', () => {
    const rows = buildMockSheet([buildDataRow()])
    const result = parseExcelData(rows, {
      defaultPago: 150000,
      defaultHorario1: 'Lunes 9am',
      defaultHorario2: 'Martes 2pm',
    })
    const mapped = result.parsed[0].mapped!

    expect(mapped.pago_tecnico).toBe(150000)
    expect(mapped.horario_visita_1).toBe('Lunes 9am')
    expect(mapped.horario_visita_2).toBe('Martes 2pm')
  })

  it('detects warranty from GARANTÍA DE FÁBRICA', () => {
    const rows = buildMockSheet([
      buildDataRow({ servicio: 'GARANTÍA DE FÁBRICA' }),
    ])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.es_garantia).toBe(true)
  })

  it('detects non-warranty service', () => {
    const rows = buildMockSheet([
      buildDataRow({ servicio: 'SERVICIO REGULAR' }),
    ])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.es_garantia).toBe(false)
  })
})

describe('parseExcelData — validation errors', () => {
  it('reports error for empty name', () => {
    const rows = buildMockSheet([buildDataRow({ nombre: '' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped).toBeNull()
    expect(parsed[0].errors).toContain('Nombre del cliente muy corto o vacío')
  })

  it('reports error for short name', () => {
    const rows = buildMockSheet([buildDataRow({ nombre: 'AB' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped).toBeNull()
    expect(parsed[0].errors).toContain('Nombre del cliente muy corto o vacío')
  })

  it('reports error for invalid phone', () => {
    const rows = buildMockSheet([buildDataRow({ telefono: ' / ' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped).toBeNull()
    expect(parsed[0].errors).toContain('Teléfono inválido')
  })

  it('reports error for unknown familia', () => {
    const rows = buildMockSheet([buildDataRow({ familia: 'ASPIRADORAS' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped).toBeNull()
    expect(parsed[0].errors.some(e => e.includes('no tiene mapeo'))).toBe(true)
  })

  it('reports error for empty address', () => {
    const rows = buildMockSheet([buildDataRow({ direccion: '' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped).toBeNull()
    expect(parsed[0].errors).toContain('Dirección vacía')
  })
})

describe('parseExcelData — address parsing', () => {
  it('parses 3-part address correctly', () => {
    const rows = buildMockSheet([buildDataRow({
      direccion: 'MEDELLIN / CRA 50 33-10 / LAURELES/COMUNA 11',
    })])
    const { parsed } = parseExcelData(rows)
    const mapped = parsed[0].mapped!

    expect(mapped.ciudad_pueblo).toBe('MEDELLIN')
    expect(mapped.direccion).toBe('CRA 50 33-10')
    expect(mapped.zona_servicio).toBe('LAURELES/COMUNA 11')
  })

  it('handles 2-part address', () => {
    const rows = buildMockSheet([buildDataRow({
      direccion: 'CALI / AV 6N 23-45',
    })])
    const { parsed } = parseExcelData(rows)
    const mapped = parsed[0].mapped!

    expect(mapped.ciudad_pueblo).toBe('CALI')
    expect(mapped.direccion).toBe('AV 6N 23-45')
  })

  it('handles address without separators', () => {
    const rows = buildMockSheet([buildDataRow({
      direccion: 'CRA 100 22-33 BOGOTA',
    })])
    const { parsed } = parseExcelData(rows)
    const mapped = parsed[0].mapped!

    // Falls back to full string as address, empty ciudad
    expect(mapped.direccion).toBe('CRA 100 22-33 BOGOTA')
  })
})

describe('parseExcelData — phone parsing', () => {
  it('extracts phone from "3005640184 / "', () => {
    const rows = buildMockSheet([buildDataRow({ telefono: '3005640184 / ' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.cliente_telefono).toBe('57|3005640184')
  })

  it('extracts phone from " / 3123420354"', () => {
    const rows = buildMockSheet([buildDataRow({ telefono: ' / 3123420354' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.cliente_telefono).toBe('57|3123420354')
  })

  it('extracts first valid phone from two numbers', () => {
    const rows = buildMockSheet([buildDataRow({ telefono: '3005640184 / 3123420354' })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.cliente_telefono).toBe('57|3005640184')
  })
})

describe('parseExcelData — brand extraction', () => {
  it('extracts MABE from model description', () => {
    const rows = buildMockSheet([buildDataRow({
      modelo: 'PM6042GV0 / CUBIERTA EMPOTRE 60 CM MABE NEG',
    })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.marca_equipo).toBe('MABE')
  })

  it('extracts GE from model description', () => {
    const rows = buildMockSheet([buildDataRow({
      modelo: 'GLV1460FSS / LAVAVAJILLAS GE INX',
    })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.marca_equipo).toBe('GE')
  })

  it('extracts SAMSUNG when present', () => {
    const rows = buildMockSheet([buildDataRow({
      modelo: 'WF20T6000AW / LAVADORA SAMSUNG 20KG',
    })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.marca_equipo).toBe('SAMSUNG')
  })

  it('detects GE even in model descriptions without MABE', () => {
    // "GENERICO" contains "GE" substring, so extractBrand matches GE
    const rows = buildMockSheet([buildDataRow({
      modelo: 'ABC123 / REFRIGERADOR GENERICO',
    })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.marca_equipo).toBe('GE')
  })

  it('falls back to description when truly no known brand', () => {
    const rows = buildMockSheet([buildDataRow({
      modelo: 'XYZ999 / LAVADORA PREMIUM',
    })])
    const { parsed } = parseExcelData(rows)
    expect(parsed[0].mapped!.marca_equipo).toBe('LAVADORA PREMIUM')
  })
})
