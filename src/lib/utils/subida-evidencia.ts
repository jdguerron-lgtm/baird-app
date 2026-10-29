/**
 * Subida de evidencia (fotos/videos) a Supabase Storage desde el navegador del
 * técnico, con progreso real, corte por inactividad y reintentos.
 *
 * Por qué existe (2026-10-24): varios técnicos reportaban que al subir fotos o
 * videos de la biblioteca "la aplicación se queda pensando". Causas:
 *
 * 1. `supabase.storage.upload()` usa `fetch`, que NO expone progreso de subida
 *    ni tiene timeout: con un video de 40 MB en 4G el técnico veía el mismo
 *    spinner 2-3 minutos y, si la conexión se caía a mitad, el `Promise.all`
 *    nunca resolvía → spinner infinito.
 * 2. Todos los archivos (hasta 20) se comprimían y subían EN PARALELO. Veinte
 *    decodificaciones de 12-48 MP a la vez en un celular = memoria al tope y
 *    pestaña congelada; veinte conexiones a la vez en datos móviles = todas
 *    lentas y ninguna termina.
 *
 * Qué hace distinto:
 * - `XMLHttpRequest` contra el mismo endpoint REST que usa storage-js
 *   (`POST /storage/v1/object/{bucket}/{path}`, cuerpo binario crudo + headers
 *   `apikey`, `Authorization`, `x-upsert`, `cache-control`, `content-type`),
 *   que sí da `upload.onprogress`.
 * - Corte por inactividad (`stallMs`): si en 45 s no sube ni un byte, aborta y
 *   reintenta (hasta 3 intentos, 1 s / 3 s de espera). Un 409 "already exists"
 *   en un reintento se trata como éxito: el intento anterior sí llegó.
 * - Si el endpoint responde un 4xx distinto de 409 (header mal armado, policy),
 *   cae UNA vez a `supabase.storage.upload()` con timeout, para no quedar peor
 *   que antes por un detalle de este helper.
 * - `ejecutarConLimite` corre las tareas de a 3, en orden, y
 *   `comprimirConLimite` evita que una foto que no se deja decodificar bloquee
 *   el envío (tras 30 s sigue con el original).
 *
 * Las funciones puras (progreso, mensajes, pool, clasificación de
 * respuestas) están cubiertas en `src/__tests__/utils/subida-evidencia.test.ts`
 * con un XHR falso.
 *
 * **Subida reanudable (TUS) para archivos grandes — 2026-10-29, plan Pro.**
 * A partir de `TUS_UMBRAL_BYTES` (6 MB, el umbral que recomienda Supabase) el
 * archivo ya no va en UN solo POST: se parte en trozos de 6 MB por el
 * protocolo TUS (`tus-js-client` → `/storage/v1/upload/resumable` en el host
 * directo de Storage `{ref}.storage.supabase.co`). Si la red se cae a mitad
 * de un video de 200 MB, el cliente retoma desde el último trozo aceptado en
 * vez de empezar de cero, y el servidor valida el tope de tamaño del
 * proyecto como siempre. Si el endpoint TUS responde un 4xx de verdad
 * (configuración), se cae al POST clásico para no quedar peor que antes.
 */

import * as tus from 'tus-js-client'
import { supabase } from '@/lib/supabase'
import { compressImageIfNeeded } from '@/lib/utils/media'

export const SUBIDA_CONCURRENCIA = 3
export const SUBIDA_STALL_MS = 45_000
export const SUBIDA_MAX_INTENTOS = 3
export const COMPRESION_TIMEOUT_MS = 30_000
/** Desde este tamaño se usa TUS reanudable (recomendación de Supabase: > 6 MB). */
export const TUS_UMBRAL_BYTES = 6 * 1024 * 1024
/** Tamaño de trozo TUS: Supabase exige exactamente 6 MB. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024
/** Timeout del fallback vía supabase-js (no tiene progreso, así que es un techo duro). */
const FALLBACK_TIMEOUT_MS = 5 * 60_000

