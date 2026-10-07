import { describe, expect, it } from 'vitest'
import {
  SIIGO,
  codigoServicio,
  desglosarIva,
  formaPagoSugerida,
  identificacionCliente,
  itemsFacturaParticular,
  quincenaDe,
  superaBaseRetefuente,
  RETEFUENTE_SERVICIOS_BASE_MINIMA,
} from '@/lib/utils/facturacion'

describe('identificacionCliente — tercero para la FV de Siigo', () => {
  it('sin cédula → consumidor final 222222222222', () => {
    const r = identificacionCliente(null)
    expect(r.tipoNombre).toBe('Consumidor final')
    expect(r.identificacion).toBe(SIIGO.CONSUMIDOR_FINAL_NIT)
    expect(r.verificar).toBe(false)
    expect(identificacionCliente('   ').identificacion).toBe(SIIGO.CONSUMIDOR_FINAL_NIT)
  })

  it('cédula típica → tipo 13 sin verificar', () => {
    const r = identificacionCliente('1020837200')
    expect(r).toEqual({ tipoCodigo: '13', tipoNombre: 'Cédula', identificacion: '1020837200', verificar: false })
  })

  it('9 dígitos que empiezan por 8/9 → NIT inferido (marcar verificar)', () => {
    const r = identificacionCliente('900.499.068')
    expect(r.tipoNombre).toBe('NIT')
    expect(r.tipoCodigo).toBe('31')
    expect(r.identificacion).toBe('900499068')
    expect(r.verificar).toBe(true)
  })

  it('9 dígitos que NO empiezan por 8/9 siguen siendo cédula', () => {
    expect(identificacionCliente('123456789').tipoNombre).toBe('Cédula')
  })
})

describe('codigoServicio', () => {
  it('usa los 8 primeros hex del uuid en mayúscula (cruza con la referencia Wompi)', () => {
    expect(codigoServicio('edcf13a6-1234-4abc-9def-000000000000')).toBe('BS-EDCF13A6')
  })
})

describe('desglosarIva', () => {
  it('cuadra base + IVA = total (diagnóstico $84.000)', () => {
    expect(desglosarIva(84000)).toEqual({ base: 70588, iva: 13412, total: 84000 })
  })
  it('valores inválidos → 0', () => {
    expect(desglosarIva(Number.NaN)).toEqual({ base: 0, iva: 0, total: 0 })
    expect(desglosarIva(-5)).toEqual({ base: 0, iva: 0, total: 0 })
  })
})

describe('itemsFacturaParticular', () => {
  const base = { tipo_equipo: 'Lavadora', marca_equipo: 'Whirlpool', tipo_solicitud: 'Reparación' }

  it('cotización discriminada (2026-08-25) → dos ítems que suman el total', () => {
    const items = itemsFacturaParticular(
      { ...base, cotizacion: { diagnostico_cliente: 84000, servicio_cliente: 136750 } },
      220750,
    )
    expect(items).toHaveLength(2)
    expect(items[0].descripcion).toContain('diagnóstico')
    expect(items[1].descripcion).toContain('Reparación')
    expect(items[0].total + items[1].total).toBe(220750)
    expect(items.every((i) => i.codigo === SIIGO.ITEM_SERVICIO_CODIGO && i.cantidad === 1)).toBe(true)
  })

  it('desglose que no cuadra con el total → un solo ítem por el total', () => {
    const items = itemsFacturaParticular(
      { ...base, cotizacion: { diagnostico_cliente: 84000, servicio_cliente: 100000 } },
      250000,
    )
    expect(items).toHaveLength(1)
    expect(items[0].total).toBe(250000)
  })

  it('sin cotización (tarifa fija) → un ítem', () => {
    const items = itemsFacturaParticular({ ...base, tipo_solicitud: 'Mantenimiento', cotizacion: null }, 180000)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ base: 151261, iva: 28739, total: 180000 })
  })
})

describe('formaPagoSugerida', () => {
  it('Wompi cubrió todo → Bancos sin pendiente', () => {
    expect(formaPagoSugerida(100000, 100000)).toEqual({ id: SIIGO.PAGO_BANCOS, nombre: 'Bancos (Wompi)', pendiente: 0 })
  })
  it('nada online → Crédito con todo pendiente', () => {
    const r = formaPagoSugerida(100000, 0)
    expect(r.id).toBe(SIIGO.PAGO_CREDITO)
    expect(r.pendiente).toBe(100000)
  })
  it('parcial → Bancos + saldo por fuera', () => {
    const r = formaPagoSugerida(100000, 42000)
    expect(r.id).toBe(SIIGO.PAGO_BANCOS)
    expect(r.pendiente).toBe(58000)
    expect(r.nombre).toContain('saldo por fuera')
  })
})

describe('quincenaDe — cortes de liquidación de técnicos', () => {
  it('día 1–15 → primera quincena', () => {
    expect(quincenaDe('2026-09-09')).toEqual({ desde: '2026-09-01', hasta: '2026-09-15', etiqueta: '1ª quincena 2026-09' })
  })
  it('día ≥16 → segunda quincena hasta fin de mes (febrero bisiesto incluido)', () => {
    expect(quincenaDe('2026-09-20')).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(quincenaDe('2028-02-16')).toMatchObject({ desde: '2028-02-16', hasta: '2028-02-29' })
  })
  it('offset -1 cruza el cambio de mes y de año', () => {
    expect(quincenaDe('2026-09-09', -1)).toMatchObject({ desde: '2026-08-16', hasta: '2026-08-31' })
    expect(quincenaDe('2026-01-03', -1)).toMatchObject({ desde: '2025-12-16', hasta: '2025-12-31' })
  })
})

describe('superaBaseRetefuente', () => {
  it('4 UVT 2026 = $209.496', () => {
    expect(RETEFUENTE_SERVICIOS_BASE_MINIMA).toBe(209496)
    expect(superaBaseRetefuente(209496)).toBe(true)
    expect(superaBaseRetefuente(209495)).toBe(false)
  })
})
