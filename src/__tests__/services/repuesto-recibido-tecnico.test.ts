import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-10-23: el técnico marca "Llegó el repuesto" desde su portal
// (esperando_repuesto | repuesto_en_camino → repuesto_recibido) y "Completar
// servicio" ya no se bloquea por un repuesto pendiente.

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))

const { mockRecibidoCliente, mockCambioEstado } = vi.hoisted(() => ({
  mockRecibidoCliente: vi.fn(),
  mockCambioEstado: vi.fn(),
}))
vi.mock('@/lib/services/whatsapp.service', () => ({
  enviarRepuestoRecibidoCliente: mockRecibidoCliente,
  notificarCambioEstado: mockCambioEstado,
}))

import {
  marcarRepuestoRecibidoPorTecnico,
  cerrarRepuestosPendientes,
} from '@/lib/services/repuesto-recibido.service'
import {
  ESTADOS_REPUESTO_COMPLETABLES,
  ESTADOS_REPUESTO_MARCABLE_TECNICO,
} from '@/lib/constants/estados'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: { data: any; error: any }): any {
  const methods = ['select', 'eq', 'in', 'is', 'neq', 'insert', 'update', 'order', 'limit']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.single = vi.fn().mockResolvedValue(resolved)
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved)
  return builder
}

const TEC = { tecnicoId: 'tec-1', tecnicoNombre: 'Néstor Bonilla' }

function mockTablas(opts: {
  sol: Record<string, unknown> | null
  updateGana?: boolean
  repuestosCerrados?: number
}) {
  const solBuilder = queryBuilder({ data: opts.sol, error: null })
  // El UPDATE atómico devuelve la fila si "ganó" la transición.
  const updBuilder = queryBuilder({ data: opts.updateGana === false ? null : { id: opts.sol?.id }, error: null })
  const repBuilder = queryBuilder({
    data: Array.from({ length: opts.repuestosCerrados ?? 1 }, (_, i) => ({ id: `rep-${i}` })),
    error: null,
  })
  const evBuilder = queryBuilder({ data: null, error: null })
  let solCalls = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'solicitudes_servicio') return solCalls++ === 0 ? solBuilder : updBuilder
    if (table === 'repuestos_pendientes') return repBuilder
    if (table === 'solicitud_eventos') return evBuilder
    return queryBuilder({ data: null, error: null })
  })
  return { solBuilder, updBuilder, repBuilder, evBuilder }
}

