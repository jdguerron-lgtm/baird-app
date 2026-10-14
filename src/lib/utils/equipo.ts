/**
 * Equipo de trabajo del técnico — auxiliares (2026-10-13).
 *
 * Helpers PUROS (sin Supabase ni fetch) compartidos por el portal del
 * técnico, los endpoints, el PNG del carnet y el service de WhatsApp.
 * Migración: supabase/migrations/20261013_tecnico_auxiliares.sql.
 * Flujo: docs/FLOWS.md § "Side flow: Equipo que te visita".
 *
 * Regla central: al CLIENTE solo se le muestra un auxiliar `activo` y
 * `verificado` por Baird (decisión 2026-10-13). Todo lo que arma texto o
 * tarjetas para el cliente pasa por `auxiliaresVisiblesAlCliente`.
 */
import { codigoCarnet, formatearDocumento } from '@/lib/utils/carnet'

/** Tope de auxiliares ACTIVOS por técnico (carnet y mensajes siguen legibles). */
export const MAX_AUXILIARES_POR_TECNICO = 3

/** En sync con el CHECK de tipo_documento en 20261013_tecnico_auxiliares.sql. */
export const TIPOS_DOCUMENTO_AUXILIAR = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PPT', label: 'Permiso por Protección Temporal' },
  { value: 'Pasaporte', label: 'Pasaporte' },
] as const

export type TipoDocumentoAuxiliar = typeof TIPOS_DOCUMENTO_AUXILIAR[number]['value']

export type EstadoVerificacionAuxiliar = 'pendiente' | 'verificado' | 'rechazado'

export const ESTADO_AUXILIAR_LABELS: Record<EstadoVerificacionAuxiliar, string> = {
  pendiente: 'Pendiente de verificación',
  verificado: 'Verificado por Baird',
  rechazado: 'Rechazado',
}

/** Fila de `tecnico_auxiliares` (columnas que usa el código). */
export interface AuxiliarRow {
  id: string
  tecnico_id: string
  nombre_completo: string
  tipo_documento: string | null
  numero_documento: string | null
  foto_perfil_url: string | null
  whatsapp?: string | null
  estado_verificacion: string | null
  fecha_verificacion?: string | null
  nota_verificacion?: string | null
  acompana_por_defecto: boolean | null
  activo: boolean | null
  autorizacion_datos_at?: string | null
  created_at?: string
  updated_at?: string
}

/** Columnas que necesita todo consumidor de la tabla. */
export const AUXILIAR_SELECT =
  'id, tecnico_id, nombre_completo, tipo_documento, numero_documento, foto_perfil_url, whatsapp, estado_verificacion, fecha_verificacion, nota_verificacion, acompana_por_defecto, activo, autorizacion_datos_at, created_at, updated_at'

/**
 * Tarjeta del auxiliar que ve el CLIENTE: mismo criterio que el carnet del
 * técnico — foto, nombre y documento ENMASCARADO. Nunca el número completo.
 */
export interface CarnetAuxiliarData {
  id: string
  nombre_completo: string
  foto_perfil_url: string | null
  tipo_documento: string | null
  /** "••32.456.789" (ver formatearDocumento). */
  documento: string | null
  verificado: boolean
  /** "BA-XXXXXXXX" — identificador legible, no secreto. */
  codigo: string
}

export function esAuxiliarVisibleAlCliente(a: Pick<AuxiliarRow, 'activo' | 'estado_verificacion'>): boolean {
  return a.activo === true && a.estado_verificacion === 'verificado'
}

/** Filtra los que el cliente puede ver (activos + verificados), en orden estable por nombre. */
export function auxiliaresVisiblesAlCliente<T extends Pick<AuxiliarRow, 'activo' | 'estado_verificacion' | 'nombre_completo'>>(rows: T[] | null | undefined): T[] {
  return (rows ?? [])
    .filter(esAuxiliarVisibleAlCliente)
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es'))
}

/** Los que procesarAceptacion copia a `auxiliares_ids` al aceptar un servicio. */
export function auxiliaresPorDefecto<T extends Pick<AuxiliarRow, 'activo' | 'estado_verificacion' | 'nombre_completo' | 'acompana_por_defecto'>>(rows: T[] | null | undefined): T[] {
  return auxiliaresVisiblesAlCliente(rows).filter(a => a.acompana_por_defecto === true)
}