export interface ProgresoBytes {
  cargado: number
  total: number
}

/** Subconjunto de XMLHttpRequest que usa el helper — inyectable en tests. */
export interface XhrLike {
  open(method: string, url: string): void
  setRequestHeader(nombre: string, valor: string): void
  send(body: Blob): void
  abort(): void
  readonly status: number
  readonly responseText: string
  onload: ((this: unknown, ev?: unknown) => void) | null
  onerror: ((this: unknown, ev?: unknown) => void) | null
  onabort: ((this: unknown, ev?: unknown) => void) | null
  upload: { onprogress: ((ev: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
}

export interface OpcionesSubida {
  onProgreso?: (p: ProgresoBytes) => void
  /** ms sin progreso antes de abortar el intento (default 45 s). */
  stallMs?: number
  /** intentos totales vía XHR (default 3). */
  maxIntentos?: number
  cacheControl?: string
  /** Token Bearer. Default: sesión activa de Supabase Auth (admin) o la anon key. */
  token?: string
  /** Inyección para tests. */
  crearXhr?: () => XhrLike
  /** Inyección para tests: espera entre reintentos. */
  esperar?: (ms: number) => Promise<void>
  /** Inyección para tests: fallback vía supabase-js. */
  fallback?: () => Promise<void>
  /**
   * Forzar o apagar la subida reanudable. Default: automática cuando el
   * archivo supera `TUS_UMBRAL_BYTES`.
   */
  resumable?: boolean
  /** Inyección para tests: implementación TUS. */
  subirTus?: (args: ArgsTus) => Promise<void>
}

export interface ArgsTus {
  bucket: string
  path: string
  file: Blob & { type: string }
  token: string
  anon: string
  cacheControl: string
  stallMs: number
  onProgreso?: (p: ProgresoBytes) => void
}

export class ErrorSubida extends Error {
  constructor(
    mensaje: string,
    /** true = vale la pena reintentar (red, 5xx, 429, inactividad). */
    public readonly reintentable: boolean,
    /** true = la respuesta fue un 4xx "de verdad" (no 409): conviene probar el fallback. */
    public readonly probarFallback: boolean,
    public readonly status: number = 0,
  ) {
    super(mensaje)
    this.name = 'ErrorSubida'
  }
}

/** Mensaje legible de la respuesta de Storage (`{ message | error | statusCode }`). */
export function mensajeDeRespuestaStorage(texto: string, status: number): string {
  try {
    const j = JSON.parse(texto) as { message?: string; error?: string; statusCode?: string }
    const m = j.message || j.error
    if (m) return m
  } catch {
    /* no es JSON */
  }
  return `HTTP ${status}`
}

/**
 * Clasifica la respuesta HTTP de Storage.
 * - 2xx → ok.
 * - 409 / "already exists" → ok (reintento tras un intento que sí llegó; el path
 *   lleva timestamp + random, así que no es una colisión real).
 * - 408 / 425 / 429 / 5xx / 0 → reintentable.
 * - otro 4xx → no reintentable, probar fallback.
 */
export function clasificarRespuesta(status: number, texto: string): { ok: boolean; error?: ErrorSubida } {
  if (status >= 200 && status < 300) return { ok: true }
  const mensaje = mensajeDeRespuestaStorage(texto, status)
  if (status === 409 || /already exists|duplicate/i.test(mensaje)) return { ok: true }
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) {
    return { ok: false, error: new ErrorSubida(mensaje, true, false, status) }
  }
  return { ok: false, error: new ErrorSubida(mensaje, false, true, status) }
}

function urlStorage(bucket: string, path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const limpio = path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
  return `${base}/storage/v1/object/${bucket}/${limpio}`
}

/**
 * Host directo de Storage (`{ref}.storage.supabase.co`), que Supabase
 * recomienda para archivos grandes porque evita el gateway de la API. Si la
 * URL no tiene la forma estándar (self-hosted, local), se usa tal cual.
 */
export function urlTusResumable(baseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL || ''): string {
  const base = baseUrl.replace(/\/$/, '')
  const m = /^(https?:\/\/)([a-z0-9]+)\.supabase\.co$/i.exec(base)
  const host = m ? `${m[1]}${m[2]}.storage.supabase.co` : base
  return `${host}/storage/v1/upload/resumable`
}

/** Clasifica el error de tus-js-client igual que `clasificarRespuesta`. */
export function clasificarErrorTus(status: number | null, mensaje: string): ErrorSubida {
  if (status == null || status === 0) return new ErrorSubida(mensaje || 'Error de red al subir el archivo.', true, false, 0)
  if (status === 408 || status === 425 || status === 429 || status >= 500) return new ErrorSubida(mensaje, true, false, status)
  return new ErrorSubida(mensaje, false, true, status)
}

/** Un intento de subida reanudable por TUS; rechaza con ErrorSubida. */
function intentoTus(args: ArgsTus): Promise<void> {
  const { bucket, path, file, token, anon, cacheControl, stallMs, onProgreso } = args
  return new Promise<void>((resolve, reject) => {
    let terminado = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const limpiar = () => { if (timer) clearTimeout(timer); timer = null }
    const finalizar = (fn: () => void) => {
      if (terminado) return
      terminado = true
      limpiar()
      fn()
    }
    const upload = new tus.Upload(file, {
      endpoint: urlTusResumable(),
      // Reintentos internos de tus (misma petición): red / 5xx. El corte por
      // inactividad y el reintento "desde cero" los maneja el bucle de afuera.
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: anon,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // No reanudar entre recargas: el nombre destino cambia por lote y un
      // upload viejo apuntaría a otro objeto. La reanudación que importa es
      // dentro de la misma sesión (red que se cae a mitad).
      storeFingerprintForResuming: false,
      chunkSize: TUS_CHUNK_BYTES,
      metadata: {
        bucketName: bucket,
        objectName: path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/'),
        contentType: file.type || 'application/octet-stream',
        cacheControl,
      },
      onShouldRetry: (err) => {
        const status = err.originalResponse?.getStatus() ?? 0
        // 4xx de verdad (403 policy, 400 metadata, 409 ya existe, 413 tope): no insistir.
        return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
      },
      onProgress: (enviados, total) => {
        if (terminado) return
        armarStall()
        onProgreso?.({ cargado: Math.min(enviados, total || file.size), total: total || file.size })
      },
      onError: (err) => finalizar(() => {
        const det = err as tus.DetailedError
        const status = det.originalResponse?.getStatus?.() ?? null
        const cuerpo = det.originalResponse?.getBody?.() ?? ''
        const mensaje = cuerpo ? mensajeDeRespuestaStorage(cuerpo, status ?? 0) : (err.message || 'Error al subir el archivo.')
        if (status === 409 || /already exists|duplicate/i.test(mensaje)) { resolve(); return }
        reject(clasificarErrorTus(status, mensaje))
      }),
      onSuccess: () => finalizar(() => {
        onProgreso?.({ cargado: file.size, total: file.size })
        resolve()
      }),
    })
    const armarStall = () => {
      limpiar()
      if (stallMs > 0) {
        timer = setTimeout(() => {
          finalizar(() => {
            upload.abort().catch(() => { /* ya cerrado */ })
            reject(new ErrorSubida('La conexión se quedó sin avanzar. Reintentando…', true, false, 0))
          })
        }, stallMs)
      }
    }
    armarStall()
    upload.start()
  })
}

async function tokenPorDefecto(): Promise<string> {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || anon
  } catch {
    return anon
  }
}

const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Un intento de subida vía XHR; rechaza con ErrorSubida. */
function intentoXhr(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  stallMs: number,
  crearXhr: () => XhrLike,
  onProgreso?: (p: ProgresoBytes) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = crearXhr()
    let terminado = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const limpiar = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const finalizar = (fn: () => void) => {
      if (terminado) return
      terminado = true
      limpiar()
      fn()
    }
    const armarStall = () => {
      limpiar()
      if (stallMs > 0) {
        timer = setTimeout(() => {
          finalizar(() => {
            try { xhr.abort() } catch { /* ya cerrado */ }
            reject(new ErrorSubida('La conexión se quedó sin avanzar. Reintentando…', true, false, 0))
          })
        }, stallMs)
      }
    }

    xhr.open('POST', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)

    xhr.upload.onprogress = (ev) => {
      if (terminado) return
      armarStall()
      if (onProgreso) {
        const total = ev.lengthComputable && ev.total > 0 ? ev.total : file.size
        onProgreso({ cargado: Math.min(ev.loaded, total), total })
      }
    }
    xhr.onload = () => finalizar(() => {
      const r = clasificarRespuesta(xhr.status, xhr.responseText)
      if (r.ok) {
        onProgreso?.({ cargado: file.size, total: file.size })
        resolve()
      } else {
        reject(r.error)
      }
    })
    xhr.onerror = () => finalizar(() => reject(new ErrorSubida('Error de red al subir el archivo.', true, false, 0)))
    xhr.onabort = () => finalizar(() => reject(new ErrorSubida('Subida cancelada.', true, false, 0)))

    armarStall()
    xhr.send(file)
  })
}

