/**
 * @deprecated Este módulo se renombró a `@/lib/constants/tarifas/mabe`.
 *
 * Doc canónico: docs/TARIFAS.md.
 *
 * Para nuevo código, importar de `@/lib/constants/tarifas` o
 * `@/lib/constants/tarifas/mabe` directamente.
 *
 * Este archivo se mantiene como shim de back-compat para callers existentes.
 */

export {
  // Tipos
  type ComplejidadServicio,
  type TarifaComplejidadLegacy as TarifaComplejidad,
  // Legacy exports (se mantienen para no romper callers)
  TARIFAS_MANO_OBRA,
  BONO_INCENTIVO,
  calcularBono,
  calcularTotalGarantia,
  // Nuevos exports recomendados
  TARIFAS_MABE_TIPO_D,
  COMPLEJIDAD_LABELS,
  COMPLEJIDAD_DESCRIPCIONES,
  BONOS_CON_ENCUESTA,
  BONOS_SIN_ENCUESTA,
  RECARGO_FIN_DE_SEMANA,
  MARGEN_BAIRD_GARANTIA,
  TIPO_TALLER_MABE_BAIRD,
  TA_HORAS_LIMITE,
  calcularBonoMABE,
  calcularTarifaMABE,
  esFinDeSemana,
  cumpleTA,
} from './tarifas/mabe'
