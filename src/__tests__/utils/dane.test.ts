import { describe, expect, it } from 'vitest'
import { ciudadDane } from '@/lib/constants/dane'

describe('ciudadDane', () => {
  it('resuelve con tildes, mayúsculas y basura concatenada', () => {
    expect(ciudadDane('Medellín')).toMatchObject({ state_code: '05', city_code: '05001', exacta: true })
    expect(ciudadDane('BOGOTA /CR 123 13B 47')).toMatchObject({ city_code: '11001', exacta: true })
    expect(ciudadDane('Chía, Cundinamarca')).toMatchObject({ city_code: '25175', exacta: true })
    expect(ciudadDane('Santa Marta')).toMatchObject({ city_code: '47001', exacta: true })
  })
  it('desconocida → Bogotá marcada como no exacta', () => {
    expect(ciudadDane('Mompox')).toEqual({ country_code: 'Co', state_code: '11', city_code: '11001', exacta: false })
    expect(ciudadDane(null).exacta).toBe(false)
  })
})