/**
 * Sube `file` a `bucket/path` y devuelve la URL pública. Lanza `Error` con un
 * mensaje legible si agota los intentos.
 */
export async function subirArchivoStorage(
  bucket: string,
  path: string,
  file: Blob & { type: string },
  opts: OpcionesSubida = {},
): Promise<{ publicUrl: string }> {
  const stallMs = opts.stallMs ?? SUBIDA_STALL_MS
  const maxIntentos = Math.max(1, opts.maxIntentos ?? SUBIDA_MAX_INTENTOS)
  const esperar = opts.esperar ?? dormir
  const crearXhr = opts.crearXhr ?? (() => new XMLHttpRequest() as unknown as XhrLike)
  const token = opts.token ?? (await tokenPorDefecto())
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const url = urlStorage(bucket, path)

  const headers: Record<string, string> = {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    'x-upsert': 'false',
    'cache-control': `max-age=${opts.cacheControl ?? '3600'}`,
  }
  if (file.type) headers['content-type'] = file.type

  const fallback = opts.fallback ?? (async () => {
    const subida = supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: opts.cacheControl ?? '3600', upsert: false, contentType: file.type || undefined })
      .then(({ error }) => {
        if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message)
      })
    let t: ReturnType<typeof setTimeout> | null = null
    const limite = new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error('La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.')), FALLBACK_TIMEOUT_MS)
    })
    try {
      await Promise.race([subida, limite])
    } finally {
      if (t) clearTimeout(t)
    }
  })

  const usarTus = opts.resumable ?? file.size > TUS_UMBRAL_BYTES
  const subirTus = opts.subirTus ?? intentoTus

  let ultimo: ErrorSubida | null = null
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      if (usarTus) {
        await subirTus({ bucket, path, file, token, anon, cacheControl: opts.cacheControl ?? '3600', stallMs, onProgreso: opts.onProgreso })
      } else {
        await intentoXhr(url, file, headers, stallMs, crearXhr, opts.onProgreso)
      }
      ultimo = null
      break
    } catch (e) {
      const err = e instanceof ErrorSubida ? e : new ErrorSubida(e instanceof Error ? e.message : String(e), true, false, 0)
      ultimo = err
      if (err.probarFallback) break
      if (intento < maxIntentos && err.reintentable) {
        await esperar(intento === 1 ? 1000 : 3000)
        continue
      }
      break
    }
  }

  if (ultimo && ultimo.probarFallback && usarTus) {
    // TUS respondió un 4xx de configuración (endpoint, metadata, policy):
    // probar el POST clásico una vez antes de rendirse. Si el tope del
    // proyecto es el problema (413), también fallará y el mensaje lo dirá.
    console.warn('[subirArchivoStorage] TUS respondió', ultimo.status, ultimo.message, '→ POST clásico')
    try {
      await intentoXhr(url, file, headers, stallMs, crearXhr, opts.onProgreso)
      ultimo = null
    } catch (e) {
      ultimo = e instanceof ErrorSubida ? e : new ErrorSubida(e instanceof Error ? e.message : String(e), true, false, 0)
    }
  }

  if (ultimo) {
    if (ultimo.probarFallback) {
      console.warn('[subirArchivoStorage] XHR respondió', ultimo.status, ultimo.message, '→ fallback supabase-js')
      await fallback()
    } else {
      throw new Error(ultimo.message || 'No se pudo subir el archivo.')
    }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}

