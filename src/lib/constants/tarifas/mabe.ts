/**
 * Tarifas de garantía MABE — Taller Tipo D
 *
 * Fuente: Tabla oficial Mabe/GE Colombia (segmento aprobado para Baird Service).
 * Doc canónico: docs/TARIFAS.md § "Garantía MABE".
 *
 * Modelo: la marca paga a Baird por código de complejidad (Tipo D).
 * Baird captura 22% de la tarifa base; el técnico recibe 78% de la base
 * + 100% del bono + 100% del recargo de fin de semana.
 */

export type ComplejidadServicio = 'baja' | 'media' | 'alta'

/**
 * Código de Tipo de Taller en el tarifario MABE.
 * Tipo D (24) es el segmento aprobado para Baird Service.
 * Tipos A/B/C se documentan como referencia histórica pero NO se usan.
 */
export const TIPO_TALLER_MABE_BAIRD = 24 as const

/** Tarifa base MABE (Tipo D) por complejidad — mano de obra, en COP. */
export const TARIFAS_MABE_TIPO_D: Record<ComplejidadServicio, number> = {
  baja: 42000,
  media: 50000,
  alta: 115000,
}

/** Descripción humana de cada complejidad (UI para admin / docs). */
export const COMPLEJIDAD_LABELS: Record<ComplejidadServicio, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const COMPLEJIDAD_DESCRIPCIONES: Record<ComplejidadServicio, string> = {
  baja: 'Ajustes menores, limpieza, cambio de piezas accesibles',
  media: 'Cambio de componentes internos, reparación de sistemas',
  alta: 'Reparación de tarjeta electrónica, compresor, motor principal',
}

/**
 * Bonos por días de solución — el técnico cumple TA Y el cliente contestó la encuesta.
 * Días = creación → completada (pausando esperando_repuesto). Ver docs/TARIFAS.md.
 */
export const BONOS_CON_ENCUESTA: Record<ComplejidadServicio, { rango: string; min: number; max: number; bono: number }[]> = {
  baja: [
    { rango: '0–1 día', min: 0, max: 1, bono: 9400 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 7500 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 3000 },
  ],
  media: [
    { rango: '0–1 día', min: 0, max: 1, bono: 13000 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 11500 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 5000 },
  ],
  alta: [
    { rango: '0–1 día', min: 0, max: 1, bono: 17000 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 15000 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 10000 },
  ],
}

/**
 * Bonos por días de solución — el técnico cumple TA pero el cliente NO contestó la encuesta.
 * Es la fila reducida del tarifario MABE.
 */
export const BONOS_SIN_ENCUESTA: Record<ComplejidadServicio, { rango: string; min: number; max: number; bono: number }[]> = {
  baja: [
    { rango: '0–1 día', min: 0, max: 1, bono: 4700 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 3800 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 1500 },
  ],
  media: [
    { rango: '0–1 día', min: 0, max: 1, bono: 6500 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 5600 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 2500 },
  ],
  alta: [
    { rango: '0–1 día', min: 0, max: 1, bono: 8500 },
    { rango: '1.1–2 días', min: 1, max: 2, bono: 7500 },
    { rango: '2.1–3 días', min: 2, max: 3, bono: 5000 },
  ],
}

/**
 * Recargo extraordinario fin de semana. Se aplica si el horario_confirmado
 * por el cliente cae sábado o domingo. Va íntegro al técnico.
 */
export const RECARGO_FIN_DE_SEMANA: Record<ComplejidadServicio, number> = {
  baja: 5000,
  media: 6000,
  alta: 7000,
}

/** Margen Baird = 22% sobre tarifa base MABE. Bonos y recargos van íntegros al técnico. */
export const MARGEN_BAIRD_GARANTIA = 0.22

/** SLA de Tiempo de Atención (TA) en horas. Desde horario_confirmado_at hasta diagnosticado_at. */
export const TA_HORAS_LIMITE = 24

// ──────────────────────────────────────────────────────────────────
// Funciones de cálculo
// ──────────────────────────────────────────────────────────────────

