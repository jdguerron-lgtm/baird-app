import { describe, it, expect, vi } from 'vitest'
import { withRetry, querySupabase } from '@/lib/utils/retry'

describe('withRetry', () => {
  it('retorna resultado al primer intento si funciona', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta hasta 3 veces y retorna éxito en el segundo intento', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue('ok-segundo')
    const result = await withRetry(fn, { backoffMs: [10, 30] })
    expect(result).toBe('ok-segundo')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('lanza el último error después de agotar reintentos', async () => {
    const err = new Error('siempre falla')
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { retries: 2, backoffMs: [5, 15] })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3) // 1 + 2 retries
  })

  it('respeta shouldRetry=false y propaga inmediatamente', async () => {
    const err = { code: '4xx-no-retryable' }
    const fn = vi.fn().mockRejectedValue(err)
    await expect(
      withRetry(fn, { retries: 5, shouldRetry: () => false, backoffMs: [5] })
    ).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('llama onRetry con el número de intento', async () => {
    const onRetry = vi.fn()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'))
      .mockResolvedValue('done')
    await withRetry(fn, { backoffMs: [5, 15], onRetry })
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error))
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error))
  })
})

describe('querySupabase', () => {
  it('retorna data al primer intento exitoso', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { id: '1' }, error: null })
    const result = await querySupabase(fn)
    expect(result.data).toEqual({ id: '1' })
    expect(result.error).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('PGRST116 (no rows) NO se reintenta — propaga como resultado normal', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows' } })
    const result = await querySupabase(fn)
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('PGRST116')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('error transitorio (fetch network) se reintenta', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'fetch failed' } })
      .mockResolvedValue({ data: { id: '2' }, error: null })
    const result = await querySupabase(fn, { backoffMs: [10, 30] })
    expect(result.data).toEqual({ id: '2' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('agota reintentos y retorna el último resultado con error', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { message: 'still failing' } })
    const result = await querySupabase(fn, { retries: 1, backoffMs: [5] })
    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('still failing')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('42501 (RLS denied) NO se reintenta', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'rls denied' } })
    const result = await querySupabase(fn, { retries: 5, backoffMs: [5] })
    expect(result.error?.code).toBe('42501')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
