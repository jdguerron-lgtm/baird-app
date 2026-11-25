import { describe, it, expect } from 'vitest'
import {
  leerDimensionesDeCabecera,
  leerOrientacionExif,
  dimensionesDestino,
  CABECERA_IMAGEN_BYTES,
} from '@/lib/utils/media'
import { urlTusResumable, clasificarErrorTus, subirArchivoStorage, TUS_UMBRAL_BYTES, type XhrLike } from '@/lib/utils/subida-evidencia'

// ── Constructores de cabeceras mínimas ──────────────────────────────────────
function jpeg(opts: { ancho: number; alto: number; orientacion?: number; progresivo?: boolean }): Uint8Array {
  const partes: number[] = [0xff, 0xd8]
  if (opts.orientacion) {
    // APP1 Exif, TIFF little-endian, IFD0 con una sola entrada: Orientation (0x0112)
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II, 42, offset IFD0 = 8
      0x01, 0x00,                                     // 1 entrada
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, opts.orientacion, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,                         // siguiente IFD = 0
    ]
    const cuerpo = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
    const largo = cuerpo.length + 2
    partes.push(0xff, 0xe1, largo >> 8, largo & 0xff, ...cuerpo)
  }
  // DQT de relleno (para comprobar que se salta segmentos)
  partes.push(0xff, 0xdb, 0x00, 0x04, 0x00, 0x00)
  const sof = opts.progresivo ? 0xc2 : 0xc0
  partes.push(0xff, sof, 0x00, 0x11, 0x08, opts.alto >> 8, opts.alto & 0xff, opts.ancho >> 8, opts.ancho & 0xff, 0x03)
  partes.push(...new Array(9).fill(0))
  partes.push(0xff, 0xda, 0x00, 0x02) // SOS
  return new Uint8Array(partes)
}

function png(ancho: number, alto: number): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const d = new DataView(b.buffer)
  d.setUint32(8, 13)
  b.set([0x49, 0x48, 0x44, 0x52], 12)
  d.setUint32(16, ancho)
  d.setUint32(20, alto)
  return b
}

function webpVp8x(ancho: number, alto: number): Uint8Array {
  const b = new Uint8Array(40)
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0)
  const w = ancho - 1
  const h = alto - 1
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24)
  return b
}

