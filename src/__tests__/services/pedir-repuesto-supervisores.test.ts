import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regla 2026-10-08: el pedido de repuesto a supervisores SOLO sale si la
// solicitud tiene al menos un repuesto especificado (SKU en repuestos_pendientes).
// Cubre el botón del admin, el cron de recordatorios y el cambio automático de
// estado a esperando_repuesto (que cae a la plantilla genérica).

const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

vi.stubGlobal('fetch', mockFetch)

import {
  notificarRepuestoSupervisores,
  notificarCambioEstado,
  MSG_SIN_REPUESTO_ESPECIFICADO,
} from '@/lib/services/whatsapp.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: { data: any; error: any }): any {
  const methods = ['select', 'eq', 'in', 'ilike', 'is', 'neq', 'insert', 'update', 'order', 'limit']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.single = vi.fn().mockResolvedValue(resolved)
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved)
  return builder
}

const SOL_GARANTIA = {
  id: 'sol-g1',
  cliente_nombre: 'Cliente Test',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'MABE',
  ciudad_pueblo: 'Bogotá',
  es_garantia: true,
  numero_serie_factura: '9415000000',
  direccion: 'Calle 1 # 2-3',
  zona_servicio: 'Suba',
  novedades_equipo: '[Modelo: LMA70] No centrifuga',
  triaje_resultado: null,
  estado: 'asignada',
}

const SUPERVISOR = {
  nombre: 'Lorena Super',
  whatsapp: '573001112233',
  ambito: 'garantia',
  marca: 'MABE',
  estados: null,
  activo: true,
}

const REPUESTO = { sku: 'WH1234', descripcion: 'Bomba de drenaje', cantidad: 1, estado: 'pendiente', solicitado_at: '2026-10-08' }

function mockTablas(repuestos: unknown[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'solicitudes_servicio') return queryBuilder({ data: SOL_GARANTIA, error: null })
    if (table === 'supervisores') return queryBuilder({ data: [SUPERVISOR], error: null })
    if (table === 'repuestos_pendientes') return queryBuilder({ data: repuestos, error: null })
    return queryBuilder({ data: null, error: null })
  })
}

function templatesEnviados(): string[] {
  return mockFetch.mock.calls.map(([, opts]) => JSON.parse(opts.body).template?.name)
}

describe('pedido de repuesto a supervisores — requiere repuesto especificado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BAIRD_TEST_PHONE_WHITELIST
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'msg-1' }] }) })
  })

  it('notificarRepuestoSupervisores NO envía nada sin repuesto especificado', async () => {
    mockTablas([])
    const r = await notificarRepuestoSupervisores('sol-g1')
    expect(r.enviados).toBe(0)
    expect(r.error).toBe(MSG_SIN_REPUESTO_ESPECIFICADO)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('notificarRepuestoSupervisores ignora filas sin SKU o canceladas como "sin repuesto"', async () => {
    mockTablas([{ ...REPUESTO, sku: '   ' }])
    const r = await notificarRepuestoSupervisores('sol-g1')
    expect(r.enviados).toBe(0)
    expect(r.error).toBe(MSG_SIN_REPUESTO_ESPECIFICADO)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('notificarRepuestoSupervisores SÍ envía con un repuesto especificado', async () => {
    mockTablas([REPUESTO])
    const r = await notificarRepuestoSupervisores('sol-g1')
    expect(r.enviados).toBe(1)
    expect(r.error).toBeUndefined()
    expect(templatesEnviados()).toEqual(['supervisor_repuesto_garantia_v1'])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const params = body.template.components[0].parameters.map((p: { text: string }) => p.text)
    expect(params).toContain('WH1234 (Bomba de drenaje)')
  })

  it('notificarCambioEstado → esperando_repuesto sin repuesto cae al aviso genérico, no al pedido', async () => {
    mockTablas([])
    await notificarCambioEstado('sol-g1', 'asignada', 'esperando_repuesto', { registrarEvento: false })
    expect(templatesEnviados()).toEqual(['supervisor_cambio_estado_v1'])
  })

  it('notificarCambioEstado → esperando_repuesto con repuesto envía el pedido con SKU', async () => {
    mockTablas([REPUESTO])
    await notificarCambioEstado('sol-g1', 'asignada', 'esperando_repuesto', { registrarEvento: false })
    expect(templatesEnviados()).toEqual(['supervisor_repuesto_garantia_v1'])
  })
})
