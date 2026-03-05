import { describe, it, expect } from 'vitest'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'

const VALID_DATA = {
  cliente_nombre: 'Maria Garcia Lopez',
  cliente_telefono: '3001234567',
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

  it('rejects phone without 3 prefix', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      cliente_telefono: '1001234567',
    })
    expect(result.success).toBe(false)
  })

  it('accepts phone with +57 prefix', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      cliente_telefono: '+573001234567',
    })
    expect(result.success).toBe(true)
  })

  it('rejects pago_tecnico below 20000', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      pago_tecnico: 10000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects pago_tecnico above 10000000', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      pago_tecnico: 20000000,
    })
    expect(result.success).toBe(false)
  })

  it('requires numero_serie_factura when es_garantia is true', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      es_garantia: true,
      numero_serie_factura: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts garantia with numero_serie_factura', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      es_garantia: true,
      numero_serie_factura: 'SN-12345',
    })
    expect(result.success).toBe(true)
  })

  it('rejects novedades_equipo shorter than 20 chars', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      novedades_equipo: 'No enciende',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid tipo_equipo', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      tipo_equipo: 'Microondas',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty cliente_nombre', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      cliente_nombre: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects short direccion', () => {
    const result = solicitudFormSchema.safeParse({
      ...VALID_DATA,
      direccion: 'Cll',
    })
    expect(result.success).toBe(false)
  })
})
