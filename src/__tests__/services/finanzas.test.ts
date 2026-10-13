import { describe, it, expect } from 'vitest'
import { calcularResumenFinanciero, cifrasServicio, type SolicitudFinanzas } from '@/lib/services/finanzas.service'
import { calcularTarifaMABE } from '@/lib/constants/tarifas/mabe'

function sol(partial: Partial<SolicitudFinanzas> & { id: string; es_garantia: boolean }): SolicitudFinanzas {
  return {
    created_at: '2026-09-01T12:00:00Z',
    tipo_equipo: 'Lavadora',
    tipo_solicitud: 'Reparación',
    estado: 'completada',
    pago_tecnico: null,
    triaje_resultado: null,
    cotizacion: null,
    recargo_weekend_aplicado: null,
    cumple_ta: null,
    diagnosticado_at: null,
    siguiente_paso: null,
    siguiente_paso_at: null,
    repuesto_recibido_at: null,
    ...partial,
  }
}

describe('finanzas.service — cifrasServicio', () => {
  it('garantía con complejidad: venta = total MABE, costo = pago consolidado', () => {
    const s = sol({ id: 'g1', es_garantia: true, triaje_resultado: { complejidad: 'media' }, cumple_ta: true })
    const c = cifrasServicio(s, undefined, '2026-09-03T12:00:00Z')
    const r = calcularTarifaMABE({ complejidad: 'media', diasSolucion: 2, cumpleTA: true, cumpleEncuesta: false, esFinDeSemana: false })
    expect(c.ventas).toBe(r.totalMABE)
    expect(c.pagoTecnico).toBe(r.pagoTecnico)
    expect(c.ventas - c.pagoTecnico).toBe(r.margenBaird)
    expect(c.estimado).toBe(false)
  })

  it('garantía sin complejidad: estima la venta desde el pago proyectado (÷ 0,78)', () => {
    const s = sol({ id: 'g2', es_garantia: true, pago_tecnico: 39000 })
    const c = cifrasServicio(s, undefined, '2026-09-03T12:00:00Z')
    expect(c.estimado).toBe(true)
    expect(c.pagoTecnico).toBe(39000)
    expect(c.ventas).toBe(50000)
  })

  it('particular con cotización: venta = base_venta persistida, costo = pago_tecnico', () => {
    const s = sol({
      id: 'p1',
      es_garantia: false,
      pago_tecnico: 100000,
      cotizacion: { total: 134470, base_venta: 113000, iva_venta: 21470 },
    })
    const c = cifrasServicio(s, undefined, '2026-09-03T12:00:00Z')
    expect(c.ventas).toBe(113000)
    expect(c.ventasConIva).toBe(134470)
    expect(c.pagoTecnico).toBe(100000)
  })

  it('particular sin base_venta: deriva la base del total con IVA', () => {
    const s = sol({ id: 'p2', es_garantia: false, pago_tecnico: 50000, cotizacion: { total: 119000 } })
    const c = cifrasServicio(s, undefined, '2026-09-03T12:00:00Z')
    expect(c.ventas).toBe(100000)
    expect(c.ventasConIva).toBe(119000)
  })
})

describe('finanzas.service — calcularResumenFinanciero', () => {
  const solicitudes: SolicitudFinanzas[] = [
    sol({ id: 'g1', es_garantia: true, triaje_resultado: { complejidad: 'baja' }, cumple_ta: true }),
    sol({ id: 'p1', es_garantia: false, pago_tecnico: 100000, cotizacion: { total: 134470, base_venta: 113000 } }),
    sol({ id: 'p2', es_garantia: false, pago_tecnico: 50000, cotizacion: { total: 119000 }, created_at: '2026-10-02T12:00:00Z' }),
    sol({ id: 'x1', es_garantia: false, estado: 'asignada', pago_tecnico: 999999, cotizacion: { total: 9999999 } }),
  ]
  const evidencias = [
    { solicitud_id: 'g1', completado_at: '2026-09-05T15:00:00Z', confirmado: true, confirmado_at: null, cliente_comentario: 'Calificacion: 9/10' },
    { solicitud_id: 'p1', completado_at: '2026-09-20T15:00:00Z', confirmado: null, confirmado_at: null, cliente_comentario: null },
    { solicitud_id: 'p2', completado_at: '2026-10-03T15:00:00Z', confirmado: null, confirmado_at: null, cliente_comentario: null },
  ]
  const pagos = [
    { solicitud_id: 'p1', monto: 40000 },
    { solicitud_id: 'p1', monto: 94470 },
  ]

  it('ignora no completadas, agrupa por mes de cierre y parte por flujo', () => {
    const r = calcularResumenFinanciero({ solicitudes, evidencias, pagos, desde: '2026-01-01', hasta: '2026-12-31' })
    const g = calcularTarifaMABE({ complejidad: 'baja', diasSolucion: 4.1, cumpleTA: true, cumpleEncuesta: true, esFinDeSemana: false })

    expect(r.periodo.total.servicios).toBe(3)
    expect(r.periodo.garantia.servicios).toBe(1)
    expect(r.periodo.particular.servicios).toBe(2)
    expect(r.periodo.garantia.ventas).toBe(g.totalMABE)
    expect(r.periodo.garantia.utilidad).toBe(g.margenBaird)
    expect(r.periodo.particular.ventas).toBe(213000)
    expect(r.periodo.particular.pagoTecnicos).toBe(150000)
    expect(r.periodo.particular.utilidad).toBe(63000)
    expect(r.periodo.particular.recaudadoOnline).toBe(134470)
    expect(r.periodo.total.utilidad).toBe(g.margenBaird + 63000)
    expect(r.periodo.total.margen).toBeCloseTo((g.margenBaird + 63000) / (g.totalMABE + 213000), 6)
    expect(r.periodo.mix.serviciosGarantia).toBeCloseTo(1 / 3, 6)
    expect(r.periodo.mix.ventasGarantia + r.periodo.mix.ventasParticular).toBeCloseTo(1, 6)

    expect(r.meses.map((m) => m.mes)).toEqual(['2026-09', '2026-10'])
    expect(r.meses[0].total.servicios).toBe(2)
    expect(r.meses[1].total.servicios).toBe(1)
    expect(r.meses[1].particular.utilidad).toBe(50000)
  })

  it('respeta el rango de fechas por día de cierre (Colombia)', () => {
    const r = calcularResumenFinanciero({ solicitudes, evidencias, pagos, desde: '2026-10-01', hasta: '2026-10-31' })
    expect(r.periodo.total.servicios).toBe(1)
    expect(r.periodo.garantia.servicios).toBe(0)
    expect(r.periodo.garantia.margen).toBe(0)
    expect(r.periodo.mix.ventasGarantia).toBe(0)
    expect(r.periodo.mix.ventasParticular).toBe(1)
  })

  it('sin servicios devuelve ceros sin dividir por cero', () => {
    const r = calcularResumenFinanciero({ solicitudes: [], evidencias: [], desde: '2026-01-01', hasta: '2026-12-31' })
    expect(r.periodo.total.servicios).toBe(0)
    expect(r.periodo.total.margen).toBe(0)
    expect(r.meses).toEqual([])
  })
})