/**
 * Resuelve el equipo de un servicio: de `auxiliares_ids` solo sobreviven los
 * que (a) existen entre los auxiliares del técnico ASIGNADO, (b) están activos
 * y (c) verificados. Así un id viejo (otro técnico, dado de baja, aún no
 * verificado) nunca llega al cliente.
 */
export function resolverEquipoServicio<T extends Pick<AuxiliarRow, 'id' | 'activo' | 'estado_verificacion' | 'nombre_completo'>>(
  auxiliaresIds: string[] | null | undefined,
  auxiliaresDelTecnico: T[] | null | undefined,
): T[] {
  if (!auxiliaresIds || auxiliaresIds.length === 0) return []
  const ids = new Set(auxiliaresIds)
  return auxiliaresVisiblesAlCliente(auxiliaresDelTecnico).filter(a => ids.has(a.id))
}

export function codigoCarnetAuxiliar(auxiliarId: string): string {
  return codigoCarnet(auxiliarId).replace(/^BS-/, 'BA-')
}

export function construirCarnetAuxiliar(row: Pick<AuxiliarRow, 'id' | 'nombre_completo' | 'foto_perfil_url' | 'tipo_documento' | 'numero_documento' | 'estado_verificacion'>): CarnetAuxiliarData {
  return {
    id: row.id,
    nombre_completo: row.nombre_completo,
    foto_perfil_url: row.foto_perfil_url ?? null,
    tipo_documento: row.tipo_documento ?? null,
    documento: formatearDocumento(row.numero_documento),
    verificado: row.estado_verificacion === 'verificado',
    codigo: codigoCarnetAuxiliar(row.id),
  }
}

/** Primer nombre + primer apellido ("Juan Carlos Pérez Gómez" → "Juan Pérez"); corto para WhatsApp. */
export function nombreCorto(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return partes.join(' ')
  // 3 partes: "Juan Pérez Gómez" → "Juan Pérez"; 4+: nombre + tercer token (1er apellido)
  return partes.length === 3 ? `${partes[0]} ${partes[1]}` : `${partes[0]} ${partes[2]}`
}

function listarNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Texto del parámetro "técnico" de las plantillas de asignación cuando hay
 * equipo: "Pedro Gómez · lo acompaña Juan Pérez (auxiliar)" o
 * "Pedro Gómez · lo acompañan Juan Pérez y Ana Ruiz (auxiliares)".
 * Sin auxiliares devuelve el nombre tal cual. Una sola línea (Meta rechaza
 * saltos de línea en parámetros) y sin emojis.
 */
export function textoEquipoWhatsApp(
  nombreTecnico: string,
  auxiliares: Array<Pick<AuxiliarRow, 'nombre_completo'>>,
): string {
  if (auxiliares.length === 0) return nombreTecnico
  const nombres = auxiliares.map(a => nombreCorto(a.nombre_completo)).filter(Boolean)
  if (nombres.length === 0) return nombreTecnico
  const verbo = nombres.length === 1 ? 'lo acompaña' : 'lo acompañan'
  const sufijo = nombres.length === 1 ? 'auxiliar' : 'auxiliares'
  return `${nombreTecnico} · ${verbo} ${listarNombres(nombres)} (${sufijo})`
}

/** Frase corta para portales/caption: "Lo acompaña Juan Pérez (auxiliar)" o '' sin equipo. */
export function fraseAcompanantes(auxiliares: Array<Pick<AuxiliarRow, 'nombre_completo'>>): string {
  if (auxiliares.length === 0) return ''
  const nombres = auxiliares.map(a => nombreCorto(a.nombre_completo)).filter(Boolean)
  if (nombres.length === 0) return ''
  return nombres.length === 1
    ? `Lo acompaña ${nombres[0]} (auxiliar)`
    : `Lo acompañan ${listarNombres(nombres)} (auxiliares)`
}

// ── Validación del formulario del técnico ──────────────────────────────

export interface AuxiliarInput {
  nombre_completo: string
  tipo_documento: string
  numero_documento: string
  foto_perfil_url: string
  whatsapp?: string | null
  acompana_por_defecto?: boolean
  autoriza_datos: boolean
}

