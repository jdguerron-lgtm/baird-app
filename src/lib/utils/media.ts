/**
 * Utilidades client-side para preparar fotos/videos antes de subir a Supabase Storage.
 *
 * Problemas que resuelve:
 *
 * 1. **HEIC iPhone (iOS 11+)**: el técnico graba fotos en HEIC y pasan `file.type.startsWith('image/')`,
 *    pero los demás navegadores (Chrome/Firefox en Android/desktop) no decodifican HEIC.
 *    Resultado típico: la foto aparece en el preview del técnico pero "no carga" en
 *    el admin o en el WhatsApp del cliente. Canvas decodifica HEIC en iOS Safari y
 *    exporta como JPEG → universalmente visible.
 *
 * 2. **Peso del archivo**: una foto iPhone son 4-6 MB sin tocar. Subir 4 fotos en 4G
 *    son 30-60 s. Resize a 4000px máx + JPEG 0.85 (2026-10-29; 0.92 desde
 *    2026-10-20, antes 2560px / 0.9) baja a ~0.8-1.5 MB: se conserva el detalle
 *    fino de placas, tarjetas y soldaduras y el upload es 3-5× más rápido que
 *    el original. Además la subida arranca al elegir el archivo
 *    (`cola-subida.ts`), no al enviar el formulario.
 *
 * 3. **Extensión robusta**: `file.name.split('.').pop()` devuelve "HEIC", "MOV", "jpeg",
 *    o nada (cámaras nativas a veces no ponen nombre con extensión). `inferExtension`
 *    usa `file.type` como fuente de verdad y devuelve siempre una extensión razonable.
 *
 * 4. **Videos**: no se comprimen (requeriría ffmpeg.wasm + ~25 MB de bundle). Solo se
 *    validan tamaño y MIME. El videoSizeAdvice da un mensaje accionable para iPhone
 *    si el archivo es demasiado grande.
 *
 * Sin dependencias nuevas — usa Canvas API + createImageBitmap, ambos soportados en
 * iOS Safari 15+, Chrome Android 79+, Firefox 98+ (>99% de los técnicos en producción).
 */

/** Tamaño debajo del cual no vale la pena recomprimir si ya es JPEG/PNG/WebP. */
const SKIP_COMPRESSION_THRESHOLD_BYTES = 500 * 1024

/** Tope de video por defecto = techo por archivo del plan Free de Supabase. */
const VIDEO_MB_DEFAULT = 50

/**
 * Límite de tamaño para VIDEOS de evidencia (diagnóstico y pruebas de
 * completación). Subido de 10 → 50 MB el 2026-10-10: los videos van directo
 * del navegador a Supabase Storage (no pasan por Vercel, así que el tope de
 * 4.5 MB por request no aplica ni el plan de Vercel cambia nada) y el bucket
 * `evidencias-servicio` no tiene `file_size_limit` propio — el techo real es
 * el límite global del proyecto Supabase (50 MB en Free).
 *
 * Desde 2026-10-24 se lee de `NEXT_PUBLIC_EVIDENCIA_VIDEO_MAX_MB` (default 50)
 * para poder subirlo SIN tocar código cuando el proyecto pase a Supabase Pro:
 * (1) Supabase → Storage → Settings → "Upload file size limit" ≥ el valor,
 * (2) la env en Vercel, (3) redeploy. Si la env supera el límite real de
 * Supabase, el upload falla con "Payload too large" — primero (1), luego (2).
 * Las fotos siguen con su propio tope post-compresión.
 */
function leerVideoMaxMb(): number {
  const raw = Number(process.env.NEXT_PUBLIC_EVIDENCIA_VIDEO_MAX_MB)
  return Number.isFinite(raw) && raw >= 10 && raw <= 5000 ? Math.floor(raw) : VIDEO_MB_DEFAULT
}
export const MAX_VIDEO_SIZE_MB = leerVideoMaxMb()
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024

