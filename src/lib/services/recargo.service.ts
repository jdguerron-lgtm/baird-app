import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  recargoParticularParaHorario,
  recargoTecnicoDesdeBruto,
} from '@/lib/constants/tarifas/particular'

/**
 * recargo.service — sincroniza el recargo de fin de semana/festivo PARTICULAR
 * cuando cambia la fecha de visita (cambio 2026-07-21).
 *
 * Regla: si el horario confirmado de un servicio particular cae sábado,
 * domingo o festivo colombiano, la solicitud lleva recargo (mismo reparto que
 * garantía: técnico 90%, Baird 10%; el cliente lo paga con IVA). Se persiste:
 *   - `recargo_weekend_aplicado` = recargo BRUTO aplicado (0 o 6000) — libro
 *     mayor de lo que ya se sumó, para que reagendar no duplique ni deje
 *     recargo fantasma.
 *   - `pago_tecnico` += delta del neto del técnico (90% del bruto).
 *
 * Solo actúa en estados PRE-cotización (`pendiente_horario`, `notificada`,
 * `asignada`): después de cotizar, el total ya fue comunicado/aprobado por el
 * cliente y no se mueve dinero retroactivamente (la cotización incorpora el
 * recargo vigente al construirse — ver /api/diagnostico). Garantía es no-op:
 * su recargo lo paga MABE por complejidad (tarifas/mabe.ts).
 *
 * Llamar DESPUÉS de cada escritura exitosa de horario_confirmado/fecha_visita_at:
 * confirmarHorarioSolicitud, procesarAceptacion (técnico elige horario),
 * procesarReagendamientoCliente y procesarReagendamientoAdmin.
 */

const ESTADOS_SINCRONIZABLES = new Set(['pendiente_horario', 'notificada', 'asignada'])

export interface RecargoSyncResult {
  /** true si se escribió un cambio en BD. */
  actualizado: boolean
  /** Recargo bruto vigente tras la sincronización (0 si no aplica). */
  recargoBruto: number
  /** pago_tecnico vigente tras la sincronización (null si no se pudo leer). */
  pagoTecnico: number | null
}

export async function sincronizarRecargoFinDeSemana(solicitudId: string): Promise<RecargoSyncResult> {
  const noop: RecargoSyncResult = { actualizado: false, recargoBruto: 0, pagoTecnico: null }

  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, es_garantia, estado, pago_tecnico, recargo_weekend_aplicado, fecha_visita_at, horario_confirmado')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) {
    console.error('[recargo] No se pudo leer la solicitud para sincronizar recargo:', error)
    return noop
  }

  if (sol.es_garantia) return { ...noop, pagoTecnico: sol.pago_tecnico ?? null }
  if (!ESTADOS_SINCRONIZABLES.has(sol.estado)) {
    return {
      actualizado: false,
      recargoBruto: sol.recargo_weekend_aplicado ?? 0,
      pagoTecnico: sol.pago_tecnico ?? null,
    }
  }

  const recargoActual = sol.recargo_weekend_aplicado ?? 0
  // fecha_visita_at (ISO) es la fuente canónica; fallback al texto español de
  // horario_confirmado (esFinDeSemana lo parsea vía parsearFechaVisita).
  const recargoNuevo = recargoParticularParaHorario(sol.fecha_visita_at ?? sol.horario_confirmado)

  if (recargoNuevo === recargoActual) {
    return { actualizado: false, recargoBruto: recargoActual, pagoTecnico: sol.pago_tecnico ?? null }
  }

  const delta = recargoTecnicoDesdeBruto(recargoNuevo) - recargoTecnicoDesdeBruto(recargoActual)
  const pagoNuevo = Math.max(0, (sol.pago_tecnico ?? 0) + delta)

  // Guard de idempotencia: solo aplica el delta si el ledger sigue como lo
  // leímos (dos syncs concurrentes no pueden sumar el delta dos veces).
  const updateBuilder = supabase
    .from('solicitudes_servicio')
    .update({ recargo_weekend_aplicado: recargoNuevo, pago_tecnico: pagoNuevo })
    .eq('id', sol.id)

  const { data: updated, error: updErr } = await (
    sol.recargo_weekend_aplicado === null
      ? updateBuilder.is('recargo_weekend_aplicado', null)
      : updateBuilder.eq('recargo_weekend_aplicado', sol.recargo_weekend_aplicado)
  )
    .select('id')
    .maybeSingle()

  if (updErr) {
    console.error('[recargo] No se pudo sincronizar el recargo:', updErr)
    return { actualizado: false, recargoBruto: recargoActual, pagoTecnico: sol.pago_tecnico ?? null }
  }
  if (!updated) {
    // Otro sync ganó la carrera — su resultado es igual de válido.
    return { actualizado: false, recargoBruto: recargoNuevo, pagoTecnico: null }
  }

  return { actualizado: true, recargoBruto: recargoNuevo, pagoTecnico: pagoNuevo }
}
