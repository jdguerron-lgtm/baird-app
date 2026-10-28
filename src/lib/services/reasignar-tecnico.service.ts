/**
 * reasignar-tecnico.service.ts — cambio MANUAL de técnico desde la ficha admin
 * (2026-10-26). Para cuando la programación quedó mal (el técnico no llega, se
 * cruzó la agenda, etc.) y el equipo ya sabe quién debe ir: a diferencia de
 * "Liberar técnico y reofertar" (que suelta al técnico y lo ofrece a todos),
 * acá el admin elige directamente al técnico nuevo.
 *
 * Efectos:
 *  - UPDATE atómico condicionado al técnico y estado leídos (si alguien lo
 *    movió mientras tanto, no toca nada). `notificada` sin técnico → `asignada`;
 *    en cualquier otro estado vivo el estado se conserva.
 *  - El trigger `limpiar_confirmacion_visita` borra la confirmación anterior.
 *  - Ofertas abiertas (`notificaciones_whatsapp.estado='enviado'`) se invalidan.
 *  - Evento `nota_admin` con `payload.origen='cambio_tecnico'` (sin migración
 *    del CHECK de `solicitud_eventos.tipo`).
 *  - Avisos (si `notificar`): al técnico nuevo y al cliente los MISMOS
 *    mensajes de una aceptación (`avisarAsignacionTecnico`, sin repetir el
 *    cobro del anticipo cuando reemplaza a otro técnico) y texto libre
 *    best-effort al técnico anterior.
 *
 * Cupo por franja: si el técnico nuevo ya está lleno en esa franja se devuelve
 * `codigo: 'cupo_lleno'` y el admin puede forzar.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { puedeCambiarTecnico } from '@/lib/utils/cambiar-tecnico'
import { MAX_SERVICIOS_TECNICO_POR_FRANJA } from '@/lib/constants/franjas'
import { tecnicoOcupadoEnSlot } from '@/lib/services/agenda.service'
import { fijarEquipoPorDefecto } from '@/lib/services/equipo.service'
import { obtenerBloqueos } from '@/lib/services/penalizacion.service'
import { bloqueadoParaServicio } from '@/lib/utils/penalizacion-oferta'
import {
  avisarAsignacionTecnico,
  enviarMensajeTexto,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'

export interface ReasignarOpts {
  /** Email del admin (queda en el evento). */
  actor: string
  motivo?: string
  /** Default true: avisar por WhatsApp a técnico nuevo, anterior y cliente. */
  notificar?: boolean
  /** Asignar aunque el técnico nuevo tenga la franja llena. */
  forzarCupo?: boolean
  /**
   * El cambio se debe a que el técnico anterior incumplió (no llegó, llegó
   * tarde): cuenta para su penalización en las ofertas (penalizacion.service).
   */
  cuentaIncumplimiento?: boolean
}

export interface ReasignarResult {
  ok: boolean
  error?: string
  codigo?: 'cupo_lleno' | 'conflicto' | 'invalido'
  tecnicoNuevoNombre?: string
  tecnicoAnteriorNombre?: string | null
  estadoNuevo?: string
}

