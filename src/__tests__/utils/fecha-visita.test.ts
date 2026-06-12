import { describe, it, expect } from 'vitest'
import { parsearFechaVisita } from '@/lib/utils/fecha-visita'

// Referencia fija para tests deterministas: 1 de enero 2026, mediodía UTC.
// Las fechas parseadas caen después → no aplica el rollover de año.
const REF = new Date('2026-01-01T12:00:00Z')

describe('parsearFechaVisita — hora de inicio del slot', () => {
  // FIX 2026-06-12: el primer número del texto es el DÍA, no la hora. La hora
  // debe salir de la franja (después del tramo "D de MES").
  it('extrae la hora de la FRANJA, no del día del mes', () => {
    // Antes del fix esto devolvía 14:00 CO (el día) en vez de 8:00 CO.
    expect(parsearFechaVisita('sábado, 14 de junio · 8am-12pm', REF))
      .toBe(new Date(Date.UTC(2026, 5, 14, 8 + 5)).toISOString())
  })

  it.each([
    ['8am-12pm', 8],
    ['12pm-3pm', 12],
    ['3pm-6pm', 15],
    ['6pm-8pm', 18],
  ])('franja %s → inicio %i:00 hora Colombia', (franja, hora) => {
    expect(parsearFechaVisita(`lunes, 9 de marzo · ${franja}`, REF))
      .toBe(new Date(Date.UTC(2026, 2, 9, hora + 5)).toISOString())
  })

  it('día > 23 con franja también usa la hora de la franja', () => {
    expect(parsearFechaVisita('martes, 24 de junio · 3pm-6pm', REF))
      .toBe(new Date(Date.UTC(2026, 5, 24, 15 + 5)).toISOString())
  })

  it('texto con fecha pero sin franja reconocible → default 8am', () => {
    expect(parsearFechaVisita('14 de junio en la tarde', REF))
      .toBe(new Date(Date.UTC(2026, 5, 14, 8 + 5)).toISOString())
  })

  it('texto sin fecha reconocible → null', () => {
    expect(parsearFechaVisita('Lo antes posible', REF)).toBeNull()
  })
})
