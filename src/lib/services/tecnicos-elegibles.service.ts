import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'
import { normalizeForMatch, cityTokenForMatch } from '@/lib/utils/format'
import { nombreCorto } from '@/lib/utils/equipo'

/**
 * Técnicos elegibles como "técnico de preferencia" del cliente (2026-10-15).
 *
 * Mismo criterio que la oferta abierta de `notificarTecnicos`
 * (whatsapp.service.ts): especialidad del tipo de equipo + verificado +
 * cubre la ciudad. Se suma `visible_para_cliente` (migración 20261015): los
 * perfiles internos siguen recibiendo ofertas abiertas pero NO se muestran
 * en el selector público.
 *
 * Lo consumen:
 *  - GET /api/tecnicos-disponibles (selector del formulario /solicitar)
 *  - POST /api/solicitar (valida server-side el id que mandó el browser)
 *
 * Solo expone datos no sensibles: id, nombre corto, foto de perfil (bucket
 * público `tecnicos-fotos`) y especialidades. Nunca WhatsApp ni documento.
 */

export interface TecnicoElegible {
  id: string
  /** Primer nombre + primer apellido ("Carlos Bonilla") */
  nombre: string
  foto_url: string | null
  especialidades: string[]
}

type TecnicoRow = {
  id: string
  nombre_completo: string
  ciudad_pueblo: string | null
  ciudades_cobertura: string[] | null
  estado_verificacion: string | null
  visible_para_cliente: boolean | null
  foto_perfil_url: string | null
}

/**
 * ¿El técnico cubre la ciudad de la solicitud? Espejo exacto del filtro de
 * `notificarTecnicos`: `ciudades_cobertura` si tiene, si no `ciudad_pueblo`;
 * comparación por token de ciudad (acentos/case/basura concatenada fuera).
 * Ciudad vacía en la solicitud → no filtra (true).
 */
export function tecnicoCubreCiudad(
  t: { ciudad_pueblo?: string | null; ciudades_cobertura?: string[] | null },
  ciudadSolicitud: string | null | undefined,
): boolean {
  const ciudadNorm = cityTokenForMatch(ciudadSolicitud ?? '')
  if (!ciudadNorm) return true
  const cobertura = Array.isArray(t.ciudades_cobertura) && t.ciudades_cobertura.length > 0
    ? t.ciudades_cobertura
    : [t.ciudad_pueblo ?? '']
  const tokens = cobertura.map(c => cityTokenForMatch(c ?? '')).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.some(tc => tc.includes(ciudadNorm) || ciudadNorm.includes(tc))
}

/**
 * Lista los técnicos elegibles para `ciudad` + `tipoEquipo`, ordenados por
 * nombre. Devuelve [] si no hay (o si falla la BD — el selector es opcional
 * y el guard real está en /api/solicitar + notificarTecnicos).
 */
export async function listarTecnicosElegibles(params: {
  ciudad: string
  tipoEquipo: string
  /**
   * true = incluir también los perfiles con `visible_para_cliente=false`
   * (Henry, Juan, auxiliares con perfil propio). SOLO para el admin
   * (invitación dirigida, 2026-10-22): el selector público nunca lo pasa.
   */
  incluirOcultos?: boolean
}): Promise<TecnicoElegible[]> {
  const ciudad = (params.ciudad ?? '').trim()
  const tipoEquipo = (params.tipoEquipo ?? '').trim()
  if (!ciudad || !tipoEquipo) return []

  const especialidadBuscada = TIPO_A_ESPECIALIDAD[tipoEquipo] ?? tipoEquipo
  const especialidadNorm = normalizeForMatch(especialidadBuscada)

  const { data: especialidades, error: espErr } = await supabase
    .from('especialidades_tecnico')
    .select('tecnico_id, especialidad')
  if (espErr || !especialidades || especialidades.length === 0) return []

  const porTecnico = new Map<string, string[]>()
  for (const e of especialidades as Array<{ tecnico_id: string; especialidad: string | null }>) {
    const arr = porTecnico.get(e.tecnico_id) ?? []
    if (e.especialidad) arr.push(e.especialidad)
    porTecnico.set(e.tecnico_id, arr)
  }

  const conEspecialidad = [...porTecnico.entries()]
    .filter(([, esps]) => esps.some(esp => normalizeForMatch(esp) === especialidadNorm))
    .map(([id]) => id)
  if (conEspecialidad.length === 0) return []

  const { data: tecnicos, error: tecErr } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, ciudad_pueblo, ciudades_cobertura, estado_verificacion, visible_para_cliente, foto_perfil_url')
    .in('id', conEspecialidad)
    .eq('estado_verificacion', 'verificado')
  if (tecErr || !tecnicos) return []

  return (tecnicos as TecnicoRow[])
    // `visible_para_cliente` NULL (migración sin aplicar / fila vieja) cuenta
    // como visible — el default de la columna es true.
    .filter(t => params.incluirOcultos || t.visible_para_cliente !== false)
    .filter(t => tecnicoCubreCiudad(t, ciudad))
    .map(t => ({
      id: t.id,
      nombre: nombreCorto(t.nombre_completo) || 'Técnico',
      foto_url: t.foto_perfil_url ?? null,
      especialidades: porTecnico.get(t.id) ?? [],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Valida server-side el id que mandó el formulario: solo se persiste si el
 * técnico es elegible para esa ciudad + tipo de equipo. Cualquier otra cosa
 * (id manipulado, técnico oculto, sin cobertura) → null = oferta abierta.
 */
export async function resolverTecnicoPreferido(params: {
  tecnicoId: string | null | undefined
  ciudad: string
  tipoEquipo: string
}): Promise<string | null> {
  const id = (params.tecnicoId ?? '').trim()
  if (!id) return null
  try {
    const elegibles = await listarTecnicosElegibles({ ciudad: params.ciudad, tipoEquipo: params.tipoEquipo })
    return elegibles.some(t => t.id === id) ? id : null
  } catch (err) {
    console.warn('[tecnico-preferido] no se pudo validar, se ignora la preferencia:', err)
    return null
  }
}
