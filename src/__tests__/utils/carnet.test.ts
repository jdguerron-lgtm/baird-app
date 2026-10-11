import { describe, it, expect } from 'vitest'
import {
  codigoCarnet,
  construirCarnet,
  enmascararDocumento,
  formatearFechaCarnet,
  urlImagenCarnet,
} from '@/lib/utils/carnet'

describe('enmascararDocumento', () => {
  it('deja visibles solo los últimos 4 dígitos', () => {
    expect(enmascararDocumento('1032456789')).toBe('•••• 6789')
  })

  it('limpia puntos y espacios antes de enmascarar', () => {
    expect(enmascararDocumento('1.032.456.789')).toBe('•••• 6789')
    expect(enmascararDocumento(' 80 123 456 ')).toBe('•••• 3456')
  })

  it('oculta por completo documentos de 4 o menos caracteres', () => {
    expect(enmascararDocumento('1234')).toBe('••••')
    expect(enmascararDocumento('12')).toBe('••••')
  })

  it('devuelve null sin número', () => {
    expect(enmascararDocumento(null)).toBeNull()
    expect(enmascararDocumento('')).toBeNull()
    expect(enmascararDocumento('---')).toBeNull()
  })

  it('nunca contiene el número completo', () => {
    const num = '1032456789'
    expect(enmascararDocumento(num)).not.toContain(num)
  })
})

describe('codigoCarnet', () => {
  it('usa los primeros 8 hex del UUID en mayúscula', () => {
    expect(codigoCarnet('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b')).toBe('BS-3F2A9C1E')
  })

  it('tolera ids vacíos', () => {
    expect(codigoCarnet('')).toBe('BS-00000000')
  })
})

describe('construirCarnet', () => {
  const base = {
    id: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
    nombre_completo: 'Carlos Pérez',
    foto_perfil_url: 'https://x/perfil.jpg',
    tipo_documento: 'CC',
    numero_documento: '1032456789',
    especialidad_principal: 'Lavadoras',
    ciudad_pueblo: 'Bogotá D.C.',
    estado_verificacion: 'verificado',
    fecha_verificacion: '2026-09-01T15:00:00.000Z',
    contrato_firmado: true,
  }

  it('arma el carnet verificado con documento enmascarado', () => {
    const c = construirCarnet(base)
    expect(c.verificado).toBe(true)
    expect(c.documento_enmascarado).toBe('•••• 6789')
    expect(c.fecha_verificacion).toBe(base.fecha_verificacion)
    expect(c.codigo).toBe('BS-3F2A9C1E')
    expect(c.contrato_firmado).toBe(true)
    // El modelo NO transporta el número completo
    expect(JSON.stringify(c)).not.toContain('1032456789')
  })

  it('un técnico pendiente no queda verificado ni con fecha', () => {
    const c = construirCarnet({ ...base, estado_verificacion: 'pendiente' })
    expect(c.verificado).toBe(false)
    expect(c.fecha_verificacion).toBeNull()
  })

  it('tolera columnas ausentes (registros viejos)', () => {
    const c = construirCarnet({ id: base.id, nombre_completo: 'X' })
    expect(c.documento_enmascarado).toBeNull()
    expect(c.foto_perfil_url).toBeNull()
    expect(c.contrato_firmado).toBe(false)
  })
})

describe('formatearFechaCarnet', () => {
  it('formatea YYYY-MM-DD en español corto', () => {
    expect(formatearFechaCarnet('2026-09-01T15:00:00.000Z')).toBe('1 sep 2026')
    expect(formatearFechaCarnet('2026-12-25')).toBe('25 dic 2026')
  })

  it('devuelve null con entrada inválida', () => {
    expect(formatearFechaCarnet(null)).toBeNull()
    expect(formatearFechaCarnet('ayer')).toBeNull()
  })
})

describe('urlImagenCarnet', () => {
  it('apunta a /api/carnet/{id} sobre APP_URL', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo.test/'
    expect(urlImagenCarnet('abc')).toBe('https://ejemplo.test/api/carnet/abc')
    process.env.NEXT_PUBLIC_APP_URL = prev
  })
})
