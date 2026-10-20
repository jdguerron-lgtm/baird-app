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
 *    son 30-60 s. Resize a 4000px máx + JPEG 0.92 (2026-10-20; antes 2560px / 0.9)
 *    baja a ~1.5-2.5 MB: se conserva el detalle fino de placas, tarjetas y
 *    soldaduras y el upload sigue siendo 2-3× más rápido que el original.
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

/**
 * Límite de tamaño para VIDEOS de evidencia (diagnóstico y pruebas de
 * completación). Subido de 10 → 50 MB el 2026-10-10: los videos van directo
 * del navegador a Supabase Storage (no pasan por Vercel, así que el tope de
 * 4.5 MB por request no aplica) y el bucket `evidencias-servicio` no tiene
 * `file_size_limit` propio — el techo real es el límite global del proyecto
 * Supabase (50 MB). Las fotos siguen con su propio tope post-compresión.
 */
export const MAX_VIDEO_SIZE_MB = 50
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
 * 6 → 12 en completar, 20 para la evidencia adicional del admin). El video
 * sigue limitado a MAX_VIDEO_SIZE_MB por archivo (techo del plan Supabase),
 * así que "un video más largo" se sube como varios clips de ≤ 50 MB.
 */
export const MAX_EVIDENCIAS_DIAGNOSTICO = 10
export const MAX_ARCHIVOS_COMPLETAR = 12
export const MAX_ARCHIVOS_EVIDENCIA_ADMIN = 20

/** Resolución y calidad por defecto de las fotos de evidencia (lado mayor en px / calidad JPEG). */
export const EVIDENCIA_MAX_DIMENSION = 4000
export const EVIDENCIA_JPEG_QUALITY = 0.92

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

  // Videos no se comprimen client-side.
  if (!file.type.startsWith('image/')) return file

  // Archivo ya razonable y formato compatible — devolvemos tal cual.
  if (file.size <= skipThresholdBytes && COMPATIBLE_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return file
  }

  try {
    // createImageBitmap maneja JPEG/PNG/WebP siempre, y HEIC/HEIF en iOS Safari 15+.
    // En navegadores que no decodifican HEIC, lanza — nosotros catcheamos abajo y
    // devolvemos el original (rare path: técnico iOS muy viejo).
    const bitmap = await createImageBitmap(file)

    // Calcular dimensiones target preservando aspect ratio.
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

  if (isIPhone) {
    return `El video supera ${MAX_VIDEO_SIZE_MB} MB. En iPhone: Ajustes → Cámara → Grabar video → elige "1080p HD a 30 fps" (o menor) y graba menos de 40 segundos. Si necesitas mostrar más, sube varios clips.`
  }
  if (isAndroid) {
    return `El video supera ${MAX_VIDEO_SIZE_MB} MB. En Android: abre la app Cámara → ajustes → resolución 1080p (o 720p) y graba menos de 40 segundos. Si necesitas mostrar más, sube varios clips.`
  }
  return `El video supera ${MAX_VIDEO_SIZE_MB} MB. Graba un clip más corto (20-30 s) o usa resolución 1080p en lugar de 4K. Puedes subir varios clips.`
}
