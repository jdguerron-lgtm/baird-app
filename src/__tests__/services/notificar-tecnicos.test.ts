import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock hoisting — safe to reference in factory
const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

// whatsapp.service lee/escribe con service_role desde la Fase 1 de RLS
// (commit 2353b3a): el mock apunta a supabase-admin, no al cliente anon.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
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
  estado_verificacion: 'verificado',
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
        return queryBuilder({ data: [{ tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' }], error: null })
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

  it('notifies tecnico whose ciudades_cobertura includes the solicitud city (Soacha)', async () => {
    // Técnico con base Bogotá que también cubre Soacha — la cobertura manda.
    // La grafía difiere a propósito (minúscula vs capitalizada): el matching
    // es por token normalizado (case/acento-insensitive).
    const tecnicoConCobertura = {
      ...TECNICO,
      ciudad_pueblo: 'Bogota',
      ciudades_cobertura: ['Bogotá', 'soacha'],
    }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: { ...SOLICITUD, ciudad_pueblo: 'Soacha' }, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [{ tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' }], error: null })
      }
      if (table === 'tecnicos') {
        return queryBuilder({ data: [tecnicoConCobertura], error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')

    expect(result.notificados).toBe(1)
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('does NOT notify tecnico without the solicitud city in cobertura (fallback a ciudad base)', async () => {
    // Técnico de Bogotá SIN cobertura cargada (legacy: []) — fallback a la
    // ciudad base, que no matchea una solicitud de Soacha.
    const tecnicoSoloBogota = { ...TECNICO, ciudades_cobertura: [] }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({ data: { ...SOLICITUD, ciudad_pueblo: 'Soacha' }, error: null })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [{ tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' }], error: null })
      }
      if (table === 'tecnicos') {
        return queryBuilder({ data: [tecnicoSoloBogota], error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')

    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
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
        return queryBuilder({ data: [{ tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' }], error: null })
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

  // Regresión 2026-09-08: admin pulsó "Notificar técnicos" sobre solicitudes
  // ya asignadas; se re-ofertaron y el estado bajó a 'notificada' con el
  // técnico puesto (invisibles en el portal del técnico).
  it('does NOT re-notify nor touch estado when the solicitud already has a tecnico asignado', async () => {
    const tablasTocadas: string[] = []
    mockFrom.mockImplementation((table: string) => {
      tablasTocadas.push(table)
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: { ...SOLICITUD, estado: 'asignada', tecnico_asignado_id: 'tec-001' },
          error: null,
        })
      }
      if (table === 'especialidades_tecnico') {
        return queryBuilder({ data: [{ tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' }], error: null })
      }
      if (table === 'tecnicos') {
        return queryBuilder({ data: [TECNICO], error: null })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await notificarTecnicos('sol-001')
    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
    expect(result.errors[0]).toMatch(/ya tiene técnico asignado/)
    // No se envió ningún WhatsApp ni se escribió en notificaciones_whatsapp
    expect(mockFetch).not.toHaveBeenCalled()
    expect(tablasTocadas).not.toContain('notificaciones_whatsapp')
    expect(tablasTocadas).not.toContain('especialidades_tecnico')
  })
})

describe('notificarTecnicos — técnico de preferencia (2026-10-15)', () => {
  const TEC_A = { ...TECNICO, id: 'tec-001', nombre_completo: 'Carlos Tecnico', whatsapp: '3009876543' }
  const TEC_B = { ...TECNICO, id: 'tec-002', nombre_completo: 'Nestor Tecnico', whatsapp: '3001112233' }
  const ESPS = [
    { tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' },
    { tecnico_id: 'tec-002', especialidad: 'Neveras y Nevecones' },
  ]

  function setup(sol: Record<string, unknown>) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') return queryBuilder({ data: sol, error: null })
      if (table === 'especialidades_tecnico') return queryBuilder({ data: ESPS, error: null })
      if (table === 'tecnicos') return queryBuilder({ data: [TEC_A, TEC_B], error: null })
      return queryBuilder({ data: null, error: null })
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'msg-1' }] }) })
  })

  it('primera oferta: solo notifica al técnico preferido si pasó los filtros', async () => {
    setup({ ...SOLICITUD, tecnico_preferido_id: 'tec-002', notificados_at: null })

    const result = await notificarTecnicos('sol-001')

    expect(result.matched).toBe(1)
    expect(result.notificados).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.to).toBe('573001112233')
  })

  it('reenvío (notificados_at ya fijado): la oferta va a todos, preferido incluido', async () => {
    setup({ ...SOLICITUD, tecnico_preferido_id: 'tec-002', notificados_at: '2026-10-15T10:00:00Z' })

    const result = await notificarTecnicos('sol-001')

    expect(result.matched).toBe(2)
    expect(result.notificados).toBe(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('preferido que ya no es candidato: oferta abierta a todos + aviso en errors', async () => {
    setup({ ...SOLICITUD, tecnico_preferido_id: 'tec-999', notificados_at: null })

    const result = await notificarTecnicos('sol-001')

    expect(result.matched).toBe(2)
    expect(result.notificados).toBe(2)
    expect(result.errors.some(e => e.includes('preferencia'))).toBe(true)
  })

  it('sin preferencia: comportamiento histórico (todos los candidatos)', async () => {
    setup({ ...SOLICITUD, tecnico_preferido_id: null, notificados_at: null })

    const result = await notificarTecnicos('sol-001')

    expect(result.matched).toBe(2)
    expect(result.notificados).toBe(2)
  })
})

describe('notificarTecnicos — invitación dirigida del admin (soloTecnicoId, 2026-10-22)', () => {
  const TEC_A = { ...TECNICO, id: 'tec-001', nombre_completo: 'Carlos Tecnico', whatsapp: '3009876543' }
  const TEC_B = { ...TECNICO, id: 'tec-002', nombre_completo: 'Nestor Tecnico', whatsapp: '3001112233' }
  const ESPS = [
    { tecnico_id: 'tec-001', especialidad: 'Neveras y Nevecones' },
    { tecnico_id: 'tec-002', especialidad: 'Neveras y Nevecones' },
  ]
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []

  function setup(sol: Record<string, unknown>) {
    inserts.length = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') return queryBuilder({ data: sol, error: null })
      if (table === 'especialidades_tecnico') return queryBuilder({ data: ESPS, error: null })
      if (table === 'tecnicos') return queryBuilder({ data: [TEC_A, TEC_B], error: null })
      const qb = queryBuilder({ data: null, error: null })
      qb.insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return qb
      })
      return qb
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'msg-1' }] }) })
  })

  it('manda SOLO al técnico elegido, con prefijo de prioridad y sin asignarlo', async () => {
    setup({ ...SOLICITUD, estado: 'notificada', notificados_at: '2026-10-20T10:00:00Z' })

    const result = await notificarTecnicos('sol-001', { soloTecnicoId: 'tec-002' })

    expect(result.matched).toBe(1)
    expect(result.notificados).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.to).toBe('573001112233')
    const params = body.template.components[0].parameters.map((p: { text: string }) => p.text)
    expect(params.some((t: string) => t.startsWith('⭐ PRIORIDAD PARA TI'))).toBe(true)
    // Bitácora: nota_admin con payload.origen='oferta_dirigida' (sin tocar el CHECK de tipos)
    const evento = inserts.find(i => i.table === 'solicitud_eventos')
    expect(evento?.row.tipo).toBe('nota_admin')
    expect((evento?.row.payload as { origen: string }).origen).toBe('oferta_dirigida')
  })

  it('gana sobre el técnico preferido del cliente en la primera oferta', async () => {
    setup({ ...SOLICITUD, tecnico_preferido_id: 'tec-002', notificados_at: null })

    const result = await notificarTecnicos('sol-001', { soloTecnicoId: 'tec-001' })

    expect(result.notificados).toBe(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.to).toBe('573009876543')
  })

  it('id que no es candidato: no envía nada y lo dice en errors', async () => {
    setup({ ...SOLICITUD, notificados_at: '2026-10-20T10:00:00Z' })

    const result = await notificarTecnicos('sol-001', { soloTecnicoId: 'tec-999' })

    expect(result.notificados).toBe(0)
    expect(result.matched).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.errors[0]).toContain('no es candidato')
  })
})
