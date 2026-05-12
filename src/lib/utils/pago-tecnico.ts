/**
 * Helpers para calcular y exponer el pago al técnico en garantía MABE.
 *
 * Estos helpers están diseñados para alimentar UI del portal del técnico
 * (lista de servicios, diagnóstico, completar). NO exponen lo que paga
 * MABE ni el margen Baird — solo el desglose neto que recibe el técnico.
 *
 * Para particular ver `src/lib/constants/tarifas/particular.ts` —
 * el técnico recibe íntegro el `costoTecnico` que él mismo ingresa.
 */

import {
  calcularTarifaMABE,
  type ComplejidadServicio,
  esFinDeSemana,
  TARIFAS_MABE_TIPO_D,
  MARGEN_BAIRD_GARANTIA,
  MARGEN_BAIRD_BONO,
  RECARGO_FIN_DE_SEMANA,
  BONOS_CON_ENCUESTA,
  BONOS_SIN_ENCUESTA,
} from '@/lib/constants/tarifas/mabe'

export type ModoEstimacion = 'rango' | 'proyectado' | 'consolidado'

export interface PagoTecnicoBreakdown {
  mode: ModoEstimacion
  /** Pago neto que recibe el técnico por la mano de obra (= 78% × base MABE). */
  pagoBase: number
  /** Pago neto del bono por tiempo (= 90% × bono MABE). 0 si no aplica. */
  pagoBono: number
  /** Pago neto del recargo de fin de semana (= 90% × recargo MABE). 0 si no aplica. */
  pagoRecargo: number
  /** Total neto al técnico. */
  pagoTotal: number
  /** Para modo `rango`: pago mínimo posible (complejidad baja, sin bono, sin weekend). */
  rangoMin?: number
  /** Para modo `rango`: pago máximo posible (complejidad alta, mejor bono, weekend). */
  rangoMax?: number
  /** Supuestos sobre los que se calculó este pago, para mostrar al técnico. */
  supuestos: string[]
  /** Complejidad sobre la que se calculó (null si modo `rango`). */
  complejidad: ComplejidadServicio | null
  esFinDeSemana: boolean
  cumpleTA: boolean
  cumpleEncuesta: boolean
  diasSolucion: number
}

/**
 * Estima el pago neto al técnico para un servicio de garantía MABE.
 *
 * Modos:
 *   - `rango`:      sin complejidad conocida → muestra mínimo y máximo posibles.
 *   - `proyectado`: con complejidad y supuestos optimistas (TA + encuesta) → pago esperado.
 *   - `consolidado`: con todos los datos reales tras cierre → pago final.
 */
