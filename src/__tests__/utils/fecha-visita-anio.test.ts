import { describe, it, expect } from 'vitest'
import {
  parsearFechaVisita,
  resolverAñoFechaVisita,
  MAX_DIAS_ROLLOVER_AÑO,
  MAX_DIAS_FECHA_VISITA_ADELANTE,
  rangoFechaVisita,
  validarFechaVisita,
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

// Función única de validación (pedido de Juan 2026-10-22): la usan
// validarHorarioAgendable (todas las vías del cliente) y el route admin.
describe('validarFechaVisita — validación única de fecha de visita', () => {
  // 2026-10-22 15:00Z = 10:00 CO
  const AHORA = new Date('2026-10-22T15:00:00Z')

  it('rangoFechaVisita = hoy CO / hoy + MAX_DIAS_FECHA_VISITA_ADELANTE', () => {
    expect(MAX_DIAS_FECHA_VISITA_ADELANTE).toBe(180)
    expect(rangoFechaVisita(AHORA)).toEqual({ min: '2026-10-22', max: '2027-04-20' })
    expect(fechaColombiaMasDias(180, AHORA)).toBe('2027-04-20')
  })

  it('acepta hoy, mañana y el borde superior (YYYY-MM-DD)', () => {
    expect(validarFechaVisita('2026-10-22', AHORA)).toEqual({ ok: true, fechaYMD: '2026-10-22' })
    expect(validarFechaVisita('2026-10-23', AHORA)).toEqual({ ok: true, fechaYMD: '2026-10-23' })
    expect(validarFechaVisita('2027-04-20', AHORA)).toEqual({ ok: true, fechaYMD: '2027-04-20' })
  })

  it('acepta un ISO timestamptz y lo normaliza al día CO', () => {
    // 2026-10-23 03:00Z = 22:00 CO del 22 → sigue siendo "hoy" en Colombia
    expect(validarFechaVisita('2026-10-23T03:00:00.000Z', AHORA)).toEqual({ ok: true, fechaYMD: '2026-10-22' })
    expect(validarFechaVisita(iso(2026, 9, 25), AHORA)).toEqual({ ok: true, fechaYMD: '2026-10-25' })
  })

  it('rechaza una fecha anterior a hoy CO (motivo "pasada") — nunca la salta de año', () => {
    const r = validarFechaVisita('2026-10-21', AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toBe('pasada')
      expect(r.error).toContain('ya pasó')
      expect(r.error).toContain('2026-10-21')
    }
    // Caso real 9415568723: slot del 29 de agosto evaluado en octubre.
    const r2 = validarFechaVisita(iso(2026, 7, 29), AHORA)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.motivo).toBe('pasada')
  })

  it('rechaza un año mal tecleado hacia atrás (casos reales 2006 / 2008) como "pasada"', () => {
    for (const f of ['2006-10-20', '2008-10-21']) {
      const r = validarFechaVisita(f, AHORA)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.motivo).toBe('pasada')
        expect(r.error).toContain(f)
      }
    }
  })

  it('rechaza más de 180 días adelante (motivo "fuera_de_rango") con mensaje "revisa el año"', () => {
    for (const f of ['2027-04-21', '2027-08-29', '2036-10-22']) {
      const r = validarFechaVisita(f, AHORA)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.motivo).toBe('fuera_de_rango')
        expect(r.error).toContain('revisa el año')
      }
    }
  })

  it('rechaza formatos y días inexistentes (motivo "formato")', () => {
    for (const f of ['2026-13-01', '2026-02-30', '22/10/2026', 'mañana', '']) {
      const r = validarFechaVisita(f, AHORA)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.motivo).toBe('formato')
    }
  })

  it('esFechaYMDValida no deja "rodar" días/meses inexistentes', () => {
    expect(esFechaYMDValida('2026-10-22')).toBe(true)
    expect(esFechaYMDValida('2028-02-29')).toBe(true)
    expect(esFechaYMDValida('2026-02-29')).toBe(false)
    expect(esFechaYMDValida('2026-00-10')).toBe(false)
  })
})
