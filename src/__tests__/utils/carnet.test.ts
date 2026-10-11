import { describe, it, expect } from 'vitest'
import {
  codigoCarnet,
  construirCarnet,
  formatearDocumento,
  formatearFechaCarnet,
  urlImagenCarnet,
} from '@/lib/utils/carnet'

describe('formatearDocumento', () => {
  it('oculta los 2 primeros dígitos y agrega puntos de miles al resto', () => {
    expect(formatearDocumento('1032456789')).toBe('••32.456.789')
    expect(formatearDocumento('80123456')).toBe('••123.456')
  })

  it('limpia puntos y espacios antes de formatear', () => {
    expect(formatearDocumento('1.032.456.789')).toBe('••32.456.789')
    expect(formatearDocumento(' 80 123 456 ')).toBe('••123.456')
  })

  it('nunca contiene el número completo', () => {
    expect(formatearDocumento('1032456789')).not.toContain('1032456789')
    expect(formatearDocumento('1032456789')?.startsWith('••')).toBe(true)
  })

  it('pasaportes alfanuméricos: 2 primeros caracteres ocultos, en mayúscula y sin puntos', () => {
    expect(formatearDocumento('ab 123456')).toBe('••123456')
  })

  it('documentos muy cortos quedan totalmente ocultos', () => {
    expect(formatearDocumento('12')).toBe('••')
    expect(formatearDocumento('1')).toBe('••')
  })

  it('devuelve null sin número', () => {
    expect(formatearDocumento(null)).toBeNull()
    expect(formatearDocumento('')).toBeNull()
    expect(formatearDocumento('---')).toBeNull()
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

  it('arma el carnet verificado con el documento anonimizado', () => {
    const c = construirCarnet(base)
    expect(c.verificado).toBe(true)
    expect(c.documento).toBe('••32.456.789')
    expect(JSON.stringify(c)).not.toContain('1032456789')
    expect(c.tipo_documento).toBe('CC')
    expect(c.fecha_verificacion).toBe(base.fecha_verificacion)
    expect(c.codigo).toBe('BS-3F2A9C1E')
    expect(c.contrato_firmado).toBe(true)
  })

  it('un técnico pendiente no queda verificado ni con fecha', () => {
    const c = construirCarnet({ ...base, estado_verificacion: 'pendiente' })
    expect(c.verificado).toBe(false)
    expect(c.fecha_verificacion).toBeNull()
  })

  it('tolera columnas ausentes (registros viejos)', () => {
    const c = construirCarnet({ id: base.id, nombre_completo: 'X' })
    expect(c.documento).toBeNull()
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
