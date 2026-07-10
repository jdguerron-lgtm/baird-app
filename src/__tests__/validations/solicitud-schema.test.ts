import { describe, it, expect } from 'vitest'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import {
  calcularPagoTecnico,
  precioClienteServicio,
  TARIFA_DIAGNOSTICO,
  TARIFA_CAMBIO_FILTRO,
  TARIFAS_MANTENIMIENTO,
  IVA_TARIFA,
  calcularBaseSinIva,
  calcularIvaIncluido,
} from '@/types/solicitud'
import { pagoNetoTecnicoTarifaFija, MULTIPLICADOR_PARTICULAR, FACTOR_PAGO_TECNICO_TARIFA_FIJA, PAGO_TECNICO_DIAGNOSTICO, calcularTarifaParticular } from '@/lib/constants/tarifas/particular'

const VALID_DATA = {
  cliente_nombre: 'Maria Garcia Lopez',
  cliente_telefono: '57|3001234567',
  direccion: 'Calle 45 #12-30 Apt 301',
  ciudad_pueblo: 'Bogota',
  zona_servicio: 'Chapinero',
  marca_equipo: 'Samsung',
  tipo_equipo: 'Nevera' as const,
  tipo_solicitud: 'Reparación' as const,
  novedades_equipo: 'La nevera no enfria correctamente desde hace 3 dias, hace un ruido',
  es_garantia: false,
  numero_serie_factura: '',
  pago_tecnico: 120000,
  horario_visita_1: 'Lunes 9am-12pm',
  horario_visita_2: 'Martes 2pm-5pm',
}

describe('solicitudFormSchema', () => {
  it('accepts valid data', () => {
    const result = solicitudFormSchema.safeParse(VALID_DATA)
    expect(result.success).toBe(true)
  })

  it('rejects phone with too few digits', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, cliente_telefono: '57|123' })
    expect(result.success).toBe(false)
  })

  it('accepts phone with country code pipe format', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, cliente_telefono: '1|2025551234' })
    expect(result.success).toBe(true)
  })

  it('accepts legacy phone format with enough digits', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, cliente_telefono: '+573001234567' })
    expect(result.success).toBe(true)
  })

  it('accepts pago_tecnico = 0 (warranty case)', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, pago_tecnico: 0 })
    expect(result.success).toBe(true)
  })

  it('rejects pago_tecnico negativo', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, pago_tecnico: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects pago_tecnico above 10000000', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, pago_tecnico: 20000000 })
    expect(result.success).toBe(false)
  })

  it('requires numero_serie_factura when es_garantia is true', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, es_garantia: true, numero_serie_factura: '' })
    expect(result.success).toBe(false)
  })

  it('accepts garantia with numero_serie_factura', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, es_garantia: true, numero_serie_factura: 'SN-12345' })
    expect(result.success).toBe(true)
  })

  it('rejects novedades_equipo shorter than 20 chars', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, novedades_equipo: 'No enciende' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid tipo_equipo', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, tipo_equipo: 'Microondas' })
    expect(result.success).toBe(false)
  })

  it('rejects empty cliente_nombre', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, cliente_nombre: '' })
    expect(result.success).toBe(false)
  })

  it('rejects short direccion', () => {
    const result = solicitudFormSchema.safeParse({ ...VALID_DATA, direccion: 'Cll' })
    expect(result.success).toBe(false)
  })
})

