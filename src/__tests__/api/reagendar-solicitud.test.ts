import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom, mockObtenerEmailAdmin, mockProcesar, mockFranjasLlenas } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockObtenerEmailAdmin: vi.fn(),
  mockProcesar: vi.fn(),
  mockFranjasLlenas: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/auth/admin', () => ({ obtenerEmailAdmin: mockObtenerEmailAdmin }))
vi.mock('@/lib/services/whatsapp.service', () => ({ procesarReagendamientoAdmin: mockProcesar }))
vi.mock('@/lib/services/agenda.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/services/agenda.service')>()
  return { ...real, franjasLlenasParaFecha: mockFranjasLlenas }
})

import { POST } from '@/app/api/admin/reagendar-solicitud/route'
import { fechaColombiaMasDias, fechaColombiaYMD, rangoFechaVisita } from '@/lib/utils/fecha-visita'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/reagendar-solicitud', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/reagendar-solicitud — validarFechaVisita', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockObtenerEmailAdmin.mockResolvedValue('admin@bairdservice.com')
    mockFranjasLlenas.mockResolvedValue([])
    mockProcesar.mockResolvedValue({
      ok: true, estado: 'asignada', horarioPrevio: 'x', teniaTecnico: false,
      clienteNotificado: true, tecnicoNotificado: false, supervisores: { enviados: 0, total: 0 },
    })
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('rechaza con 400 un año mal tecleado (caso real 2006) sin tocar la solicitud', async () => {
    const res = await POST(req({ id: 'abc', fecha: '2006-10-20', franja: '8am-12pm' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.motivo).toBe('pasada')
    expect(data.error).toContain('ya pasó')
    expect(data.error).toContain('2006-10-20')
    expect(mockProcesar).not.toHaveBeenCalled()
  })

  it('rechaza con 400 una fecha anterior a hoy (ayer) — ya no es solo un aviso', async () => {
    const ayer = fechaColombiaMasDias(-1)
    const res = await POST(req({ id: 'abc', fecha: ayer, franja: '3pm-6pm' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.motivo).toBe('pasada')
    expect(data.error).toContain('ya pasó')
    expect(mockProcesar).not.toHaveBeenCalled()
  })

  it('rechaza con 400 una fecha a más de 180 días ("revisa el año")', async () => {
    const res = await POST(req({ id: 'abc', fecha: fechaColombiaMasDias(181), franja: '8am-12pm' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.motivo).toBe('fuera_de_rango')
    expect(data.error).toContain('revisa el año')
    expect(mockProcesar).not.toHaveBeenCalled()
  })

  it('rechaza con 400 un día calendario inexistente', async () => {
    const res = await POST(req({ id: 'abc', fecha: '2026-02-30', franja: '8am-12pm' }))
    expect(res.status).toBe(400)
    expect((await res.json()).motivo).toBe('formato')
    expect(mockProcesar).not.toHaveBeenCalled()
  })

  it('acepta una fecha dentro del rango y materializa fecha_visita_at con ese año', async () => {
    const fecha = fechaColombiaMasDias(3)
    const res = await POST(req({ id: 'abc', fecha, franja: '8am-12pm' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.fecha_visita_at).toBe(`${fecha}T13:00:00.000Z`)
    expect(data.avisos).toEqual([])
    expect(mockProcesar).toHaveBeenCalledWith('abc', expect.stringContaining('8am-12pm'), `${fecha}T13:00:00.000Z`)
  })

  it('"hoy" sigue pasando con aviso NO bloqueante', async () => {
    const hoy = fechaColombiaYMD()
    const res = await POST(req({ id: 'abc', fecha: hoy, franja: '3pm-6pm' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.avisos.join(' ')).toContain('hoy')
    expect(mockProcesar).toHaveBeenCalled()
  })

  it('los bordes del rango (hoy y hoy+180) pasan', async () => {
    const { min, max } = rangoFechaVisita()
    expect((await POST(req({ id: 'abc', fecha: min, franja: '8am-12pm' }))).status).toBe(200)
    expect((await POST(req({ id: 'abc', fecha: max, franja: '8am-12pm' }))).status).toBe(200)
  })

  it('sigue exigiendo admin (401) antes de validar nada', async () => {
    mockObtenerEmailAdmin.mockResolvedValue(null)
    const res = await POST(req({ id: 'abc', fecha: '2006-10-20', franja: '8am-12pm' }))
    expect(res.status).toBe(401)
  })
})