/**
 * Límite para IMÁGENES ya comprimidas (defensa post-compresión). Subido de
 * 10 → 20 MB el 2026-10-20 junto con la resolución de salida (4000 px / 0.92):
 * una foto de 48 MP re-encodeada puede pasar de 10 MB sin ser un error.
 */
export const MAX_IMAGE_SIZE_MB = 20
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

/**
 * Topes de archivos por formulario (2026-10-20: 4 → 10 en diagnóstico,
 * 6 → 12 en completar, 20 para la evidencia adicional del admin;
 * 2026-10-24: 20 / 20 / 30 porque seguían quedando cortos; 2026-10-29: 30 /
 * 30 / 30 y configurable con `NEXT_PUBLIC_EVIDENCIA_MAX_ARCHIVOS`). No hay
 * techo técnico en la cantidad: el límite real es el **storage** del proyecto
 * Supabase (1 GB en Free; al 2026-10-29 iban ~545 MB, creciendo 50–180 MB
 * por semana) — ver docs/GOTCHAS.md § Límites de evidencia. El video sigue
 * limitado a MAX_VIDEO_SIZE_MB por archivo, así que "un video más largo" se
 * sube como varios clips de ≤ ese tamaño.
 */
const ARCHIVOS_DEFAULT = 30
function leerMaxArchivos(): number {
  // Referencia literal a la env: Next solo inyecta NEXT_PUBLIC_* en el bundle
  // cuando aparece escrita completa (no sirve `process.env[nombre]`).
  const raw = Number(process.env.NEXT_PUBLIC_EVIDENCIA_MAX_ARCHIVOS)
  return Number.isFinite(raw) && raw >= 5 && raw <= 100 ? Math.floor(raw) : ARCHIVOS_DEFAULT
}
export const MAX_EVIDENCIAS_DIAGNOSTICO = leerMaxArchivos()
export const MAX_ARCHIVOS_COMPLETAR = leerMaxArchivos()
export const MAX_ARCHIVOS_EVIDENCIA_ADMIN = Math.max(30, leerMaxArchivos())

/**
 * Resolución y calidad por defecto de las fotos de evidencia (lado mayor en
 * px / calidad JPEG). 2026-10-29: calidad 0.92 → 0.85. En las fotos reales
 * de octubre (promedio 1,2–1,8 MB a 0.92) baja ~35–40 % de bytes sin pérdida
 * visible — a 4000 px las placas y tarjetas siguen legibles — y eso es menos
 * tiempo de subida en 4G y menos storage por servicio. Si hace falta volver,
 * es solo esta constante.
 */
export const EVIDENCIA_MAX_DIMENSION = 4000
export const EVIDENCIA_JPEG_QUALITY = 0.85

// ─────────────────────────────────────────────────────────────────────────────
// Dimensiones y orientación leyendo SOLO la cabecera (2026-10-29)
//
// Por qué: en Android, elegir fotos de la GALERÍA (no de la cámara) era
// lentísimo. La cámara del formulario entrega ~12 MP, pero la galería entrega
// el original de 50–108 MP de los Samsung/Xiaomi (hasta 12000×9000, 20–30 MB).
// `createImageBitmap(file)` decodificaba la imagen COMPLETA (108 MP = ~430 MB
// de RAM) antes de escalarla: en un celular de gama media tardaba 10–30 s por
// foto o directamente fallaba, caía al tope de 30 s de `comprimirConLimite` y
// terminaba subiendo el original de 25 MB. Con la cámara nunca pasaba.
//
// Solución: leer ancho/alto (y la orientación EXIF) de los primeros KB del
// archivo y pedirle al navegador que decodifique YA REDUCIDO
// (`createImageBitmap(file, { resizeWidth, resizeHeight })`): Chrome/Safari
// usan el escalado del propio decodificador JPEG (1/2, 1/4, 1/8), que es
// varias veces más rápido y usa una fracción de la memoria.
// ─────────────────────────────────────────────────────────────────────────────

export interface DimensionesImagen {
  /** Ancho/alto tal como vienen en el archivo (antes de aplicar la orientación EXIF). */
  ancho: number
  alto: number
  /** Orientación EXIF 1–8 (1 si no hay). 5–8 = la imagen se muestra rotada 90°. */
  orientacion: number
}

