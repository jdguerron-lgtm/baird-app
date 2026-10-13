/**
 * Receptor del servicio (2026-10-13): persona distinta del titular que recibe
 * al técnico en el domicilio y sigue el flujo en paralelo por WhatsApp.
 *
 * Helpers PUROS (sin Supabase ni fetch) compartidos por el formulario del
 * técnico, los endpoints y el service de WhatsApp. Ver docs/FLOWS.md
 * § "Side flow: Receptor del servicio".
 */
import { phoneToDigits, isMobileColombiano } from '@/lib/utils/phone'

/** Lista cerrada — en sync con el CHECK de 20261013_receptor_servicio.sql. */
export const RELACIONES_RECEPTOR = [
  { value: 'familiar', label: 'Familiar' },
  { value: 'empleado_hogar', label: 'Empleado(a) del hogar' },
  { value: 'administracion', label: 'Administración / portería' },
  { value: 'arrendatario', label: 'Arrendatario' },
  { value: 'otro', label: 'Otro' },
] as const

export type RelacionReceptor = typeof RELACIONES_RECEPTOR[number]['value']

export function labelRelacionReceptor(value: string | null | undefined): string {
  return RELACIONES_RECEPTOR.find(r => r.value === value)?.label ?? (value || '—')
}

export interface ReceptorInput {
  nombre: string
  telefono: string
  relacion: string
}

export interface ReceptorValidado {
  nombre: string
  /** Dígitos con 57 (573XXXXXXXXX). */
  telefono: string
  relacion: RelacionReceptor
}

/**
 * Valida y normaliza los datos del receptor. Devuelve `error` legible para
 * mostrar al técnico. `telefonoTitular` evita registrar el mismo número del
 * titular (no tendría sentido duplicar los mensajes a la misma persona).
 */
export function validarReceptor(
  input: Partial<ReceptorInput> | null | undefined,
  telefonoTitular?: string | null,
): { ok: true; receptor: ReceptorValidado } | { ok: false; error: string } {
  const nombre = typeof input?.nombre === 'string' ? input.nombre.replace(/\s+/g, ' ').trim() : ''
  const telefonoRaw = typeof input?.telefono === 'string' ? input.telefono.trim() : ''
  const relacion = typeof input?.relacion === 'string' ? input.relacion.trim() : ''

  if (nombre.length < 3) return { ok: false, error: 'Escribe el nombre de la persona que recibe (mínimo 3 letras).' }
  if (nombre.length > 80) return { ok: false, error: 'El nombre es demasiado largo (máximo 80 caracteres).' }

  if (!telefonoRaw) return { ok: false, error: 'Falta el celular de la persona que recibe.' }
  const telefono = phoneToDigits(telefonoRaw)
  if (!isMobileColombiano(telefono)) {
    return { ok: false, error: 'El celular debe ser un móvil colombiano de 10 dígitos (3XX XXX XXXX).' }
  }
  if (telefonoTitular && phoneToDigits(telefonoTitular) === telefono) {
    return { ok: false, error: 'Ese es el mismo número del titular: no hace falta registrarlo como receptor.' }
  }

  if (!RELACIONES_RECEPTOR.some(r => r.value === relacion)) {
    return { ok: false, error: 'Indica qué relación tiene con el titular del servicio.' }
  }

  return { ok: true, receptor: { nombre, telefono, relacion: relacion as RelacionReceptor } }
}

export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().split(/\s+/)[0] || 'Hola'
}

/**
 * Clona los componentes de una plantilla reemplazando el PRIMER parámetro del
 * body (en todas las plantillas al cliente es el nombre del titular) por el
 * nombre del receptor. No muta el array original. Si no hay body o no tiene
 * parámetros, devuelve una copia sin cambios.
 */
export function componentesParaReceptor(
  components: Record<string, unknown>[] | undefined,
  nombreReceptor: string,
): Record<string, unknown>[] | undefined {
  if (!components) return components
  return components.map(c => {
    if (c.type !== 'body' || !Array.isArray(c.parameters) || c.parameters.length === 0) return c
    const params = (c.parameters as Record<string, unknown>[]).map((p, i) =>
      i === 0 && p.type === 'text' ? { ...p, text: primerNombre(nombreReceptor) } : p,
    )
    return { ...c, parameters: params }
  })
}

/** Fila mínima de solicitud para decidir si hay receptor activo. */
export interface ReceptorFila {
  receptor_nombre?: string | null
  receptor_telefono?: string | null
  receptor_acepto_at?: string | null
  cliente_telefono?: string | null
}

/**
 * Receptor "activo" = registrado Y aceptó los términos Y su número no es el
 * del titular. Solo a un receptor activo se le espejan los WhatsApp.
 */
export function receptorActivo(sol: ReceptorFila | null | undefined): { nombre: string; telefono: string } | null {
  if (!sol?.receptor_telefono || !sol.receptor_nombre || !sol.receptor_acepto_at) return null
  const telefono = phoneToDigits(sol.receptor_telefono)
  if (!isMobileColombiano(telefono)) return null
  if (sol.cliente_telefono && phoneToDigits(sol.cliente_telefono) === telefono) return null
  return { nombre: sol.receptor_nombre, telefono }
}
