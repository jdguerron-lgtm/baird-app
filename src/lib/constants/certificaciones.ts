// Catálogo de certificaciones / acreditaciones que validan la idoneidad de
// un técnico, y el shape del JSONB `tecnicos.certificaciones` donde el admin
// registra MANUALMENTE el estado de cada una (ficha /admin/tecnicos/[id]).
//
// Por qué existe: en Colombia intervenir un artefacto a gas exige certificado
// de competencia laboral (Res. 90902/2013 MinMinas, num. 6.1), y marcas /
// grandes clientes exigen manejo ambiental de refrigerantes, CONTE, etc.
// Hoy es declarativo + verificación manual; el siguiente paso es usar
// `competencia_gas` como gate en el matching de gasodomésticos.
//
// Fuentes y detalle en docs/CERTIFICACIONES.md. Shared client/server.

import type { Especialidad } from './especialidades'

export type CertificacionId =
  | 'competencia_gas'
  | 'firma_instaladora_sic'
  | 'refrigeracion_sena'
  | 'manejo_refrigerantes'
  | 'conte'
  | 'trabajo_alturas'
  | 'formacion_tecnica'
  | 'capacitacion_marca'
  | 'antecedentes'

export type EstadoCertificacion =
  | 'sin_revisar'   // nadie la ha mirado (default implícito)
  | 'declarada'     // el técnico dice tenerla, sin soporte revisado
  | 'verificada'    // el admin vio el documento / consultó la entidad
  | 'vencida'       // tuvo pero expiró
  | 'rechazada'     // el soporte no era válido
  | 'no_aplica'     // el admin decidió que no aplica a este técnico

export const ESTADO_CERTIFICACION_LABELS: Record<EstadoCertificacion, string> = {
  sin_revisar: 'Sin revisar',
  declarada: 'Declarada por el técnico',
  verificada: 'Verificada',
  vencida: 'Vencida',
  rechazada: 'Rechazada',
  no_aplica: 'No aplica',
}

export const ESTADOS_CERTIFICACION = Object.keys(ESTADO_CERTIFICACION_LABELS) as EstadoCertificacion[]

/** Una entrada del JSONB `tecnicos.certificaciones` (mapa id → entrada). */
export interface CertificacionTecnico {
  estado: EstadoCertificacion
  entidad?: string         // quién la expidió (SENA, OCP, marca…)
  numero?: string          // número de certificado / matrícula
  vence?: string           // YYYY-MM-DD (vacío = sin vencimiento)
  nota?: string
  actualizado_en?: string  // ISO
  actualizado_por?: string // email del admin, 'registro' o 'portal' si lo declaró el técnico
}

export type CertificacionesTecnico = Partial<Record<CertificacionId, CertificacionTecnico>>

export interface CertificacionDef {
  id: CertificacionId
  nombre: string
  descripcion: string
  entidad: string
  /** Especialidades a las que aplica; 'todos' = cualquier técnico. */
  aplicaA: 'todos' | Especialidad[]
  /** Solo tiene sentido si el técnico cubre gasodomésticos. */
  soloGas?: boolean
  /** Sin esta certificación VERIFICADA el técnico no debería recibir gasodomésticos. */
  requeridaParaGas?: boolean
  /** Meses de vigencia típicos; null = no vence (títulos, matrícula). */
  vigenciaMeses: number | null
  normativa?: string
  verificarEn?: string
  /** Se le pregunta al técnico en /registro y en su portal ("¿la tienes?"). */
  declarable: boolean
}

