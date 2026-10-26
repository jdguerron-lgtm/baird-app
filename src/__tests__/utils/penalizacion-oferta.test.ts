import { describe, it, expect } from 'vitest'
import {
  bloqueadoParaServicio,
  GRACIA_PENDIENTE_MS,
  minIso,
  minutosPenalizacion,
  parsearPendientes,
  planificarOferta,
  type ConfigPenalizacion,
} from '@/lib/utils/penalizacion-oferta'

const CFG: ConfigPenalizacion = { activa: true, minutosPorIncumplimiento: 5, dias: 30, maxMinutos: 60 }
const AHORA = new Date('2026-10-26T15:00:00.000Z')
const masMin = (m: number) => new Date(AHORA.getTime() + m * 60_000).toISOString()

describe('minutosPenalizacion', () => {
  it('5 min por incumplimiento', () => {
    expect(minutosPenalizacion(0, CFG)).toBe(0)
    expect(minutosPenalizacion(1, CFG)).toBe(5)
    expect(minutosPenalizacion(3, CFG)).toBe(15)
  })
  it('respeta el tope', () => {
    expect(minutosPenalizacion(20, CFG)).toBe(60)
  })
  it('apagada = 0', () => {
    expect(minutosPenalizacion(4, { ...CFG, activa: false })).toBe(0)
  })
})

describe('planificarOferta', () => {
  it('sin penalizados: todos ya, sin pendientes', () => {
    const r = planificarOferta({ candidatos: ['a', 'b'], pendientes: [], penalizacion: new Map(), ahora: AHORA })
    expect(r.enviarAhora).toEqual(['a', 'b'])
    expect(r.pendientes).toEqual([])
    expect(r.proximoAt).toBeNull()
  })

  it('retiene al penalizado N×5 min y fija el despertador', () => {
    const r = planificarOferta({ candidatos: ['a', 'b', 'c'], pendientes: [], penalizacion: new Map([['b', 10], ['c', 5]]), ahora: AHORA })
    expect(r.enviarAhora).toEqual(['a'])
    expect(r.pendientes).toEqual([
      { tecnico_id: 'c', liberar_at: masMin(5) },
      { tecnico_id: 'b', liberar_at: masMin(10) },
    ])
    expect(r.proximoAt).toBe(masMin(5))
  })

  it('pena cumplida: se envía sin volver a penalizar', () => {
    const r = planificarOferta({
      candidatos: ['b'],
      pendientes: [{ tecnico_id: 'b', liberar_at: masMin(-1) }],
      penalizacion: new Map([['b', 10]]),
      ahora: AHORA,
    })
    expect(r.enviarAhora).toEqual(['b'])
    expect(r.pendientes).toEqual([])
  })

  it('retención vigente futura sigue esperando', () => {
    const r = planificarOferta({
      candidatos: ['b'],
      pendientes: [{ tecnico_id: 'b', liberar_at: masMin(3) }],
      penalizacion: new Map([['b', 10]]),
      ahora: AHORA,
    })
    expect(r.enviarAhora).toEqual([])
    expect(r.pendientes).toEqual([{ tecnico_id: 'b', liberar_at: masMin(3) }])
  })

  it('retención vieja (fuera de la gracia) se recalcula', () => {
    const vieja = new Date(AHORA.getTime() - GRACIA_PENDIENTE_MS - 60_000).toISOString()
    const r = planificarOferta({
      candidatos: ['b'],
      pendientes: [{ tecnico_id: 'b', liberar_at: vieja }],
      penalizacion: new Map([['b', 5]]),
      ahora: AHORA,
    })
    expect(r.enviarAhora).toEqual([])
    expect(r.pendientes).toEqual([{ tecnico_id: 'b', liberar_at: masMin(5) }])
  })

  it('conserva retenciones futuras de técnicos fuera de esta ola', () => {
    const r = planificarOferta({
      candidatos: ['a'],
      pendientes: [{ tecnico_id: 'z', liberar_at: masMin(7) }],
      penalizacion: new Map(),
      ahora: AHORA,
    })
    expect(r.enviarAhora).toEqual(['a'])
    expect(r.pendientes).toEqual([{ tecnico_id: 'z', liberar_at: masMin(7) }])
    expect(r.proximoAt).toBe(masMin(7))
  })
})

describe('parsearPendientes / minIso / bloqueadoParaServicio', () => {
  it('ignora basura en el JSONB', () => {
    expect(parsearPendientes(null)).toEqual([])
    expect(parsearPendientes([{ tecnico_id: 'a', liberar_at: 'no-fecha' }, { x: 1 }, { tecnico_id: 'b', liberar_at: masMin(1) }]))
      .toEqual([{ tecnico_id: 'b', liberar_at: masMin(1) }])
  })
  it('minIso', () => {
    expect(minIso(null, null)).toBeNull()
    expect(minIso(masMin(5), null)).toBe(masMin(5))
    expect(minIso(masMin(5), masMin(2))).toBe(masMin(2))
  })
  it('bloqueo por flujo', () => {
    const b = { garantia: true, particular: false }
    expect(bloqueadoParaServicio(b, true)).toBe(true)
    expect(bloqueadoParaServicio(b, false)).toBe(false)
    expect(bloqueadoParaServicio(undefined, true)).toBe(false)
  })
})
