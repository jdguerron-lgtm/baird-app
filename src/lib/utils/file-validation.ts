// Helpers para clasificar archivos cuando algunos navegadores Android (Samsung
// Internet viejo, Mi Browser de Xiaomi, Huawei Browser, ciertos WebView) reportan
// `File.type` vacío (`""`) en capturas de cámara. La lógica histórica
// (`file.type.startsWith('image/')`) descartaba esos archivos en silencio.
//
// Reglas (estrictamente más permisivas que el check anterior):
//   1. Si `file.type` tiene un valor reconocible → se usa tal cual.
//   2. Si `file.type` está vacío → se infiere por la extensión del nombre.
//   3. Si tampoco hay extensión válida → null (sigue siendo descartado).

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i
const VIDEO_EXTS = /\.(mp4|m4v|mov|3gp|3g2|webm|mkv|avi)$/i

export type MediaKind = 'image' | 'video' | null

export function classifyMedia(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (!file.type) {
    if (IMAGE_EXTS.test(file.name)) return 'image'
    if (VIDEO_EXTS.test(file.name)) return 'video'
  }
  return null
}

// Para Supabase Storage: si `file.type` está vacío, el bucket guarda el archivo
// con `application/octet-stream` y luego `<img>` no lo renderiza. Inferimos un
// content-type razonable desde la extensión para evitar que las fotos queden
// "rotas" en el panel admin / portal cliente.
export function inferContentType(file: File): string {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (/\.jpe?g$/.test(name)) return 'image/jpeg'
  if (/\.png$/.test(name)) return 'image/png'
  if (/\.gif$/.test(name)) return 'image/gif'
  if (/\.webp$/.test(name)) return 'image/webp'
  if (/\.heic$/.test(name)) return 'image/heic'
  if (/\.heif$/.test(name)) return 'image/heif'
  if (/\.avif$/.test(name)) return 'image/avif'
  if (/\.(mp4|m4v)$/.test(name)) return 'video/mp4'
  if (/\.mov$/.test(name)) return 'video/quicktime'
  if (/\.3gp$/.test(name)) return 'video/3gpp'
  if (/\.3g2$/.test(name)) return 'video/3gpp2'
  if (/\.webm$/.test(name)) return 'video/webm'
  return 'application/octet-stream'
}
