import { describe, it, expect } from 'vitest'
import { festivosColombia, esFestivoColombiaYMD, esFestivoColombia } from '@/lib/utils/festivos'
import { esFinDeSemana, fechaDeHorario } from '@/lib/constants/tarifas/mabe'

describe('festivosColombia (Ley Emiliani)', () => {
  it('incluye los 6 festivos fijos de 2026', () => {
    for (const ymd of ['2026-01-01', '2026-05-01', '2026-07-20', '2026-08-07', '2026-12-08', '2026-12-25']) {
      expect(esFestivoColombiaYMD(ymd), ymd).toBe(true)
    }
  })

  it('traslada los festivos Emiliani 2026 al lunes siguiente', () => {
    // Reyes: 6 ene 2026 es martes → lunes 12 ene
    expect(esFestivoColombiaYMD('2026-01-06')).toBe(false)
    expect(esFestivoColombiaYMD('2026-01-12')).toBe(true)
    // San José: 19 mar 2026 es jueves → lunes 23 mar
    expect(esFestivoColombiaYMD('2026-03-19')).toBe(false)
    expect(esFestivoColombiaYMD('2026-03-23')).toBe(true)
    // San Pedro y San Pablo: 29 jun 2026 ya es lunes → no se mueve
    expect(esFestivoColombiaYMD('2026-06-29')).toBe(true)
    // Asunción: 15 ago 2026 es sábado → lunes 17 ago
    expect(esFestivoColombiaYMD('2026-08-17')).toBe(true)
    // Todos los Santos: 1 nov 2026 es domingo → lunes 2 nov
    expect(esFestivoColombiaYMD('2026-11-02')).toBe(true)
    // Independencia de Cartagena: 11 nov 2026 es miércoles → lunes 16 nov
    expect(esFestivoColombiaYMD('2026-11-16')).toBe(true)
  })

  it('computa los festivos de Semana Santa y pos-Pascua 2026 (Pascua = 5 abr)', () => {
    expect(esFestivoColombiaYMD('2026-04-02')).toBe(true)  // Jueves Santo
    expect(esFestivoColombiaYMD('2026-04-03')).toBe(true)  // Viernes Santo
    expect(esFestivoColombiaYMD('2026-05-18')).toBe(true)  // Ascensión (lunes)
    expect(esFestivoColombiaYMD('2026-06-08')).toBe(true)  // Corpus Christi (lunes)
    expect(esFestivoColombiaYMD('2026-06-15')).toBe(true)  // Sagrado Corazón (lunes)
  })

  it('2026 tiene exactamente 18 festivos', () => {
    expect(festivosColombia(2026).size).toBe(18)
  })

  it('un martes común no es festivo', () => {
    expect(esFestivoColombiaYMD('2026-07-21')).toBe(false)
  })

  it('esFestivoColombia evalúa el día calendario en TZ Colombia', () => {
    // 20 jul 2026 15:00 UTC = 10:00 CO → festivo
    expect(esFestivoColombia('2026-07-20T15:00:00Z')).toBe(true)
    // 21 jul 2026 02:00 UTC = 20 jul 21:00 CO → sigue siendo festivo en CO
    expect(esFestivoColombia('2026-07-21T02:00:00Z')).toBe(true)
    // null / inválido → false
    expect(esFestivoColombia(null)).toBe(false)
    expect(esFestivoColombia('no es fecha')).toBe(false)
  })
})

describe('esFinDeSemana (sábado/domingo/festivo, TZ Colombia)', () => {
  it('true para sábado y domingo (ISO)', () => {
    expect(esFinDeSemana('2026-07-25T15:00:00Z')).toBe(true) // sábado
    expect(esFinDeSemana('2026-07-26T15:00:00Z')).toBe(true) // domingo
  })

  it('true para festivo entre semana (20 jul 2026, lunes festivo fijo)', () => {
    expect(esFinDeSemana('2026-07-20T15:00:00Z')).toBe(true)
  })

  it('false para día hábil común', () => {
    expect(esFinDeSemana('2026-07-22T15:00:00Z')).toBe(false) // miércoles
  })

  it('evalúa el día en TZ Colombia, no en UTC', () => {
    // Viernes 24 jul 2026 20:00 CO = sábado 25 jul 01:00 UTC → NO es finde en CO
    expect(esFinDeSemana('2026-07-25T01:00:00Z')).toBe(false)
  })

  it('FIX 2026-07-21: parsea el texto canónico español de horario_confirmado', () => {
    // Antes `new Date(texto)` daba Invalid Date y el recargo weekend nunca aplicaba.
    const fecha = fechaDeHorario('lunes, 6 de mayo · 8am-12pm')
    expect(fecha).not.toBeNull()
    // Un texto de sábado debe detectar finde (el año lo resuelve parsearFechaVisita
    // al actual-o-siguiente; el 25 de julio se elige porque en 2026 Y 2027 cae
    // sábado y domingo respectivamente — finde en ambos casos).
    expect(esFinDeSemana('sábado, 25 de julio · 8am-12pm')).toBe(true)
  })

  it('null y basura → false', () => {
    expect(esFinDeSemana(null)).toBe(false)
    expect(esFinDeSemana(undefined)).toBe(false)
    expect(esFinDeSemana('sin fecha reconocible')).toBe(false)
  })
})
