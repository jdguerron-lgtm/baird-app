import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regresión 2026-10-09: el evento 'mensaje_cliente' (historial del admin)
// se escribía con `void` (fire-and-forget). En Vercel la función se congela
// al responder y el INSERT quedaba pendiente: el admin no veía que el
// WhatsApp de selección de horario ya había salido y lo reenviaba (clientes
// con la plantilla duplicada). Ahora el registro se espera ANTES de resolver.

const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

vi.stubGlobal('fetch', mockFetch)

process.env.WHATSAPP_PHONE_ID = 'test-phone-id'
process.env.WHATSAPP_API_TOKEN = 'test-token'
delete process.env.BAIRD_TEST_PHONE_WHITELIST

import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: { data: any; error: any }): any {
  const methods = ['select', 'eq', 'in', 'is', 'neq', 'update', 'order', 'limit']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.single = vi.fn().mockResolvedValue(resolved)
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved)
  return builder
}

const SOL = {
  cliente_telefono: '573001234567',
  cliente_nombre: 'María Test',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'MABE',
  horario_visita_1: 'viernes, 16 de octubre · 8am-12pm',
  horario_visita_2: '2:00 PM - 5:00 PM',
  horario_token: 'tok-123',
  horario_confirmado_at: null,
  estado: 'pendiente_horario',
  es_garantia: true,
  numero_serie_factura: '9415683292',
}

describe('historial del WhatsApp al cliente se registra ANTES de resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid-1' }] }),
    })
  })

  it('enviarSeleccionHorarioCliente inserta el evento mensaje_cliente y luego retorna ok', async () => {
    const inserts: Record<string, unknown>[] = []
    let insertResuelto = false

    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === 'solicitud_eventos') {
        // Insert lento a propósito: si el servicio no lo esperara, retornaría
        // antes de que esto termine (el bug original).
        return {
          insert: vi.fn().mockImplementation(async (row: Record<string, unknown>) => {
            inserts.push(row)
            await new Promise(r => setTimeout(r, 30))
            insertResuelto = true
            return { error: null }
          }),
        }
      }
      return queryBuilder({ data: SOL, error: null })
    })

    const r = await enviarSeleccionHorarioCliente('sol-001')

    expect(r.ok).toBe(true)
    expect(insertResuelto).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      solicitud_id: 'sol-001',
      tipo: 'mensaje_cliente',
      actor: 'sistema',
      payload: { plantilla: 'cliente_seleccion_horario_v2', canal: 'whatsapp' },
    })
  })

  it('un fallo al registrar el historial no rompe el envío', async () => {
    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === 'solicitud_eventos') {
        return { insert: vi.fn().mockRejectedValue(new Error('db caída')) }
      }
      return queryBuilder({ data: SOL, error: null })
    })

    const r = await enviarSeleccionHorarioCliente('sol-001')
    expect(r.ok).toBe(true)
  })
})
