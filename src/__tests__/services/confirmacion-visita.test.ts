import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockNotificarTecnicos, mockNotificarCambioEstado, mockEnviarTexto, mockEnviarPlantilla } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockNotificarTecnicos: vi.fn(),
  mockNotificarCambioEstado: vi.fn(),
  mockEnviarTexto: vi.fn(),
  mockEnviarPlantilla: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

vi.mock('@/lib/services/whatsapp.service', () => ({
  notificarTecnicos: mockNotificarTecnicos,
  notificarCambioEstado: mockNotificarCambioEstado,
  enviarMensajeTexto: mockEnviarTexto,
  enviarPlantilla: mockEnviarPlantilla,
  isPhoneAllowed: () => true,
  sanitizarParametroPlantilla: (s: unknown) => String(s ?? ''),
}))

import { confirmarVisita, liberarTecnico } from '@/lib/services/confirmacion-visita.service'

// Builder encadenable: cualquier método devuelve el builder; `await` y
// `.single()` resuelven con `resolved`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(resolved: { data: any; error: any }): any {
  const methods = ['select', 'eq', 'in', 'is', 'not', 'gte', 'lt', 'insert', 'update', 'order', 'limit']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of methods) b[m] = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue(resolved)
  return b
}

/** Cola de builders por tabla: cada `from(tabla)` consume el siguiente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function colas(spec: Record<string, any[]>) {
  const copia: Record<string, unknown[]> = Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, [...v]]))
  mockFrom.mockImplementation((tabla: string) => {
    const b = copia[tabla]?.shift()
    if (!b) throw new Error(`from('${tabla}') inesperado`)
    return b
  })
}

const SOL = {
  id: 'sol-1',
  estado: 'asignada',
  tecnico_asignado_id: 'tec-1',
  fecha_visita_at: '2099-10-23T13:00:00.000Z',
  horario_confirmado: 'jueves, 23 de octubre · 8am-12pm',
  tecnico_liberado_count: 0,
  cliente_nombre: 'Juan Pérez',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'Mabe',
  visita_confirmada_at: null,
}

const TEC = { id: 'tec-1', nombre_completo: 'Carlos Bonilla', whatsapp: '573001234567' }

describe('liberarTecnico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificarTecnicos.mockResolvedValue({ notificados: 2, matched: 3, errors: [] })
    mockNotificarCambioEstado.mockResolvedValue(undefined)
    mockEnviarTexto.mockResolvedValue(undefined)
  })

  it('rechaza si el servicio no está en asignada (ya hubo diagnóstico)', async () => {
    colas({ solicitudes_servicio: [builder({ data: { ...SOL, estado: 'en_proceso' }, error: null })] })
    const r = await liberarTecnico('sol-1', { motivo: 'admin', actor: 'admin@baird.com' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/asignada/)
    expect(mockNotificarTecnicos).not.toHaveBeenCalled()
  })

  it('rechaza si el técnico que pide no es el asignado', async () => {
    colas({ solicitudes_servicio: [builder({ data: SOL, error: null })] })
    const r = await liberarTecnico('sol-1', { motivo: 'no_alcanzo', actor: 'Otro', tecnicoId: 'tec-999' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no está asignado a ti/)
  })

  it('"No alcanzo": suelta, deja evento y reoferta URGENTE excluyendo al técnico (sin texto al técnico)', async () => {
    const update = builder({ data: [{ id: 'sol-1' }], error: null })
    const evento = builder({ data: null, error: null })
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), update],
      tecnicos: [builder({ data: TEC, error: null })],
      solicitud_eventos: [evento],
    })

    const r = await liberarTecnico('sol-1', { motivo: 'no_alcanzo', actor: 'Carlos Bonilla', tecnicoId: 'tec-1', detalle: 'Se me cruzó otro trabajo' })

    expect(r.ok).toBe(true)
    expect(r.tecnicoNombre).toBe('Carlos Bonilla')
    expect(update.update).toHaveBeenCalledWith({ tecnico_asignado_id: null, estado: 'notificada', tecnico_liberado_count: 1 })
    // Condicionado al técnico y estado leídos (atómico)
    expect(update.eq).toHaveBeenCalledWith('tecnico_asignado_id', 'tec-1')
    expect(update.eq).toHaveBeenCalledWith('estado', 'asignada')
    expect(evento.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'tecnico_liberado',
      estado_previo: 'asignada',
      estado_nuevo: 'notificada',
      actor: 'tecnico',
      payload: expect.objectContaining({ tecnico_id: 'tec-1', motivo: 'no_alcanzo', detalle: 'Se me cruzó otro trabajo' }),
    }))
    expect(mockNotificarCambioEstado).toHaveBeenCalledWith('sol-1', 'asignada', 'notificada')
    expect(mockNotificarTecnicos).toHaveBeenCalledWith('sol-1', { excluirTecnicoId: 'tec-1', urgente: true })
    expect(r.reoferta?.notificados).toBe(2)
    expect(mockEnviarTexto).not.toHaveBeenCalled()
  })

  it('liberación por el admin: avisa al técnico por texto libre (best-effort)', async () => {
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), builder({ data: [{ id: 'sol-1' }], error: null })],
      tecnicos: [builder({ data: TEC, error: null })],
      solicitud_eventos: [builder({ data: null, error: null })],
    })
    mockEnviarTexto.mockRejectedValueOnce(new Error('131047 ventana cerrada'))

    const r = await liberarTecnico('sol-1', { motivo: 'admin', actor: 'admin@baird.com' })
    expect(r.ok).toBe(true)
    expect(mockEnviarTexto).toHaveBeenCalledWith('573001234567', expect.stringContaining('Baird liberó el servicio de Juan Pérez'))
    // El fallo del texto no rompe la liberación ni la reoferta
    expect(mockNotificarTecnicos).toHaveBeenCalledTimes(1)
  })

  it('si el UPDATE no afecta filas (alguien se adelantó) no reoferta', async () => {
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), builder({ data: [], error: null })],
      tecnicos: [builder({ data: TEC, error: null })],
    })
    const r = await liberarTecnico('sol-1', { motivo: 'admin', actor: 'admin@baird.com' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/cambió mientras tanto/)
    expect(mockNotificarTecnicos).not.toHaveBeenCalled()
  })

  it('reofertar: false → suelta sin notificar técnicos', async () => {
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), builder({ data: [{ id: 'sol-1' }], error: null })],
      tecnicos: [builder({ data: TEC, error: null })],
      solicitud_eventos: [builder({ data: null, error: null })],
    })
    const r = await liberarTecnico('sol-1', { motivo: 'admin', actor: 'admin@baird.com', reofertar: false })
    expect(r.ok).toBe(true)
    expect(r.reoferta).toBeUndefined()
    expect(mockNotificarTecnicos).not.toHaveBeenCalled()
  })
})

describe('confirmarVisita', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marca confirmada por el técnico y deja evento', async () => {
    const update = builder({ data: null, error: null })
    const evento = builder({ data: null, error: null })
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), update],
      solicitud_eventos: [evento],
    })
    const r = await confirmarVisita('sol-1', { por: 'tecnico', actor: 'Carlos Bonilla', tecnicoId: 'tec-1' })
    expect(r.ok).toBe(true)
    expect(r.yaEstaba).toBeUndefined()
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ visita_confirmada_por: 'tecnico' }))
    expect(evento.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'visita_confirmada', actor: 'tecnico' }))
  })

  it('idempotente: ya confirmada → ok con yaEstaba', async () => {
    colas({ solicitudes_servicio: [builder({ data: { ...SOL, visita_confirmada_at: '2026-10-22T20:00:00Z' }, error: null })] })
    const r = await confirmarVisita('sol-1', { por: 'admin', actor: 'admin@baird.com' })
    expect(r).toEqual({ ok: true, yaEstaba: true })
  })

  it('rechaza visita pasada, sin técnico, o de otro técnico', async () => {
    colas({ solicitudes_servicio: [builder({ data: { ...SOL, fecha_visita_at: '2020-01-01T13:00:00Z' }, error: null })] })
    expect((await confirmarVisita('sol-1', { por: 'admin', actor: 'a' })).error).toMatch(/ya pasó/)

    colas({ solicitudes_servicio: [builder({ data: { ...SOL, tecnico_asignado_id: null }, error: null })] })
    expect((await confirmarVisita('sol-1', { por: 'admin', actor: 'a' })).error).toMatch(/sin técnico|no tiene técnico/)

    colas({ solicitudes_servicio: [builder({ data: SOL, error: null })] })
    expect((await confirmarVisita('sol-1', { por: 'tecnico', actor: 'x', tecnicoId: 'tec-2' })).error).toMatch(/no está asignado a ti/)
  })
})