/** Bytes de cabecera que se leen para buscar dimensiones (los EXIF con miniatura pueden pasar de 64 KB). */
export const CABECERA_IMAGEN_BYTES = 512 * 1024

/**
 * Orientación EXIF de un JPEG a partir del segmento APP1 (`Exif\0\0` + TIFF).
 * Devuelve 1 si no la encuentra. `d` es un DataView sobre el inicio del archivo.
 */
export function leerOrientacionExif(d: DataView): number {
  let off = 2
  while (off + 4 <= d.byteLength) {
    if (d.getUint8(off) !== 0xff) return 1
    const marcador = d.getUint8(off + 1)
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { off += 2; continue }
    if (marcador === 0xda || marcador === 0xd9) return 1 // SOS / EOI: ya no hay APP1
    const largo = d.getUint16(off + 2)
    if (marcador === 0xe1 && off + 10 <= d.byteLength && d.getUint32(off + 4) === 0x45786966) {
      // 'Exif' 0x00 0x00, luego cabecera TIFF
      const tiff = off + 10
      if (tiff + 8 > d.byteLength) return 1
      const le = d.getUint16(tiff) === 0x4949
      const ifd0 = tiff + d.getUint32(tiff + 4, le)
      if (ifd0 + 2 > d.byteLength) return 1
      const n = d.getUint16(ifd0, le)
      for (let i = 0; i < n; i++) {
        const e = ifd0 + 2 + i * 12
        if (e + 12 > d.byteLength) return 1
        if (d.getUint16(e, le) === 0x0112) {
          const v = d.getUint16(e + 8, le)
          return v >= 1 && v <= 8 ? v : 1
        }
      }
      return 1
    }
    off += 2 + largo
  }
  return 1
}

/**
 * Dimensiones de un JPEG (marcador SOFn), PNG (IHDR) o WebP (VP8/VP8L/VP8X)
 * leyendo solo la cabecera. null si no se reconocen.
 */
export function leerDimensionesDeCabecera(bytes: Uint8Array): DimensionesImagen | null {
  if (bytes.length < 12) return null
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const b = bytes

  // PNG: 8 bytes de firma + IHDR (ancho/alto big-endian en 16 y 20)
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (b.length < 24) return null
    return { ancho: d.getUint32(16), alto: d.getUint32(20), orientacion: 1 }
  }

  // WebP: RIFF....WEBP + chunk VP8 / VP8L / VP8X
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    if (b.length < 30) return null
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (chunk === 'VP8X') {
      const ancho = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
      const alto = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
      return { ancho, alto, orientacion: 1 }
    }
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { ancho: 1 + (bits & 0x3fff), alto: 1 + ((bits >> 14) & 0x3fff), orientacion: 1 }
    }
    if (chunk === 'VP8 ') {
      return { ancho: d.getUint16(26, true) & 0x3fff, alto: d.getUint16(28, true) & 0x3fff, orientacion: 1 }
    }
    return null
  }

  // JPEG: recorrer marcadores hasta un SOFn (C0–CF salvo C4, C8, CC)
  if (b[0] === 0xff && b[1] === 0xd8) {
    let off = 2
    while (off + 9 <= b.length) {
      if (b[off] !== 0xff) { off++; continue }
      const m = b[off + 1]
      if (m === 0xff) { off++; continue }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { off += 2; continue }
      if (m === 0xda || m === 0xd9) return null
      const largo = d.getUint16(off + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { alto: d.getUint16(off + 5), ancho: d.getUint16(off + 7), orientacion: leerOrientacionExif(d) }
      }
      off += 2 + largo
    }
  }
  return null
}

/** Lee la cabecera de `file` y devuelve sus dimensiones, o null si no se reconocen. */
export async function leerDimensionesImagen(file: Blob): Promise<DimensionesImagen | null> {
  try {
    const buf = await file.slice(0, CABECERA_IMAGEN_BYTES).arrayBuffer()
    return leerDimensionesDeCabecera(new Uint8Array(buf))
  } catch {
    return null
  }
}

