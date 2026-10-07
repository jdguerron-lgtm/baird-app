import { describe, it, expect } from 'vitest'
import { formatCOP, escapeLikePattern, cityTokenForMatch, normalizeForMatch } from '@/lib/utils/format'

describe('formatCOP', () => {
  it('formats integer amounts', () => {
    const result = formatCOP(180000)
    // es-CO locale uses period as thousands separator
    expect(result).toContain('180')
  })

  it('formats zero', () => {
    expect(formatCOP(0)).toBe('0')
  })

  it('formats large amounts', () => {
    const result = formatCOP(10000000)
    expect(result).toContain('10')
  })

  it('formats small amounts', () => {
    const result = formatCOP(20000)
    expect(result).toContain('20')
  })
})

describe('escapeLikePattern', () => {
  it('escapes percent sign', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%')
  })

  it('escapes underscore', () => {
    expect(escapeLikePattern('test_value')).toBe('test\\_value')
  })

  it('escapes backslash', () => {
    expect(escapeLikePattern('path\\to')).toBe('path\\\\to')
  })

  it('returns normal text unchanged', () => {
    expect(escapeLikePattern('Bogotá')).toBe('Bogotá')
  })

  it('escapes multiple special chars', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })

  it('handles empty string', () => {
    expect(escapeLikePattern('')).toBe('')
  })
})

describe('normalizeForMatch (pipeline de matching)', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeForMatch('BOGOTÁ')).toBe('bogota')
    expect(normalizeForMatch('Medellín')).toBe('medellin')
    expect(normalizeForMatch('Ñoño')).toBe('nono')
  })

  it('trims leading/trailing whitespace and collapses inner whitespace', () => {
    expect(normalizeForMatch('   Bogotá   ')).toBe('bogota')
    expect(normalizeForMatch('Neveras   y\tNevecones\n')).toBe('neveras y nevecones')
  })

  it('removes special characters', () => {
    expect(normalizeForMatch('Bogotá D.C.')).toBe('bogota d c')
    expect(normalizeForMatch('(Bogotá)')).toBe('bogota')
    expect(normalizeForMatch('Hornos/Estufas')).toBe('hornos estufas')
    expect(normalizeForMatch('Neveras y Nevecones!')).toBe('neveras y nevecones')
    expect(normalizeForMatch('Lavadora - Secadora')).toBe('lavadora secadora')
    expect(normalizeForMatch('*MABE*')).toBe('mabe')
  })

  it('keeps digits', () => {
    expect(normalizeForMatch('Zona 7')).toBe('zona 7')
  })

  it('makes real-world variants equal', () => {
    const variantes = ['BOGOTA', 'Bogotá', ' bogota ', 'Bogotá.', 'BOGOTÁ ']
    const norm = new Set(variantes.map(normalizeForMatch))
    expect(norm.size).toBe(1)
    expect([...norm][0]).toBe('bogota')
  })

  it('handles empty string', () => {
    expect(normalizeForMatch('')).toBe('')
    expect(normalizeForMatch('   ')).toBe('')
  })
})

describe('cityTokenForMatch', () => {
  it('strips special characters around the city', () => {
    expect(cityTokenForMatch('(Bogotá)')).toBe('bogota')
    expect(cityTokenForMatch('  Soacha.  ')).toBe('soacha')
  })

  it('treats Bogotá D.C. variants as the same city as Bogotá', () => {
    for (const v of ['Bogotá D.C.', 'BOGOTA DC', 'Bogotá D. C.', 'Bogota Distrito Capital', 'BOGOTÁ, D.C.', 'Bogotá D.C']) {
      expect(cityTokenForMatch(v)).toBe('bogota')
    }
  })

  it('matches the solicitud city against tecnico coverage regardless of case/accents/junk', () => {
    const ciudadSolicitud = cityTokenForMatch('BOGOTA')
    const cobertura = ['Bogotá', 'Soacha'].map(cityTokenForMatch)
    expect(cobertura.some(c => c.includes(ciudadSolicitud) || ciudadSolicitud.includes(c))).toBe(true)
  })

  it('returns clean city name unchanged', () => {
    expect(cityTokenForMatch('Bogotá')).toBe('bogota')
    expect(cityTokenForMatch('Medellín')).toBe('medellin')
  })

  it('strips address junk after slash (real BITACORA case)', () => {
    expect(cityTokenForMatch('BOGOTA /CR 123 13B 47')).toBe('bogota')
  })

  it('strips department after comma', () => {
    expect(cityTokenForMatch('Bogotá, Cundinamarca')).toBe('bogota')
  })

  it('strips zone after hyphen', () => {
    expect(cityTokenForMatch('Bogotá - Engativá')).toBe('bogota')
  })

  it('strips suffix after semicolon', () => {
    expect(cityTokenForMatch('Bogotá; D.C.')).toBe('bogota')
  })

  it('handles uppercase + accent variations', () => {
    expect(cityTokenForMatch('BOGOTÁ')).toBe('bogota')
    expect(cityTokenForMatch('Bogota')).toBe('bogota')
  })

  it('preserves multi-word city when no separator present', () => {
    expect(cityTokenForMatch('San Andrés')).toBe('san andres')
  })

  it('handles empty string', () => {
    expect(cityTokenForMatch('')).toBe('')
  })
})
