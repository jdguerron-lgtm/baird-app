import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  normalizarCodigoDescuento,
  esCodigoDescuentoValido,
  type DescuentoSnapshot,
  type TipoDescuento,
} from '@/lib/constants/descuentos'

/**
 * Códigos de descuento (2026-10-19) — server-side (service_role).
 *
 * Tabla `codigos_descuento` (migración 20261019_codigos_descuento). Reglas en
 * `src/lib/constants/descuentos.ts`. Los usos NO se guardan en un contador:
 * se cuentan desde `solicitudes_servicio.codigo_descuento_id` (solicitudes
 * no canceladas) para que nunca deriven.
 */

export interface CodigoDescuento {
  id: string
  codigo: string
  tipo: TipoDescuento
  valor: number
  descripcion: string | null
  activo: boolean
  vigente_desde: string | null
  vigente_hasta: string | null
  max_usos: number | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface CodigoDescuentoConUso extends CodigoDescuento {
  /** Solicitudes (no canceladas) que reservaron con este código. */
  usos: number
  /** Estado derivado para el listado admin. */
  estado: 'activo' | 'inactivo' | 'programado' | 'vencido' | 'agotado'
}

export type ResultadoValidacion =
  | { ok: true; descuento: DescuentoSnapshot & { id: string; descripcion: string | null } }
  | { ok: false; motivo: string }

const COLUMNAS =
  'id, codigo, tipo, valor, descripcion, activo, vigente_desde, vigente_hasta, max_usos, creado_por, created_at, updated_at'

function normalizarFila(row: Record<string, unknown>): CodigoDescuento {
  return {
    ...(row as unknown as CodigoDescuento),
    // numeric(12,2) llega como string desde PostgREST.
    valor: Number(row.valor),
  }
}

/** Solicitudes no canceladas por código (Map id → usos). */
async function contarUsos(ids: string[]): Promise<Map<string, number>> {
  const usos = new Map<string, number>()
  if (ids.length === 0) return usos
  const { data } = await supabase
    .from('solicitudes_servicio')
    .select('codigo_descuento_id')
    .in('codigo_descuento_id', ids)
    .neq('estado', 'cancelada')
  for (const r of data ?? []) {
    const id = r.codigo_descuento_id as string | null
    if (id) usos.set(id, (usos.get(id) ?? 0) + 1)
  }
  return usos
}

function estadoDerivado(c: CodigoDescuento, usos: number, ahora = new Date()): CodigoDescuentoConUso['estado'] {
  if (!c.activo) return 'inactivo'
  if (c.vigente_desde && new Date(c.vigente_desde) > ahora) return 'programado'
  if (c.vigente_hasta && new Date(c.vigente_hasta) < ahora) return 'vencido'
  if (c.max_usos != null && usos >= c.max_usos) return 'agotado'
  return 'activo'
}

/**
 * Valida un código escrito por el cliente. Motivos genéricos a propósito
 * (no distingue "no existe" de "inactivo") para no facilitar enumeración.
 */
export async function validarCodigoDescuento(raw: string | null | undefined): Promise<ResultadoValidacion> {
  const codigo = normalizarCodigoDescuento(raw)
  if (!codigo) return { ok: false, motivo: 'Escribe un código de descuento.' }
  if (!esCodigoDescuentoValido(codigo)) {
    return { ok: false, motivo: 'Código de descuento inválido.' }
  }
  const { data, error } = await supabase
    .from('codigos_descuento')
    .select(COLUMNAS)
    .eq('codigo', codigo)
    .maybeSingle()
  if (error) {
    console.error('[descuentos] error consultando código:', error)
    return { ok: false, motivo: 'No pudimos validar el código en este momento. Intenta de nuevo.' }
  }
  if (!data) return { ok: false, motivo: 'Código de descuento inválido o vencido.' }
  const c = normalizarFila(data as Record<string, unknown>)
  const usos = (await contarUsos([c.id])).get(c.id) ?? 0
  const estado = estadoDerivado(c, usos)
  if (estado === 'inactivo' || estado === 'programado') {
    return { ok: false, motivo: 'Código de descuento inválido o vencido.' }
  }
  if (estado === 'vencido') return { ok: false, motivo: 'Este código de descuento ya venció.' }
  if (estado === 'agotado') return { ok: false, motivo: 'Este código de descuento ya alcanzó su límite de usos.' }
  return {
    ok: true,
    descuento: { id: c.id, codigo: c.codigo, tipo: c.tipo, valor: c.valor, descripcion: c.descripcion },
  }
}

/** Listado completo para /admin/descuentos (con usos y estado derivado). */
export async function listarCodigosDescuento(): Promise<CodigoDescuentoConUso[]> {
  const { data, error } = await supabase
    .from('codigos_descuento')
    .select(COLUMNAS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const codigos = (data ?? []).map((r) => normalizarFila(r as Record<string, unknown>))
  const usos = await contarUsos(codigos.map((c) => c.id))
  const ahora = new Date()
  return codigos.map((c) => {
    const n = usos.get(c.id) ?? 0
    return { ...c, usos: n, estado: estadoDerivado(c, n, ahora) }
  })
}

export interface DatosCodigoDescuento {
  codigo: string
  tipo: TipoDescuento
  valor: number
  descripcion?: string | null
  activo?: boolean
  vigente_desde?: string | null
  vigente_hasta?: string | null
  max_usos?: number | null
}

export async function crearCodigoDescuento(
  datos: DatosCodigoDescuento,
  creadoPor: string,
): Promise<{ ok: true; codigo: CodigoDescuento } | { ok: false; error: string }> {
  const codigo = normalizarCodigoDescuento(datos.codigo)
  if (!esCodigoDescuentoValido(codigo)) {
    return { ok: false, error: 'El código debe tener 3–30 caracteres: letras, números, guion o guion bajo.' }
  }
  const { data, error } = await supabase
    .from('codigos_descuento')
    .insert({
      codigo,
      tipo: datos.tipo,
      valor: datos.valor,
      descripcion: datos.descripcion?.trim() || null,
      activo: datos.activo ?? true,
      vigente_desde: datos.vigente_desde || null,
      vigente_hasta: datos.vigente_hasta || null,
      max_usos: datos.max_usos ?? null,
      creado_por: creadoPor,
    })
    .select(COLUMNAS)
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, error: `Ya existe un código "${codigo}".` }
    return { ok: false, error: error.message }
  }
  return { ok: true, codigo: normalizarFila(data as Record<string, unknown>) }
}