/**
 * Calcula el bono según días de solución, cumplimiento de encuesta y de TA.
 * Regla:
 *   - Si NO cumple TA → bono 0.
 *   - Si cumple TA y cliente contestó encuesta → tabla A.
 *   - Si cumple TA y cliente NO contestó encuesta → tabla B (reducida).
 *   - Si días > 3 → bono 0 sin importar otras condiciones.
 *
 * `diasSolucion` admite decimales (ej. 1.5 días). El bono se aplica si
 * `diasSolucion <= rango.max`. Rangos de la tabla MABE: 0–1, 1.1–2, 2.1–3.
 * Buscamos el primer rango cuyo `max` >= `diasSolucion` (después de redondear
 * hacia arriba en buckets de 1 día para corresponder a la tabla original).
 */
export function calcularBonoMABE(params: {
  complejidad: ComplejidadServicio
  diasSolucion: number
  cumpleEncuesta: boolean
  cumpleTA: boolean
}): number {
  const { complejidad, diasSolucion, cumpleEncuesta, cumpleTA } = params
  if (!cumpleTA) return 0
  const rangos = cumpleEncuesta ? BONOS_CON_ENCUESTA[complejidad] : BONOS_SIN_ENCUESTA[complejidad]
  for (const rango of rangos) {
    if (diasSolucion <= rango.max) {
      return rango.bono
    }
  }
  return 0
}

export interface TarifaMABEResultado {
  tarifaBase: number
  bono: number
  recargoWeekend: number
  totalMABE: number
  margenBaird: number
  pagoTecnico: number
  meta: {
    complejidad: ComplejidadServicio
    codigoTaller: typeof TIPO_TALLER_MABE_BAIRD
    cumpleTA: boolean
    cumpleEncuesta: boolean
    diasSolucion: number
    esFinDeSemana: boolean
  }
}

/**
 * Cálculo completo del reparto de pagos para un servicio de garantía MABE.
 *
 * Retorna:
 *   - tarifaBase: lo que MABE paga por mano de obra (sin bono ni weekend)
 *   - bono: $0 si no cumple TA o si días > 3
 *   - recargoWeekend: $0 si no es sábado/domingo
 *   - totalMABE: lo que MABE paga (base + bono + weekend)
 *   - margenBaird: 22% de la tarifa base
 *   - pagoTecnico: 78% de la base + 100% bono + 100% weekend
 */
export function calcularTarifaMABE(params: {
  complejidad: ComplejidadServicio
  diasSolucion: number
  cumpleTA: boolean
  cumpleEncuesta: boolean
  esFinDeSemana: boolean
}): TarifaMABEResultado {
  const { complejidad, diasSolucion, cumpleTA, cumpleEncuesta, esFinDeSemana } = params
  const tarifaBase = TARIFAS_MABE_TIPO_D[complejidad]
  const bono = calcularBonoMABE({ complejidad, diasSolucion, cumpleEncuesta, cumpleTA })
  const recargoWeekend = esFinDeSemana ? RECARGO_FIN_DE_SEMANA[complejidad] : 0
  const totalMABE = tarifaBase + bono + recargoWeekend
  const margenBaird = Math.round(tarifaBase * MARGEN_BAIRD_GARANTIA)
  const pagoTecnico = totalMABE - margenBaird
  return {
    tarifaBase,
    bono,
    recargoWeekend,
    totalMABE,
    margenBaird,
    pagoTecnico,
    meta: {
      complejidad,
      codigoTaller: TIPO_TALLER_MABE_BAIRD,
      cumpleTA,
      cumpleEncuesta,
      diasSolucion,
      esFinDeSemana,
    },
  }
}

/**
 * Helper: verifica si un horario confirmado cae en sábado o domingo.
 * `horarioConfirmado` puede ser un ISO string o cualquier formato
 * parseable por `new Date()`. Usa la fecha local del servidor (Bogotá).
 */
export function esFinDeSemana(horarioConfirmado: string | Date | null | undefined): boolean {
  if (!horarioConfirmado) return false
  const fecha = horarioConfirmado instanceof Date ? horarioConfirmado : new Date(horarioConfirmado)
  if (Number.isNaN(fecha.getTime())) return false
  const dia = fecha.getDay() // 0 = Sunday, 6 = Saturday
  return dia === 0 || dia === 6
}

/**
 * Helper: verifica si el técnico cumplió TA (24h desde horario_confirmado_at hasta diagnosticado_at).
 * Acepta ISO strings o Date. Si falta cualquiera de los dos, devuelve false (conservador).
 */
