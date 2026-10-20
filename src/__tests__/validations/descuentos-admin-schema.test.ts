import { describe, expect, it } from 'vitest'

/**
 * El módulo de /api/admin/descuentos debe poder IMPORTARSE: en el build de
 * Vercel del 2026-10-20 reventó al evaluar `baseSchema.partial()` sobre un
 * objeto con superRefine (Zod lo prohíbe). tsc y los tests unitarios no lo
 * veían porque nadie importaba la ruta.
 */
describe('/api/admin/descuentos — el módulo carga', () => {
  it('importa sin lanzar y expone GET/POST/PATCH', async () => {
    const mod = await import('@/app/api/admin/descuentos/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
    expect(typeof mod.PATCH).toBe('function')
  })
})