export interface AuxiliarValidado {
  nombre_completo: string
  tipo_documento: TipoDocumentoAuxiliar
  numero_documento: string
  foto_perfil_url: string
  whatsapp: string | null
  acompana_por_defecto: boolean
}

/**
 * Valida y normaliza el alta/edición de un auxiliar. `documentoTecnico`
 * evita que el técnico se registre a sí mismo como auxiliar.
 */
export function validarAuxiliar(
  input: Partial<AuxiliarInput> | null | undefined,
  opts: { documentoTecnico?: string | null; bucketUrlPrefix?: string | null } = {},
): { ok: true; auxiliar: AuxiliarValidado } | { ok: false; error: string } {
  const nombre = typeof input?.nombre_completo === 'string' ? input.nombre_completo.replace(/\s+/g, ' ').trim() : ''
  if (nombre.length < 3) return { ok: false, error: 'Escribe el nombre completo del auxiliar (mínimo 3 letras).' }
  if (nombre.length > 80) return { ok: false, error: 'El nombre es demasiado largo (máximo 80 caracteres).' }

  const tipo = typeof input?.tipo_documento === 'string' ? input.tipo_documento.trim() : ''
  if (!TIPOS_DOCUMENTO_AUXILIAR.some(t => t.value === tipo)) {
    return { ok: false, error: 'Selecciona el tipo de documento del auxiliar.' }
  }

  const docRaw = typeof input?.numero_documento === 'string' ? input.numero_documento : ''
  const numero = docRaw.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (numero.length < 4 || numero.length > 20) {
    return { ok: false, error: 'El número de documento debe tener entre 4 y 20 caracteres.' }
  }
  if (tipo === 'CC' && !/^\d+$/.test(numero)) {
    return { ok: false, error: 'La cédula de ciudadanía solo lleva números.' }
  }
  const docTecnico = (opts.documentoTecnico ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (docTecnico && docTecnico === numero) {
    return { ok: false, error: 'Ese es tu propio documento: el auxiliar debe ser otra persona.' }
  }

  const foto = typeof input?.foto_perfil_url === 'string' ? input.foto_perfil_url.trim() : ''
  if (!foto) return { ok: false, error: 'La foto del auxiliar es obligatoria: el cliente debe poder reconocerlo.' }
  if (!/^https:\/\//.test(foto) || foto.length > 500) return { ok: false, error: 'La foto no es válida. Vuelve a subirla.' }
  if (opts.bucketUrlPrefix && !foto.startsWith(opts.bucketUrlPrefix)) {
    return { ok: false, error: 'La foto debe subirse desde este formulario.' }
  }

  if (input?.autoriza_datos !== true) {
    return { ok: false, error: 'Debes confirmar que el auxiliar autorizó compartir sus datos con Baird y con los clientes.' }
  }

  let whatsapp: string | null = null
  if (typeof input?.whatsapp === 'string' && input.whatsapp.trim()) {
    const digits = input.whatsapp.replace(/\D/g, '')
    const normalizado = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits
    if (!/^573\d{9}$/.test(normalizado)) {
      return { ok: false, error: 'El celular del auxiliar debe ser un móvil colombiano de 10 dígitos (o déjalo vacío).' }
    }
    whatsapp = normalizado
  }

  return {
    ok: true,
    auxiliar: {
      nombre_completo: nombre,
      tipo_documento: tipo as TipoDocumentoAuxiliar,
      numero_documento: numero,
      foto_perfil_url: foto,
      whatsapp,
      acompana_por_defecto: input?.acompana_por_defecto !== false,
    },
  }
}

/** Cambió algo que identifica a la persona → la verificación de Baird deja de valer. */
export function cambioRequiereReverificacion(
  previo: Pick<AuxiliarRow, 'nombre_completo' | 'tipo_documento' | 'numero_documento' | 'foto_perfil_url'>,
  nuevo: Pick<AuxiliarValidado, 'nombre_completo' | 'tipo_documento' | 'numero_documento' | 'foto_perfil_url'>,
): boolean {
  return (
    previo.nombre_completo !== nuevo.nombre_completo ||
    (previo.tipo_documento ?? '') !== nuevo.tipo_documento ||
    (previo.numero_documento ?? '') !== nuevo.numero_documento ||
    (previo.foto_perfil_url ?? '') !== nuevo.foto_perfil_url
  )
}