describe('calcularPagoTecnico', () => {
  it('returns 0 for warranty regardless of tipo', () => {
    expect(calcularPagoTecnico('Lavadora', 'Mantenimiento', true)).toBe(0)
    expect(calcularPagoTecnico('Nevera', 'Reparación', true)).toBe(0)
    expect(calcularPagoTecnico('Estufa', 'Diagnóstico', true)).toBe(0)
  })

  it('returns TARIFA_DIAGNOSTICO for non-warranty Diagnóstico', () => {
    expect(calcularPagoTecnico('Lavadora', 'Diagnóstico', false)).toBe(TARIFA_DIAGNOSTICO)
    expect(calcularPagoTecnico('Nevera', 'Diagnóstico', false)).toBe(TARIFA_DIAGNOSTICO)
  })

  it('returns TARIFA_DIAGNOSTICO for non-warranty Reparación', () => {
    expect(calcularPagoTecnico('Lavadora', 'Reparación', false)).toBe(TARIFA_DIAGNOSTICO)
    expect(calcularPagoTecnico('Nevecón', 'Reparación', false)).toBe(TARIFA_DIAGNOSTICO)
  })

  it('returns the specific tariff per equipo for non-warranty Mantenimiento', () => {
    expect(calcularPagoTecnico('Lavadora', 'Mantenimiento', false)).toBe(TARIFAS_MANTENIMIENTO['Lavadora'])
    expect(calcularPagoTecnico('Nevera', 'Mantenimiento', false)).toBe(TARIFAS_MANTENIMIENTO['Nevera'])
    expect(calcularPagoTecnico('Aire Acondicionado', 'Mantenimiento', false)).toBe(TARIFAS_MANTENIMIENTO['Aire Acondicionado'])
  })

  it('matches the agreed price catalog +5% (smoke check 2026-05)', () => {
    expect(TARIFAS_MANTENIMIENTO['Lavadora']).toBe(126000)
    expect(TARIFAS_MANTENIMIENTO['Nevera']).toBe(147000)
    expect(TARIFAS_MANTENIMIENTO['Lavadora Secadora']).toBe(189000)
    expect(TARIFA_DIAGNOSTICO).toBe(84000)
  })
})

describe('pagoNetoTecnicoTarifaFija (reseller: catálogo ÷ 1.3447 × 0.8, ajuste 2026-07-09)', () => {
  // Cifras canónicas de public/guia-pagos.html (lo que recibe el técnico).
  // Diagnóstico/Reparación NO usan la inversa: pagan PAGO_TECNICO_DIAGNOSTICO fijo.
  it('cambio de filtro $180.000 → $107.087 neto', () => {
    expect(pagoNetoTecnicoTarifaFija(TARIFA_CAMBIO_FILTRO)).toBe(107087)
  })

  it('diagnóstico paga fijo $35.000 (no la inversa del catálogo)', () => {
    expect(PAGO_TECNICO_DIAGNOSTICO).toBe(35000)
    expect(PAGO_TECNICO_DIAGNOSTICO).toBeLessThan(TARIFA_DIAGNOSTICO)
  })

  it('mantenimiento por equipo = catálogo ÷ 1.3447 × 0.8', () => {
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Estufa'])).toBe(62467)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Horno'])).toBe(68714)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Lavadora'])).toBe(74961)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Secadora'])).toBe(81208)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Aire Acondicionado'])).toBe(81208)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Nevera'])).toBe(87454)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Lavavajillas'])).toBe(87454)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Nevecón'])).toBe(99948)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Lavadora Secadora'])).toBe(112441)
  })

  it('el neto es siempre menor que el catálogo (Baird retiene utilidad + IVA)', () => {
    expect(pagoNetoTecnicoTarifaFija(TARIFA_CAMBIO_FILTRO)).toBeLessThan(TARIFA_CAMBIO_FILTRO)
    expect(pagoNetoTecnicoTarifaFija(TARIFAS_MANTENIMIENTO['Lavadora'])).toBeLessThan(TARIFAS_MANTENIMIENTO['Lavadora'])
  })

  it('garantía / valores no positivos → 0', () => {
    expect(pagoNetoTecnicoTarifaFija(0)).toBe(0)
    expect(pagoNetoTecnicoTarifaFija(-100)).toBe(0)
  })

  it('reconstruye (±1 por redondeo) el catálogo al deshacer factor 0.8 y multiplicar por 1.3447', () => {
    for (const precio of [TARIFA_DIAGNOSTICO, TARIFA_CAMBIO_FILTRO, ...Object.values(TARIFAS_MANTENIMIENTO)]) {
      const reconstruido = Math.round(
        (pagoNetoTecnicoTarifaFija(precio) / FACTOR_PAGO_TECNICO_TARIFA_FIJA) * MULTIPLICADOR_PARTICULAR,
      )
      expect(Math.abs(reconstruido - precio)).toBeLessThanOrEqual(1)
    }
  })
})

