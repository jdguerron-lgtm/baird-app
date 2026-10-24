/**
 * bono-garantia.ts — ÚNICA fuente de verdad para los bonos de garantía MABE
 * (2026-10-24): tiempo de atención (TA), días de solución con pausa por
 * repuesto, recargo de fin de semana/festivo y encuesta. Helpers PUROS
 * (sin Supabase) compartidos por la liquidación, finanzas, la ficha admin y
 * el portal del técnico. Ver docs/TARIFAS.md § "Garantía MABE".
 *
 * Reglas (pedido de Juan, 2026-10-24):
 *   - TA: el diagnóstico dentro de las 24 h desde que el cliente confirmó el
 *     horario (`cumple_ta` persistido por /api/diagnostico; se recalcula aquí
 *     si hay fechas para mostrar las horas).
 *   - Días de solución: creación → cierre, DESCONTANDO la pausa por repuesto.
 *     La pausa arranca en el diagnóstico con `esperar_repuesto`
 *     (`siguiente_paso_at`) y termina cuando el repuesto se recibe EN EL
 *     SISTEMA (`repuesto_recibido_at`: admin, supervisor o técnico). Si nadie
 *     lo marcó pero el servicio salió del ciclo (el cliente agendó con el
 *     repuesto en camino, o el técnico completó directo), termina en ese
 *     evento (`fin_pausa_repuesto_at`, derivado de solicitud_eventos). Si el
 *     servicio sigue esperando, la pausa está ABIERTA hasta "ahora".
 *   - Recargo finde/festivo: aplica si el técnico TRABAJÓ en sábado, domingo
 *     o festivo CO — es decir, si el diagnóstico (`diagnosticado_at`) o el
 *     cierre (`evidencias.completado_at`) cayó en uno de esos días. Antes
 *     del diagnóstico es una proyección por el horario confirmado. Las filas
 *     viejas con `recargo_weekend_aplicado > 0` se respetan.
 *   - Encuesta: `evidencias.confirmado = true` + "Calificacion: N/10" en el
 *     comentario del cliente.
 */
import {
  calcularTarifaMABE,
  cumpleTA as cumpleTAHelper,
  esFinDeSemana,
  TA_HORAS_LIMITE,
  type ComplejidadServicio,
  type TarifaMABEResultado,
} from '@/lib/constants/tarifas/mabe'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

const MS_DIA = 24 * 60 * 60 * 1000
const CALIFICACION_RE = /Calificacion:\s*(\d{1,2})\/10/

/** Estados en los que la pausa por repuesto sigue abierta. */
export const ESTADOS_PAUSA_REPUESTO: ReadonlySet<string> = new Set([
  'esperando_repuesto',
  'repuesto_en_camino',
  'repuesto_recibido',
])

export interface SolicitudBono {
  created_at: string
  estado?: string | null
  diagnosticado_at?: string | null
  horario_confirmado_at?: string | null
  horario_confirmado?: string | null
  fecha_visita_at?: string | null
  cumple_ta?: boolean | null
  siguiente_paso?: string | null
  siguiente_paso_at?: string | null
  repuesto_recibido_at?: string | null
  /** Salida del ciclo de repuesto sin "recibido" (evento → en_proceso / confirmacion_pendiente). */
  fin_pausa_repuesto_at?: string | null
  recargo_weekend_aplicado?: number | null
  triaje_resultado?: { complejidad?: string | null; dias_transcurridos?: number | null } | Record<string, unknown> | null
}

export interface EvidenciaBono {
  completado_at?: string | null
  confirmado?: boolean | null
  confirmado_at?: string | null
  cliente_comentario?: string | null
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}
const redondear1 = (n: number) => Math.round(n * 10) / 10

/** Fecha de cierre efectiva (mismos fallbacks que la liquidación). */
export function fechaCierreBono(
  sol: SolicitudBono,
  ev: EvidenciaBono | null | undefined,
): { iso: string; origen: 'completado' | 'confirmación cliente' | 'diagnóstico' | 'creación' } {
  if (ev?.completado_at) return { iso: ev.completado_at, origen: 'completado' }
  if (ev?.confirmado_at) return { iso: ev.confirmado_at, origen: 'confirmación cliente' }
  if (sol.diagnosticado_at) return { iso: sol.diagnosticado_at, origen: 'diagnóstico' }
  return { iso: sol.created_at, origen: 'creación' }
}

