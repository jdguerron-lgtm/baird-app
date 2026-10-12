import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

// agenda.service lee con service_role desde la Fase 1 de RLS (commit 2353b3a):
// el mock tiene que apuntar a supabase-admin, no al cliente anon.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

import {
  validarHorarioAgendable,
  franjasLlenasParaFecha,
  tecnicoOcupadoEnSlot,
  ocupacionTecnicoEnSlot,
} from '@/lib/services/agenda.service'
import { MAX_RESERVAS_POR_FRANJA, MAX_SERVICIOS_TECNICO_POR_FRANJA } from '@/lib/constants/franjas'
import { fechaColombiaMasDias } from '@/lib/utils/fecha-visita'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "YYYY-MM-DD" → texto canónico de HorarioSelector: "lunes, D de MES · franja" */
function horarioTexto(ymd: string, franja = '8am-12pm'): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `lunes, ${d} de ${MESES[m - 1]} · ${franja}`
}

/** ISO del slot (inicio de franja en hora CO) — espejo de agenda.service. */
function isoSlot(ymd: string, horaInicio: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, horaInicio + 5, 0, 0)).toISOString()
}

// Builder encadenable cuyo await resuelve el valor dado (count o data).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: Record<string, unknown>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve),
  }
  for (const m of ['select', 'eq', 'neq', 'not', 'in']) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  return builder
}

describe('validarHorarioAgendable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(queryBuilder({ count: 0, error: null }))
  })

  it('rechaza el mismo día (hoy en TZ Colombia)', async () => {
    const r = await validarHorarioAgendable(horarioTexto(fechaColombiaYMDHoy()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('mismo día')
    // Corta antes de consultar cupo
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('acepta mañana cuando la franja tiene cupo', async () => {
    mockFrom.mockReturnValue(queryBuilder({ count: MAX_RESERVAS_POR_FRANJA - 1, error: null }))
    const ymd = fechaColombiaMasDias(2)
    const r = await validarHorarioAgendable(horarioTexto(ymd))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.fechaVisitaAt).toBe(isoSlot(ymd, 8))
  })

  it('rechaza cuando la franja ya tiene el cupo máximo', async () => {
    mockFrom.mockReturnValue(queryBuilder({ count: MAX_RESERVAS_POR_FRANJA, error: null }))
    const r = await validarHorarioAgendable(horarioTexto(fechaColombiaMasDias(2)))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('llena')
  })

  it('deja pasar texto libre no parseable (sugerencias del formulario)', async () => {
    const r = await validarHorarioAgendable('Lo antes posible, en la mañana')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.fechaVisitaAt).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fail-open: si el conteo falla no bloquea el agendamiento', async () => {
    mockFrom.mockReturnValue(queryBuilder({ count: null, error: { message: 'boom' } }))
    const r = await validarHorarioAgendable(horarioTexto(fechaColombiaMasDias(2)))
    expect(r.ok).toBe(true)
  })
})

describe('franjasLlenasParaFecha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marca llena solo la franja con cupo agotado', async () => {
    const ymd = fechaColombiaMasDias(3)
    const filas = [
      ...Array.from({ length: MAX_RESERVAS_POR_FRANJA }, () => ({ fecha_visita_at: isoSlot(ymd, 8) })),
      { fecha_visita_at: isoSlot(ymd, 12) },
    ]
    mockFrom.mockReturnValue(queryBuilder({ data: filas, error: null }))

    const llenas = await franjasLlenasParaFecha(ymd)
    expect(llenas).toEqual(['8am-12pm'])
  })

  it('fail-open: ante error de BD devuelve []', async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: { message: 'boom' } }))
    const llenas = await franjasLlenasParaFecha(fechaColombiaMasDias(3))
    expect(llenas).toEqual([])
  })
})

describe('tecnicoOcupadoEnSlot (cupo por técnico = MAX_SERVICIOS_TECNICO_POR_FRANJA)', () => {
  const YMD = fechaColombiaMasDias(2)
  const SLOT = isoSlot(YMD, 8)
  const CUPO = MAX_SERVICIOS_TECNICO_POR_FRANJA

  /** Mock por tabla: servicios → count, bloqueos → filas. */
  function mockTablas(servicios: number | null, bloqueos: { bloquea_franja: boolean }[] | null, errorServicios = false) {
    const builders: Record<string, ReturnType<typeof queryBuilder>> = {
      solicitudes_servicio: queryBuilder(
        errorServicios ? { count: null, error: { message: 'boom' } } : { count: servicios, error: null },
      ),
      agenda_tecnico_bloqueos: queryBuilder(
        bloqueos === null ? { data: null, error: { message: 'boom' } } : { data: bloqueos, error: null },
      ),
    }
    mockFrom.mockImplementation((tabla: string) => builders[tabla])
    return builders
  }

  beforeEach(() => vi.clearAllMocks())

  it('false con un solo servicio en el slot (ya no bloquea desde 2026-10-11)', async () => {
    mockTablas(1, [])
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(false)
  })

  it('true cuando ya tiene el cupo completo de servicios Baird', async () => {
    mockTablas(CUPO, [])
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(true)
  })

  it('suma los bloqueos externos al conteo', async () => {
    mockTablas(CUPO - 1, [{ bloquea_franja: false }])
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(true)
  })

  it('true si un bloqueo cierra la franja aunque haya cupo', async () => {
    mockTablas(0, [{ bloquea_franja: true }])
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(true)
  })

  it('consulta los bloqueos por el día CO y la franja del slot', async () => {
    const b = mockTablas(0, [])
    await tecnicoOcupadoEnSlot('tec-1', SLOT)
    expect(b.agenda_tecnico_bloqueos.eq).toHaveBeenCalledWith('tecnico_id', 'tec-1')
    expect(b.agenda_tecnico_bloqueos.eq).toHaveBeenCalledWith('fecha', YMD)
    expect(b.agenda_tecnico_bloqueos.eq).toHaveBeenCalledWith('franja', '8am-12pm')
  })

  it('false cuando no tiene nada en ese slot', async () => {
    mockTablas(0, [])
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(false)
  })

  it('excluye la propia solicitud (reagendamientos)', async () => {
    const b = mockTablas(0, [])
    await tecnicoOcupadoEnSlot('tec-1', SLOT, 'sol-1')
    expect(b.solicitudes_servicio.neq).toHaveBeenCalledWith('id', 'sol-1')
  })

  it('fail-open: ante error de BD en servicios no bloquea la aceptación', async () => {
    mockTablas(null, [], true)
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(false)
  })

  it('fail-open: ante error en bloqueos solo cuentan los servicios', async () => {
    mockTablas(CUPO - 1, null)
    expect(await tecnicoOcupadoEnSlot('tec-1', SLOT)).toBe(false)
  })

  it('ocupacionTecnicoEnSlot desglosa servicios, bloqueos y cierre', async () => {
    mockTablas(2, [{ bloquea_franja: false }, { bloquea_franja: true }])
    expect(await ocupacionTecnicoEnSlot('tec-1', SLOT)).toEqual({ servicios: 2, bloqueos: 2, cerrado: true, total: 4 })
  })
})

/** Hoy (YYYY-MM-DD) en TZ Colombia — mismo helper que usa la app. */
function fechaColombiaYMDHoy(): string {
  return fechaColombiaMasDias(0)
}
