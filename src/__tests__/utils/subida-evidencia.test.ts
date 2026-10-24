import { describe, it, expect, vi } from 'vitest'
import {
  subirArchivoStorage,
  clasificarRespuesta,
  mensajeDeRespuestaStorage,
  ejecutarConLimite,
  porcentajeTotal,
  mensajeProgresoSubida,
  mensajePreparando,
  crearAgregadorProgreso,
  comprimirConLimite,
  type XhrLike,
} from '@/lib/utils/subida-evidencia'
import { tipoArchivoEvidencia } from '@/lib/utils/media'

// ── XHR falso ────────────────────────────────────────────────────────────────
type Guion = { status: number; body?: string; progreso?: number[]; red?: boolean; nuncaTermina?: boolean }

function fabricaXhr(guiones: Guion[]) {
  const llamadas: { url: string; headers: Record<string, string>; abortado: boolean }[] = []
  const crearXhr = (): XhrLike => {
    const g = guiones[Math.min(llamadas.length, guiones.length - 1)]
    const registro = { url: '', headers: {} as Record<string, string>, abortado: false }
    llamadas.push(registro)
    const xhr: XhrLike = {
      status: 0,
      responseText: '',
      onload: null,
      onerror: null,
      onabort: null,
      upload: { onprogress: null },
      open: (_m, url) => { registro.url = url },
      setRequestHeader: (k, v) => { registro.headers[k] = v },
      abort: () => { registro.abortado = true },
      send: (body) => {
        const total = body.size
        setTimeout(() => {
          for (const p of g.progreso ?? []) xhr.upload.onprogress?.({ lengthComputable: true, loaded: p, total })
          if (g.nuncaTermina) return
          if (g.red) { xhr.onerror?.(); return }
          ;(xhr as { status: number }).status = g.status
          ;(xhr as { responseText: string }).responseText = g.body ?? ''
          xhr.onload?.()
        }, 0)
      },
    }
    return xhr
  }
  return { crearXhr, llamadas }
}

const archivo = () => new Blob([new Uint8Array(1000)], { type: 'video/mp4' }) as Blob & { type: string }
const sinEspera = () => Promise.resolve()