describe('leerDimensionesDeCabecera — dimensiones sin decodificar (2026-10-29)', () => {
  it('JPEG baseline: SOF0 tras otros segmentos, sin EXIF → orientación 1', () => {
    expect(leerDimensionesDeCabecera(jpeg({ ancho: 12000, alto: 9000 }))).toEqual({ ancho: 12000, alto: 9000, orientacion: 1 })
  })

  it('JPEG progresivo (SOF2) y con EXIF Orientation = 6 (rotada 90°)', () => {
    expect(leerDimensionesDeCabecera(jpeg({ ancho: 4032, alto: 3024, orientacion: 6, progresivo: true })))
      .toEqual({ ancho: 4032, alto: 3024, orientacion: 6 })
  })

  it('leerOrientacionExif devuelve 1 si el valor es inválido o no hay APP1', () => {
    const sin = jpeg({ ancho: 10, alto: 10 })
    expect(leerOrientacionExif(new DataView(sin.buffer))).toBe(1)
    const raro = jpeg({ ancho: 10, alto: 10, orientacion: 9 })
    expect(leerOrientacionExif(new DataView(raro.buffer))).toBe(1)
  })

  it('PNG (IHDR) y WebP (VP8X)', () => {
    expect(leerDimensionesDeCabecera(png(1920, 1080))).toEqual({ ancho: 1920, alto: 1080, orientacion: 1 })
    expect(leerDimensionesDeCabecera(webpVp8x(6000, 4000))).toEqual({ ancho: 6000, alto: 4000, orientacion: 1 })
  })

  it('devuelve null con cabeceras desconocidas o truncadas', () => {
    expect(leerDimensionesDeCabecera(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(leerDimensionesDeCabecera(new Uint8Array(40).fill(0x41))).toBeNull()
    expect(leerDimensionesDeCabecera(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })

  it('se leen hasta 512 KB de cabecera (los EXIF con miniatura son grandes)', () => {
    expect(CABECERA_IMAGEN_BYTES).toBe(512 * 1024)
  })
})

describe('dimensionesDestino — tamaño pedido al decodificador', () => {
  it('escala el lado mayor a maxDimension conservando la proporción', () => {
    expect(dimensionesDestino({ ancho: 12000, alto: 9000, orientacion: 1 }, 4000)).toEqual({ ancho: 4000, alto: 3000 })
  })

  it('con orientación 5–8 intercambia ancho/alto (la foto se muestra vertical)', () => {
    expect(dimensionesDestino({ ancho: 4032, alto: 3024, orientacion: 6 }, 4000)).toEqual({ ancho: 3000, alto: 4000 })
    expect(dimensionesDestino({ ancho: 4032, alto: 3024, orientacion: 1 }, 4000)).toEqual({ ancho: 4000, alto: 3000 })
  })

  it('null si la imagen ya cabe o las dimensiones son inválidas', () => {
    expect(dimensionesDestino({ ancho: 3000, alto: 2000, orientacion: 1 }, 4000)).toBeNull()
    expect(dimensionesDestino({ ancho: 0, alto: 2000, orientacion: 1 }, 4000)).toBeNull()
  })
})

describe('TUS — host directo y clasificación de errores', () => {
  it('urlTusResumable usa {ref}.storage.supabase.co para proyectos hosted y deja otros hosts igual', () => {
    expect(urlTusResumable('https://ceblicvdmephhktedsyv.supabase.co')).toBe('https://ceblicvdmephhktedsyv.storage.supabase.co/storage/v1/upload/resumable')
    expect(urlTusResumable('https://ceblicvdmephhktedsyv.supabase.co/')).toBe('https://ceblicvdmephhktedsyv.storage.supabase.co/storage/v1/upload/resumable')
    expect(urlTusResumable('http://localhost:54321')).toBe('http://localhost:54321/storage/v1/upload/resumable')
  })

  it('clasificarErrorTus: red/5xx/429 reintentables; 4xx de configuración → probar POST clásico', () => {
    expect(clasificarErrorTus(null, 'x')).toMatchObject({ reintentable: true, probarFallback: false })
    expect(clasificarErrorTus(503, 'x')).toMatchObject({ reintentable: true, probarFallback: false })
    expect(clasificarErrorTus(429, 'x')).toMatchObject({ reintentable: true, probarFallback: false })
    expect(clasificarErrorTus(403, 'policy')).toMatchObject({ reintentable: false, probarFallback: true, status: 403 })
    expect(clasificarErrorTus(413, 'Payload too large')).toMatchObject({ reintentable: false, probarFallback: true })
  })
})

describe('subirArchivoStorage — elige TUS por tamaño', () => {
  const xhrOk = (): XhrLike => {
    const xhr: XhrLike = {
      status: 0, responseText: '', onload: null, onerror: null, onabort: null,
      upload: { onprogress: null },
      open: () => {}, setRequestHeader: () => {}, abort: () => {},
      send: () => { setTimeout(() => { (xhr as { status: number }).status = 200; xhr.onload?.() }, 0) },
    }
    return xhr
  }
  const grande = () => new Blob([new Uint8Array(TUS_UMBRAL_BYTES + 1)], { type: 'video/mp4' }) as Blob & { type: string }
  const chico = () => new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }) as Blob & { type: string }

  it('> 6 MB va por TUS con el token y la ruta destino; < 6 MB va por XHR', async () => {
    const llamadas: string[] = []
    const subirTus = async (a: { path: string; token: string }) => { llamadas.push(`tus:${a.path}:${a.token}`) }
    await subirArchivoStorage('evidencias-servicio', 'sol/v.mp4', grande(), { subirTus, token: 'tok', crearXhr: () => { llamadas.push('xhr'); return xhrOk() }, esperar: async () => {} })
    await subirArchivoStorage('evidencias-servicio', 'sol/f.jpg', chico(), { subirTus, token: 'tok', crearXhr: () => { llamadas.push('xhr'); return xhrOk() }, esperar: async () => {} })
    expect(llamadas).toEqual(['tus:sol/v.mp4:tok', 'xhr'])
  })

  it('si TUS responde un 4xx de configuración, cae una vez al POST clásico', async () => {
    const llamadas: string[] = []
    const subirTus = async () => { llamadas.push('tus'); throw clasificarErrorTus(400, 'metadata inválida') }
    const r = await subirArchivoStorage('evidencias-servicio', 'sol/v.mp4', grande(), {
      subirTus, token: 'tok', esperar: async () => {}, crearXhr: () => { llamadas.push('xhr'); return xhrOk() },
    })
    expect(llamadas).toEqual(['tus', 'xhr'])
    expect(r.publicUrl).toContain('sol/v.mp4')
  })

  it('si TUS falla por red agota los intentos TUS y no cae a XHR', async () => {
    const llamadas: string[] = []
    const subirTus = async () => { llamadas.push('tus'); throw clasificarErrorTus(0, 'red') }
    await expect(subirArchivoStorage('evidencias-servicio', 'sol/v.mp4', grande(), {
      subirTus, token: 'tok', esperar: async () => {}, maxIntentos: 2, crearXhr: () => { llamadas.push('xhr'); return xhrOk() },
    })).rejects.toThrow(/red/)
    expect(llamadas).toEqual(['tus', 'tus'])
  })
})
