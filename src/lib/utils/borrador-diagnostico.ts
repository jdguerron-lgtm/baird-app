/**
 * Borrador local del formulario de diagnóstico del técnico (2026-11-03).
 *
 * Por qué existe: en Android la pestaña del navegador se recarga cuando el
 * técnico abre la cámara, cambia a WhatsApp para llamar al cliente o el
 * celular se queda sin memoria. Al volver, el formulario quedaba en blanco
 * (texto, firma, fotos ya subidas) y había que empezar de cero. El 3-nov una
 * técnica lo perdió dos veces seguidas y el diagnóstico nunca se registró.
 *
 * Qué guarda (en `localStorage`, por solicitud, con TTL de 24 h): los campos
 * del formulario y las URLs de los archivos que YA quedaron subidos a Storage.
 * Los archivos a medio subir no se pueden recuperar (el `File` no sobrevive a
 * la recarga): el técnico los vuelve a elegir.
 *
 * Todo va en try/catch: sin storage (modo privado, cuota llena) la página
 * funciona igual que antes, solo que sin borrador.
 */

import type { ComplejidadServicio } from '@/lib/constants/tarifas/mabe'
import type { CodigoFalla } from '@/lib/constants/codigos-falla'
import type { SiguientePasoData } from '@/components/ui/SiguientePasoSelector'
import type { ProductoNecesario, ProductoRecomendado } from '@/types/solicitud'
import type { TipoArchivoEvidencia } from '@/lib/utils/media'

export const BORRADOR_DIAGNOSTICO_VERSION = 1
export const BORRADOR_DIAGNOSTICO_TTL_MS = 24 * 60 * 60 * 1000

export interface ArchivoBorrador {
  url: string
  tipo: TipoArchivoEvidencia
  nombre: string
}

export interface DatosBorradorDiagnostico {
  diagnosticoTexto: string
  complejidad: ComplejidadServicio | null
  codigoFalla: CodigoFalla | null
  siguientePaso: SiguientePasoData | null
  productosNecesarios: ProductoNecesario[]
  productosRecomendados: ProductoRecomendado[]
  costoTecnico: string
  oathFirma: string | null
  evidencias: ArchivoBorrador[]
  placa: ArchivoBorrador | null
}

interface BorradorGuardado extends DatosBorradorDiagnostico {
  v: number
  savedAt: number
}

/** Interfaz mínima de Storage (inyectable en tests). */
export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export function claveBorradorDiagnostico(solicitudId: string): string {
  return `baird:diag-borrador:${solicitudId}`
}

function storagePorDefecto(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

/** true si el borrador no tiene nada que valga la pena recuperar. */
export function borradorVacio(d: DatosBorradorDiagnostico): boolean {
  return (
    !d.diagnosticoTexto.trim() &&
    !d.complejidad &&
    !d.codigoFalla &&
    !d.siguientePaso &&
    d.productosNecesarios.length === 0 &&
    d.productosRecomendados.length === 0 &&
    !d.costoTecnico.trim() &&
    d.evidencias.length === 0 &&
    !d.placa
  )
}

const esArchivo = (a: unknown): a is ArchivoBorrador =>
  !!a &&
  typeof a === 'object' &&
  typeof (a as ArchivoBorrador).url === 'string' &&
  (a as ArchivoBorrador).url.startsWith('https://') &&
  ((a as ArchivoBorrador).tipo === 'imagen' || (a as ArchivoBorrador).tipo === 'video') &&
  typeof (a as ArchivoBorrador).nombre === 'string'

export function guardarBorradorDiagnostico(
  solicitudId: string,
  datos: DatosBorradorDiagnostico,
  opts: { storage?: StorageLike | null; ahora?: number } = {},
): boolean {
  const storage = opts.storage === undefined ? storagePorDefecto() : opts.storage
  if (!storage) return false
  try {
    // La firma sola no amerita borrador: si no hay nada más, se limpia.
    if (borradorVacio(datos)) {
      storage.removeItem(claveBorradorDiagnostico(solicitudId))
      return true
    }
    const guardado: BorradorGuardado = { ...datos, v: BORRADOR_DIAGNOSTICO_VERSION, savedAt: opts.ahora ?? Date.now() }
    storage.setItem(claveBorradorDiagnostico(solicitudId), JSON.stringify(guardado))
    return true
  } catch {
    return false
  }
}

/** Lee el borrador; null si no hay, venció, es de otra versión o está corrupto. */
export function leerBorradorDiagnostico(
  solicitudId: string,
  opts: { storage?: StorageLike | null; ahora?: number } = {},
): (DatosBorradorDiagnostico & { savedAt: number }) | null {
  const storage = opts.storage === undefined ? storagePorDefecto() : opts.storage
  if (!storage) return null
  const clave = claveBorradorDiagnostico(solicitudId)
  try {
    const crudo = storage.getItem(clave)
    if (!crudo) return null
    const b = JSON.parse(crudo) as Partial<BorradorGuardado>
    const ahora = opts.ahora ?? Date.now()
    if (
      !b ||
      b.v !== BORRADOR_DIAGNOSTICO_VERSION ||
      typeof b.savedAt !== 'number' ||
      ahora - b.savedAt > BORRADOR_DIAGNOSTICO_TTL_MS
    ) {
      storage.removeItem(clave)
      return null
    }
    return {
      savedAt: b.savedAt,
      diagnosticoTexto: typeof b.diagnosticoTexto === 'string' ? b.diagnosticoTexto : '',
      complejidad: b.complejidad === 'baja' || b.complejidad === 'media' || b.complejidad === 'alta' ? b.complejidad : null,
      codigoFalla: b.codigoFalla && typeof b.codigoFalla === 'object' ? b.codigoFalla : null,
      siguientePaso: b.siguientePaso && typeof b.siguientePaso === 'object' && typeof b.siguientePaso.paso === 'string'
        ? b.siguientePaso
        : null,
      productosNecesarios: Array.isArray(b.productosNecesarios) ? b.productosNecesarios : [],
      productosRecomendados: Array.isArray(b.productosRecomendados) ? b.productosRecomendados : [],
      costoTecnico: typeof b.costoTecnico === 'string' ? b.costoTecnico : '',
      oathFirma: typeof b.oathFirma === 'string' && b.oathFirma ? b.oathFirma : null,
      evidencias: Array.isArray(b.evidencias) ? b.evidencias.filter(esArchivo) : [],
      placa: esArchivo(b.placa) ? b.placa : null,
    }
  } catch {
    try { storage.removeItem(clave) } catch { /* noop */ }
    return null
  }
}

export function borrarBorradorDiagnostico(solicitudId: string, opts: { storage?: StorageLike | null } = {}): void {
  const storage = opts.storage === undefined ? storagePorDefecto() : opts.storage
  if (!storage) return
  try {
    storage.removeItem(claveBorradorDiagnostico(solicitudId))
  } catch {
    /* noop */
  }
}
