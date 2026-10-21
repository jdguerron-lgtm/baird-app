import { describe, expect, it } from 'vitest'
import {
  describirDescuento,
  descuentoDeSolicitud,
  esCodigoDescuentoValido,
  montoDescuento,
  normalizarCodigoDescuento,
} from '@/lib/constants/descuentos'
import {
  descuentoClienteParaCobro,
  etapaPagoCliente,
  totalClienteNetoParaCobro,
  totalClienteParaCobro,
  type SolicitudParaEtapaPago,
} from '@/lib/constants/pago-cliente'

/**
 * Códigos de descuento (2026-10-19). Reglas: % sobre el total del servicio
 * (repuestos incluidos), se resta SOLO del saldo final, Baird lo asume, tope
 * en lo que falta por pagar (sin devolución), garantía no aplica.
 */

describe('normalizarCodigoDescuento / esCodigoDescuentoValido', () => {
  it('trim + mayúsculas', () => {
    expect(normalizarCodigoDescuento('  bienvenido10 ')).toBe('BIENVENIDO10')
    expect(normalizarCodigoDescuento(null)).toBe('')
  })
  it('formato canónico 3–30 [A-Z0-9_-]', () => {
    expect(esCodigoDescuentoValido('BIENVENIDO10')).toBe(true)
    expect(esCodigoDescuentoValido('PROMO_OCT-26')).toBe(true)
    expect(esCodigoDescuentoValido('AB')).toBe(false)
    expect(esCodigoDescuentoValido('CON ESPACIO')).toBe(false)
    expect(esCodigoDescuentoValido('ñandu')).toBe(false)
  })
})

describe('montoDescuento', () => {
  it('porcentaje sobre el total, redondeado', () => {
    expect(montoDescuento(200_000, { codigo: 'X', tipo: 'porcentaje', valor: 10 })).toBe(20_000)
    expect(montoDescuento(136_750, { codigo: 'X', tipo: 'porcentaje', valor: 15 })).toBe(20_513)
  })
  it('valor fijo, topado al total', () => {
    expect(montoDescuento(200_000, { codigo: 'X', tipo: 'valor', valor: 30_000 })).toBe(30_000)
    expect(montoDescuento(20_000, { codigo: 'X', tipo: 'valor', valor: 30_000 })).toBe(20_000)
  })
  it('100% cubre todo; total inválido o sin descuento → 0', () => {
    expect(montoDescuento(200_000, { codigo: 'X', tipo: 'porcentaje', valor: 100 })).toBe(200_000)
    expect(montoDescuento(0, { codigo: 'X', tipo: 'porcentaje', valor: 10 })).toBe(0)
    expect(montoDescuento(200_000, null)).toBe(0)
  })
})

describe('descuentoDeSolicitud (snapshot en columnas)', () => {
  it('lee el snapshot y acepta numeric como string (PostgREST)', () => {
    expect(descuentoDeSolicitud({ es_garantia: false, descuento_codigo: 'promo10', descuento_tipo: 'porcentaje', descuento_valor: '10.00' }))
      .toEqual({ codigo: 'PROMO10', tipo: 'porcentaje', valor: 10 })
  })
  it('garantía, sin código, tipo raro o % > 100 → null', () => {
    expect(descuentoDeSolicitud({ es_garantia: true, descuento_codigo: 'X', descuento_tipo: 'valor', descuento_valor: 1000 })).toBeNull()
    expect(descuentoDeSolicitud({ es_garantia: false, descuento_codigo: null })).toBeNull()
    expect(descuentoDeSolicitud({ es_garantia: false, descuento_codigo: 'X', descuento_tipo: 'otro', descuento_valor: 10 })).toBeNull()
    expect(descuentoDeSolicitud({ es_garantia: false, descuento_codigo: 'X', descuento_tipo: 'porcentaje', descuento_valor: 150 })).toBeNull()
  })
})

describe('describirDescuento', () => {
  it('"10%" y "$50.000"', () => {
    expect(describirDescuento({ codigo: 'X', tipo: 'porcentaje', valor: 10 })).toBe('10%')
    expect(describirDescuento({ codigo: 'X', tipo: 'valor', valor: 50_000 })).toBe('$50.000')
  })
})

