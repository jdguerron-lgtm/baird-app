/**
 * Tarifas de garantía MABE — Taller Tipo C
 *
 * Fuente: Tabla oficial Mabe/GE Colombia
 * Código SAP mano de obra: 8011161600000121
 * Código SAP kilometraje: 8011161600000125
 */

export type ComplejidadServicio = 'baja' | 'media' | 'alta'

export interface TarifaComplejidad {
  codigo: 21 | 22 | 23
  label: string
  descripcion: string
  manoObra: number
}

/**
 * Tarifas de mano de obra por complejidad — Taller Tipo C
 */
export const TARIFAS_MANO_OBRA: Record<ComplejidadServicio, TarifaComplejidad> = {
  baja: {
    codigo: 21,
    label: 'Baja',
    descripcion: 'Ajustes menores, limpieza, cambio de piezas accesibles',
    manoObra: 26254,
  },
  media: {
    codigo: 22,
    label: 'Media',
    descripcion: 'Cambio de componentes internos, reparacion de sistemas',
    manoObra: 42079,
  },
  alta: {
    codigo: 23,
    label: 'Alta',
    descripcion: 'Reparacion de tarjeta electronica, compresor, motor principal',
    manoObra: 91592,
  },
}

/**
 * Tarifa de kilometraje
 */
export const TARIFA_KILOMETRO = 470 // COP por km

/**
 * Bono incentivo por cumplimiento (TSS — Time to Service)
 * Basado en dias desde la creacion de la solicitud hasta el diagnostico
 */
export const BONO_INCENTIVO: Record<ComplejidadServicio, { rango: string; min: number; max: number; bono: number }[]> = {
  baja: [
    { rango: '0 a 2 dias', min: 0, max: 2, bono: 9400 },
    { rango: '3 a 5 dias', min: 3, max: 5, bono: 7500 },
    { rango: '6 a 8 dias', min: 6, max: 8, bono: 4000 },
  ],
  media: [
    { rango: '0 a 2 dias', min: 0, max: 2, bono: 13000 },
    { rango: '3 a 5 dias', min: 3, max: 5, bono: 11500 },
    { rango: '6 a 8 dias', min: 6, max: 8, bono: 7500 },
  ],
  alta: [
    { rango: '0 a 2 dias', min: 0, max: 2, bono: 17000 },
    { rango: '3 a 5 dias', min: 3, max: 5, bono: 15000 },
    { rango: '6 a 8 dias', min: 6, max: 8, bono: 11200 },
  ],
}

/**
 * Calcula el bono incentivo basado en la complejidad y dias transcurridos
 */
export function calcularBono(complejidad: ComplejidadServicio, diasTranscurridos: number): number {
  const rangos = BONO_INCENTIVO[complejidad]
  for (const rango of rangos) {
    if (diasTranscurridos >= rango.min && diasTranscurridos <= rango.max) {
      return rango.bono
    }
  }
  return 0 // Sin bono si pasa de 8 dias
}

/**
 * Calcula el total del servicio de garantía
 */
export function calcularTotalGarantia(
  complejidad: ComplejidadServicio,
  kilometros: number,
  diasTranscurridos: number
): {
  manoObra: number
  kilometraje: number
  bono: number
  total: number
  complejidadInfo: TarifaComplejidad
} {
  const info = TARIFAS_MANO_OBRA[complejidad]
  const kilometraje = Math.round(kilometros * TARIFA_KILOMETRO)
  const bono = calcularBono(complejidad, diasTranscurridos)

  return {
    manoObra: info.manoObra,
    kilometraje,
    bono,
    total: info.manoObra + kilometraje + bono,
    complejidadInfo: info,
  }
}