export function estimarPagoTecnicoGarantia(params: {
  complejidad?: ComplejidadServicio | null
  diasSolucion?: number
  horarioConfirmado?: string | Date | null
  cumpleTA?: boolean
  cumpleEncuesta?: boolean
  /** Si true, los supuestos no resueltos se interpretan optimistas (TA + encuesta). */
  asumirOptimista?: boolean
  /** Si true, el cálculo se considera consolidado (no proyección). */
  consolidado?: boolean
}): PagoTecnicoBreakdown {
  const {
    complejidad = null,
    diasSolucion = 0,
    horarioConfirmado,
    cumpleTA,
    cumpleEncuesta,
    asumirOptimista = true,
    consolidado = false,
  } = params

  const weekend = esFinDeSemana(horarioConfirmado ?? null)
  const taResuelto = typeof cumpleTA === 'boolean' ? cumpleTA : asumirOptimista
  const encuestaResuelta = typeof cumpleEncuesta === 'boolean' ? cumpleEncuesta : asumirOptimista

  // Sin complejidad conocida → calcular rango min/max para que el técnico
  // tenga una idea del orden de magnitud antes de diagnosticar.
  if (!complejidad) {
    const min = calcularTarifaMABE({
      complejidad: 'baja',
      diasSolucion: 99,
      cumpleTA: false,
      cumpleEncuesta: false,
      esFinDeSemana: false,
    }).pagoTecnico
    const max = calcularTarifaMABE({
      complejidad: 'alta',
      diasSolucion: 0,
      cumpleTA: true,
      cumpleEncuesta: true,
      esFinDeSemana: true,
    }).pagoTecnico
    return {
      mode: 'rango',
      pagoBase: 0,
      pagoBono: 0,
      pagoRecargo: 0,
      pagoTotal: 0,
      rangoMin: min,
      rangoMax: max,
      supuestos: [
        'Rango entre el peor caso (complejidad baja, sin bono) y el mejor caso (complejidad alta, bono pleno, sábado/domingo).',
        'El pago exacto se confirma al registrar el diagnóstico.',
      ],
      complejidad: null,
      esFinDeSemana: weekend,
      cumpleTA: taResuelto,
      cumpleEncuesta: encuestaResuelta,
      diasSolucion,
    }
  }

  const result = calcularTarifaMABE({
    complejidad,
    diasSolucion,
    cumpleTA: taResuelto,
    cumpleEncuesta: encuestaResuelta,
    esFinDeSemana: weekend,
  })

  const supuestos: string[] = []
  if (!consolidado) {
    if (typeof cumpleTA !== 'boolean') {
      supuestos.push('Supone que diagnosticas dentro de las 24 horas del horario confirmado (TA).')
    } else if (!cumpleTA) {
      supuestos.push('TA NO cumplido — el bono se anula.')
    }
    if (typeof cumpleEncuesta !== 'boolean') {
      supuestos.push('Supone que el cliente contestará la encuesta de satisfacción (bono pleno).')
    } else if (!cumpleEncuesta) {
      supuestos.push('Cliente no contestó encuesta — bono reducido.')
    }
    if (diasSolucion === 0) {
      supuestos.push('Bono calculado asumiendo solución en menos de 1 día.')
    }
  } else {
    supuestos.push('Cálculo consolidado con encuesta del cliente y TA reales.')
  }
  if (weekend) {
    supuestos.push('Recargo de fin de semana aplicado.')
  }

  return {
    mode: consolidado ? 'consolidado' : 'proyectado',
    pagoBase: result.pagoBase,
    pagoBono: result.pagoBono,
    pagoRecargo: result.pagoRecargo,
    pagoTotal: result.pagoTecnico,
    supuestos,
    complejidad,
    esFinDeSemana: weekend,
    cumpleTA: taResuelto,
    cumpleEncuesta: encuestaResuelta,
    diasSolucion,
  }
}

/**
 * Pago base (mano de obra solamente) que recibe el técnico, neto, por complejidad.
 * Útil para mostrar referencia rápida en la lista de servicios.
 */
export function pagoBaseNetoTecnico(complejidad: ComplejidadServicio): number {
  return Math.round(TARIFAS_MABE_TIPO_D[complejidad] * (1 - MARGEN_BAIRD_GARANTIA))
}

/**
 * Pago neto del recargo de fin de semana por complejidad.
 */
export function pagoRecargoWeekendNeto(complejidad: ComplejidadServicio): number {
  return Math.round(RECARGO_FIN_DE_SEMANA[complejidad] * (1 - MARGEN_BAIRD_BONO))
}

/**
 * Bono neto que recibe el técnico, por complejidad / días / encuesta.
 * Útil para mostrar las tablas de incentivos en el portal sin re-importar BONOS_*.
 */
export function pagoBonoNetoTecnico(
  complejidad: ComplejidadServicio,
  diasSolucion: number,
  cumpleEncuesta: boolean,
  cumpleTA: boolean = true,
): number {
  if (!cumpleTA) return 0
  const tabla = cumpleEncuesta ? BONOS_CON_ENCUESTA[complejidad] : BONOS_SIN_ENCUESTA[complejidad]
  for (const rango of tabla) {
    if (diasSolucion <= rango.max) {
      return Math.round(rango.bono * (1 - MARGEN_BAIRD_BONO))
    }
  }
  return 0
}
