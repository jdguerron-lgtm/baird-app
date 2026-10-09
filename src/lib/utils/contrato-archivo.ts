/**
 * Validación pura (sin Supabase) del archivo del contrato de prestación de
 * servicios firmado y escaneado que el admin sube en /admin/tecnicos/[id].
 * Acepta PDF, JPG o PNG hasta 10 MB y verifica los magic bytes para no
 * confiar en la extensión ni en el MIME que declara el navegador.
 */

export const CONTRATO_ARCHIVO_MAX_BYTES = 10 * 1024 * 1024
export const CONTRATO_ARCHIVO_BUCKET = 'tecnicos-contratos'

export type ContratoArchivoTipo = 'pdf' | 'jpg' | 'png'

export function detectarTipoContrato(header: Uint8Array): ContratoArchivoTipo | null {
  if (header.length >= 4 && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) return 'pdf' // %PDF
  if (header.length >= 2 && header[0] === 0xff && header[1] === 0xd8) return 'jpg'
  if (header.length >= 4 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return 'png'
  return null
}

export function validarArchivoContrato(size: number, header: Uint8Array): { ok: true; tipo: ContratoArchivoTipo } | { ok: false; error: string } {
  if (size <= 0) return { ok: false, error: 'El archivo está vacío' }
  if (size > CONTRATO_ARCHIVO_MAX_BYTES) return { ok: false, error: 'El archivo excede el máximo de 10 MB' }
  const tipo = detectarTipoContrato(header)
  if (!tipo) return { ok: false, error: 'Solo se acepta PDF, JPG o PNG' }
  return { ok: true, tipo }
}

/** Ruta determinista dentro del bucket: {tecnicoId}/contrato_{version}_{ts}.{ext} */
export function rutaArchivoContrato(tecnicoId: string, version: string, tipo: ContratoArchivoTipo, ts = Date.now()): string {
  const safeId = tecnicoId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeVersion = version.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${safeId}/contrato_${safeVersion}_${ts}.${tipo}`
}
