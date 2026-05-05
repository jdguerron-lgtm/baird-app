import { describe, it, expect } from 'vitest'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import {
  calcularPagoTecnico,
  TARIFA_DIAGNOSTICO,
  TARIFAS_MANTENIMIENTO,
  IVA_TARIFA,
  calcularBaseSinIva,
  calcularIvaIncluido,
} from '@/types/solicitud'

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
