import { describe, expect, it } from 'vitest'
import {
  etapaPagoCliente,
  pasosPagoCliente,
  totalClienteParaCobro,
  type SolicitudParaEtapaPago,
} from '@/lib/constants/pago-cliente'

/**
 * Etapa de pago (2026-10-11): en qué cobro va el cliente particular.
 * Casos tomados de servicios reales de prod.
 */

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

// Cotización de Lynn Mari Bonilla (2026-10-09): bomba de desagüe, con repuesto.
const cotConRepuestos = {
  total: 220750,
  aprobado_at: '2026-10-09T21:23:46.221Z',
  productos_necesarios: [{ sku: 'WP3363394V', cantidad: 1 }],
}
const cotSinRepuestos = { total: 136750, aprobado_at: '2026-08-25T20:59:39.803Z', productos_necesarios: [] }

describe('etapaPagoCliente', () => {
  it('garantía → null (paga la marca)', () => {
    expect(etapaPagoCliente({ ...base, es_garantia: true })).toBeNull()
  })

  it('sin técnico → sin_cobro (todavía no sale ningún link)', () => {
    expect(etapaPagoCliente({ ...base, estado: 'notificada', tecnico_asignado_id: null })?.etapa).toBe('sin_cobro')
  })

  it('técnico asignado sin anticipo → anticipo_pendiente con el 50% del diagnóstico', () => {
    const r = etapaPagoCliente(base)
    expect(r?.etapa).toBe('anticipo_pendiente')
    expect(r?.porCobrar).toBe(42000)
  })

  it('anticipo pendiente de mantenimiento con recargo dominical: 50% de $133.140', () => {
    const r = etapaPagoCliente({ ...base, tipo_solicitud: 'Mantenimiento', recargo_weekend_aplicado: 6000 })
    expect(r?.etapa).toBe('anticipo_pendiente')
    expect(r?.porCobrar).toBe(66570)
    expect(r?.total).toBe(133140)
  })

  it('anticipo pagado, aún sin cotización → anticipo_pagado', () => {
    const r = etapaPagoCliente({ ...base, anticipo_pagado_at: '2026-10-09T20:49:38Z', monto_pagado_online: 42000 })
    expect(r?.etapa).toBe('anticipo_pagado')
    expect(r?.porCobrar).toBe(0)
  })

  it('cotización enviada pero no aprobada → sigue en anticipo_pagado', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'cotizacion_enviada', cotizacion: { total: 131863 },
      anticipo_pagado_at: '2026-10-09T20:49:38Z', monto_pagado_online: 42000,
    })
    expect(r?.etapa).toBe('anticipo_pagado')
    expect(r?.total).toBe(131863)
  })

  it('cotización con repuestos aprobada → abono_pendiente por 50% del saldo (caso Lynn: $89.375)', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: cotConRepuestos,
      anticipo_pagado_at: '2026-10-09T20:49:38Z', monto_pagado_online: 42000,
    })
    expect(r?.etapa).toBe('abono_pendiente')
    expect(r?.porCobrar).toBe(89375)
  })

  it('abono pagado y servicio en curso → abono_pagado', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: cotConRepuestos,
      anticipo_pagado_at: '2026-10-09T20:49:38Z', abono_pagado_at: '2026-10-09T21:29:29Z', monto_pagado_online: 131375,
    })
    expect(r?.etapa).toBe('abono_pagado')
  })

  it('abono pagado y servicio completado → saldo_pendiente por lo que falta (caso Lynn hoy)', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'completada', cotizacion: cotConRepuestos,
      anticipo_pagado_at: '2026-10-09T20:49:38Z', abono_pagado_at: '2026-10-09T21:29:29Z', monto_pagado_online: 131375,
    })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(89375)
    expect(r?.pagado).toBe(131375)
  })

  it('cotización SIN repuestos aprobada → saldo_pendiente de inmediato', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: cotSinRepuestos,
      anticipo_pagado_at: '2026-08-25T20:49:58Z', monto_pagado_online: 42000,
    })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(94750)
  })

  it('saldo_pagado_at o suma ≥ total → pagado', () => {
    expect(etapaPagoCliente({ ...base, estado: 'completada', cotizacion: cotSinRepuestos, saldo_pagado_at: 'x' })?.etapa).toBe('pagado')
    expect(etapaPagoCliente({
      ...base, estado: 'completada', cotizacion: cotSinRepuestos,
      anticipo_pagado_at: 'x', monto_pagado_online: 136750,
    })?.etapa).toBe('pagado')
  })

  it('mantenimiento: anticipo pagado y en curso → anticipo_pagado; completado → saldo_pendiente del resto', () => {
    const mant = { ...base, tipo_solicitud: 'Mantenimiento', anticipo_pagado_at: 'x', monto_pagado_online: 63000 }
    expect(etapaPagoCliente({ ...mant, estado: 'en_proceso' })?.etapa).toBe('anticipo_pagado')
    const fin = etapaPagoCliente({ ...mant, estado: 'completada' })
    expect(fin?.etapa).toBe('saldo_pendiente')
    expect(fin?.porCobrar).toBe(63000)
  })

  it('diagnóstico sin cotización NUNCA se marca pagado por suma (no conocemos el total)', () => {
    // Portal del técnico: no carga la cotización → total 0. Con anticipo+abono
    // pagados ($131.375 > $84.000) no debe decir "Pagado total".
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: undefined,
      anticipo_pagado_at: 'x', abono_pagado_at: 'y', monto_pagado_online: 131375,
    })
    expect(r?.etapa).toBe('abono_pagado')
  })

  it('después de la visita sin pago online NO marca anticipo pendiente (QR en sitio / previo a Wompi)', () => {
    // Portal del técnico (sin cotización): diagnóstico ya en proceso o completado.
    expect(etapaPagoCliente({ ...base, estado: 'en_proceso' })?.etapa).toBe('sin_pago_online')
    expect(etapaPagoCliente({ ...base, estado: 'completada' })?.etapa).toBe('sin_pago_online')
    // Con total conocido y completado: el link del saldo total ya salió.
    const r = etapaPagoCliente({ ...base, estado: 'completada', cotizacion: cotSinRepuestos })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(136750)
    // Antes de la visita sí es anticipo pendiente.
    expect(etapaPagoCliente({ ...base, estado: 'asignada' })?.etapa).toBe('anticipo_pendiente')
  })

  it('servicio cerrado sin reparar: con pago → cerrado_con_pago, sin pago → null', () => {
    expect(etapaPagoCliente({ ...base, estado: 'cotizacion_rechazada', anticipo_pagado_at: 'x', monto_pagado_online: 42000 })?.etapa)
      .toBe('cerrado_con_pago')
    expect(etapaPagoCliente({ ...base, estado: 'cancelada' })).toBeNull()
    expect(etapaPagoCliente({ ...base, estado: 'sin_agendar', tecnico_asignado_id: null })).toBeNull()
  })
})

