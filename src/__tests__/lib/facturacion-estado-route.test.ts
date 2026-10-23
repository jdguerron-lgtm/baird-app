import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/admin/facturacion-estado — auth y reglas end-to-end del handler
 * con Supabase y Auth mockeados:
 *   - sin token → 401
 *   - email fuera de ambas allowlists → 401
 *   - rol LECTURA (logística) → 200 y `facturada_por` = su email (única
 *     excepción a su solo-lectura, decisión 2026-10-22)
 *   - admin → 200
 *   - solicitud no completada → 409 sin escribir
 */

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mockGetUser } } }))

import { POST } from '@/app/api/admin/facturacion-estado/route'

const ID = '6c7efe75-6309-432e-8809-61d2a5013e3e'
const ENV_KEYS = ['ADMIN_EMAILS', 'NEXT_PUBLIC_ADMIN_EMAILS', 'LECTURA_EMAILS', 'NEXT_PUBLIC_LECTURA_EMAILS'] as const
const backup: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(resolved: { data: any; error: any }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = { then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve) }
  for (const m of ['select', 'eq', 'update', 'insert']) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue(resolved)
  b.single = vi.fn().mockResolvedValue(resolved)
  return b
}

interface Tablas {
  solicitud: { data: unknown; error: unknown }
  update?: { data: unknown; error: unknown }
}

function mockTablas(t: Tablas) {
  const updateBuilder = builder(t.update ?? { data: null, error: null })
  const selectBuilder = builder(t.solicitud)
  const eventosBuilder = builder({ data: null, error: null })
  // La misma tabla se consulta dos veces: primero SELECT, luego UPDATE.
  let llamadasSolicitudes = 0
  mockFrom.mockImplementation((tabla: string) => {
    if (tabla === 'solicitud_eventos') return eventosBuilder
    llamadasSolicitudes += 1
    return llamadasSolicitudes === 1 ? selectBuilder : updateBuilder
  })
  return { updateBuilder, selectBuilder, eventosBuilder }
}

function req(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/admin/facturacion-estado', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const COMPLETADA = { id: ID, estado: 'completada', facturacion_estado: 'pendiente', factura_numero: null, facturacion_nota: null }
const BODY = { solicitud_id: ID, facturacion_estado: 'facturada', factura_numero: 'FV-2-1524' }

beforeEach(() => {
  for (const k of ENV_KEYS) {
    backup[k] = process.env[k]
    delete process.env[k]
  }
  mockFrom.mockReset()
  mockGetUser.mockReset()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (backup[k] === undefined) delete process.env[k]
    else process.env[k] = backup[k]
  }
})

describe('POST /api/admin/facturacion-estado — auth', () => {
  it('sin Authorization → 401 y no toca la BD', async () => {
    mockTablas({ solicitud: { data: COMPLETADA, error: null } })
    const res = await POST(req(BODY))
    expect(res.status).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('usuario autenticado fuera de ambas allowlists → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'intruso@gmail.com' } } })
    mockTablas({ solicitud: { data: COMPLETADA, error: null } })
    const res = await POST(req(BODY, 'tok'))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rol LECTURA (logística) SÍ puede marcar y queda como facturada_por', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'logistica@encompasslatam.com' } } })
    const actualizada = { ...COMPLETADA, facturacion_estado: 'facturada', factura_numero: 'FV-2-1524', facturada_por: 'logistica@encompasslatam.com' }
    const { updateBuilder, eventosBuilder } = mockTablas({
      solicitud: { data: COMPLETADA, error: null },
      update: { data: actualizada, error: null },
    })
    const res = await POST(req(BODY, 'tok'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.rol).toBe('lectura')
    expect(json.solicitud.factura_numero).toBe('FV-2-1524')

    const update = updateBuilder.update.mock.calls[0][0]
    expect(update).toMatchObject({ facturacion_estado: 'facturada', factura_numero: 'FV-2-1524', facturada_por: 'logistica@encompasslatam.com' })
    expect(typeof update.facturada_at).toBe('string')
    // Guard atómico sobre el estado
    expect(updateBuilder.eq).toHaveBeenCalledWith('estado', 'completada')

    const evento = eventosBuilder.insert.mock.calls[0][0]
    expect(evento).toMatchObject({
      solicitud_id: ID,
      tipo: 'nota_admin',
      actor: 'logistica@encompasslatam.com',
      payload: { origen: 'facturacion_estado', rol: 'lectura', despues: { facturacion_estado: 'facturada', factura_numero: 'FV-2-1524' } },
    })
  })

  it('admin → 200 con rol admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'jdguerron@bairdservice.com' } } })
    mockTablas({
      solicitud: { data: COMPLETADA, error: null },
      update: { data: { ...COMPLETADA, facturacion_estado: 'no_aplica' }, error: null },
    })
    const res = await POST(req({ solicitud_id: ID, facturacion_estado: 'no_aplica' }, 'tok'))
    expect(res.status).toBe(200)
    expect((await res.json()).rol).toBe('admin')
  })
})

describe('POST /api/admin/facturacion-estado — reglas', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'jdguerron@bairdservice.com' } } })
  })

  it('body inválido → 400', async () => {
    mockTablas({ solicitud: { data: COMPLETADA, error: null } })
    const res = await POST(req({ solicitud_id: 'x', facturacion_estado: 'facturada' }, 'tok'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('facturada sin número → 400 sin escribir', async () => {
    const { updateBuilder } = mockTablas({ solicitud: { data: COMPLETADA, error: null } })
    const res = await POST(req({ solicitud_id: ID, facturacion_estado: 'facturada' }, 'tok'))
    expect(res.status).toBe(400)
    expect(updateBuilder.update).not.toHaveBeenCalled()
  })

  it('solicitud no completada → 409 sin escribir', async () => {
    const { updateBuilder } = mockTablas({ solicitud: { data: { ...COMPLETADA, estado: 'en_proceso' }, error: null } })
    const res = await POST(req(BODY, 'tok'))
    expect(res.status).toBe(409)
    expect(updateBuilder.update).not.toHaveBeenCalled()
  })

  it('solicitud inexistente → 404', async () => {
    mockTablas({ solicitud: { data: null, error: null } })
    const res = await POST(req(BODY, 'tok'))
    expect(res.status).toBe(404)
  })

  it('si dejó de estar completada entre el select y el update → 409', async () => {
    mockTablas({ solicitud: { data: COMPLETADA, error: null }, update: { data: null, error: null } })
    const res = await POST(req(BODY, 'tok'))
    expect(res.status).toBe(409)
  })
})
