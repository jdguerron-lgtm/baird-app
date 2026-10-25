import { describe, it, expect } from 'vitest'
import {
  esUrlVideo,
  esUrlPdf,
  MAX_VIDEO_SIZE_MB,
  MAX_IMAGE_SIZE_MB,
  MAX_EVIDENCIAS_DIAGNOSTICO,
  MAX_ARCHIVOS_COMPLETAR,
  MAX_ARCHIVOS_EVIDENCIA_ADMIN,
  EVIDENCIA_MAX_DIMENSION,
  EVIDENCIA_JPEG_QUALITY,
  segundosVideoAprox,
} from '@/lib/utils/media'
import {
  esEventoEvidenciaAdmin,
  archivosDeEvento,
  esUrlEvidenciaAdminValida,
  contarArchivosEvidenciaAdmin,
  ORIGEN_EVIDENCIA_ADMIN,
} from '@/lib/utils/evidencia-admin'

const BASE = 'https://ceblicvdmephhktedsyv.supabase.co/storage/v1/object/public/evidencias-servicio/'
const SOL = '0bafe18a-1111-2222-3333-444444444444'

describe('media — límites de evidencia (2026-10-24)', () => {
  it('video por defecto 50 MB (techo del plan Free de Supabase, se sube por env) y fotos 20 MB post-compresión', () => {
    expect(MAX_VIDEO_SIZE_MB).toBe(50)
    expect(MAX_IMAGE_SIZE_MB).toBe(20)
  })

  it('más archivos por formulario: 20 diagnóstico, 20 completar, 30 admin', () => {
    expect(MAX_EVIDENCIAS_DIAGNOSTICO).toBe(20)
    expect(MAX_ARCHIVOS_COMPLETAR).toBe(20)
    expect(MAX_ARCHIVOS_EVIDENCIA_ADMIN).toBe(30)
  })

  it('la guía de duración escala con el tope de video (≈1,25 MB/s, múltiplos de 10 s)', () => {
    expect(segundosVideoAprox(50)).toBe(40)
    expect(segundosVideoAprox(200)).toBe(160)
    expect(segundosVideoAprox(500)).toBe(400)
    expect(segundosVideoAprox(5)).toBe(10)
  })

  it('fotos a mayor resolución: 4000 px / JPEG 0.92', () => {
    expect(EVIDENCIA_MAX_DIMENSION).toBe(4000)
    expect(EVIDENCIA_JPEG_QUALITY).toBe(0.92)
  })
})

describe('esUrlVideo / esUrlPdf', () => {
  it('detecta videos por extensión, con y sin query string, en mayúsculas', () => {
    expect(esUrlVideo(`${BASE}${SOL}/diagnostico_1_ab_0.mp4`)).toBe(true)
    expect(esUrlVideo(`${BASE}${SOL}/x.MOV`)).toBe(true)
    expect(esUrlVideo(`${BASE}${SOL}/x.webm?t=123`)).toBe(true)
    expect(esUrlVideo(`${BASE}${SOL}/x.3gp#a`)).toBe(true)
  })

  it('no confunde fotos ni PDF con video', () => {
    expect(esUrlVideo(`${BASE}${SOL}/x.jpg`)).toBe(false)
    expect(esUrlVideo(`${BASE}${SOL}/x.jpeg`)).toBe(false)
    expect(esUrlVideo(`${BASE}${SOL}/x.pdf`)).toBe(false)
    expect(esUrlVideo(`${BASE}${SOL}/sin-extension`)).toBe(false)
    expect(esUrlVideo('')).toBe(false)
  })

  it('esUrlPdf', () => {
    expect(esUrlPdf(`${BASE}${SOL}/admin_1_ab_0.pdf`)).toBe(true)
    expect(esUrlPdf(`${BASE}${SOL}/admin_1_ab_0.PDF?x=1`)).toBe(true)
    expect(esUrlPdf(`${BASE}${SOL}/admin_1_ab_0.jpg`)).toBe(false)
  })
})

describe('evidencia-admin', () => {
  const evento = {
    id: 1,
    tipo: 'nota_admin',
    actor: 'jdguerron@bairdservice.com',
    motivo: 'Fotos del cliente',
    ocurrido_at: '2026-10-20T12:00:00Z',
    payload: {
      origen: ORIGEN_EVIDENCIA_ADMIN,
      archivos: [
        { url: `${BASE}${SOL}/admin_1_ab_0.jpg`, mime: 'image/jpeg', nombre: 'a.jpg', bytes: 1200 },
        { url: `${BASE}${SOL}/admin_1_ab_1.mp4` },
        { nombre: 'sin url' },
        null,
      ],
    },
  }

  it('esEventoEvidenciaAdmin distingue la carga de una nota manual y de otros eventos', () => {
    expect(esEventoEvidenciaAdmin(evento)).toBe(true)
    expect(esEventoEvidenciaAdmin({ tipo: 'nota_admin', payload: { origen: 'nota_manual' } })).toBe(false)
    expect(esEventoEvidenciaAdmin({ tipo: 'nota_admin', payload: null })).toBe(false)
    expect(esEventoEvidenciaAdmin({ tipo: 'comprobante_envio', payload: { origen: ORIGEN_EVIDENCIA_ADMIN } })).toBe(false)
  })

  it('archivosDeEvento normaliza y descarta entradas sin url', () => {
    const archivos = archivosDeEvento(evento)
    expect(archivos).toHaveLength(2)
    expect(archivos[0]).toEqual({ url: `${BASE}${SOL}/admin_1_ab_0.jpg`, mime: 'image/jpeg', nombre: 'a.jpg', bytes: 1200 })
    expect(archivos[1]).toEqual({ url: `${BASE}${SOL}/admin_1_ab_1.mp4`, mime: null, nombre: null, bytes: null })
    expect(archivosDeEvento({ payload: null })).toEqual([])
    expect(archivosDeEvento({ payload: { archivos: 'nope' } })).toEqual([])
    expect(contarArchivosEvidenciaAdmin([evento, { payload: null }])).toBe(2)
  })

  it('esUrlEvidenciaAdminValida exige bucket + carpeta de la solicitud + prefijo admin_', () => {
    expect(esUrlEvidenciaAdminValida(`${BASE}${SOL}/admin_1_ab_0.jpg`, SOL)).toBe(true)
    expect(esUrlEvidenciaAdminValida(`${BASE}${SOL}/admin_1_ab_0.mp4?download=1`, SOL)).toBe(true)
    // otra solicitud
    expect(esUrlEvidenciaAdminValida(`${BASE}otra-solicitud/admin_1_ab_0.jpg`, SOL)).toBe(false)
    // archivo del técnico (sin prefijo admin_)
    expect(esUrlEvidenciaAdminValida(`${BASE}${SOL}/diagnostico_1_ab_0.jpg`, SOL)).toBe(false)
    // otro bucket / otro host / http / path traversal / no string
    expect(esUrlEvidenciaAdminValida(`https://x.supabase.co/storage/v1/object/public/tecnicos-fotos/${SOL}/admin_1.jpg`, SOL)).toBe(false)
    expect(esUrlEvidenciaAdminValida(`http://ceblicvdmephhktedsyv.supabase.co/storage/v1/object/public/evidencias-servicio/${SOL}/admin_1.jpg`, SOL)).toBe(false)
    expect(esUrlEvidenciaAdminValida(`${BASE}${SOL}/admin_../otra/x.jpg`, SOL)).toBe(false)
    expect(esUrlEvidenciaAdminValida(null, SOL)).toBe(false)
    expect(esUrlEvidenciaAdminValida(123, SOL)).toBe(false)
  })
})
