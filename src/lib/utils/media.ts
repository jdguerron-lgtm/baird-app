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
 *    son 30-60 s. Resize a 2560px máx + JPEG 0.9 baja a ~600-900 KB → upload 5-10×
 *    más rápido y siguen siendo más que suficientes como evidencia técnica.
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
    maxDimension = 2560,
    quality = 0.9,
    skipThresholdBytes = SKIP_COMPRESSION_THRESHOLD_BYTES,
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
    return compressed.size < file.size ? compressed : file
  } catch (err) {
    console.warn('[compressImageIfNeeded] decode falló, subiendo original:', err)
    return file
  }
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
    return 'El video supera 10 MB. En iPhone: Ajustes → Cámara → Grabar video → elige "1080p HD a 30 fps" (o menor) y graba menos de 20 segundos.'
  }
  if (isAndroid) {
    return 'El video supera 10 MB. En Android: abre la app Cámara → ajustes → resolución 1080p (o 720p) y graba menos de 20 segundos.'
  }
  return 'El video supera 10 MB. Graba un clip más corto (10-15 s) o usa resolución 1080p en lugar de 4K.'
}