/**
 * Ejecuta `tareas` con a lo sumo `limite` en vuelo, conservando el orden de
 * los resultados. Si una tarea lanza, la promesa rechaza (igual que
 * Promise.all) — las páginas envuelven cada tarea para devolver `{ ok:false }`.
 */
export async function ejecutarConLimite<T>(tareas: Array<() => Promise<T>>, limite: number = SUBIDA_CONCURRENCIA): Promise<T[]> {
  const resultados: T[] = new Array(tareas.length)
  let siguiente = 0
  const n = Math.max(1, Math.min(limite, tareas.length))
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++
      resultados[i] = await tareas[i]()
    }
  }
  await Promise.all(Array.from({ length: n }, trabajador))
  return resultados
}

/**
 * Comprime con tope de tiempo: si `compressImageIfNeeded` no termina en
 * `timeoutMs` (decode colgado en un celular con poca memoria), sigue con el
 * archivo original en vez de dejar el formulario "pensando".
 */
export async function comprimirConLimite(file: File, timeoutMs: number = COMPRESION_TIMEOUT_MS): Promise<File> {
  let t: ReturnType<typeof setTimeout> | null = null
  const limite = new Promise<File>(resolve => {
    t = setTimeout(() => {
      console.warn('[comprimirConLimite] compresión excedió', timeoutMs, 'ms; se sube el original')
      resolve(file)
    }, timeoutMs)
  })
  try {
    return await Promise.race([compressImageIfNeeded(file), limite])
  } finally {
    if (t) clearTimeout(t)
  }
}