/**
 * Tamaño destino (ya orientado) para que el lado mayor quede en `maxDimension`.
 * null si la imagen ya cabe (no hace falta escalar).
 */
export function dimensionesDestino(dims: DimensionesImagen, maxDimension: number): { ancho: number; alto: number } | null {
  const rotada = dims.orientacion >= 5 && dims.orientacion <= 8
  const w = rotada ? dims.alto : dims.ancho
  const h = rotada ? dims.ancho : dims.alto
  if (w <= 0 || h <= 0) return null
  const lado = Math.max(w, h)
  if (lado <= maxDimension) return null
  const escala = maxDimension / lado
  return { ancho: Math.max(1, Math.round(w * escala)), alto: Math.max(1, Math.round(h * escala)) }
}

/** Tipos de imagen que ya son universalmente compatibles y no necesitan conversión. */
const COMPATIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

/** Tipos de video que la mayoría de navegadores reproducen sin transcodificar. */
const COMPATIBLE_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // iPhone .mov — Safari + Chrome reproducen, Firefox a veces no
])

export interface CompressOptions {
  /** Lado más largo (px) al que se hace resize. Si la imagen ya es menor, no se escala. */
  maxDimension?: number
  /** Calidad JPEG (0-1). 0.9 = visualmente sin pérdida apreciable, pero ~6× más liviano que sin comprimir. */
  quality?: number
  /** Si el archivo ya es JPEG/PNG/WebP y pesa menos que esto, se devuelve tal cual. */
  skipThresholdBytes?: number
  /**
   * Devolver SIEMPRE el JPEG re-encodeado aunque pese más que el original.
   * Útil cuando lo que importa es el formato (WebP/HEIC → JPEG universal), no
   * el peso: una imagen plana en WebP puede ser más liviana que su JPEG y la
   * defensa por tamaño devolvería el WebP original. Default false.
   */
  forceReencode?: boolean
}

/**
 * Devuelve la extensión más confiable para un archivo, infiriendo desde `file.type`.
 *
 * Preferimos MIME sobre el nombre porque las cámaras nativas (especialmente iOS)
 * generan archivos con nombres como "image.jpg" pero MIME `image/heic`, o sin
 * extensión en absoluto cuando el archivo viene de `capture="environment"`.
 */
export function inferExtension(file: File): string {
  const mime = file.type.toLowerCase()
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'video/3gpp': '3gp',
  }
  if (mimeMap[mime]) return mimeMap[mime]

  // Fallback al nombre del archivo si el MIME es desconocido (algunos Android raros).
  const fromName = file.name.toLowerCase().split('.').pop()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName

  return file.type.startsWith('video/') ? 'mp4' : 'jpg'
}

/**
 * Comprime una imagen client-side: resize + re-encode a JPEG.
 *
 * Si el archivo no es una imagen (ej. video), se devuelve tal cual.
 *
 * Si el archivo ya está en formato compatible Y pesa menos del umbral,
 * también se devuelve tal cual — recomprimir un JPEG ya pequeño solo lo
 * degrada un poco sin ganar tiempo.
 *
 * Si la decodificación falla (HEIC en un navegador que no soporta), se
 * devuelve el original — el upload puede fallar más tarde pero al menos
 * no rompemos aquí.
 */