/**
 * Edita un código. El texto del código NO se cambia (las solicitudes guardan
 * snapshot, pero el código es la identidad que el admin comunica); si se
 * necesita otro, se crea uno nuevo y se desactiva el viejo.
 */
export async function actualizarCodigoDescuento(
  id: string,
  cambios: Partial<Omit<DatosCodigoDescuento, 'codigo'>>,
): Promise<{ ok: true; codigo: CodigoDescuento } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (cambios.tipo !== undefined) patch.tipo = cambios.tipo
  if (cambios.valor !== undefined) patch.valor = cambios.valor
  if (cambios.descripcion !== undefined) patch.descripcion = cambios.descripcion?.trim() || null
  if (cambios.activo !== undefined) patch.activo = cambios.activo
  if (cambios.vigente_desde !== undefined) patch.vigente_desde = cambios.vigente_desde || null
  if (cambios.vigente_hasta !== undefined) patch.vigente_hasta = cambios.vigente_hasta || null
  if (cambios.max_usos !== undefined) patch.max_usos = cambios.max_usos ?? null
  const { data, error } = await supabase
    .from('codigos_descuento')
    .update(patch)
    .eq('id', id)
    .select(COLUMNAS)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Código no encontrado.' }
  return { ok: true, codigo: normalizarFila(data as Record<string, unknown>) }
}
