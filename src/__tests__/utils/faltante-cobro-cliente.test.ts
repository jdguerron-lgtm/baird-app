import { describe, expect, it } from 'vitest'
import { faltanteCobroCliente, type SolicitudParaEtapaPago } from '@/lib/constants/pago-cliente'

/** Botón "Cobrar faltante por WhatsApp" (2026-11-03): qué se debe en cada etapa. */

const base: SolicitudParaEtapaPago = {
  es_garantia: false,
  estado: 'asignada',
  tipo_solicitud: 'Diagnóstico',
  tipo_equipo: 'Lavadora',
  tecnico_asignado_id: 'tec-1',
  cotizacion: null,
  recargo_weekend_aplicado: 0,
  anticipo_pagado_at: null,
  abono_pagado_at: null,
  saldo_pagado_at: null,
  monto_pagado_online: 0,
}
const cotConRepuestos = { total: 220750, aprobado_at: '2026-10-09T21:23:46.221Z', productos_necesarios: [{ sku: 'X', cantidad: 1 }] }
const cotSinRepuestos = { total: 136750, aprobado_at: '2026-08-25T20:59:39.803Z', productos_necesarios: [] }

describe('faltanteCobroCliente', () => {
  it('garantía → null', () => {
    expect(faltanteCobroCliente({ ...base, es_garantia: true })).toBeNull()
  })

  it('asignada sin anticipo (caso 613656b1) → anticipo', () => {
    const f = faltanteCobroCliente(base)
    expect(f?.tipo).toBe('anticipo')
    expect(f!.monto).toBeGreaterThan(0)
  })

  it('sin técnico → null (aún no se cobra)', () => {
    expect(faltanteCobroCliente({ ...base, tecnico_asignado_id: null })).toBeNull()
  })

  it('cotización con repuestos sin abono → abono', () => {
    const f = faltanteCobroCliente({ ...base, estado: 'en_proceso', cotizacion: cotConRepuestos, anticipo_pagado_at: 'x', monto_pagado_online: 42000 })
    expect(f?.tipo).toBe('abono')
  })

  it('cotización sin repuestos aprobada, anticipo pagado → saldo restante', () => {
    const f = faltanteCobroCliente({ ...base, estado: 'en_proceso', cotizacion: cotSinRepuestos, anticipo_pagado_at: 'x', monto_pagado_online: 42000 })
    expect(f).toEqual({ tipo: 'saldo', monto: 136750 - 42000 })
  })

  it('abono pagado y servicio aún en curso → saldo restante igual', () => {
    const f = faltanteCobroCliente({ ...base, estado: 'en_proceso', cotizacion: cotConRepuestos, anticipo_pagado_at: 'x', abono_pagado_at: 'y', monto_pagado_online: 130000 })
    expect(f).toEqual({ tipo: 'saldo', monto: 220750 - 130000 })
  })

  it('cotización enviada sin aprobar (caso 677eaefa) → null', () => {
    const cotEnviada = { total: 843388, productos_necesarios: [] }
    expect(faltanteCobroCliente({ ...base, estado: 'cotizacion_enviada', cotizacion: cotEnviada, anticipo_pagado_at: 'x', monto_pagado_online: 45570 })).toBeNull()
  })

  it('completada con cotización sin aprobado_at → saldo (el servicio ya se hizo)', () => {
    const cot = { total: 846000, productos_necesarios: [] }
    expect(faltanteCobroCliente({ ...base, estado: 'completada', cotizacion: cot })).toEqual({ tipo: 'saldo', monto: 846000 })
  })

  it('mantenimiento asignado con anticipo pagado → saldo del resto', () => {
    const f = faltanteCobroCliente({ ...base, tipo_solicitud: 'Mantenimiento', anticipo_pagado_at: 'x', monto_pagado_online: 63000 })
    expect(f?.tipo).toBe('saldo')
    expect(f!.monto).toBeGreaterThan(0)
  })

  it('completada con todo pagado → null', () => {
    expect(faltanteCobroCliente({ ...base, estado: 'completada', cotizacion: cotSinRepuestos, monto_pagado_online: 136750 })).toBeNull()
  })

  it('diagnóstico con anticipo pagado y sin cotización → null (total desconocido)', () => {
    expect(faltanteCobroCliente({ ...base, estado: 'en_proceso', anticipo_pagado_at: 'x', monto_pagado_online: 42000 })).toBeNull()
  })

  it('cancelada → null', () => {
    expect(faltanteCobroCliente({ ...base, estado: 'cancelada', anticipo_pagado_at: 'x', monto_pagado_online: 42000 })).toBeNull()
  })
})