describe('totalClienteParaCobro', () => {
  it('cotización manda; precio fijo usa catálogo + recargo con IVA; diagnóstico sin cotización = 0', () => {
    expect(totalClienteParaCobro({ ...base, cotizacion: { total: 220750 } })).toBe(220750)
    expect(totalClienteParaCobro({ ...base, tipo_solicitud: 'Mantenimiento', recargo_weekend_aplicado: 6000 })).toBe(133140)
    expect(totalClienteParaCobro({ ...base, tipo_solicitud: 'Cambio de filtro', tipo_equipo: 'Nevecón' })).toBe(180000)
    expect(totalClienteParaCobro(base)).toBe(0)
    expect(totalClienteParaCobro({ ...base, es_garantia: true, cotizacion: { total: 1 } })).toBe(0)
  })
})

describe('pasosPagoCliente', () => {
  it('sin repuestos: anticipo + saldo; con repuestos: anticipo + abono + saldo', () => {
    expect(pasosPagoCliente({ ...base, anticipo_pagado_at: 'x', monto_pagado_online: 42000 }).map(p => p.paso))
      .toEqual(['anticipo', 'saldo'])
    const pasos = pasosPagoCliente({
      ...base, estado: 'completada', cotizacion: cotConRepuestos,
      anticipo_pagado_at: 'a', abono_pagado_at: 'b', monto_pagado_online: 131375,
    })
    expect(pasos.map(p => [p.paso, p.estado])).toEqual([
      ['anticipo', 'pagado'], ['abono', 'pagado'], ['saldo', 'pendiente'],
    ])
  })

  it('pagado total marca todos los pasos como pagados', () => {
    const pasos = pasosPagoCliente({ ...base, estado: 'completada', cotizacion: cotSinRepuestos, saldo_pagado_at: 's' })
    expect(pasos.every(p => p.estado === 'pagado')).toBe(true)
  })
})
