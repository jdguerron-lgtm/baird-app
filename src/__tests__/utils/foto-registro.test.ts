import { describe, it, expect } from 'vitest'
import { sniffImageType, LIMITES_FOTO } from '@/lib/utils/foto-registro'

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap(x => (typeof x === 'string' ? [...x].map(c => c.charCodeAt(0)) : [x])))

describe('sniffImageType', () => {
  it('reconoce JPEG, PNG, GIF, BMP', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('image/jpeg')
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe('image/png')
    expect(sniffImageType(bytes('GIF89a', 0, 0, 0, 0, 0, 0))).toBe('image/gif')
    expect(sniffImageType(bytes('BM', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('image/bmp')
  })

  it('reconoce WebP (RIFF....WEBP) y HEIC (....ftypheic)', () => {
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp')
    expect(sniffImageType(bytes(0, 0, 0, 0x18, 'ftyp', 'heic'))).toBe('image/heic')
    expect(sniffImageType(bytes(0, 0, 0, 0x18, 'ftyp', 'mif1'))).toBe('image/heic')
  })

  it('devuelve null para PDF, texto o cabeceras cortas', () => {
    expect(sniffImageType(bytes('%PDF-1.4', 0, 0, 0, 0))).toBeNull()
    expect(sniffImageType(bytes('hola mundo!!'))).toBeNull()
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull()
    // RIFF que no es WEBP (p.ej. WAV)
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull()
  })
})

describe('LIMITES_FOTO', () => {
  it('el documento conserva más resolución que el perfil y ambos aceptan hasta 5 MB', () => {
    expect(LIMITES_FOTO.documento.maxDimension).toBeGreaterThan(LIMITES_FOTO.perfil.maxDimension)
    expect(LIMITES_FOTO.perfil.maxBytes).toBe(5 * 1024 * 1024)
    expect(LIMITES_FOTO.documento.maxBytes).toBe(5 * 1024 * 1024)
  })
})
