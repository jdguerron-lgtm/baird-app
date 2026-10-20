/**
 * Evidencia adicional subida por el equipo Baird desde la ficha admin
 * (2026-10-20): fotos, videos o PDF que llegan por WhatsApp/correo del
 * cliente, del técnico o del supervisor y que antes no tenían dónde quedar.
 *
 * Modelo (sin migración, misma decisión que el receptor): cada carga es UN
 * evento `solicitud_eventos` tipo `nota_admin` con
 *   payload.origen   = 'evidencia_admin'
 *   payload.archivos = [{ url, mime, nombre, bytes }]
 *   payload.subido_por = email del admin
 *   motivo           = nota opcional del admin
 * Los archivos viven en el bucket público `evidencias-servicio` bajo
 * `{solicitud_id}/admin_*` — el navegador del admin (sesión authenticated,
 * la policy de INSERT es `public`) sube directo a Storage, así que no aplica
 * el tope de 4.5 MB por request de Vercel; el API solo registra el evento.
 *
 * Append-only como las notas: un archivo equivocado se aclara con otra carga.
 */

export const ORIGEN_EVIDENCIA_ADMIN = 'evidencia_admin'

/** Prefijo de path dentro del bucket (tras `{solicitud_id}/`). */
export const PREFIJO_ARCHIVO_ADMIN = 'admin_'

export const BUCKET_EVIDENCIAS_PATH = '/storage/v1/object/public/evidencias-servicio/'

export interface ArchivoEvidenciaAdmin {
  url: string
  mime: string | null
  nombre: string | null
  bytes: number | null
}

export interface EventoEvidenciaAdmin {
  id: number
  tipo: string
  actor: string | null
  motivo: string | null
  payload: Record<string, unknown> | null
  ocurrido_at: string
}

/** true si el evento del audit log es una carga de evidencia del admin. */
export function esEventoEvidenciaAdmin(e: { tipo: string; payload: Record<string, unknown> | null }): boolean {
  return e.tipo === 'nota_admin' && e.payload?.origen === ORIGEN_EVIDENCIA_ADMIN
}

/** Archivos de un evento de evidencia admin (lista vacía si el payload está malformado). */
export function archivosDeEvento(e: { payload: Record<string, unknown> | null }): ArchivoEvidenciaAdmin[] {
  const raw = e.payload?.archivos
  if (!Array.isArray(raw)) return []
  return raw.flatMap((a) => {
    if (!a || typeof a !== 'object') return []
    const o = a as Record<string, unknown>
    if (typeof o.url !== 'string' || !o.url) return []
    return [{
      url: o.url,
      mime: typeof o.mime === 'string' ? o.mime : null,
      nombre: typeof o.nombre === 'string' ? o.nombre : null,
      bytes: typeof o.bytes === 'number' && Number.isFinite(o.bytes) ? o.bytes : null,
    }]
  })
}

/**
 * Valida que una URL pertenezca al bucket público de evidencias Y a la carpeta
 * de ESA solicitud con el prefijo del admin. Evita que el API registre URLs
 * arbitrarias (o archivos de otra solicitud) en el audit log.
 */
export function esUrlEvidenciaAdminValida(url: unknown, solicitudId: string): url is string {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false
  const idx = url.indexOf(BUCKET_EVIDENCIAS_PATH)
  if (idx === -1) return false
  const resto = url.slice(idx + BUCKET_EVIDENCIAS_PATH.length).split('?')[0]
  return resto.startsWith(`${solicitudId}/${PREFIJO_ARCHIVO_ADMIN}`) && !resto.includes('..')
}

/** Suma de archivos en una lista de eventos (para el contador de la galería). */
export function contarArchivosEvidenciaAdmin(eventos: Array<{ payload: Record<string, unknown> | null }>): number {
  return eventos.reduce((n, e) => n + archivosDeEvento(e).length, 0)
}
