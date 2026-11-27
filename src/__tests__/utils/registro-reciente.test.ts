import { describe, it, expect } from 'vitest'
import { registroEsReciente, VENTANA_BIENVENIDA_REGISTRO_MIN } from '@/lib/utils/registro-reciente'

const AHORA = new Date('2026-11-25T15:00:00.000Z')
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()

describe('registroEsReciente', () => {
  it('acepta un registro recién creado', () => {
    expect(registroEsReciente(haceMin(0), AHORA)).toBe(true)
    expect(registroEsReciente(haceMin(5), AHORA)).toBe(true)
  })

  it('acepta justo en el borde de la ventana y rechaza después', () => {
    expect(registroEsReciente(haceMin(VENTANA_BIENVENIDA_REGISTRO_MIN), AHORA)).toBe(true)
    expect(registroEsReciente(haceMin(VENTANA_BIENVENIDA_REGISTRO_MIN + 1), AHORA)).toBe(false)
  })

  it('rechaza técnicos antiguos', () => {
    expect(registroEsReciente('2026-06-01T10:00:00.000Z', AHORA)).toBe(false)
  })

  it('tolera un desfase pequeño de reloj pero no fechas futuras', () => {
    expect(registroEsReciente(haceMin(-0.5), AHORA)).toBe(true)
    expect(registroEsReciente(haceMin(-10), AHORA)).toBe(false)
  })

  it('rechaza valores vacíos o inválidos', () => {
    expect(registroEsReciente(null, AHORA)).toBe(false)
    expect(registroEsReciente(undefined, AHORA)).toBe(false)
    expect(registroEsReciente('no-es-fecha', AHORA)).toBe(false)
  })
})