export interface PausaRepuesto {
  /** Hubo (o hay) pausa por repuesto. */
  aplica: boolean
  inicio: string | null
  /** null mientras la pausa sigue abierta. */
  fin: string | null
  abierta: boolean
  /** Días descontados (1 decimal). */
  dias: number
  /** Qué cerró la pausa. */
  origenFin: 'recibido' | 'salida_ciclo' | null
}

/**
 * Pausa por repuesto hasta `hastaIso` (cierre real o "ahora" en proyección).
 */
export function pausaRepuesto(sol: SolicitudBono, hastaIso: string): PausaRepuesto {
  const vacia: PausaRepuesto = { aplica: false, inicio: null, fin: null, abierta: false, dias: 0, origenFin: null }
  if (sol.siguiente_paso !== 'esperar_repuesto') return vacia
  const inicioIso = sol.siguiente_paso_at ?? sol.diagnosticado_at ?? null
  const p0 = ms(inicioIso)
  if (p0 === null) return vacia

  let finIso: string | null = null
  let origenFin: PausaRepuesto['origenFin'] = null
  if (ms(sol.repuesto_recibido_at) !== null) {
    finIso = sol.repuesto_recibido_at!
    origenFin = 'recibido'
  } else if (ms(sol.fin_pausa_repuesto_at) !== null) {
    finIso = sol.fin_pausa_repuesto_at!
    origenFin = 'salida_ciclo'
  }

  const enCiclo = ESTADOS_PAUSA_REPUESTO.has(sol.estado ?? '')
  const abierta = finIso === null && enCiclo
  // Sin fin conocido y fuera del ciclo (fila vieja sin evento): la pausa
  // llega hasta el cierre — el técnico no controla la espera.
  const finEfectivoMs = finIso ? ms(finIso)! : ms(hastaIso)!
  const hastaMs = ms(hastaIso)!
  const dias = Math.max(0, (Math.min(finEfectivoMs, hastaMs) - p0) / MS_DIA)
  return {
    aplica: true,
    inicio: inicioIso,
    fin: finIso,
    abierta,
    dias: redondear1(dias),
    origenFin,
  }
}

export interface DiasSolucion {
  /** Días netos para la tabla de bonos (1 decimal). */
  netos: number
  /** Días calendario brutos creación → cierre (1 decimal). */
  brutos: number
  pausa: PausaRepuesto
  inicio: string
  fin: string
}

/** Días de solución netos = brutos − pausa por repuesto. */
export function diasSolucionBono(sol: SolicitudBono, cierreIso: string): DiasSolucion {
  const inicio = ms(sol.created_at)
  const fin = ms(cierreIso)
  const pausa = pausaRepuesto(sol, cierreIso)
  if (inicio === null || fin === null || fin < inicio) {
    const fallback = Number((sol.triaje_resultado as { dias_transcurridos?: number } | null)?.dias_transcurridos ?? 0) || 0
    return { netos: fallback, brutos: fallback, pausa, inicio: sol.created_at, fin: cierreIso }
  }
  const brutos = (fin - inicio) / MS_DIA
  const netos = Math.max(0, brutos - pausa.dias)
  return { netos: redondear1(netos), brutos: redondear1(brutos), pausa, inicio: sol.created_at, fin: cierreIso }
}

export interface TiempoAtencion {
  /** null = sin datos (solicitud sin horario confirmado o sin diagnóstico). */
  cumple: boolean | null
  /** Horas entre la confirmación del horario y el diagnóstico (1 decimal). */
  horas: number | null
  limite: number
}

export function tiempoAtencion(sol: SolicitudBono): TiempoAtencion {
  const h0 = ms(sol.horario_confirmado_at)
  const h1 = ms(sol.diagnosticado_at)
  if (h0 !== null && h1 !== null) {
    return {
      cumple: cumpleTAHelper(sol.horario_confirmado_at, sol.diagnosticado_at),
      horas: redondear1((h1 - h0) / 3600000),
      limite: TA_HORAS_LIMITE,
    }
  }
  return { cumple: typeof sol.cumple_ta === 'boolean' ? sol.cumple_ta : null, horas: null, limite: TA_HORAS_LIMITE }
}

export interface FinDeSemanaTrabajo {
  aplica: boolean
  /** Por qué aplica (o, en proyección, por qué aplicaría). */
  motivo: 'diagnóstico' | 'cierre' | 'horario' | 'persistido' | null
  /** Día CO (YYYY-MM-DD) que disparó el recargo. */
  fecha: string | null
  /** true si aún no hay diagnóstico y se evaluó el horario confirmado. */
  proyeccion: boolean
}