// ─── Integración con la etapa de pago ──────────────────────────────
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
  descuento_codigo: 'PROMO10',
  descuento_tipo: 'porcentaje',
  descuento_valor: 10,
}
const cotSinRepuestos = { total: 200_000, aprobado_at: '2026-10-19T10:00:00Z', productos_necesarios: [] }
const cotConRepuestos = { total: 200_000, aprobado_at: '2026-10-19T10:00:00Z', productos_necesarios: [{ sku: 'X', cantidad: 1 }] }

describe('descuento en la etapa de pago (solo saldo final)', () => {
  it('totales bruto / descuento / neto', () => {
    const sol = { ...base, cotizacion: cotSinRepuestos }
    expect(totalClienteParaCobro(sol)).toBe(200_000)
    expect(descuentoClienteParaCobro(sol)).toBe(20_000)
    expect(totalClienteNetoParaCobro(sol)).toBe(180_000)
  })

  it('el anticipo NO cambia con el código (50% del precio de catálogo)', () => {
    const r = etapaPagoCliente(base)
    expect(r?.etapa).toBe('anticipo_pendiente')
    expect(r?.porCobrar).toBe(42_000)
  })

  it('el abono de repuestos se calcula sobre el saldo BRUTO', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: cotConRepuestos,
      anticipo_pagado_at: 'x', monto_pagado_online: 42_000,
    })
    expect(r?.etapa).toBe('abono_pendiente')
    expect(r?.porCobrar).toBe(79_000) // 50% × (200.000 − 42.000), sin descuento
  })

  it('saldo final = total − descuento − pagado (sin repuestos)', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'en_proceso', cotizacion: cotSinRepuestos,
      anticipo_pagado_at: 'x', monto_pagado_online: 42_000,
    })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(138_000)
    expect(r?.descuento).toBe(20_000)
    expect(r?.totalNeto).toBe(180_000)
  })

  it('saldo final con repuestos: tras el abono bruto, el descuento baja lo que falta', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'completada', cotizacion: cotConRepuestos,
      anticipo_pagado_at: 'x', abono_pagado_at: 'x', monto_pagado_online: 121_000, // 42.000 + 79.000
    })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(59_000) // 200.000 − 20.000 − 121.000
  })

  it('pagado ≥ neto → pagado (no exige el bruto)', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'completada', cotizacion: cotSinRepuestos,
      anticipo_pagado_at: 'x', monto_pagado_online: 180_000,
    })
    expect(r?.etapa).toBe('pagado')
  })

  it('descuento mayor a lo que falta → saldo 0, etapa pagado, sin devolución', () => {
    const r = etapaPagoCliente({
      ...base, estado: 'completada', cotizacion: cotSinRepuestos,
      descuento_tipo: 'valor', descuento_valor: 170_000,
      anticipo_pagado_at: 'x', monto_pagado_online: 42_000,
    })
    expect(r?.etapa).toBe('pagado')
    expect(r?.porCobrar).toBe(0)
    expect(r?.descuento).toBe(170_000)
  })

  it('tarifa fija (Mantenimiento) también aplica el descuento al completar', () => {
    const r = etapaPagoCliente({
      ...base, tipo_solicitud: 'Mantenimiento', estado: 'completada',
      anticipo_pagado_at: 'x', monto_pagado_online: 63_000,
    })
    const bruto = totalClienteParaCobro({ ...base, tipo_solicitud: 'Mantenimiento' })
    expect(r?.etapa).toBe('saldo_pendiente')
    expect(r?.porCobrar).toBe(bruto - Math.round(bruto * 0.1) - 63_000)
  })

  it('garantía: nunca hay descuento', () => {
    expect(descuentoClienteParaCobro({ ...base, es_garantia: true, cotizacion: cotSinRepuestos })).toBe(0)
  })

  it('sin código: resumen idéntico al de siempre (descuento 0, neto = total)', () => {
    const r = etapaPagoCliente({
      ...base, descuento_codigo: null, descuento_tipo: null, descuento_valor: null,
      estado: 'en_proceso', cotizacion: cotSinRepuestos, anticipo_pagado_at: 'x', monto_pagado_online: 42_000,
    })
    expect(r).toMatchObject({ etapa: 'saldo_pendiente', total: 200_000, descuento: 0, totalNeto: 200_000, porCobrar: 158_000 })
  })
})