export async function compressImageIfNeeded(file: File, opts: CompressOptions = {}): Promise<File> {
  const {
    maxDimension = EVIDENCIA_MAX_DIMENSION,
    quality = EVIDENCIA_JPEG_QUALITY,
    skipThresholdBytes = SKIP_COMPRESSION_THRESHOLD_BYTES,
    forceReencode = false,
  } = opts

  // Videos (y cualquier cosa que no sea imagen) no se comprimen client-side.
  // Se clasifica con tipoArchivoEvidencia para que una foto que llega con
  // MIME vacío desde la galería de algunos Android también pase por acá.
  if (tipoArchivoEvidencia(file) !== 'imagen') return file

  // Archivo ya razonable y formato compatible — devolvemos tal cual.
  if (file.size <= skipThresholdBytes && COMPATIBLE_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return file
  }

  try {
    // 2026-10-29: si la cabecera dice cuánto mide, se pide el bitmap YA
    // REDUCIDO (ver "Dimensiones y orientación" arriba). Para una foto de
    // galería de 50–108 MP esto es la diferencia entre 1 s y 20 s (o un
    // fallo de memoria) en Android. `imageOrientation: 'from-image'` para
    // que el resize se aplique sobre la imagen ya rotada según EXIF.
    let bitmap: ImageBitmap | null = null
    const dims = await leerDimensionesImagen(file)
    const destino = dims ? dimensionesDestino(dims, maxDimension) : null
    if (destino) {
      try {
        bitmap = await createImageBitmap(file, {
          resizeWidth: destino.ancho,
          resizeHeight: destino.alto,
          resizeQuality: 'medium',
          imageOrientation: 'from-image',
        } as ImageBitmapOptions)
      } catch {
        bitmap = null // opciones no soportadas → decode completo, como antes
      }
    }
    // createImageBitmap maneja JPEG/PNG/WebP siempre, y HEIC/HEIF en iOS Safari 15+.
    // En navegadores que no decodifican HEIC, lanza — nosotros catcheamos abajo y
    // devolvemos el original (rare path: técnico iOS muy viejo).
    if (!bitmap) bitmap = await createImageBitmap(file)

    // Calcular dimensiones target preservando aspect ratio (si ya vino
    // reducido, scale = 1 y se dibuja tal cual).
    const { width: srcW, height: srcH } = bitmap
    const longSide = Math.max(srcW, srcH)
    const scale = longSide > maxDimension ? maxDimension / longSide : 1
    const dstW = Math.round(srcW * scale)
    const dstH = Math.round(srcH * scale)

    const canvas = document.createElement('canvas')
    canvas.width = dstW
    canvas.height = dstH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
    if (!blob) return file

    // Nombre con .jpg y conservando el stem original (sin extensión).
    const stem = file.name.replace(/\.[^.]+$/, '') || 'foto'
    const compressed = new File([blob], `${stem}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })

    // Defensa: si por algún motivo el "comprimido" es más grande (raro, fotos
    // muy pequeñas que ya estaban súper optimizadas), devolvemos el original.
    return forceReencode || compressed.size < file.size ? compressed : file
  } catch (err) {
    console.warn('[compressImageIfNeeded] decode falló, subiendo original:', err)
    return file
  }
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', '3gp', 'm4v'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'avif'])

export type TipoArchivoEvidencia = 'imagen' | 'video'

/**
 * Clasifica un archivo elegido por el técnico. Primero por MIME; si viene
 * vacío (pasa con la galería de algunos Android y con archivos compartidos
 * desde WhatsApp), por la extensión del nombre. `null` = no es evidencia
 * (PDF, audio, etc.). Antes un MIME vacío se descartaba en silencio y el
 * técnico veía que "no pasaba nada" al elegir fotos.
 */
export function tipoArchivoEvidencia(file: { type: string; name?: string }): TipoArchivoEvidencia | null {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'imagen'
  if (mime.startsWith('video/')) return 'video'
  if (mime) return null
  const ext = (file.name || '').toLowerCase().split('.').pop() || ''
  if (IMAGE_EXTENSIONS.has(ext)) return 'imagen'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

/** Lado mayor de las miniaturas de vista previa (px). */
export const MINIATURA_MAX_DIMENSION = 320

/**
 * Miniatura liviana para la vista previa de una foto recién elegida.
 *
 * Antes la galería del formulario mostraba `URL.createObjectURL(original)`:
 * el navegador tenía que decodificar cada original completo (12–48 MP) para
 * pintar un cuadrito de 80 px, y con 10–20 fotos de la biblioteca a la vez el
 * celular se quedaba "pensando" o Safari recargaba la pestaña. Acá se decodifica
 * con `createImageBitmap(file, { resizeWidth })` (el navegador puede
 * decodificar a escala) y se exporta un JPEG de `MINIATURA_MAX_DIMENSION` px.
 * Si algo falla (HEIC en un navegador sin soporte, canvas sin contexto) vuelve
 * al object URL del original, como antes.
 */
export async function crearMiniatura(file: File, maxDim: number = MINIATURA_MAX_DIMENSION): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return URL.createObjectURL(file)
  }
  let bitmap: ImageBitmap | null = null
  try {
    // Primer decode ya reducido cuando el navegador lo soporta (Chrome/Safari 15+).
    bitmap = await createImageBitmap(file, { resizeWidth: maxDim, resizeQuality: 'low' } as ImageBitmapOptions)
      .catch(() => createImageBitmap(file))
    const { width: w, height: h } = bitmap
    const escala = Math.max(w, h) > maxDim ? maxDim / Math.max(w, h) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * escala))
    canvas.height = Math.max(1, Math.round(h * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) return URL.createObjectURL(file)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    return blob ? URL.createObjectURL(blob) : URL.createObjectURL(file)
  } catch {
    return URL.createObjectURL(file)
  } finally {
    bitmap?.close()
  }
}

/** Extensión (minúsculas, sin query string) de una URL de Storage; '' si no tiene. */
function extensionDeUrl(url: string): string {
  const limpia = url.split('?')[0].split('#')[0]
  const m = /\.([a-z0-9]{2,5})$/i.exec(limpia)
  return m ? m[1].toLowerCase() : ''
}

/**
 * true si la URL de evidencia apunta a un video (por extensión). Las galerías
 * (admin, supervisor, cotización del cliente) lo usan para renderizar
 * `<video>` en vez de `<img>`: antes todo pasaba por next/image y un .mp4
 * salía como imagen rota.
 */
export function esUrlVideo(url: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionDeUrl(url))
}

/** true si la URL apunta a un PDF (evidencia adicional del admin / comprobantes). */
export function esUrlPdf(url: string): boolean {
  return extensionDeUrl(url) === 'pdf'
}

/** Devuelve true si el video probablemente se reproducirá en la mayoría de browsers/devices. */
export function isCompatibleVideo(file: File): boolean {
  return COMPATIBLE_VIDEO_TYPES.has(file.type.toLowerCase())
}

/**
 * Mensaje accionable para el técnico cuando el video supera el límite de tamaño.
 * Detecta plataforma de forma básica vía user-agent para dar la guía correcta.
 */
export function videoSizeAdvice(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIPhone = /iPhone|iPad|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const seg = segundosVideoAprox(MAX_VIDEO_SIZE_MB)

  if (isIPhone) {
    return `El video supera ${MAX_VIDEO_SIZE_MB} MB. En iPhone: Ajustes → Cámara → Grabar video → elige "1080p HD a 30 fps" (o menor) y graba menos de ${seg} segundos. Si necesitas mostrar más, sube varios clips.`
  }
  if (isAndroid) {
    return `El video supera ${MAX_VIDEO_SIZE_MB} MB. En Android: abre la app Cámara → ajustes → resolución 1080p (o 720p) y graba menos de ${seg} segundos. Si necesitas mostrar más, sube varios clips.`
  }
  return `El video supera ${MAX_VIDEO_SIZE_MB} MB. Graba un clip más corto (menos de ${seg} s) o usa resolución 1080p en lugar de 4K. Puedes subir varios clips.`
}

/**
 * Duración aproximada (segundos) que cabe en `mb` a 1080p/30 fps en un
 * celular típico (~1,25 MB/s). Es una guía para el técnico, no un cálculo
 * exacto: 50 MB ≈ 40 s, 200 MB ≈ 160 s. Redondeado a múltiplos de 10.
 */
export function segundosVideoAprox(mb: number): number {
  return Math.max(10, Math.floor((mb / 1.25) / 10) * 10)
}
