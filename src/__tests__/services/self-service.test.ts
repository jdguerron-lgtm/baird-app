import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock factory hoisting
const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.stubGlobal('fetch', mockFetch)

// Set env so enviarMensajeTexto doesn't throw on missing config
process.env.WHATSAPP_PHONE_ID = 'test-phone-id'
process.env.WHATSAPP_API_TOKEN = 'test-token'

import {
  procesarCancelacionCliente,
  procesarReagendamientoCliente,
} from '@/lib/services/whatsapp.service'
import { MAX_REAGENDAMIENTOS_CLIENTE } from '@/types/solicitud'

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

const SOLICITUD_BASE = {
  id: 'sol-001',
  cliente_telefono: '57|3001234567',
  cliente_nombre: 'María Test',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'LG',
  horario_confirmado: 'Mañana 8am-12pm',
  horario_confirmado_at: new Date().toISOString(),
  reagendamientos_count: 0,
  es_garantia: false,
}

describe('procesarCancelacionCliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-1' }] }),
    })
  })

  it('rechaza token inválido', async () => {
    mockFrom.mockImplementation(() =>
      queryBuilder({ data: null, error: { message: 'not found' } }),
    )

    const result = await procesarCancelacionCliente('bad-token', 'Cambio de planes')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Token inválido')
  })

  it('rechaza cancelación desde estado terminal', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: { ...SOLICITUD_BASE, estado: 'completada', tecnico_asignado_id: null },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarCancelacionCliente('token-1', 'Ya no quiero')

    expect(result.ok).toBe(false)
    expect(result.estado_previo).toBe('completada')
    expect(result.error).toContain('No se puede cancelar')
  })

  it('cancela exitosamente desde notificada (sin técnico) — cancelado_tarde=false', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: { ...SOLICITUD_BASE, estado: 'notificada', tecnico_asignado_id: null },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarCancelacionCliente('token-1', 'Cambio de planes')

    expect(result.ok).toBe(true)
    expect(result.estado_previo).toBe('notificada')
    expect(result.cancelado_tarde).toBe(false)
    // 1 mensaje al cliente, 0 al técnico (no hay)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('cancela desde asignada (con técnico) — cancelado_tarde=true + notifica al técnico', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: { ...SOLICITUD_BASE, estado: 'asignada', tecnico_asignado_id: 'tec-001' },
          error: null,
        })
      }
      if (table === 'tecnicos') {
        return queryBuilder({
          data: { whatsapp: '57|3009876543', nombre_completo: 'Carlos Tecnico' },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarCancelacionCliente('token-1', 'No estaré en casa')

    expect(result.ok).toBe(true)
    expect(result.estado_previo).toBe('asignada')
    expect(result.cancelado_tarde).toBe(true)
    // 1 al cliente + 1 al técnico
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('procesarReagendamientoCliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-1' }] }),
    })
  })

  it('rechaza horario vacío', async () => {
    const result = await procesarReagendamientoCliente('token-1', '   ')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Horario inválido')
  })

  it('rechaza horario excesivamente largo', async () => {
    const result = await procesarReagendamientoCliente('token-1', 'x'.repeat(201))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Horario inválido')
  })

  it('rechaza token inválido', async () => {
    mockFrom.mockImplementation(() =>
      queryBuilder({ data: null, error: { message: 'not found' } }),
    )

    const result = await procesarReagendamientoCliente('bad-token', 'Mañana 2pm-6pm')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Token inválido')
  })

  it('rechaza reagendamiento desde estado no permitido', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: { ...SOLICITUD_BASE, estado: 'en_proceso', tecnico_asignado_id: 'tec-001' },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarReagendamientoCliente('token-1', 'Mañana 2pm-6pm')

    expect(result.ok).toBe(false)
    expect(result.estado_previo).toBe('en_proceso')
    expect(result.error).toContain('No se puede reagendar')
  })

  it('rechaza al alcanzar el máximo de reagendamientos', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: {
            ...SOLICITUD_BASE,
            estado: 'asignada',
            tecnico_asignado_id: 'tec-001',
            reagendamientos_count: MAX_REAGENDAMIENTOS_CLIENTE,
          },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarReagendamientoCliente('token-1', 'Mañana 2pm-6pm')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('máximo')
  })

  it('reagenda desde asignada — incrementa contador y notifica técnico', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: {
            ...SOLICITUD_BASE,
            estado: 'asignada',
            tecnico_asignado_id: 'tec-001',
            reagendamientos_count: 0,
          },
          error: null,
        })
      }
      if (table === 'tecnicos') {
        return queryBuilder({
          data: { whatsapp: '57|3009876543', nombre_completo: 'Carlos Tecnico' },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarReagendamientoCliente('token-1', 'Sábado 2pm-6pm', 'Cambio de horario')

    expect(result.ok).toBe(true)
    expect(result.reagendamientos_count).toBe(1)
    // 1 al cliente + 1 al técnico
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('reagenda pre-aceptación (sin técnico) — solo notifica al cliente', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'solicitudes_servicio') {
        return queryBuilder({
          data: {
            ...SOLICITUD_BASE,
            estado: 'pendiente_horario',
            tecnico_asignado_id: null,
            reagendamientos_count: 0,
          },
          error: null,
        })
      }
      return queryBuilder({ data: null, error: null })
    })

    const result = await procesarReagendamientoCliente('token-1', 'Sábado 2pm-6pm')

    expect(result.ok).toBe(true)
    expect(result.reagendamientos_count).toBe(1)
    // Solo cliente, no técnico
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