/**
 * Recargo finde/festivo por TRABAJO REAL del técnico: diagnóstico o cierre en
 * sábado, domingo o festivo CO. Sin diagnóstico aún → proyección por horario.
 */
export function finDeSemanaTrabajo(sol: SolicitudBono, ev: EvidenciaBono | null | undefined): FinDeSemanaTrabajo {
  if (sol.diagnosticado_at && esFinDeSemana(sol.diagnosticado_at)) {
    return { aplica: true, motivo: 'diagnóstico', fecha: fechaColombiaYMD(new Date(sol.diagnosticado_at)), proyeccion: false }
  }
  if (ev?.completado_at && esFinDeSemana(ev.completado_at)) {
    return { aplica: true, motivo: 'cierre', fecha: fechaColombiaYMD(new Date(ev.completado_at)), proyeccion: false }
  }
  if ((sol.recargo_weekend_aplicado ?? 0) > 0) {
    return { aplica: true, motivo: 'persistido', fecha: null, proyeccion: false }
  }
  if (!sol.diagnosticado_at) {
    const horario = sol.fecha_visita_at ?? sol.horario_confirmado ?? null
    if (horario && esFinDeSemana(horario)) {
      const f = sol.fecha_visita_at ? fechaColombiaYMD(new Date(sol.fecha_visita_at)) : null
      return { aplica: true, motivo: 'horario', fecha: f, proyeccion: true }
    }
    return { aplica: false, motivo: null, fecha: null, proyeccion: true }
  }
  return { aplica: false, motivo: null, fecha: null, proyeccion: false }
}

export interface EncuestaBono {
  contestada: boolean
  calificacion: number | null
}

export function encuestaDeEvidencia(ev: EvidenciaBono | null | undefined): EncuestaBono {
  const match = ev?.cliente_comentario?.match(CALIFICACION_RE)
  if (ev?.confirmado === true && match) return { contestada: true, calificacion: Number(match[1]) }
  return { contestada: false, calificacion: null }
}

export interface ResumenBonoGarantia {
  complejidad: ComplejidadServicio | null
  /** true cuando hay cierre real (evidencia completada / confirmada). */
  consolidado: boolean
  cierre: ReturnType<typeof fechaCierreBono> | { iso: string; origen: 'ahora' }
  ta: TiempoAtencion
  dias: DiasSolucion
  finde: FinDeSemanaTrabajo
  encuesta: EncuestaBono
  /** Encuesta usada en el cálculo (en proyección se asume contestada). */
  encuestaAsumida: boolean
  /** TA usado en el cálculo (null → asumido cumplido). */
  taAsumido: boolean
  tarifa: TarifaMABEResultado | null
}

/**
 * Resumen completo para UI/liquidación. Sin cierre real usa `ahora` como fin
 * (proyección) y supone TA cumplido y encuesta contestada cuando no hay dato.
 */
export function resumenBonoGarantia(
  sol: SolicitudBono,
  ev: EvidenciaBono | null | undefined,
  opts: { ahora?: Date; cierreIso?: string } = {},
): ResumenBonoGarantia {
  const complejidadRaw = (sol.triaje_resultado as { complejidad?: string } | null)?.complejidad
  const complejidad: ComplejidadServicio | null =
    complejidadRaw === 'baja' || complejidadRaw === 'media' || complejidadRaw === 'alta' ? complejidadRaw : null

  const consolidado = !!(ev?.completado_at || ev?.confirmado_at || opts.cierreIso)
  const cierre = opts.cierreIso
    ? { iso: opts.cierreIso, origen: 'completado' as const }
    : consolidado
      ? fechaCierreBono(sol, ev)
      : { iso: (opts.ahora ?? new Date()).toISOString(), origen: 'ahora' as const }

  const ta = tiempoAtencion(sol)
  const dias = diasSolucionBono(sol, cierre.iso)
  const finde = finDeSemanaTrabajo(sol, ev)
  const encuesta = encuestaDeEvidencia(ev)

  const taAsumido = ta.cumple === null
  const encuestaAsumida = !consolidado && !encuesta.contestada
  const tarifa = complejidad
    ? calcularTarifaMABE({
        complejidad,
        diasSolucion: dias.netos,
        cumpleTA: ta.cumple ?? true,
        cumpleEncuesta: consolidado ? encuesta.contestada : true,
        esFinDeSemana: finde.aplica,
      })
    : null

  return { complejidad, consolidado, cierre, ta, dias, finde, encuesta, encuestaAsumida, taAsumido, tarifa }
}
