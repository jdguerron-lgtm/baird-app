/**
 * Carnet digital del técnico (2026-10-10).
 *
 * Reemplaza la exposición de la FOTO DE LA CÉDULA al cliente (portal
 * /servicio/{cliente_token} + imagen por WhatsApp en procesarAceptacion):
 * el cliente solo necesita confirmar que la persona que llega es la que Baird
 * asignó, y eso se logra con foto de perfil + nombre + tipo y número de
 * documento (con los 2 primeros dígitos ocultos) que el cliente compara contra
 * la cédula física que el técnico muestra en la puerta. La IMAGEN de la cédula
 * (PII sensible, Ley 1581/2012) no sale de /admin.
 *
 * Tres superficies consumen el mismo modelo `CarnetTecnicoData`:
 *   - `src/components/ui/CarnetTecnico.tsx` → tarjeta React (portal cliente
 *     y portal técnico "Mi carnet").
 *   - `GET /api/carnet/{tecnicoId}` → PNG (next/og) para WhatsApp: imagen
 *     free-form best-effort en procesarAceptacion + HEADER IMAGE de las
 *     plantillas `tecnico_asignado_cliente_v7` / `tecnico_asignado_particular_v2`.
 *   - Admin sigue viendo la cédula completa en /admin/tecnicos/[id].
 */

export interface CarnetTecnicoData {
  id: string
  nombre_completo: string
  foto_perfil_url: string | null
  tipo_documento: string | null
  /** Número de documento con los 2 primeros dígitos ocultos y puntos de miles (p.ej. "••32.456.789"). */
  documento: string | null
  especialidad_principal: string | null
  ciudad_pueblo: string | null
  verificado: boolean
  /** ISO date de `tecnicos.fecha_verificacion` (null si no verificado). */
  fecha_verificacion: string | null
  contrato_firmado: boolean
  /** Código corto visible en el carnet (derivado del UUID, no secreto). */
  codigo: string
}

/** Columnas de `tecnicos` que necesita `construirCarnet`. */
export const CARNET_TECNICO_SELECT =
  'id, nombre_completo, foto_perfil_url, tipo_documento, numero_documento, especialidad_principal, ciudad_pueblo, estado_verificacion, fecha_verificacion, contrato_firmado'

export interface CarnetTecnicoRow {
  id: string
  nombre_completo: string
  foto_perfil_url?: string | null
  tipo_documento?: string | null
  numero_documento?: string | null
  especialidad_principal?: string | null
  ciudad_pueblo?: string | null
  estado_verificacion?: string | null
  fecha_verificacion?: string | null
  contrato_firmado?: boolean | null
}

/** Cuántos caracteres iniciales del documento se ocultan en el carnet. */
export const DIGITOS_OCULTOS_DOCUMENTO = 2

/**
 * Formatea el número de documento para el carnet ANONIMIZANDO los 2 primeros
 * dígitos (decisión 2026-10-10): limpia puntos/espacios, oculta el inicio con
 * "••" y agrega puntos de miles al resto ("1032456789" → "••32.456.789").
 * Pasaportes alfanuméricos: mismos 2 primeros caracteres ocultos, sin puntos.
 * Documentos de 2 o menos caracteres quedan como "••". Null si no hay número.
 */
export function formatearDocumento(numero: string | null | undefined): string | null {
  if (!numero) return null
  const limpio = String(numero).replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (!limpio) return null
  const mascara = '•'.repeat(DIGITOS_OCULTOS_DOCUMENTO)
  const resto = limpio.slice(DIGITOS_OCULTOS_DOCUMENTO)
  if (!resto) return mascara
  if (!/^\d+$/.test(limpio)) return mascara + resto
  return mascara + resto.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Código corto del carnet: "BS-" + primeros 8 hex del UUID en mayúscula.
 * Es un identificador legible para que el cliente lo mencione si llama a
 * Baird, NO una credencial (el UUID completo tampoco es secreto).
 */
export function codigoCarnet(tecnicoId: string): string {
  const hex = String(tecnicoId).replace(/-/g, '').slice(0, 8).toUpperCase()
  return `BS-${hex || '00000000'}`
}

export function construirCarnet(row: CarnetTecnicoRow): CarnetTecnicoData {
  const verificado = row.estado_verificacion === 'verificado'
  return {
    id: row.id,
    nombre_completo: row.nombre_completo,
    foto_perfil_url: row.foto_perfil_url ?? null,
    tipo_documento: row.tipo_documento ?? null,
    documento: formatearDocumento(row.numero_documento),
    especialidad_principal: row.especialidad_principal ?? null,
    ciudad_pueblo: row.ciudad_pueblo ?? null,
    verificado,
    fecha_verificacion: verificado ? (row.fecha_verificacion ?? null) : null,
    contrato_firmado: row.contrato_firmado === true,
    codigo: codigoCarnet(row.id),
  }
}

/** Fecha corta en español sin depender del TZ del runtime (solo YYYY-MM-DD). */
export function formatearFechaCarnet(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const mes = meses[Number(m[2]) - 1]
  if (!mes) return null
  return `${Number(m[3])} ${mes} ${m[1]}`
}

const APP_URL_FALLBACK = 'https://lineablanca.bairdservice.com'

/**
 * URL pública absoluta del PNG del carnet (la consume Meta para el header).
 * Con `auxiliaresIds` (equipo del servicio, 2026-10-13) el PNG agrega una
 * fila con los auxiliares; el endpoint ignora ids que no pertenezcan al
 * técnico o no estén verificados. Sin auxiliares la URL es la de siempre
 * (misma caché).
 */
export function urlImagenCarnet(tecnicoId: string, auxiliaresIds?: string[] | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK).replace(/\/$/, '')
  const url = `${base}/api/carnet/${encodeURIComponent(tecnicoId)}`
  const ids = (auxiliaresIds ?? []).filter(Boolean)
  return ids.length > 0 ? `${url}?aux=${encodeURIComponent(ids.join(','))}` : url
}
