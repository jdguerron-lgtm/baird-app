import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { validarHorarioAgendable, franjasLlenasParaFecha } from '@/lib/services/agenda.service'
import { MAX_RESERVAS_POR_FRANJA } from '@/lib/constants/franjas'
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
      { fecha_visita_at: isoSlot(ymd, 8) },
      { fecha_visita_at: isoSlot(ymd, 8) },
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

/** Hoy (YYYY-MM-DD) en TZ Colombia — mismo helper que usa la app. */
function fechaColombiaYMDHoy(): string {
  return fechaColombiaMasDias(0)
}