describe('marcarRepuestoRecibidoPorTecnico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecibidoCliente.mockResolvedValue({ ok: true })
    mockCambioEstado.mockResolvedValue(undefined)
  })

  it('404 si la solicitud no existe', async () => {
    mockTablas({ sol: null })
    const r = await marcarRepuestoRecibidoPorTecnico('x', TEC)
    expect(r).toMatchObject({ ok: false, status: 404 })
    expect(mockRecibidoCliente).not.toHaveBeenCalled()
  })

  it('403 si el servicio es de otro técnico', async () => {
    mockTablas({ sol: { id: 's1', estado: 'esperando_repuesto', tecnico_asignado_id: 'otro', reprogramacion_token: null } })
    const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
    expect(r).toMatchObject({ ok: false, status: 403 })
    expect(mockRecibidoCliente).not.toHaveBeenCalled()
  })

  it('400 si el servicio no está en el ciclo marcable (p.ej. ya repuesto_recibido o en_proceso)', async () => {
    for (const estado of ['repuesto_recibido', 'en_proceso', 'asignada', 'completada']) {
      vi.clearAllMocks()
      mockTablas({ sol: { id: 's1', estado, tecnico_asignado_id: 'tec-1', reprogramacion_token: null } })
      const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
      expect(r, estado).toMatchObject({ ok: false, status: 400 })
      expect(mockCambioEstado).not.toHaveBeenCalled()
    }
  })

  it('esperando_repuesto → repuesto_recibido: cierra repuestos, avisa al cliente, evento actor tecnico, supervisores sin duplicar evento', async () => {
    const { updBuilder, repBuilder, evBuilder } = mockTablas({
      sol: { id: 's1', estado: 'esperando_repuesto', tecnico_asignado_id: 'tec-1', reprogramacion_token: null },
    })
    const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
    expect(r).toMatchObject({ ok: true, estadoPrevio: 'esperando_repuesto', clienteNotificado: true })

    // repuestos_pendientes: pendiente → recibido (solo los pendientes)
    expect(repBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'recibido' }))
    expect(repBuilder.eq).toHaveBeenCalledWith('estado', 'pendiente')

    // transición atómica con guard .in sobre los estados marcables
    const upd = updBuilder.update.mock.calls[0][0]
    expect(upd.estado).toBe('repuesto_recibido')
    expect(typeof upd.reprogramacion_token).toBe('string')
    expect(upd.repuesto_recibido_at).toBeTruthy()
    expect(updBuilder.in).toHaveBeenCalledWith('estado', ['esperando_repuesto', 'repuesto_en_camino'])

    expect(mockRecibidoCliente).toHaveBeenCalledWith('s1')
    expect(evBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'cambio_estado',
      actor: 'tecnico',
      estado_previo: 'esperando_repuesto',
      estado_nuevo: 'repuesto_recibido',
      payload: { origen: 'portal_tecnico' },
    }))
    expect(mockCambioEstado).toHaveBeenCalledWith('s1', 'esperando_repuesto', 'repuesto_recibido', { registrarEvento: false })
  })

  it('repuesto_en_camino: reusa el reprogramacion_token existente (el botón del cliente sigue vivo)', async () => {
    const { updBuilder } = mockTablas({
      sol: { id: 's1', estado: 'repuesto_en_camino', tecnico_asignado_id: 'tec-1', reprogramacion_token: 'tok-viejo' },
    })
    const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
    expect(r).toMatchObject({ ok: true, estadoPrevio: 'repuesto_en_camino' })
    expect(updBuilder.update.mock.calls[0][0].reprogramacion_token).toBe('tok-viejo')
  })

  it('409 si otro actor ganó la transición (UPDATE no devuelve fila) — sin notificar', async () => {
    mockTablas({
      sol: { id: 's1', estado: 'esperando_repuesto', tecnico_asignado_id: 'tec-1', reprogramacion_token: null },
      updateGana: false,
    })
    const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(mockRecibidoCliente).not.toHaveBeenCalled()
    expect(mockCambioEstado).not.toHaveBeenCalled()
  })

  it('si el aviso al cliente falla, la transición igual queda hecha (clienteNotificado=false)', async () => {
    mockRecibidoCliente.mockResolvedValue({ ok: false, error: 'WhatsApp caído' })
    mockTablas({ sol: { id: 's1', estado: 'esperando_repuesto', tecnico_asignado_id: 'tec-1', reprogramacion_token: null } })
    const r = await marcarRepuestoRecibidoPorTecnico('s1', TEC)
    expect(r).toMatchObject({ ok: true, clienteNotificado: false })
    expect(mockCambioEstado).toHaveBeenCalled()
  })
})

describe('cerrarRepuestosPendientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve cuántas filas pasaron a recibido', async () => {
    const { repBuilder } = mockTablas({ sol: null, repuestosCerrados: 2 })
    expect(await cerrarRepuestosPendientes('s1')).toBe(2)
    expect(repBuilder.eq).toHaveBeenCalledWith('solicitud_id', 's1')
  })

  it('nunca lanza: ante error de BD devuelve 0', async () => {
    mockFrom.mockImplementation(() => queryBuilder({ data: null, error: { message: 'boom' } }))
    expect(await cerrarRepuestosPendientes('s1')).toBe(0)
  })
})

describe('sets de estados del ciclo de repuesto (portal del técnico)', () => {
  it('el técnico puede marcar "Llegó el repuesto" solo antes de repuesto_recibido', () => {
    expect([...ESTADOS_REPUESTO_MARCABLE_TECNICO].sort()).toEqual(['esperando_repuesto', 'repuesto_en_camino'])
  })
  it('"Completar servicio" se habilita en los tres estados de repuesto', () => {
    expect([...ESTADOS_REPUESTO_COMPLETABLES].sort()).toEqual(['esperando_repuesto', 'repuesto_en_camino', 'repuesto_recibido'])
  })
})