export const CERTIFICACIONES: CertificacionDef[] = [
  {
    id: 'competencia_gas',
    nombre: 'Competencia laboral en gas (Res. 90902/2013)',
    descripcion:
      'Certificado de competencia laboral para mantener y reparar (o instalar) artefactos a gas, expedido por el SENA o por un Organismo de Certificación de Personas acreditado por ONAC (ISO/IEC 17024). Obligatorio para intervenir estufas, hornos, calentadores o secadoras a gas. Vigencia 3 años con seguimiento anual.',
    entidad: 'SENA u OCP acreditado por ONAC',
    aplicaA: 'todos',
    soloGas: true,
    requeridaParaGas: true,
    vigenciaMeses: 36,
    normativa: 'Res. 90902/2013 MinMinas num. 6.1 · NTC 3631 · NCL SENA 280202019',
    verificarEn: 'https://certificados.sena.edu.co/',
    declarable: true,
  },
  {
    id: 'firma_instaladora_sic',
    nombre: 'Firma instaladora de gas registrada ante la SIC',
    descripcion:
      'Solo si el técnico modifica la instalación interna (tubería, reguladores, acometida) y no únicamente el artefacto. Las distribuidoras de gas exigen que quien construya o reforme la instalación pertenezca a una firma registrada en la SIC.',
    entidad: 'Superintendencia de Industria y Comercio',
    aplicaA: 'todos',
    soloGas: true,
    vigenciaMeses: 12,
    normativa: 'Res. 90902/2013 · Registro de firmas instaladoras SIC',
    verificarEn: 'https://www.sic.gov.co/',
    declarable: false,
  },
  {
    id: 'refrigeracion_sena',
    nombre: 'Formación en refrigeración y aire acondicionado',
    descripcion:
      'Título técnico o tecnólogo del SENA en Mantenimiento de equipos de refrigeración y aire acondicionado (titulación 180501009) o certificado de competencia laboral NCL 280501026 "Corregir fallas y averías en sistemas de refrigeración y aire acondicionado doméstico". Vale formación equivalente de otra institución.',
    entidad: 'SENA u otra institución de educación para el trabajo',
    aplicaA: ['Neveras y Nevecones', 'Aires Acondicionados'],
    vigenciaMeses: null,
    normativa: 'Mesa Sectorial de Mantenimiento SENA (80501)',
    verificarEn: 'https://certificados.sena.edu.co/',
    declarable: true,
  },
  {
    id: 'manejo_refrigerantes',
    nombre: 'Manejo ambiental de refrigerantes (NCL 280501022)',
    descripcion:
      'Certificación de competencia en manejo ambiental de sustancias refrigerantes (Protocolo de Montreal, Unidad Técnica de Ozono de Minambiente): recuperación, reciclaje y no venteo del gas. La exigen marcas y grandes clientes para tocar el circuito de refrigeración.',
    entidad: 'SENA / Minambiente (UTO)',
    aplicaA: ['Neveras y Nevecones', 'Aires Acondicionados'],
    vigenciaMeses: 36,
    normativa: 'NCL 280501022 · Protocolo de Montreal',
    verificarEn: 'https://certificados.sena.edu.co/',
    declarable: true,
  },
  {
    id: 'conte',
    nombre: 'Matrícula profesional CONTE (clase TE-6 o TE-1)',
    descripcion:
      'Matrícula de técnico electricista del Consejo Nacional de Técnicos Electricistas. La clase TE-6 cubre montaje, conexión, mantenimiento y reparación de electrodomésticos; la TE-1, instalaciones eléctricas interiores. Habilita legalmente para intervenir la parte eléctrica de cualquier equipo.',
    entidad: 'CONTE',
    aplicaA: 'todos',
    vigenciaMeses: null,
    normativa: 'Ley 19/1990 · Decreto 991/1991 · Ley 1264/2008',
    verificarEn: 'https://www.conte.org.co/',
    declarable: true,
  },
  {
    id: 'trabajo_alturas',
    nombre: 'Trabajo seguro en alturas',
    descripcion:
      'Certificado de formación en trabajo seguro en alturas (Res. 4272/2021 MinTrabajo) para instalar o mantener unidades condensadoras de aire acondicionado en fachadas, terrazas o andamios. Reentrenamiento anual.',
    entidad: 'Centro de formación autorizado / SENA',
    aplicaA: ['Aires Acondicionados'],
    vigenciaMeses: 12,
    normativa: 'Res. 4272/2021 MinTrabajo',
    declarable: true,
  },
  {
    id: 'formacion_tecnica',
    nombre: 'Formación técnica en electrónica, electricidad o electromecánica',
    descripcion:
      'Título técnico, tecnólogo o certificado de curso (SENA, politécnico o institución de educación para el trabajo) en electrónica, electricidad, electromecánica o mantenimiento de electrodomésticos. Sustenta la idoneidad general del técnico.',
    entidad: 'SENA u otra institución',
    aplicaA: 'todos',
    vigenciaMeses: null,
    verificarEn: 'https://certificados.sena.edu.co/',
    declarable: true,
  },
  {
    id: 'capacitacion_marca',
    nombre: 'Capacitación de fabricante (MABE, Whirlpool, LG, Samsung, Haceb…)',
    descripcion:
      'Certificado de entrenamiento técnico emitido por la marca. Relevante para garantía: las marcas exigen técnicos entrenados en sus equipos para atender servicios en garantía.',
    entidad: 'Fabricante',
    aplicaA: 'todos',
    vigenciaMeses: null,
    declarable: true,
  },
  {
    id: 'antecedentes',
    nombre: 'Antecedentes judiciales y disciplinarios',
    descripcion:
      'Consulta de antecedentes en Policía Nacional, Procuraduría y Contraloría (gratuitas y en línea). No es una certificación técnica pero sí parte de la verificación: el técnico entra a la casa del cliente. Re-consultar cada año.',
    entidad: 'Policía Nacional / Procuraduría / Contraloría',
    aplicaA: 'todos',
    vigenciaMeses: 12,
    verificarEn: 'https://antecedentes.policia.gov.co:7005/WebJudicial/',
    declarable: false,
  },
]

