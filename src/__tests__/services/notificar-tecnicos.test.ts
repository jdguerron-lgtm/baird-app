import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock hoisting — safe to reference in factory
const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.stubGlobal('fetch', mockFetch)

import { notificarTecnicos } from '@/lib/services/whatsapp.service'

// Helper: chainable supabase query builder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: { data: any; error: any }): any {
  const methods = ['select', 'eq', 'in', 'ilike', 'is', 'neq', 'insert', 'update', 'order', 'limit', 'single']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(resolved)
  return builder
}

const SOLICITUD = {
  id: 'sol-001',
  tipo_equipo: 'Nevera',
  marca_equipo: 'Samsung',
  novedades_equipo: 'No enfria correctamente desde hace varios dias y hace ruido',
  direccion: 'Calle 45 #12-30',
  zona_servicio: 'Chapinero',
  ciudad_pueblo: 'Bogota',
  pago_tecnico: 120000,
  horario_visita_1: 'Lun 5 Mar, 8:00 AM - 12:00 PM',
  horario_visita_2: 'Mar 6 Mar, 12:00 PM - 4:00 PM',
  triaje_resultado: null,
  cliente_nombre: 'Juan Test',
  cliente_telefono: '3001234567',
}

const TECNICO = {
  id: 'tec-001',
  nombre_completo: 'Carlos Tecnico',
  whatsapp: '3009876543',
  ciudad_pueblo: 'Bogota',
}

describe('notificarTecnicos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-1' }] }),
    })
  })

  it('notifies matching tecnico (especialidad + verificado + city)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: SOLICITUD, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [{ tecnico_id: 'tec-001' }], error: null })
      }
      if (table === 'tecnicos') {
        return queryBuilder({ data: [TECNICO], error: null })
      }
      if (table === 'notificaciones_whatsapp') {
        return queryBuilder({ data: null, error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')

    expect(result.notificados).toBe(1)
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/messages')
    const body = JSON.parse(opts.body)
    expect(body.to).toBe('573009876543')
  })

  it('returns 0 when no tecnicos have the matching especialidad', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: SOLICITUD, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [], error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')

    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 0 when tecnicos exist but none match city + verificado filter', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: SOLICITUD, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [{ tecnico_id: 'tec-001' }], error: null })
      }
      if (table === 'tecnicos') {
        // Query returns empty — no verified tecnicos in the city
        return queryBuilder({ data: [], error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')

    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws when solicitud is not found', async () => {
    mockFrom.mockImplementation(() => {
      return queryBuilder({ data: null, error: { message: 'not found' } })
    })

    await expect(notificarTecnicos('nonexistent')).rejects.toThrow('Solicitud no encontrada')
  })

  it('returns 0 when especialidades query returns null', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: SOLICITUD, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: null, error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')
    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
  })
})