export async function reasignarTecnicoManual(
  solicitudId: string,
  nuevoTecnicoId: string,
  opts: ReasignarOpts,
): Promise<ReasignarResult> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, es_garantia, tecnico_asignado_id, fecha_visita_at, horario_confirmado, cliente_nombre, tipo_equipo, marca_equipo')
    .eq('id', solicitudId)
    .single()
  if (error || !sol) return { ok: false, codigo: 'invalido', error: 'Servicio no encontrado' }

  if (!puedeCambiarTecnico(sol.estado)) {
    return {
      ok: false,
      codigo: 'invalido',
      error: sol.estado === 'pendiente_horario'
        ? 'El servicio aún no tiene horario confirmado. Confirma el horario antes de asignar técnico.'
        : `El servicio está cerrado ("${sol.estado}"); no se puede cambiar el técnico.`,
    }
  }
  if (!sol.horario_confirmado && !sol.fecha_visita_at) {
    return { ok: false, codigo: 'invalido', error: 'El servicio no tiene horario de visita. Confirma el horario primero.' }
  }
  if (sol.tecnico_asignado_id === nuevoTecnicoId) {
    return { ok: false, codigo: 'invalido', error: 'Ese técnico ya está asignado a este servicio.' }
  }

  const { data: nuevo } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, estado_verificacion')
    .eq('id', nuevoTecnicoId)
    .maybeSingle()
  if (!nuevo) return { ok: false, codigo: 'invalido', error: 'Técnico no encontrado' }
  if (nuevo.estado_verificacion !== 'verificado') {
    return { ok: false, codigo: 'invalido', error: `${nuevo.nombre_completo} no está verificado.` }
  }
  // Bloqueo por tipo de servicio (2026-10-26): ni a mano se le asigna un
  // flujo bloqueado — primero quitar el bloqueo en /admin/tecnicos/[id].
  const bloqueos = await obtenerBloqueos([nuevo.id])
  if (bloqueadoParaServicio(bloqueos.get(nuevo.id), sol.es_garantia === true)) {
    return {
      ok: false,
      codigo: 'invalido',
      error: `${nuevo.nombre_completo} está bloqueado para servicios ${sol.es_garantia ? 'de garantía' : 'particulares'}. Quita el bloqueo en su ficha si debe ir.`,
    }
  }

  if (sol.fecha_visita_at && !opts.forzarCupo) {
    const ocupado = await tecnicoOcupadoEnSlot(nuevo.id, sol.fecha_visita_at, sol.id)
    if (ocupado) {
      return {
        ok: false,
        codigo: 'cupo_lleno',
        error: `${nuevo.nombre_completo} ya tiene ${MAX_SERVICIOS_TECNICO_POR_FRANJA} compromisos en esa franja.`,
      }
    }
  }

  const anteriorId = sol.tecnico_asignado_id as string | null
  let anterior: { id: string; nombre_completo: string; whatsapp: string | null } | null = null
  if (anteriorId) {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, whatsapp')
      .eq('id', anteriorId)
      .maybeSingle()
    anterior = data ?? null
  }

  const estadoNuevo = sol.estado === 'notificada' ? 'asignada' : (sol.estado as string)

  let upd = supabase
    .from('solicitudes_servicio')
    .update({ tecnico_asignado_id: nuevo.id, estado: estadoNuevo })
    .eq('id', sol.id)
    .eq('estado', sol.estado)
  upd = anteriorId ? upd.eq('tecnico_asignado_id', anteriorId) : upd.is('tecnico_asignado_id', null)
  const { data: filas, error: updErr } = await upd.select('*')
  if (updErr) return { ok: false, error: updErr.message }
  if (!filas || filas.length === 0) {
    return { ok: false, codigo: 'conflicto', error: 'El servicio cambió mientras tanto (otro técnico lo aceptó o el admin lo movió). Recarga.' }
  }
  const actualizado = filas[0]

  // Ofertas abiertas ya no sirven: nadie más puede aceptar este servicio.
  const { error: invErr } = await supabase
    .from('notificaciones_whatsapp')
    .update({ estado: 'invalidado' })
    .eq('solicitud_id', sol.id)
    .eq('estado', 'enviado')
  if (invErr) console.warn('[reasignarTecnicoManual] no se invalidaron ofertas abiertas:', invErr.message)

  const nombreAnterior = anterior?.nombre_completo ?? null
  const { error: evErr } = await supabase.from('solicitud_eventos').insert({
    solicitud_id: sol.id,
    tipo: 'nota_admin',
    estado_previo: sol.estado,
    estado_nuevo: estadoNuevo,
    actor: opts.actor,
    motivo: nombreAnterior
      ? `El equipo Baird (${opts.actor}) cambió el técnico: ${nombreAnterior} → ${nuevo.nombre_completo}${opts.motivo ? `. Motivo: ${opts.motivo}` : ''}`
      : `El equipo Baird (${opts.actor}) asignó manualmente a ${nuevo.nombre_completo}${opts.motivo ? `. Motivo: ${opts.motivo}` : ''}`,
    payload: {
      origen: 'cambio_tecnico',
      tecnico_anterior_id: anteriorId,
      tecnico_anterior_nombre: nombreAnterior,
      tecnico_nuevo_id: nuevo.id,
      tecnico_nuevo_nombre: nuevo.nombre_completo,
      motivo: opts.motivo ?? null,
      fecha_visita_at: sol.fecha_visita_at,
      horario_confirmado: sol.horario_confirmado,
      forzar_cupo: opts.forzarCupo === true,
      cuenta_incumplimiento: !!anteriorId && opts.cuentaIncumplimiento === true,
      notificado: opts.notificar !== false,
    },
  })
  if (evErr) console.error('[reasignarTecnicoManual] evento falló:', evErr.message)

  if (estadoNuevo !== sol.estado) {
    try {
      await notificarCambioEstado(sol.id, sol.estado, estadoNuevo)
    } catch (err) {
      console.error('[reasignarTecnicoManual] notificarCambioEstado falló:', err)
    }
  }

  if (opts.notificar === false) {
    // Sin avisos: igual se fija el equipo (auxiliares) del técnico nuevo para
    // que el carnet y /servicio no muestren a los del anterior.
    await fijarEquipoPorDefecto(sol.id, nuevo.id)
  } else {
    try {
      // Primera asignación (venía sin técnico) = igual que una aceptación,
      // anticipo incluido. Reemplazo = el cliente ya recibió el cobro.
      await avisarAsignacionTecnico(actualizado, nuevo.id, {
        incluirAnticipo: !anteriorId,
        contexto: 'reasignarTecnicoManual',
      })
    } catch (err) {
      console.error('[reasignarTecnicoManual] avisos de asignación fallaron:', err)
    }

    if (anterior?.whatsapp) {
      const equipo = [sol.tipo_equipo, sol.marca_equipo].filter(Boolean).join(' ')
      try {
        await enviarMensajeTexto(
          anterior.whatsapp,
          `Hola ${anterior.nombre_completo.split(' ')[0]}, Baird reasignó el servicio de ${sol.cliente_nombre} (${equipo}${sol.horario_confirmado ? `, ${sol.horario_confirmado}` : ''}) a otro técnico. Ya no tienes que ir. Si fue un error, escríbenos por este chat.`,
        )
      } catch (err) {
        console.warn('[reasignarTecnicoManual] aviso al técnico anterior no enviado:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  return {
    ok: true,
    tecnicoNuevoNombre: nuevo.nombre_completo,
    tecnicoAnteriorNombre: nombreAnterior,
    estadoNuevo,
  }
}
