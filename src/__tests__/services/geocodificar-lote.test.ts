import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))

import { geocodificarLote } from '@/lib/services/geocoding.service'

describe('geocodificarLote', () => {
  it('geocodifica todas las solicitudes en orden', async () => {
    const vistos: string[] = []
    const r = await geocodificarLote(['a', 'b', 'c'], async (id) => { vistos.push(id) })
    expect(vistos).toEqual(['a', 'b', 'c'])
    expect(r).toEqual({ ok: 3, fallidas: 0 })
  })

  it('un fallo no detiene las demás', async () => {
    const vistos: string[] = []
    const r = await geocodificarLote(['a', 'b', 'c'], async (id) => {
      vistos.push(id)
      if (id === 'b') throw new Error('Google caído')
    })
    expect(vistos).toEqual(['a', 'b', 'c'])
    expect(r).toEqual({ ok: 2, fallidas: 1 })
  })

  it('va en serie, nunca dos a la vez', async () => {
    let enCurso = 0
    let maximo = 0
    await geocodificarLote(['a', 'b', 'c', 'd'], async () => {
      enCurso++
      maximo = Math.max(maximo, enCurso)
      await new Promise((ok) => setTimeout(ok, 5))
      enCurso--
    })
    expect(maximo).toBe(1)
  })

  it('lista vacía no hace nada', async () => {
    const fn = vi.fn()
    expect(await geocodificarLote([], fn)).toEqual({ ok: 0, fallidas: 0 })
    expect(fn).not.toHaveBeenCalled()
  })
})
