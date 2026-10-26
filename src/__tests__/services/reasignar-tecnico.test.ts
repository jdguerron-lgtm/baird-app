import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockAvisar, mockTexto, mockCambioEstado, mockOcupado, mockBloqueos, mockEquipo } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockAvisar: vi.fn(),
  mockTexto: vi.fn(),
  mockCambioEstado: vi.fn(),
  mockOcupado: vi.fn(),
  mockBloqueos: vi.fn(),
  mockEquipo: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/services/whatsapp.service', () => ({
  avisarAsignacionTecnico: mockAvisar,
  enviarMensajeTexto: mockTexto,
  notificarCambioEstado: mockCambioEstado,
}))
vi.mock('@/lib/services/agenda.service', () => ({ tecnicoOcupadoEnSlot: mockOcupado }))
vi.mock('@/lib/services/penalizacion.service', () => ({ obtenerBloqueos: mockBloqueos }))
vi.mock('@/lib/services/equipo.service', () => ({ fijarEquipoPorDefecto: mockEquipo }))

import { reasignarTecnicoManual } from '@/lib/services/reasignar-tecnico.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(resolved: { data: any; error: any }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = { then: (r: (v: unknown) => void) => Promise.resolve(resolved).then(r) }
  for (const m of ['select', 'eq', 'in', 'is', 'update', 'insert']) b[m] = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue(resolved)
  b.maybeSingle = vi.fn().mockResolvedValue(resolved)
  return b
}

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
  es_garantia: true,
  tecnico_asignado_id: 'tec-viejo',
  fecha_visita_at: '2099-10-27T13:00:00.000Z',
  horario_confirmado: 'martes · 8am-12pm',
  cliente_nombre: 'Ana',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'Mabe',
}
const NUEVO = { id: 'tec-nuevo', nombre_completo: 'Pedro Gómez', whatsapp: '573001112233', estado_verificacion: 'verificado' }
const VIEJO = { id: 'tec-viejo', nombre_completo: 'Carlos Bonilla', whatsapp: '573004445566' }

describe('reasignarTecnicoManual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOcupado.mockResolvedValue(false)
    mockBloqueos.mockResolvedValue(new Map())
    mockAvisar.mockResolvedValue(undefined)
    mockTexto.mockResolvedValue(undefined)
  })

  it('cambia el técnico, invalida ofertas, deja evento y avisa a todos (sin repetir anticipo)', async () => {
    const upd = builder({ data: [{ ...SOL, tecnico_asignado_id: 'tec-nuevo' }], error: null })
    const ev = builder({ data: null, error: null })
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), upd],
      tecnicos: [builder({ data: NUEVO, error: null }), builder({ data: VIEJO, error: null })],
      notificaciones_whatsapp: [builder({ data: null, error: null })],
      solicitud_eventos: [ev],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'admin@baird.com', cuentaIncumplimiento: true })
    expect(r.ok).toBe(true)
    expect(r.estadoNuevo).toBe('asignada')
    expect(upd.eq).toHaveBeenCalledWith('tecnico_asignado_id', 'tec-viejo')
    expect(ev.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'nota_admin',
      payload: expect.objectContaining({ origen: 'cambio_tecnico', tecnico_anterior_id: 'tec-viejo', cuenta_incumplimiento: true }),
    }))
    expect(mockAvisar).toHaveBeenCalledWith(expect.anything(), 'tec-nuevo', expect.objectContaining({ incluirAnticipo: false }))
    expect(mockTexto).toHaveBeenCalledWith(VIEJO.whatsapp, expect.stringContaining('reasignó'))
    expect(mockCambioEstado).not.toHaveBeenCalled()
  })

  it('sin técnico previo: notificada → asignada con anticipo incluido', async () => {
    const sol = { ...SOL, estado: 'notificada', tecnico_asignado_id: null, es_garantia: false }
    const upd = builder({ data: [{ ...sol, tecnico_asignado_id: 'tec-nuevo', estado: 'asignada' }], error: null })
    colas({
      solicitudes_servicio: [builder({ data: sol, error: null }), upd],
      tecnicos: [builder({ data: NUEVO, error: null })],
      notificaciones_whatsapp: [builder({ data: null, error: null })],
      solicitud_eventos: [builder({ data: null, error: null })],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'admin@baird.com' })
    expect(r.ok).toBe(true)
    expect(r.estadoNuevo).toBe('asignada')
    expect(upd.is).toHaveBeenCalledWith('tecnico_asignado_id', null)
    expect(mockCambioEstado).toHaveBeenCalledWith('sol-1', 'notificada', 'asignada')
    expect(mockAvisar).toHaveBeenCalledWith(expect.anything(), 'tec-nuevo', expect.objectContaining({ incluirAnticipo: true }))
  })

  it('cupo lleno → código cupo_lleno sin tocar nada', async () => {
    mockOcupado.mockResolvedValue(true)
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null })],
      tecnicos: [builder({ data: NUEVO, error: null })],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'a' })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('cupo_lleno')
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it('bloqueado para garantía → rechaza', async () => {
    mockBloqueos.mockResolvedValue(new Map([['tec-nuevo', { garantia: true, particular: false, nota: null }]]))
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null })],
      tecnicos: [builder({ data: NUEVO, error: null })],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'a' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/bloqueado/)
  })

  it('servicio cerrado → rechaza', async () => {
    colas({ solicitudes_servicio: [builder({ data: { ...SOL, estado: 'completada' }, error: null })] })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'a' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/cerrado/)
  })

  it('conflicto si alguien lo movió entre lectura y escritura', async () => {
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), builder({ data: [], error: null })],
      tecnicos: [builder({ data: NUEVO, error: null }), builder({ data: VIEJO, error: null })],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'a' })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('conflicto')
  })

  it('sin avisos: no manda WhatsApp pero fija el equipo del técnico nuevo', async () => {
    colas({
      solicitudes_servicio: [builder({ data: SOL, error: null }), builder({ data: [{ ...SOL }], error: null })],
      tecnicos: [builder({ data: NUEVO, error: null }), builder({ data: VIEJO, error: null })],
      notificaciones_whatsapp: [builder({ data: null, error: null })],
      solicitud_eventos: [builder({ data: null, error: null })],
    })
    const r = await reasignarTecnicoManual('sol-1', 'tec-nuevo', { actor: 'a', notificar: false })
    expect(r.ok).toBe(true)
    expect(mockAvisar).not.toHaveBeenCalled()
    expect(mockTexto).not.toHaveBeenCalled()
    expect(mockEquipo).toHaveBeenCalledWith('sol-1', 'tec-nuevo')
  })
})