export function cumpleTA(horarioConfirmadoAt: string | Date | null | undefined, diagnosticadoAt: string | Date | null | undefined): boolean {
  if (!horarioConfirmadoAt || !diagnosticadoAt) return false
  const start = horarioConfirmadoAt instanceof Date ? horarioConfirmadoAt : new Date(horarioConfirmadoAt)
  const end = diagnosticadoAt instanceof Date ? diagnosticadoAt : new Date(diagnosticadoAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const horas = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  return horas >= 0 && horas <= TA_HORAS_LIMITE
}

// ──────────────────────────────────────────────────────────────────
// Back-compat — exports legacy preservados para callers existentes.
// El refactor mantiene la API pública del módulo viejo `tarifas-garantia.ts`.
// ──────────────────────────────────────────────────────────────────

export interface TarifaComplejidadLegacy {
  codigo: typeof TIPO_TALLER_MABE_BAIRD
  label: string
  descripcion: string
  manoObra: number
}

/**
 * @deprecated Usar TARIFAS_MABE_TIPO_D + COMPLEJIDAD_LABELS + COMPLEJIDAD_DESCRIPCIONES.
 * Mantenido para compat con el componente de selección de complejidad en el portal del técnico.
 */
export const TARIFAS_MANO_OBRA: Record<ComplejidadServicio, TarifaComplejidadLegacy> = {
  baja: {
    codigo: TIPO_TALLER_MABE_BAIRD,
    label: COMPLEJIDAD_LABELS.baja,
    descripcion: COMPLEJIDAD_DESCRIPCIONES.baja,
    manoObra: TARIFAS_MABE_TIPO_D.baja,
  },
  media: {
    codigo: TIPO_TALLER_MABE_BAIRD,
    label: COMPLEJIDAD_LABELS.media,
    descripcion: COMPLEJIDAD_DESCRIPCIONES.media,
    manoObra: TARIFAS_MABE_TIPO_D.media,
  },
  alta: {
    codigo: TIPO_TALLER_MABE_BAIRD,
    label: COMPLEJIDAD_LABELS.alta,
    descripcion: COMPLEJIDAD_DESCRIPCIONES.alta,
    manoObra: TARIFAS_MABE_TIPO_D.alta,
  },
}

/**
 * @deprecated Modelo viejo de bonos por días sin distinguir encuesta/TA.
 * Equivalente a BONOS_CON_ENCUESTA del nuevo modelo (bono más alto).
 * Mantenido para compat con el banner de bonos del portal técnico.
 *
 * Los rangos en el modelo legacy estaban en buckets enteros (0-2, 3-5, 6-8 días).
 * El modelo nuevo usa rangos decimales (0–1, 1.1–2, 2.1–3 días). Para back-compat
 * exponemos buckets enteros equivalentes a los del modelo nuevo: 0-1, 1-2, 2-3.
 */
export const BONO_INCENTIVO: Record<ComplejidadServicio, { rango: string; min: number; max: number; bono: number }[]> =
  BONOS_CON_ENCUESTA

/**
 * @deprecated Usar `calcularBonoMABE({ complejidad, diasSolucion, cumpleEncuesta: true, cumpleTA: true })`.
 * Mantenido para compat con `calcularTotalGarantia` legacy.
 */
export function calcularBono(complejidad: ComplejidadServicio, diasTranscurridos: number): number {
  return calcularBonoMABE({
    complejidad,
    diasSolucion: diasTranscurridos,
    cumpleEncuesta: true,
    cumpleTA: true,
  })
}

/**
 * @deprecated Usar `calcularTarifaMABE` con todos los parámetros explícitos.
 * Mantenido para compat con el formulario de diagnóstico del técnico.
 *
 * Asume `cumpleTA=true` y `cumpleEncuesta=true` por compatibilidad con el flujo
 * viejo (que solo conocía días transcurridos). El recálculo final ocurre al
 * cerrar el servicio en `/api/confirmar-servicio` con datos reales.
 */
export function calcularTotalGarantia(
  complejidad: ComplejidadServicio,
  _kilometros: number, // deprecated, kept for backward compat
  diasTranscurridos: number,
): {
  manoObra: number
  kilometraje: number
  bono: number
  total: number
  complejidadInfo: TarifaComplejidadLegacy
} {
  const info = TARIFAS_MANO_OBRA[complejidad]
  const bono = calcularBono(complejidad, diasTranscurridos)

  return {
    manoObra: info.manoObra,
    kilometraje: 0,
    bono,
    total: info.manoObra + bono,
    complejidadInfo: info,
  }
}
