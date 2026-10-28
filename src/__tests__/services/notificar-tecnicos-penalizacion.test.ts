import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockFetch, mockBloqueos, mockCfgPen, mockMinutos } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
  mockBloqueos: vi.fn(),
  mockCfgPen: vi.fn(),
  mockMinutos: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/services/penalizacion.service', () => ({
  obtenerBloqueos: mockBloqueos,
  obtenerConfigPenalizacion: mockCfgPen,
  minutosPenalizacionTecnicos: mockMinutos,
}))
vi.mock('@/lib/services/reparto.service', () => ({
  obtenerConfigReparto: async () => ({ activo: false, minutos_ventaja: 10, max_servicios_semana: 3 }),
  contarServiciosRecientes: async () => new Map(),
  dividirPorPrioridad: <T,>(t: T[]) => ({ prioritarios: t, resto: [] }),
}))
vi.stubGlobal('fetch', mockFetch)

import { notificarTecnicos } from '@/lib/services/whatsapp.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qb(resolved: { data: any; error: any }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = { then: (r: (v: unknown) => void) => Promise.resolve(resolved).then(r) }
  for (const m of ['select', 'eq', 'in', 'is', 'neq', 'gte', 'insert', 'update', 'order', 'limit']) b[m] = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue(resolved)
  return b
}

const SOL = {
  id: 'sol-1',
  tipo_equipo: 'Nevera',
  marca_equipo: 'Mabe',
  novedades_equipo: 'No enfría',
  direccion: 'Calle 1',
  zona_servicio: 'Chapinero',
  ciudad_pueblo: 'Bogota',
  pago_tecnico: 35000,
  horario_confirmado: 'lunes · 8am-12pm',
  es_garantia: true,
  tecnico_asignado_id: null,
  oferta_pendientes: null,
}
const TECS = [
  { id: 'a', nombre_completo: 'Ana Uno', whatsapp: '3001111111', ciudad_pueblo: 'Bogota', estado_verificacion: 'verificado' },
  { id: 'b', nombre_completo: 'Beto Dos', whatsapp: '3002222222', ciudad_pueblo: 'Bogota', estado_verificacion: 'verificado' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let updatesSolicitud: any[] = []

function montar(sol: Record<string, unknown>) {
  updatesSolicitud = []
  mockFrom.mockImplementation((t: string) => {
    if (t === 'solicitudes_servicio') {
      const b = qb({ data: sol, error: null })
      b.update = vi.fn((v: unknown) => { updatesSolicitud.push(v); return b })
      return b
    }
    if (t === 'especialidades_tecnico') {
      return qb({ data: [{ tecnico_id: 'a', especialidad: 'Neveras y Nevecones' }, { tecnico_id: 'b', especialidad: 'Neveras y Nevecones' }], error: null })
    }
    if (t === 'tecnicos') return qb({ data: TECS, error: null })
    return qb({ data: [], error: null })
  })
}

const destinos = () => mockFetch.mock.calls.map(([, o]) => JSON.parse(o.body).to)

describe('notificarTecnicos — bloqueo y penalización (2026-10-26)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'm' }] }) })
    mockBloqueos.mockResolvedValue(new Map())
    mockCfgPen.mockResolvedValue({ activa: true, minutosPorIncumplimiento: 5, dias: 30, maxMinutos: 60 })
    mockMinutos.mockResolvedValue(new Map())
  })

  it('excluye al técnico bloqueado para garantía', async () => {
    montar(SOL)
    mockBloqueos.mockResolvedValue(new Map([['b', { garantia: true, particular: false, nota: null }]]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(1)
    expect(destinos()).toEqual(['573001111111'])
  })

  it('bloqueado solo para particular sí recibe garantía', async () => {
    montar(SOL)
    mockBloqueos.mockResolvedValue(new Map([['b', { garantia: false, particular: true, nota: null }]]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(2)
  })

  it('todos bloqueados: no envía y lo dice', async () => {
    montar(SOL)
    mockBloqueos.mockResolvedValue(new Map([
      ['a', { garantia: true, particular: false, nota: null }],
      ['b', { garantia: true, particular: false, nota: null }],
    ]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(0)
    expect(r.errors[0]).toMatch(/bloqueados/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('penalizado: se retiene y queda en oferta_pendientes con despertador', async () => {
    montar(SOL)
    mockMinutos.mockResolvedValue(new Map([['b', 10]]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(1)
    expect(r.retenidos).toBe(1)
    expect(destinos()).toEqual(['573001111111'])
    const upd = updatesSolicitud.find(u => 'oferta_pendientes' in u)
    expect(upd.oferta_pendientes).toEqual([{ tecnico_id: 'b', liberar_at: expect.any(String) }])
    expect(upd.oferta_abierta_at).toBe(upd.oferta_pendientes[0].liberar_at)
    expect(upd.estado).toBe('notificada')
  })

  it('todos penalizados: nadie la recibe aún pero la solicitud queda esperando', async () => {
    montar(SOL)
    mockMinutos.mockResolvedValue(new Map([['a', 5], ['b', 10]]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(0)
    expect(r.retenidos).toBe(2)
    expect(mockFetch).not.toHaveBeenCalled()
    const upd = updatesSolicitud.find(u => 'oferta_pendientes' in u)
    expect(upd.oferta_pendientes).toHaveLength(2)
  })

  it('sin la migración (sol sin oferta_pendientes) no hay retención', async () => {
    const sinColumna: Record<string, unknown> = { ...SOL }
    delete sinColumna.oferta_pendientes
    montar(sinColumna)
    mockMinutos.mockResolvedValue(new Map([['b', 10]]))
    const r = await notificarTecnicos('sol-1')
    expect(r.notificados).toBe(2)
    expect(r.retenidos).toBeUndefined()
  })

  it('la invitación dirigida no se retrasa', async () => {
    montar(SOL)
    mockMinutos.mockResolvedValue(new Map([['b', 10]]))
    const r = await notificarTecnicos('sol-1', { soloTecnicoId: 'b' })
    expect(r.notificados).toBe(1)
    expect(destinos()).toEqual(['573002222222'])
  })
})
