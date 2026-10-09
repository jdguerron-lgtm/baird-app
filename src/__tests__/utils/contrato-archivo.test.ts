import { describe, it, expect } from 'vitest'
import {
  CONTRATO_ARCHIVO_MAX_BYTES,
  detectarTipoContrato,
  rutaArchivoContrato,
  validarArchivoContrato,
} from '@/lib/utils/contrato-archivo'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const TXT = new Uint8Array([0x48, 0x6f, 0x6c, 0x61])

describe('contrato-archivo', () => {
  it('detecta PDF, JPG y PNG por magic bytes', () => {
    expect(detectarTipoContrato(PDF)).toBe('pdf')
    expect(detectarTipoContrato(JPG)).toBe('jpg')
    expect(detectarTipoContrato(PNG)).toBe('png')
    expect(detectarTipoContrato(TXT)).toBeNull()
    expect(detectarTipoContrato(new Uint8Array([]))).toBeNull()
  })

  it('rechaza vacío, >10MB y tipos no permitidos', () => {
    expect(validarArchivoContrato(0, PDF)).toEqual({ ok: false, error: 'El archivo está vacío' })
    expect(validarArchivoContrato(CONTRATO_ARCHIVO_MAX_BYTES + 1, PDF).ok).toBe(false)
    expect(validarArchivoContrato(100, TXT)).toEqual({ ok: false, error: 'Solo se acepta PDF, JPG o PNG' })
  })

  it('acepta un PDF de tamaño normal', () => {
    expect(validarArchivoContrato(CONTRATO_ARCHIVO_MAX_BYTES, PDF)).toEqual({ ok: true, tipo: 'pdf' })
  })

  it('genera rutas saneadas por técnico y versión', () => {
    expect(rutaArchivoContrato('abc-123', '2026.10.09', 'pdf', 42)).toBe('abc-123/contrato_2026.10.09_42.pdf')
    expect(rutaArchivoContrato('../x', 'v 1/..', 'jpg', 1)).toBe('___x/contrato_v_1_.._1.jpg')
  })
})