export const CERTIFICACION_POR_ID: Record<CertificacionId, CertificacionDef> = Object.fromEntries(
  CERTIFICACIONES.map(c => [c.id, c]),
) as Record<CertificacionId, CertificacionDef>

/** Normaliza para comparar especialidades (mismo criterio que el matching). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Certificaciones que aplican a un técnico según sus especialidades y si
 * cubre gasodomésticos. `cubreGas === null` (no informado) se trata como
 * "podría" → las de gas se muestran pero no se exigen.
 */
export function certificacionesAplicables(
  especialidades: string[],
  cubreGas: boolean | null | undefined,
): CertificacionDef[] {
  const esp = especialidades.map(norm)
  return CERTIFICACIONES.filter(c => {
    if (c.soloGas && cubreGas === false) return false
    if (c.aplicaA === 'todos') return true
    return c.aplicaA.some(a => esp.includes(norm(a)))
  })
}

/** Una certificación cuenta como vigente solo si está verificada y no venció. */
export function certificacionVigente(
  cert: CertificacionTecnico | undefined,
  hoy: Date = new Date(),
): boolean {
  if (!cert || cert.estado !== 'verificada') return false
  if (!cert.vence) return true
  const hoyISO = hoy.toISOString().slice(0, 10)
  return cert.vence >= hoyISO
}

export type EstadoGasTecnico =
  | 'no_informado'          // registro previo a la pregunta
  | 'no_cubre'
  | 'cubre_sin_certificado' // ⚠️ declara atender gas sin competencia verificada
  | 'cubre_certificado'

/** Resumen para badges/alertas: ¿puede este técnico recibir gasodomésticos? */
export function estadoGasTecnico(
  cubreGas: boolean | null | undefined,
  certificaciones: CertificacionesTecnico | null | undefined,
  hoy: Date = new Date(),
): EstadoGasTecnico {
  if (cubreGas === null || cubreGas === undefined) return 'no_informado'
  if (!cubreGas) return 'no_cubre'
  return certificacionVigente(certificaciones?.competencia_gas, hoy)
    ? 'cubre_certificado'
    : 'cubre_sin_certificado'
}

export const ESTADO_GAS_LABELS: Record<EstadoGasTecnico, string> = {
  no_informado: 'Gas: no informado',
  no_cubre: 'No atiende gas',
  cubre_sin_certificado: 'Atiende gas · sin certificado verificado',
  cubre_certificado: 'Atiende gas · certificado',
}

/** Parse defensivo del JSONB (puede venir null, [] legacy o basura). */
export function parseCertificaciones(raw: unknown): CertificacionesTecnico {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: CertificacionesTecnico = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in CERTIFICACION_POR_ID)) continue
    if (!v || typeof v !== 'object') continue
    const e = v as Record<string, unknown>
    const estado = typeof e.estado === 'string' && (ESTADOS_CERTIFICACION as string[]).includes(e.estado)
      ? (e.estado as EstadoCertificacion)
      : 'sin_revisar'
    out[k as CertificacionId] = {
      estado,
      entidad: typeof e.entidad === 'string' ? e.entidad : undefined,
      numero: typeof e.numero === 'string' ? e.numero : undefined,
      vence: typeof e.vence === 'string' ? e.vence : undefined,
      nota: typeof e.nota === 'string' ? e.nota : undefined,
      actualizado_en: typeof e.actualizado_en === 'string' ? e.actualizado_en : undefined,
      actualizado_por: typeof e.actualizado_por === 'string' ? e.actualizado_por : undefined,
    }
  }
  return out
}

/**
 * Mezcla lo que el técnico DECLARA (registro / portal) sobre lo que ya hay,
 * sin pisar nunca una verificación del admin: si el admin ya la marcó
 * verificada/rechazada/vencida/no_aplica, la declaración del técnico no la
 * toca. "No la tengo" se guarda como sin_revisar + nota (no borra nada).
 */
export function aplicarDeclaracionTecnico(
  actual: CertificacionesTecnico,
  declaradas: Partial<Record<CertificacionId, boolean>>,
  origen: 'registro' | 'portal',
  ahora: Date = new Date(),
): CertificacionesTecnico {
  const out: CertificacionesTecnico = { ...actual }
  const ts = ahora.toISOString()
  for (const [id, tiene] of Object.entries(declaradas) as [CertificacionId, boolean | undefined][]) {
    if (tiene === undefined || !(id in CERTIFICACION_POR_ID)) continue
    const prev = out[id]
    if (prev && prev.estado !== 'sin_revisar' && prev.estado !== 'declarada') continue // decisión del admin, intocable
    out[id] = tiene
      ? { ...prev, estado: 'declarada', actualizado_en: ts, actualizado_por: origen }
      : { ...prev, estado: 'sin_revisar', nota: `Declaró en ${origen} NO tenerla`, actualizado_en: ts, actualizado_por: origen }
  }
  return out
}
