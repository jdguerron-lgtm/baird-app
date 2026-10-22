/**
 * Una fecha de visita YA PASADA se rechaza en TODOS los puntos de entrada
 * (pedido de Juan 2026-10-22: "no permitas que se reserve en fechas que ya
 * pasaron"). Todos pasan por validarHorarioAgendable → validarFechaVisita.
 *
 * Caso real: orden 9415568723 — el técnico aceptó eligiendo una opción del
 * cliente ya vencida ("sábado, 29 de agosto") y parsearFechaVisita la mandó a
 * 2027-08-29. Aquí se verifica que cada vía corta ANTES de escribir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockFetch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.stubGlobal('fetch', mockFetch)

import { confirmarHorarioSolicitud, reprogramarRepuestoSolicitud } from '@/lib/services/transiciones.service'
import { procesarAceptacion, procesarReagendamientoCliente } from '@/lib/services/whatsapp.service'
import { fechaColombiaMasDias } from '@/lib/utils/fecha-visita'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "YYYY-MM-DD" → texto canónico del HorarioSelector: "lunes, D de MES · franja" */
function horarioTexto(ymd: string, franja = '8am-12pm'): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `lunes, ${d} de ${MESES[m - 1]} · ${franja}`
}

const HORARIO_PASADO = horarioTexto(fechaColombiaMasDias(-10))
const HORARIO_FUTURO = horarioTexto(fechaColombiaMasDias(5))

/** Builder encadenable por tabla; registra `update` para afirmar que NO se escribió. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tabla(single: { data: any; error: any }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  }
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'insert', 'update']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockResolvedValue(single)
  return b
}

describe('fecha pasada rechazada en cada punto de entrada', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tablas: Record<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'msg-1' }] }) })
    tablas = {}
    mockFrom.mockImplementation((nombre: string) => {
      if (!tablas[nombre]) throw new Error(`tabla no esperada en el test: ${nombre}`)
      return tablas[nombre]
    })
  })

  it('confirmar-horario del cliente (confirmarHorarioSolicitud)', async () => {
    tablas.solicitudes_servicio = tabla({
      data: { id: 'sol-1', estado: 'pendiente_horario', horario_confirmado_at: null, fecha_visita_at: null, tecnico_asignado_id: null },
      error: null,
    })
    const r = await confirmarHorarioSolicitud('tok-horario', HORARIO_PASADO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.httpStatus).toBe(400)
      expect(r.body.error).toContain('ya pasó')
    }
    expect(tablas.solicitudes_servicio.update).not.toHaveBeenCalled()
  })

  it('reprogramación tras repuesto (reprogramarRepuestoSolicitud)', async () => {
    tablas.solicitudes_servicio = tabla({ data: { id: 'sol-2', estado: 'repuesto_recibido' }, error: null })
    const r = await reprogramarRepuestoSolicitud('tok-repuesto', HORARIO_PASADO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.httpStatus).toBe(400)
      expect(r.body.error).toContain('ya pasó')
    }
    expect(tablas.solicitudes_servicio.update).not.toHaveBeenCalled()
  })

  it('aceptación del técnico eligiendo el "otro horario" ya vencido (caso 9415568723)', async () => {
    tablas.notificaciones_whatsapp = tabla({
      data: { solicitud_id: 'sol-3', tecnico_id: 'tec-1', estado: 'enviado', enviado_at: new Date().toISOString() },
      error: null,
    })
    tablas.solicitudes_servicio = tabla({
      data: {
        id: 'sol-3',
        horario_visita_1: HORARIO_PASADO,
        horario_visita_2: HORARIO_FUTURO,
        horario_confirmado: HORARIO_FUTURO,
        fecha_visita_at: null,
      },
      error: null,
    })
    const r = await procesarAceptacion('tok-aceptar', 1)
    expect(r.ganado).toBe(false)
    expect(r.reintentar).toBe(true)
    expect(r.mensaje).toContain('ya pasó')
    // No se asignó ni se tocó el horario.
    expect(tablas.solicitudes_servicio.update).not.toHaveBeenCalled()
    expect(tablas.notificaciones_whatsapp.update).not.toHaveBeenCalled()
  })

  it('reagendamiento por link del cliente (procesarReagendamientoCliente)', async () => {
    tablas.solicitudes_servicio = tabla({
      data: {
        id: 'sol-4', estado: 'asignada', tecnico_asignado_id: 'tec-1',
        cliente_telefono: '573001234567', cliente_nombre: 'María', tipo_equipo: 'Lavadora', marca_equipo: 'LG',
        horario_confirmado: HORARIO_FUTURO, reagendamientos_count: 0, es_garantia: false, numero_serie_factura: null,
      },
      error: null,
    })
    const r = await procesarReagendamientoCliente('tok-cliente', HORARIO_PASADO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ya pasó')
    expect(tablas.solicitudes_servicio.update).not.toHaveBeenCalled()
  })
})
