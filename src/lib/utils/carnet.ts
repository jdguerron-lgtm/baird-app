/**
 * Carnet digital del técnico (2026-10-10).
 *
 * Reemplaza la exposición de la FOTO DE LA CÉDULA al cliente (portal
 * /servicio/{cliente_token} + imagen por WhatsApp en procesarAceptacion):
 * el cliente solo necesita confirmar que la persona que llega es la que Baird
 * asignó, y eso se logra con foto de perfil + nombre + documento ENMASCARADO
 * (últimos dígitos) que el cliente compara contra la cédula física que el
 * técnico muestra en la puerta. La imagen completa de la cédula es PII
 * sensible (Ley 1581/2012) y no vuelve a salir de /admin.
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
  /** Documento ENMASCARADO (p.ej. "•••• 4567"). Nunca el número completo. */
  documento_enmascarado: string | null
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

/** Cuántos dígitos finales del documento se muestran en el carnet. */
export const DIGITOS_VISIBLES_DOCUMENTO = 4

/**
 * Enmascara el número de documento dejando visibles solo los últimos
 * `DIGITOS_VISIBLES_DOCUMENTO` dígitos: "1032456789" → "•••• 6789".
 * Documentos muy cortos (≤ 4 dígitos) se ocultan por completo. Devuelve null
 * si no hay número.
 */
export function enmascararDocumento(numero: string | null | undefined): string | null {
  if (!numero) return null
  const limpio = String(numero).replace(/[^0-9A-Za-z]/g, '')
  if (!limpio) return null
  if (limpio.length <= DIGITOS_VISIBLES_DOCUMENTO) return '••••'
  return `•••• ${limpio.slice(-DIGITOS_VISIBLES_DOCUMENTO)}`
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
    documento_enmascarado: enmascararDocumento(row.numero_documento),
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

/** URL pública absoluta del PNG del carnet (la consume Meta para el header). */
export function urlImagenCarnet(tecnicoId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK).replace(/\/$/, '')
  return `${base}/api/carnet/${encodeURIComponent(tecnicoId)}`
}