/** Porcentaje global (0–100) a partir de bytes por archivo. */
export function porcentajeTotal(cargado: number[], total: number[]): number {
  const t = total.reduce((a, b) => a + b, 0)
  if (t <= 0) return 0
  const c = cargado.reduce((a, b) => a + b, 0)
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)))
}

/** Texto corto para el spinner: "Subiendo 3 de 8 · 42 %". */
export function mensajeProgresoSubida(listos: number, total: number, porcentaje: number): string {
  if (total <= 0) return 'Subiendo…'
  const enCurso = Math.min(total, listos + 1)
  return `Subiendo ${enCurso} de ${total} archivo${total === 1 ? '' : 's'} · ${porcentaje} %`
}

/** Texto para la fase de compresión: "Preparando foto 2 de 8". */
export function mensajePreparando(indice: number, total: number): string {
  return `Preparando foto ${Math.min(total, indice + 1)} de ${total}…`
}

/**
 * Agregador de progreso para N archivos: cada tarea reporta sus bytes y el
 * agregador llama `onCambio` con el porcentaje global y los terminados.
 */
export function crearAgregadorProgreso(
  tamanos: number[],
  onCambio: (porcentaje: number, listos: number) => void,
): { reportar: (i: number, p: ProgresoBytes) => void; terminar: (i: number) => void } {
  const cargado = tamanos.map(() => 0)
  const total = tamanos.slice()
  const listo = tamanos.map(() => false)
  const emitir = () => onCambio(porcentajeTotal(cargado, total), listo.filter(Boolean).length)
  return {
    reportar: (i, p) => {
      if (p.total > 0) total[i] = p.total
      cargado[i] = Math.min(p.cargado, total[i])
      emitir()
    },
    terminar: (i) => {
      cargado[i] = total[i]
      listo[i] = true
      emitir()
    },
  }
}
