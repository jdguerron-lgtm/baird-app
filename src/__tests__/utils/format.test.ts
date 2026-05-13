import { describe, it, expect } from 'vitest'
import { formatCOP, escapeLikePattern, cityTokenForMatch } from '@/lib/utils/format'

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

describe('cityTokenForMatch', () => {
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
