import { describe, it, expect } from 'vitest'
import { formatCOP, escapeLikePattern } from '@/lib/utils/format'

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