describe('subirArchivoStorage — XHR con progreso, reintentos y fallback', () => {
  it('sube con los headers que espera Storage y reporta progreso', async () => {
    const { crearXhr, llamadas } = fabricaXhr([{ status: 200, body: '{"Key":"x"}', progreso: [250, 1000] }])
    const progreso: number[] = []
    const r = await subirArchivoStorage('evidencias-servicio', '/sol/a.mp4', archivo(), {
      crearXhr, token: 'tok', esperar: sinEspera, onProgreso: p => progreso.push(p.cargado),
    })
    expect(r.publicUrl).toContain('/storage/v1/object/public/evidencias-servicio/sol/a.mp4')
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://test.supabase.co/storage/v1/object/evidencias-servicio/sol/a.mp4')
    expect(llamadas[0].headers).toMatchObject({
      apikey: 'test-anon-key',
      Authorization: 'Bearer tok',
      'x-upsert': 'false',
      'cache-control': 'max-age=3600',
      'content-type': 'video/mp4',
    })
    expect(progreso).toEqual([250, 1000, 1000])
  })

  it('reintenta tras error de red y 5xx, y termina OK', async () => {
    const { crearXhr, llamadas } = fabricaXhr([{ status: 0, red: true }, { status: 503, body: '{"message":"upstream"}' }, { status: 200 }])
    await subirArchivoStorage('b', 'p', archivo(), { crearXhr, token: 't', esperar: sinEspera })
    expect(llamadas).toHaveLength(3)
  })

  it('un 409 "already exists" en el reintento cuenta como éxito', async () => {
    const { crearXhr, llamadas } = fabricaXhr([{ status: 0, red: true }, { status: 409, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }])
    await expect(subirArchivoStorage('b', 'p', archivo(), { crearXhr, token: 't', esperar: sinEspera })).resolves.toBeTruthy()
    expect(llamadas).toHaveLength(2)
  })

  it('aborta por inactividad y reintenta; agota intentos → error legible', async () => {
    const { crearXhr, llamadas } = fabricaXhr([{ status: 0, nuncaTermina: true }])
    await expect(
      subirArchivoStorage('b', 'p', archivo(), { crearXhr, token: 't', esperar: sinEspera, stallMs: 5, maxIntentos: 2 }),
    ).rejects.toThrow(/sin avanzar/)
    expect(llamadas).toHaveLength(2)
    expect(llamadas.every(l => l.abortado)).toBe(true)
  })

  it('un 4xx distinto de 409 NO reintenta y cae al fallback una vez', async () => {
    const { crearXhr, llamadas } = fabricaXhr([{ status: 400, body: '{"message":"Invalid header"}' }])
    const fallback = vi.fn(async () => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await subirArchivoStorage('b', 'p', archivo(), { crearXhr, token: 't', esperar: sinEspera, fallback })
    warn.mockRestore()
    expect(llamadas).toHaveLength(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('si el fallback también falla, propaga su error', async () => {
    const { crearXhr } = fabricaXhr([{ status: 403, body: '{"message":"new row violates row-level security policy"}' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      subirArchivoStorage('b', 'p', archivo(), { crearXhr, token: 't', esperar: sinEspera, fallback: async () => { throw new Error('policy') } }),
    ).rejects.toThrow('policy')
    warn.mockRestore()
  })
})

describe('clasificarRespuesta / mensajeDeRespuestaStorage', () => {
  it('2xx y 409 son ok; 429/5xx/0 reintentables; otros 4xx → fallback', () => {
    expect(clasificarRespuesta(200, '').ok).toBe(true)
    expect(clasificarRespuesta(409, '{"message":"The resource already exists"}').ok).toBe(true)
    // Respuesta real de Storage (verificada 2026-10-24): HTTP 400 con statusCode "409".
    expect(clasificarRespuesta(400, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists","code":"KeyAlreadyExists"}').ok).toBe(true)
    const r429 = clasificarRespuesta(429, '')
    expect(r429.ok).toBe(false); expect(r429.error?.reintentable).toBe(true); expect(r429.error?.probarFallback).toBe(false)
    const r500 = clasificarRespuesta(500, '')
    expect(r500.error?.reintentable).toBe(true)
    const r0 = clasificarRespuesta(0, '')
    expect(r0.error?.reintentable).toBe(true)
    const r413 = clasificarRespuesta(413, '{"message":"Payload too large"}')
    expect(r413.error?.reintentable).toBe(false); expect(r413.error?.probarFallback).toBe(true)
    expect(r413.error?.message).toBe('Payload too large')
  })

  it('mensaje: usa message/error del JSON o "HTTP n"', () => {
    expect(mensajeDeRespuestaStorage('{"error":"Bad"}', 400)).toBe('Bad')
    expect(mensajeDeRespuestaStorage('<html>', 502)).toBe('HTTP 502')
  })
})

describe('ejecutarConLimite', () => {
  it('respeta el límite de concurrencia y conserva el orden', async () => {
    let enVuelo = 0
    let pico = 0
    const tareas = [50, 10, 30, 5, 20].map((ms, i) => async () => {
      enVuelo++
      pico = Math.max(pico, enVuelo)
      await new Promise(r => setTimeout(r, ms))
      enVuelo--
      return i
    })
    const res = await ejecutarConLimite(tareas, 2)
    expect(res).toEqual([0, 1, 2, 3, 4])
    expect(pico).toBe(2)
  })

  it('lista vacía → []', async () => {
    expect(await ejecutarConLimite([], 3)).toEqual([])
  })
})

describe('progreso agregado y mensajes', () => {
  it('porcentajeTotal pondera por bytes', () => {
    expect(porcentajeTotal([50, 0], [100, 100])).toBe(25)
    expect(porcentajeTotal([], [])).toBe(0)
    expect(porcentajeTotal([200], [100])).toBe(100)
  })

  it('crearAgregadorProgreso emite porcentaje y terminados', () => {
    const cambios: Array<[number, number]> = []
    const ag = crearAgregadorProgreso([100, 300], (p, l) => cambios.push([p, l]))
    ag.reportar(0, { cargado: 100, total: 100 })
    ag.terminar(0)
    ag.reportar(1, { cargado: 100, total: 300 })
    expect(cambios.at(-1)).toEqual([50, 1])
    ag.terminar(1)
    expect(cambios.at(-1)).toEqual([100, 2])
  })

  it('mensajes', () => {
    expect(mensajeProgresoSubida(2, 8, 42)).toBe('Subiendo 3 de 8 archivos · 42 %')
    expect(mensajeProgresoSubida(0, 1, 0)).toBe('Subiendo 1 de 1 archivo · 0 %')
    expect(mensajeProgresoSubida(8, 8, 100)).toBe('Subiendo 8 de 8 archivos · 100 %')
    expect(mensajePreparando(1, 8)).toBe('Preparando foto 2 de 8…')
  })
})

describe('comprimirConLimite', () => {
  it('un video (no imagen) vuelve tal cual sin esperar', async () => {
    const f = new File([new Uint8Array(10)], 'v.mp4', { type: 'video/mp4' })
    expect(await comprimirConLimite(f, 1000)).toBe(f)
  })
})

describe('tipoArchivoEvidencia — MIME vacío (galerías Android)', () => {
  it('clasifica por MIME y, si falta, por extensión', () => {
    expect(tipoArchivoEvidencia(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe('imagen')
    expect(tipoArchivoEvidencia(new File([''], 'a.mov', { type: 'video/quicktime' }))).toBe('video')
    expect(tipoArchivoEvidencia(new File([''], 'IMG_0001.HEIC', { type: '' }))).toBe('imagen')
    expect(tipoArchivoEvidencia(new File([''], 'VID_0001.mp4', { type: '' }))).toBe('video')
    expect(tipoArchivoEvidencia(new File([''], 'doc.pdf', { type: 'application/pdf' }))).toBeNull()
    expect(tipoArchivoEvidencia(new File([''], 'sin-extension', { type: '' }))).toBeNull()
  })
})
