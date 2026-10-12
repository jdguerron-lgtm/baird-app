import { describe, it, expect } from 'vitest'
import {
  slotDesdeFechaVisita,
  franjaPorHoraCO,
  addDaysYMD,
  inicioSemanaYMD,
  medianocheColombiaIso,
  esFranjaValida,
  esYMDValido,
} from '@/lib/utils/agenda-slots'
import { parsearFechaVisita } from '@/lib/utils/fecha-visita'
import { FRANJAS_HORARIO } from '@/lib/constants/franjas'

/** ISO del slot (inicio de franja en hora CO) — espejo de agenda.service.isoDeSlot. */
function isoSlot(ymd: string, horaInicio: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, horaInicio + 5, 0, 0)).toISOString()
}

describe('slotDesdeFechaVisita', () => {
  it('es la inversa de la materialización del slot para las 4 franjas', () => {
    for (const f of FRANJAS_HORARIO) {
      expect(slotDesdeFechaVisita(isoSlot('2026-10-15', f.horaInicio))).toEqual({ fecha: '2026-10-15', franja: f.value })
    }
  })

  it('coincide con parsearFechaVisita (texto canónico del HorarioSelector)', () => {
    const iso = parsearFechaVisita('jueves, 15 de octubre · 6pm-8pm', new Date('2026-10-01T00:00:00Z'))!
    expect(slotDesdeFechaVisita(iso)).toEqual({ fecha: '2026-10-15', franja: '6pm-8pm' })
  })

  it('resuelve el día en hora Colombia (la noche CO NO rueda al día UTC siguiente)', () => {
    // 6pm CO del 15 = 23:00Z del 15; 8am CO del 15 = 13:00Z
    expect(slotDesdeFechaVisita('2026-10-15T23:00:00+00:00')?.fecha).toBe('2026-10-15')
    // Formato "+00:00" de Supabase y "Z" dan lo mismo
    expect(slotDesdeFechaVisita('2026-10-15T13:00:00Z')).toEqual(slotDesdeFechaVisita('2026-10-15T13:00:00+00:00'))
  })

  it('horas intermedias (carga masiva) caen en la franja por rango', () => {
    expect(franjaPorHoraCO(10)).toBe('8am-12pm')
    expect(franjaPorHoraCO(14)).toBe('12pm-3pm')
    expect(franjaPorHoraCO(17)).toBe('3pm-6pm')
    expect(franjaPorHoraCO(20)).toBe('6pm-8pm')
    expect(franjaPorHoraCO(6)).toBe('8am-12pm')
  })

  it('null para ISO inválido o vacío', () => {
    expect(slotDesdeFechaVisita(null)).toBeNull()
    expect(slotDesdeFechaVisita('')).toBeNull()
    expect(slotDesdeFechaVisita('no-es-fecha')).toBeNull()
  })
})

describe('helpers YMD', () => {
  it('addDaysYMD cruza mes y año', () => {
    expect(addDaysYMD('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDaysYMD('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysYMD('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('inicioSemanaYMD devuelve el lunes', () => {
    expect(inicioSemanaYMD('2026-10-11')).toBe('2026-10-05') // domingo
    expect(inicioSemanaYMD('2026-10-05')).toBe('2026-10-05') // lunes
    expect(inicioSemanaYMD('2026-10-08')).toBe('2026-10-05') // jueves
  })

  it('medianocheColombiaIso es 05:00Z', () => {
    expect(medianocheColombiaIso('2026-10-15')).toBe('2026-10-15T05:00:00.000Z')
  })

  it('validadores', () => {
    expect(esFranjaValida('8am-12pm')).toBe(true)
    expect(esFranjaValida('9am-1pm')).toBe(false)
    expect(esYMDValido('2026-10-15')).toBe(true)
    expect(esYMDValido('2026-13-45')).toBe(false)
    expect(esYMDValido('15/10/2026')).toBe(false)
  })
})
