// Comprime imágenes en cliente antes de subir a Supabase Storage.
//
// Diseño:
//   1. NUNCA falla en una forma que rompa la subida: cualquier excepción o
//      caso no soportado retorna el archivo ORIGINAL sin tocar.
//   2. Si el resultado "comprimido" termina siendo más grande que el original
//      (raro pero ocurre con PNGs muy chicos), devuelve el original.
//   3. No comprime videos ni archivos ya pequeños (≤ skipBelowBytes).
//   4. Usa `createImageBitmap` cuando está disponible (más rápido y maneja
//      HEIC nativo en Safari iOS); cae a HTMLImageElement como fallback.
//
// Para Android Chrome: la cámara entrega JPEG; comprimir a 2048px @ 0.85
// reduce típicamente 8-12MB a 0.6-1.5MB sin pérdida visual notable, lo que
// hace que las subidas en redes 3G/HSPA terminen.

export interface CompressOptions {
  maxDimension?: number
  quality?: number
  skipBelowBytes?: number
}

const DEFAULT_MAX_DIM = 2048
const DEFAULT_QUALITY = 0.85
const DEFAULT_SKIP_BELOW = 1.5 * 1024 * 1024

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const looksLikeImage =
    file.type.startsWith('image/') ||
    (!file.type && /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))
  if (!looksLikeImage) return file
  if (file.size <= (opts.skipBelowBytes ?? DEFAULT_SKIP_BELOW)) return file

  const maxDim = opts.maxDimension ?? DEFAULT_MAX_DIM
  const quality = opts.quality ?? DEFAULT_QUALITY

  let bitmap: ImageBitmap | null = null
  let img: HTMLImageElement | null = null
  let imgUrl: string | null = null

  try {
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
      try {
        bitmap = await createImageBitmap(file)
      } catch {
        bitmap = null
      }
    }

    let width: number
    let height: number

    if (bitmap) {
      width = bitmap.width
      height = bitmap.height
    } else {
      imgUrl = URL.createObjectURL(file)
      img = new Image()
      await new Promise<void>((resolve, reject) => {
        img!.onload = () => resolve()
        img!.onerror = () => reject(new Error('decode failed'))
        img!.src = imgUrl!
      })
      width = img.naturalWidth || img.width
      height = img.naturalHeight || img.height
    }

    if (!width || !height) return file

    const scale = Math.min(1, maxDim / Math.max(width, height))
    const tw = Math.max(1, Math.round(width * scale))
    const th = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    if (bitmap) ctx.drawImage(bitmap, 0, 0, tw, th)
    else if (img) ctx.drawImage(img, 0, 0, tw, th)

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) return file
    if (blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    if (bitmap) bitmap.close?.()
    if (imgUrl) URL.revokeObjectURL(imgUrl)
  }
}
