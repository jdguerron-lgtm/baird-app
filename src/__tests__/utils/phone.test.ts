import { describe, it, expect } from 'vitest'
import { parsePhone, phoneToDigits, isValidPhone } from '@/lib/utils/phone'

describe('parsePhone', () => {
  it('parses pipe-delimited format', () => {
    expect(parsePhone('57|3001234567')).toEqual({ countryCode: '57', number: '3001234567' })
  })

  it('parses pipe format with other country code', () => {
    expect(parsePhone('1|2025551234')).toEqual({ countryCode: '1', number: '2025551234' })
  })

  it('detects Colombian number from raw 12-digit starting with 57', () => {
    expect(parsePhone('573001234567')).toEqual({ countryCode: '57', number: '3001234567' })
  })

  it('detects Colombian 10-digit number starting with 3', () => {
    expect(parsePhone('3001234567')).toEqual({ countryCode: '57', number: '3001234567' })
  })

  it('strips non-digit characters', () => {
    expect(parsePhone('+57 300 123 4567')).toEqual({ countryCode: '57', number: '3001234567' })
  })

  it('handles short numbers as raw digits', () => {
    const result = parsePhone('123456')
    expect(result.countryCode).toBe('57')
    expect(result.number).toBe('123456')
  })
})

describe('phoneToDigits', () => {
  it('converts pipe format to digits', () => {
    expect(phoneToDigits('57|3001234567')).toBe('573001234567')
  })

  it('adds 57 prefix to 10-digit Colombian number', () => {
    expect(phoneToDigits('3001234567')).toBe('573001234567')
  })

  it('returns 12-digit number starting with 57 as-is', () => {
    expect(phoneToDigits('573001234567')).toBe('573001234567')
  })

  it('strips non-digit characters from pipe format', () => {
    expect(phoneToDigits('57|300-123-4567')).toBe('573001234567')
  })
})

describe('isValidPhone', () => {
  it('validates pipe format with 7+ digit number', () => {
    expect(isValidPhone('57|3001234567')).toBe(true)
  })

  it('rejects pipe format with short number', () => {
    expect(isValidPhone('57|12345')).toBe(false)
  })

  it('validates 10+ digit raw number', () => {
    expect(isValidPhone('3001234567')).toBe(true)
  })

  it('rejects short raw number', () => {
    expect(isValidPhone('300123')).toBe(false)
  })

  it('validates with formatting characters', () => {
    expect(isValidPhone('+57 300 123 4567')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidPhone('')).toBe(false)
  })
})
