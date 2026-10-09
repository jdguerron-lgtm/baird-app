import { describe, it, expect } from 'vitest'
import { sanitizarParametroPlantilla } from '@/lib/services/whatsapp.service'

// Meta error 132018: "Param text cannot have new-line/tab characters or more
// than 4 consecutive spaces". Caso real 2026-10-09: dirección con 5 espacios
// tumbó servicio_asignado_tecnico_v4 y el técnico quedó sin portal.
describe('sanitizarParametroPlantilla', () => {
  it('colapsa 5+ espacios (caso real de la dirección)', () => {
    expect(sanitizarParametroPlantilla('Cll 14 #119a-17, Fontibón recodo, 9.     502'))
      .toBe('Cll 14 #119a-17, Fontibón recodo, 9. 502')
  })

  it('quita saltos de línea, tabs y separadores unicode', () => {
    expect(sanitizarParametroPlantilla('No enfría\nhace ruido\t fuerte ok')).toBe('No enfría hace ruido fuerte ok')
    expect(sanitizarParametroPlantilla('a\r\n\r\nb')).toBe('a b')
  })

  it('recorta extremos y no toca textos ya limpios', () => {
    expect(sanitizarParametroPlantilla('  Lavadora MABE  ')).toBe('Lavadora MABE')
    expect(sanitizarParametroPlantilla('+573001234567')).toBe('+573001234567')
    expect(sanitizarParametroPlantilla('miércoles, 14 de octubre · 3pm-6pm')).toBe('miércoles, 14 de octubre · 3pm-6pm')
  })

  it('un parámetro vacío/nulo se vuelve "-" (Meta tampoco acepta vacíos)', () => {
    expect(sanitizarParametroPlantilla('')).toBe('-')
    expect(sanitizarParametroPlantilla('   \n ')).toBe('-')
    expect(sanitizarParametroPlantilla(undefined)).toBe('-')
    expect(sanitizarParametroPlantilla(null)).toBe('-')
  })

  it('nunca deja 2+ espacios seguidos (regla de Meta: máx 4)', () => {
    const out = sanitizarParametroPlantilla('x' + ' '.repeat(50) + 'y')
    expect(out).toBe('x y')
    expect(/ {2,}/.test(out)).toBe(false)
  })
})
