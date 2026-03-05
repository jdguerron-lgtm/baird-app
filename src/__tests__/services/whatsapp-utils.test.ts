import { describe, it, expect } from 'vitest'
import { formatearTelefono, formatCOP, TIPO_A_ESPECIALIDAD } from '@/lib/services/whatsapp.service'
import { TIPOS_EQUIPO } from '@/types/solicitud'

describe('formatearTelefono', () => {
  it('adds 57 prefix to 10-digit number starting with 3', () => {
    expect(formatearTelefono('3001234567')).toBe('573001234567')
  })

  it('returns 12-digit number with 57 prefix unchanged', () => {
    expect(formatearTelefono('573001234567')).toBe('573001234567')
  })

  it('strips + from +57 prefix', () => {
    expect(formatearTelefono('+573001234567')).toBe('573001234567')
  })

  it('strips spaces and dashes before processing', () => {
    expect(formatearTelefono('300-123-4567')).toBe('573001234567')
    expect(formatearTelefono('300 123 4567')).toBe('573001234567')
  })

  it('strips +57 with spaces', () => {
    expect(formatearTelefono('+57 300 123 4567')).toBe('573001234567')
  })

  it('returns raw digits for non-Colombian format', () => {
    expect(formatearTelefono('1234567890')).toBe('1234567890')
  })

  it('handles empty string', () => {
    expect(formatearTelefono('')).toBe('')
  })
})

describe('formatCOP', () => {
  it('formats integer with thousands separator', () => {
    const result = formatCOP(150000)
    // es-CO uses period as thousands separator
    expect(result).toBe('150.000')
  })

  it('formats zero', () => {
    expect(formatCOP(0)).toBe('0')
  })

  it('formats large number', () => {
    expect(formatCOP(1500000)).toBe('1.500.000')
  })
})

describe('TIPO_A_ESPECIALIDAD mapping', () => {
  it('has a mapping for every TIPOS_EQUIPO value', () => {
    for (const tipo of TIPOS_EQUIPO) {
      expect(TIPO_A_ESPECIALIDAD[tipo], `Missing mapping for "${tipo}"`).toBeDefined()
    }
  })

  it('maps Lavadora, Secadora, Lavavajillas to "Lavadoras"', () => {
    expect(TIPO_A_ESPECIALIDAD['Lavadora']).toBe('Lavadoras')
    expect(TIPO_A_ESPECIALIDAD['Secadora']).toBe('Lavadoras')
    expect(TIPO_A_ESPECIALIDAD['Lavavajillas']).toBe('Lavadoras')
  })

  it('maps Nevera, Nevecón to "Neveras y Nevecones"', () => {
    expect(TIPO_A_ESPECIALIDAD['Nevera']).toBe('Neveras y Nevecones')
    expect(TIPO_A_ESPECIALIDAD['Nevecón']).toBe('Neveras y Nevecones')
  })

  it('maps Horno, Estufa to "Hornos y Estufas"', () => {
    expect(TIPO_A_ESPECIALIDAD['Horno']).toBe('Hornos y Estufas')
    expect(TIPO_A_ESPECIALIDAD['Estufa']).toBe('Hornos y Estufas')
  })

  it('maps Aire Acondicionado to "Aires Acondicionados"', () => {
    expect(TIPO_A_ESPECIALIDAD['Aire Acondicionado']).toBe('Aires Acondicionados')
  })

  it('produces exactly 4 unique especialidad values', () => {
    const uniqueValues = new Set(Object.values(TIPO_A_ESPECIALIDAD))
    expect(uniqueValues.size).toBe(4)
  })
})
