import { describe, it, expect } from 'vitest'
import {
  parsearFechaVisita,
  resolverAñoFechaVisita,
  MAX_DIAS_ROLLOVER_AÑO,
  rangoFechaReagendaAdmin,
  validarFechaReagendaAdmin,
  esFechaYMDValida,
  fechaColombiaMasDias,
} from '@/lib/utils/fecha-visita'

const iso = (y: number, m0: number, d: number, h = 8) => new Date(Date.UTC(y, m0, d, h + 5)).toISOString()

// Regla del año (2026-10-22): nunca inventar un año a más de 6 meses. Antes,
// cualquier fecha ya pasada rotaba +1 año y una opción vencida quedaba agendada
// un año después (orden 9415568723: "29 de agosto" → 2027-08-29).
describe('parsearFechaVisita — resolución del año', () => {
  it('fecha futura en el año de la referencia → ese año', () => {
    expect(parsearFechaVisita('sábado, 29 de agosto · 8am-12pm', new Date('2026-08-25T15:00:00Z')))
      .toBe(iso(2026, 7, 29))
  })

  it('caso real 9415568723: "29 de agosto" confirmada en septiembre NO salta a 2027', () => {
    expect(parsearFechaVisita('sábado, 29 de agosto · 8am-12pm', new Date('2026-09-10T15:00:00Z')))
      .toBe(iso(2026, 7, 29))
  })

  it('fecha que pasó hace 2 días → año de la referencia (queda en el pasado, el caller la rechaza)', () => {
    expect(parsearFechaVisita('martes, 20 de octubre · 8am-12pm', new Date('2026-10-22T15:00:00Z')))
      .toBe(iso(2026, 9, 20))
  })

  it('margen de 1 día por TZ: "ayer" por pocas horas sigue siendo el año de la referencia', () => {
    // Slot 2026-10-21 08:00 CO = 13:00Z; referencia 2026-10-22 12:00Z (23 h después).
    expect(parsearFechaVisita('miércoles, 21 de octubre · 8am-12pm', new Date('2026-10-22T12:00:00Z')))
      .toBe(iso(2026, 9, 21))
  })

  it('cruce diciembre → enero: "5 de enero" visto el 20 de diciembre → año siguiente', () => {
    expect(parsearFechaVisita('lunes, 5 de enero · 8am-12pm', new Date('2026-12-20T15:00:00Z')))
      .toBe(iso(2027, 0, 5))
  })

  it('rota al año siguiente solo si queda a menos de MAX_DIAS_ROLLOVER_AÑO', () => {
    const ref = new Date('2026-10-22T15:00:00Z')
    // 2027-04-10 está a ~170 días de la referencia → rota.
    expect(resolverAñoFechaVisita(3, 10, 8, ref)).toBe(2027)
    // 2027-04-30 está a ~190 días → no rota (se queda en 2026, en el pasado).
    expect(resolverAñoFechaVisita(3, 30, 8, ref)).toBe(2026)
    expect(MAX_DIAS_ROLLOVER_AÑO).toBe(180)
  })

  it('cuando rota al año siguiente, la fecha queda a menos de MAX_DIAS_ROLLOVER_AÑO', () => {
    // Referencia a mitad de año: enero–junio ya pasaron; solo rotan los que
    // caen a < 180 días (ninguno en este caso: la mitad siguiente queda a
    // 184+ días), julio–diciembre son futuro del mismo año.
    const ref = new Date('2026-06-15T15:00:00Z')
    for (let mes = 0; mes < 12; mes++) {
      const año = resolverAñoFechaVisita(mes, 15, 8, ref)
      if (año === ref.getUTCFullYear() + 1) {
        const dias = (Date.UTC(año, mes, 15, 13) - ref.getTime()) / 86_400_000
        expect(dias).toBeLessThan(MAX_DIAS_ROLLOVER_AÑO)
      } else {
        expect(año).toBe(2026)
      }
    }
    // Referencia a fin de año: enero–marzo rotan (< 180 días), el resto no.
    const refDic = new Date('2026-12-28T15:00:00Z')
    expect(resolverAñoFechaVisita(0, 15, 8, refDic)).toBe(2027)
    expect(resolverAñoFechaVisita(2, 15, 8, refDic)).toBe(2027)
    expect(resolverAñoFechaVisita(6, 15, 8, refDic)).toBe(2026)
  })
})

describe('rango de fecha del reagendamiento admin', () => {
  // 2026-10-22 15:00Z = 10:00 CO
  const AHORA = new Date('2026-10-22T15:00:00Z')

  it('rangoFechaReagendaAdmin = hoy CO −30 / +180 días', () => {
    expect(rangoFechaReagendaAdmin(AHORA)).toEqual({ min: '2026-09-22', max: '2027-04-20' })
    expect(fechaColombiaMasDias(-30, AHORA)).toBe('2026-09-22')
  })

  it('acepta fechas dentro del rango (incluidos los bordes y hoy)', () => {
    expect(validarFechaReagendaAdmin('2026-10-22', AHORA)).toBeNull()
    expect(validarFechaReagendaAdmin('2026-09-22', AHORA)).toBeNull()
    expect(validarFechaReagendaAdmin('2027-04-20', AHORA)).toBeNull()
    expect(validarFechaReagendaAdmin('2026-10-20', AHORA)).toBeNull() // pasado reciente: aviso, no bloqueo
  })

  it('rechaza un año mal tecleado (casos reales 2006 / 2008) con mensaje claro', () => {
    const err = validarFechaReagendaAdmin('2006-10-20', AHORA)
    expect(err).toContain('fuera de rango')
    expect(err).toContain('revisa el año')
    expect(validarFechaReagendaAdmin('2008-10-21', AHORA)).toContain('fuera de rango')
    expect(validarFechaReagendaAdmin('2027-08-29', AHORA)).toContain('fuera de rango')
  })

  it('rechaza bordes exteriores y formatos inválidos', () => {
    expect(validarFechaReagendaAdmin('2026-09-21', AHORA)).toContain('fuera de rango')
    expect(validarFechaReagendaAdmin('2027-04-21', AHORA)).toContain('fuera de rango')
    expect(validarFechaReagendaAdmin('2026-13-01', AHORA)).toContain('inválida')
    expect(validarFechaReagendaAdmin('2026-02-30', AHORA)).toContain('inválida')
    expect(validarFechaReagendaAdmin('22/10/2026', AHORA)).toContain('inválida')
  })

  it('esFechaYMDValida no deja "rodar" días/meses inexistentes', () => {
    expect(esFechaYMDValida('2026-10-22')).toBe(true)
    expect(esFechaYMDValida('2028-02-29')).toBe(true)
    expect(esFechaYMDValida('2026-02-29')).toBe(false)
    expect(esFechaYMDValida('2026-00-10')).toBe(false)
  })
})
