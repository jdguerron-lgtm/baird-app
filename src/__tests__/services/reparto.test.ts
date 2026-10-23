import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { dividirPorPrioridad } from '@/lib/services/reparto.service'

const t = (id: string) => ({ id })

describe('dividirPorPrioridad', () => {
  it('separa a quien tiene menos servicios que el tope', () => {
    const conteos = new Map([['carlos', 16], ['german', 1], ['nestor', 0]])
    const r = dividirPorPrioridad([t('carlos'), t('german'), t('nestor')], conteos, 3)
    expect(r.prioritarios.map(x => x.id)).toEqual(['german', 'nestor'])
    expect(r.resto.map(x => x.id)).toEqual(['carlos'])
  })

  it('el tope es estricto: con 3 servicios y tope 3 ya no tiene prioridad', () => {
    const r = dividirPorPrioridad([t('a'), t('b')], new Map([['a', 3], ['b', 2]]), 3)
    expect(r.prioritarios.map(x => x.id)).toEqual(['b'])
    expect(r.resto.map(x => x.id)).toEqual(['a'])
  })

  it('técnico sin conteo cuenta como 0 servicios', () => {
    const r = dividirPorPrioridad([t('a'), t('b')], new Map([['a', 5]]), 3)
    expect(r.prioritarios.map(x => x.id)).toEqual(['b'])
  })

  it('si todos están bajo el tope no escalona (todos a la vez)', () => {
    const r = dividirPorPrioridad([t('a'), t('b')], new Map([['a', 0], ['b', 1]]), 3)
    expect(r.prioritarios).toHaveLength(2)
    expect(r.resto).toHaveLength(0)
  })

  it('si todos superan el tope no escalona (todos a la vez)', () => {
    const r = dividirPorPrioridad([t('a'), t('b')], new Map([['a', 9], ['b', 4]]), 3)
    expect(r.prioritarios).toHaveLength(2)
    expect(r.resto).toHaveLength(0)
  })
})
