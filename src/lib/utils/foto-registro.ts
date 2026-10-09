/**
 * foto-registro.ts — preparación client-side de las fotos del formulario
 * /registro (foto de perfil y foto del documento) ANTES de subirlas a Storage.
 *
 * Por qué existe (2026-10-09): el técnico se registra desde el celular y las
 * fotos venían rebotando por reglas rígidas:
 *   - tope de 2 MB para el perfil: una foto de cámara pesa 3–8 MB → rechazo
 *     inmediato con "excede el tamaño máximo".
 *   - solo JPG/PNG por MIME + extensión: WebP, HEIC (iPhone) o archivos que el
 *     selector de Android entrega sin `type`/sin extensión → rechazo aunque la
 *     imagen fuera perfectamente válida.
 *
 * Ahora el flujo es: detectar el tipo real por magic bytes → comprimir y
 * re-encodear a JPEG en el navegador (reusa `compressImageIfNeeded` de
 * media.ts, el mismo que usan diagnóstico/completar) → validar que quedó en
 * un formato universal y por debajo del límite. Solo se rechaza lo que de
 * verdad no es una imagen o lo que el navegador no pudo decodificar (HEIC en
 * Chrome/Android), y en ese caso con un mensaje accionable.
 *
 * Las funciones puras (`sniffImageType`, `LIMITES_FOTO`) tienen tests en
 * src/__tests__/utils/foto-registro.test.ts; `prepararFoto` usa Canvas y
 * se prueba en el navegador.
 */
import { compressImageIfNeeded } from './media'

export type TipoFotoRegistro = 'perfil' | 'documento'

export const LIMITES_FOTO: Record<TipoFotoRegistro, { maxDimension: number; maxBytes: number; etiqueta: string }> = {
  // 1600 px de lado largo sobra para un avatar y deja la foto en ~200–400 KB.
  perfil: { maxDimension: 1600, maxBytes: 5 * 1024 * 1024, etiqueta: 'foto de perfil' },
  // La cédula debe seguir legible al hacer zoom → más resolución.
  documento: { maxDimension: 2400, maxBytes: 5 * 1024 * 1024, etiqueta: 'foto del documento' },
}

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/heic' | 'image/bmp'

/**
 * Detecta el tipo de imagen por los primeros 12 bytes. Es la fuente de verdad
 * cuando `file.type` viene vacío o mentiroso (selectores Android, archivos
 * renombrados). Devuelve null si no parece una imagen conocida.
 */
export function sniffImageType(header: Uint8Array): ImageMime | null {
  const b = header
  if (b.length < 4) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  if (b.length >= 12) {
    const ascii = (desde: number, hasta: number) => String.fromCharCode(...b.slice(desde, hasta))
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
    if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis|avif)$/.test(ascii(8, 12))) return 'image/heic'
  }
  return null
}

const FORMATOS_UNIVERSALES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

/**
 * Prepara una foto del registro para subirla: normaliza el MIME, comprime a
 * JPEG y verifica límites. Lanza Error con mensaje para mostrar al técnico.
 */
export async function prepararFoto(file: File, tipo: TipoFotoRegistro): Promise<File> {
  const cfg = LIMITES_FOTO[tipo]
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const real = sniffImageType(header)

  // Los magic bytes mandan sobre `file.type`: un MIME vacío (selector Android)
  // no descarta una foto válida, y un MIME "image/jpeg" no salva a un PDF
  // renombrado (que antes pasaba la selección y reventaba recién al enviar).
  if (!real) {
    throw new Error(`El archivo no es una imagen válida (JPG, PNG, WebP o HEIC). Selecciona una ${cfg.etiqueta} tomada con la cámara.`)
  }
  let entrada = file
  const mimeDeclarado = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase()
  if (mimeDeclarado !== real) {
    entrada = new File([file], file.name || `${tipo}.${real === 'image/jpeg' ? 'jpg' : 'png'}`, {
      type: real,
      lastModified: file.lastModified,
    })
  }

  // JPG/PNG pequeños se dejan tal cual (umbral 400 KB); todo lo demás
  // (pesado, WebP, HEIC, GIF, BMP) se re-encodea a JPEG.
  const esUniversal = FORMATOS_UNIVERSALES.has(entrada.type.toLowerCase())
  let salida = await compressImageIfNeeded(entrada, {
    maxDimension: cfg.maxDimension,
    quality: 0.85,
    skipThresholdBytes: esUniversal ? 400 * 1024 : 0,
    // WebP/HEIC/GIF/BMP: el JPEG puede pesar más que el original (imágenes
    // planas) y aun así lo queremos, porque el formato es lo que importa.
    forceReencode: !esUniversal,
  })

  // Segunda pasada más agresiva si sigue pesada (fotos enormes o PNG con mucho detalle).
  if (salida.size > cfg.maxBytes) {
    salida = await compressImageIfNeeded(salida, {
      maxDimension: Math.round(cfg.maxDimension * 0.6),
      quality: 0.7,
      skipThresholdBytes: 0,
    })
  }

  if (!FORMATOS_UNIVERSALES.has(salida.type.toLowerCase())) {
    // compressImageIfNeeded devuelve el original cuando el navegador no pudo
    // decodificar (típico: HEIC de iPhone abierto en Chrome/Android).
    const formato = (real ?? entrada.type).replace('image/', '').toUpperCase()
    throw new Error(
      `Tu navegador no pudo convertir esta imagen (formato ${formato}). ` +
        'Toma la foto directamente con la cámara desde este formulario o guárdala como JPG y vuelve a intentar.'
    )
  }

  if (salida.size > cfg.maxBytes) {
    throw new Error(
      `La ${cfg.etiqueta} sigue pesando más de ${Math.round(cfg.maxBytes / 1024 / 1024)} MB después de comprimirla. ` +
        'Toma la foto con menor resolución e inténtalo de nuevo.'
    )
  }

  return salida
}