describe('calcularTarifaParticular (utilidad 13% + IVA 19% sobre la venta)', () => {
  it('ejemplo canónico $100.000: margen 13.000, base 113.000, IVA 21.470, total 134.470', () => {
    const t = calcularTarifaParticular({ costoTecnico: 100000 })
    expect(t.margenBaird).toBe(13000)
    expect(t.baseVenta).toBe(113000)
    expect(t.ivaCliente).toBe(21470)
    expect(t.totalCliente).toBe(134470)
  })

  it('el técnico recibe íntegro su costo y el total suma base + IVA', () => {
    const t = calcularTarifaParticular({ costoTecnico: 70000 })
    expect(t.costoTecnico).toBe(70000)
    expect(t.baseVenta).toBe(t.costoTecnico + t.margenBaird)
    expect(t.totalCliente).toBe(t.baseVenta + t.ivaCliente)
  })

  it('costo 0 o negativo → todo en 0', () => {
    const t = calcularTarifaParticular({ costoTecnico: -5000 })
    expect(t.totalCliente).toBe(0)
  })
})

describe('precioClienteServicio (lo que paga el cliente)', () => {
  it('tarifa fija sin cotización → precio de catálogo (IVA incl.)', () => {
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', false)).toBe(TARIFAS_MANTENIMIENTO['Lavadora'])
    expect(precioClienteServicio('Nevera', 'Diagnóstico', false)).toBe(TARIFA_DIAGNOSTICO)
    expect(precioClienteServicio('Lavadora', 'Cambio de filtro', false)).toBe(TARIFA_CAMBIO_FILTRO)
  })

  it('con cotización (total > 0) → total cotizado (ya con IVA + margen Baird)', () => {
    expect(precioClienteServicio('Nevera', 'Reparación', false, { total: 196350 })).toBe(196350)
  })

  it('cotización con total 0/null cae al catálogo', () => {
    expect(precioClienteServicio('Nevera', 'Reparación', false, { total: 0 })).toBe(TARIFA_DIAGNOSTICO)
    expect(precioClienteServicio('Nevera', 'Reparación', false, null)).toBe(TARIFA_DIAGNOSTICO)
  })

  it('garantía → 0 (la marca paga, el cliente no)', () => {
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', true)).toBe(0)
  })

  it('precio al cliente ≥ pago neto al técnico para tarifa fija', () => {
    const precio = precioClienteServicio('Nevera', 'Mantenimiento', false)
    expect(precio).toBeGreaterThan(pagoNetoTecnicoTarifaFija(precio))
  })
})

describe('IVA helpers', () => {
  it('IVA_TARIFA es 19%', () => {
    expect(IVA_TARIFA).toBe(0.19)
  })

  it('calcularBaseSinIva: $84.000 con IVA → $70.588 base', () => {
    expect(calcularBaseSinIva(84000)).toBe(70588)
  })

  it('calcularIvaIncluido: $84.000 con IVA → $13.412 IVA', () => {
    expect(calcularIvaIncluido(84000)).toBe(13412)
  })

  it('base + IVA = total (consistencia matemática)', () => {
    const total = 140000
    expect(calcularBaseSinIva(total) + calcularIvaIncluido(total)).toBe(total)
  })

  it('calcularBaseSinIva(0) = 0 (caso garantía)', () => {
    expect(calcularBaseSinIva(0)).toBe(0)
    expect(calcularIvaIncluido(0)).toBe(0)
  })
})
