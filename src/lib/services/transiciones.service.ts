import { supabase } from '@/lib/supabase'
import {
  notificarTecnicos,
  notificarCambioEstado,
  notificarCotizacionAprobada,
  notificarTecnicoVisitaReprogramada,
  enviarMensajeTexto,
} from '@/lib/services/whatsapp.service'
import { esFechaVisitaPasada } from '@/lib/utils/fecha-visita'
import { validarHorarioAgendable } from '@/lib/services/agenda.service'
import { TYC_VERSION } from '@/types/solicitud'

/**
 * Servicio de transiciones de estado — única dueña de cada mutación.
 *
 * Cada función encapsula la lógica que antes vivía embebida en un route
 * handler. Devuelve `{ ok, httpStatus, body }` donde `body` es EXACTAMENTE
 * el JSON que el route debe responder, de modo que el route queda como un
 * wrapper delgado y su contrato HTTP no cambia.
 *
 * Estas mismas funciones son las que invoca el webhook de Dapta (segunda
 * línea de voz) para empujar el flujo cuando el cliente responde por
 * teléfono en vez de WhatsApp — reusando el MISMO guard atómico de estado,
 * que es la defensa anti-carrera (si el cliente confirma por las dos vías,
 * la segunda es no-op). Ver docs/DAPTA.md.
 */
export interface TransicionResult {
  ok: boolean
  httpStatus: number
  body: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────
// pendiente_horario → notificada  (confirmar-horario)
// ─────────────────────────────────────────────────────────────────
export async function confirmarHorarioSolicitud(
  token: unknown,
  horario: unknown,
): Promise<TransicionResult> {
  if (!token || typeof horario !== 'string' || !horario.trim() || horario.length > 200) {
    return { ok: false, httpStatus: 400, body: { error: 'Parámetros inválidos' } }
  }

  const horarioElegido = horario.trim()

  // 1. Validar token
  const { data: sol, error: solErr } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, horario_confirmado_at, fecha_visita_at, tecnico_asignado_id')
    .eq('horario_token', token)
    .single()

  if (solErr || !sol) {
    return { ok: false, httpStatus: 404, body: { error: 'Token inválido o expirado' } }
  }

  if (sol.estado === 'sin_agendar') {
    return { ok: false, httpStatus: 410, body: { error: 'La solicitud expiró sin confirmación' } }
  }

  // Reagendar-vencido: ya se agendó una vez pero la fecha pasó y el servicio no
  // avanzó (sigue en 'notificada' sin técnico — nadie lo tomó). Permite
  // re-confirmar por este MISMO link, saltando los guards de "ya confirmado" /
  // "ya no espera horario". Cualquier otro estado conserva el comportamiento previo.
  const esReagendarVencido =
    sol.estado === 'notificada' &&
    !sol.tecnico_asignado_id &&
    esFechaVisitaPasada(sol.fecha_visita_at)

  if (!esReagendarVencido) {
    if (sol.horario_confirmado_at) {
      return { ok: false, httpStatus: 400, body: { error: 'Este horario ya fue confirmado' } }
    }
    if (sol.estado !== 'pendiente_horario') {
      return {
        ok: false,
        httpStatus: 400,
        body: { error: 'La solicitud ya no está esperando confirmación de horario' },
      }
    }
  }

  // Validación de agenda (agenda.service): mínimo mañana (TZ Colombia) +
  // cupo de MAX_RESERVAS_POR_FRANJA por slot (día + franja). Texto libre no
  // parseable pasa con fechaVisitaAt=null (la UI ya impone min; admin coordina).
  const agenda = await validarHorarioAgendable(horarioElegido, sol.id)
  if (!agenda.ok) {
    return { ok: false, httpStatus: 400, body: { error: agenda.error } }
  }
  const fechaVisitaAt = agenda.fechaVisitaAt

  const estadoPrevio = sol.estado

  // 2. UPDATE atómico. Guard anti-carrera según el caso:
  //    - normal: solo si aún no se confirmó (horario_confirmado_at IS NULL)
  //    - reagendar-vencido: solo si sigue en 'notificada' sin técnico (si uno
  //      aceptó entre el read y el write, el update no toca nada y abortamos).
  const updateBuilder = supabase
    .from('solicitudes_servicio')
    .update({
      horario_confirmado: horarioElegido,
      horario_confirmado_at: new Date().toISOString(),
      fecha_visita_at: fechaVisitaAt,
      estado: 'notificada',
      notificados_at: new Date().toISOString(),
      tyc_aceptados_at: new Date().toISOString(),
      tyc_version: TYC_VERSION,
    })
    .eq('id', sol.id)

  const { data: updated, error: updateErr } = await (
    esReagendarVencido
      ? updateBuilder.eq('estado', 'notificada').is('tecnico_asignado_id', null)
      : updateBuilder.is('horario_confirmado_at', null)
  )
    .select('id')
    .single()

  if (updateErr || !updated) {
    return { ok: false, httpStatus: 500, body: { error: 'No se pudo confirmar el horario' } }
  }

  // Auditoría del reagendamiento por vencimiento (append-only). No bloquea.
  if (esReagendarVencido) {
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'reagendamiento',
        estado_previo: estadoPrevio,
        estado_nuevo: 'notificada',
        actor: 'cliente',
        motivo: 'Cliente reagendó vía link de horario tras vencer la fecha sin técnico asignado',
        payload: { horario_confirmado: horarioElegido, reagendar_vencido: true },
      })
    } catch (err) {
      console.error('[confirmar-horario] No se pudo registrar evento de reagendamiento:', err)
    }
  }

  // Notificar a supervisores configurados (no bloquea el flujo si falla).
  // Si fue reagendar-vencido, el evento dedicado 'reagendamiento' de arriba ya
  // registró la transición — no duplicar en el historial.
  await notificarCambioEstado(sol.id, estadoPrevio, 'notificada', { registrarEvento: !esReagendarVencido })

  // 3. Notificar técnicos (await — fire-and-forget se cancela en Vercel serverless)
  let notifResult: { notificados: number; matched: number; errors: string[] } | null = null
  try {
    notifResult = await notificarTecnicos(sol.id)
  } catch (err) {
    console.error('[confirmar-horario] notificarTecnicos falló:', err)
  }

  // 4. Si nadie recibió la notificación (0 técnicos disponibles o todos
  //    fallaron), registrar evento de admin para visibilidad. La fila
  //    quedó en estado 'notificada' pero realmente nadie está al tanto —
  //    admin necesita saber para resolver manualmente (e.g., asignar
  //    técnico de otra zona o avisar al cliente que hay demora).
  const notifFalla = !notifResult || notifResult.notificados === 0
  if (notifFalla) {
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'nota_admin',
        estado_previo: 'pendiente_horario',
        estado_nuevo: 'notificada',
        actor: 'sistema',
        motivo: 'Cliente confirmó horario pero ningún técnico fue notificado',
        payload: {
          horario_confirmado: horarioElegido,
          matched: notifResult?.matched ?? 0,
          notificados: 0,
          errors: notifResult?.errors ?? [],
          requiere_intervencion_admin: true,
        },
      })
    } catch (err) {
      console.error('[confirmar-horario] No se pudo registrar evento de admin:', err)
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    body: {
      success: true,
      horario: horarioElegido,
      notificados: notifResult?.notificados ?? 0,
      matched: notifResult?.matched ?? 0,
      errors: notifResult?.errors ?? [],
      // Warning visible al cliente cuando no hay técnicos en la zona —
      // HorarioSelector lo muestra para que el cliente sepa que hay demora.
      warning: notifFalla
        ? 'Tu horario fue registrado, pero en este momento no encontramos técnicos disponibles en tu zona. El equipo Baird te contactará para ofrecerte alternativas.'
        : null,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// en_verificacion → completada | en_disputa  (confirmar-servicio)
// ─────────────────────────────────────────────────────────────────
export async function confirmarServicioCliente(
  confirmacionToken: unknown,
  confirmado: unknown,
  comentario?: unknown,
): Promise<TransicionResult> {
  if (!confirmacionToken || typeof confirmado !== 'boolean') {
    return { ok: false, httpStatus: 400, body: { error: 'Faltan parámetros' } }
  }

  // Find evidence by confirmation token
  const { data: evidencia } = await supabase
    .from('evidencias_servicio')
    .select('id, solicitud_id, tecnico_id, confirmado')
    .eq('confirmacion_token', confirmacionToken)
    .single()

  if (!evidencia) {
    return { ok: false, httpStatus: 404, body: { error: 'Token inválido' } }
  }

  if (evidencia.confirmado !== null) {
    return { ok: false, httpStatus: 400, body: { error: 'Ya fue confirmado anteriormente' } }
  }

  const comentarioTexto = typeof comentario === 'string' ? comentario : null

  // Update evidence
  await supabase
    .from('evidencias_servicio')
    .update({
      confirmado,
      confirmado_at: new Date().toISOString(),
      cliente_comentario: comentarioTexto || null,
    })
    .eq('id', evidencia.id)

  // Update solicitud estado
  const nuevoEstado = confirmado ? 'completada' : 'en_disputa'
  await supabase
    .from('solicitudes_servicio')
    .update({ estado: nuevoEstado })
    .eq('id', evidencia.solicitud_id)

  await notificarCambioEstado(evidencia.solicitud_id, 'en_verificacion', nuevoEstado)

  // Fetch solicitud and technician data to send WhatsApp notifications
  const [{ data: sol }, { data: tecnico }] = await Promise.all([
    supabase
      .from('solicitudes_servicio')
      .select('tipo_equipo, marca_equipo, cliente_nombre')
      .eq('id', evidencia.solicitud_id)
      .single(),
    supabase
      .from('tecnicos')
      .select('nombre_completo, whatsapp')
      .eq('id', evidencia.tecnico_id)
      .single(),
  ])

  // Send WhatsApp notification to technician
  if (tecnico?.whatsapp && sol) {
    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    try {
      if (confirmado) {
        await enviarMensajeTexto(
          tecnico.whatsapp,
          `🎉 ¡Hola ${nombreTecnico}! El cliente ${sol.cliente_nombre} ha confirmado que el servicio de ${equipo} fue completado exitosamente.\n\n⭐ ¡Buen trabajo! Sigue así 💪\n\n🔧 Baird Service`
        )
      } else {
        await enviarMensajeTexto(
          tecnico.whatsapp,
          `⚠️ Hola ${nombreTecnico}, el cliente ${sol.cliente_nombre} ha reportado un problema con el servicio de ${equipo}.\n\n📞 El equipo de Baird Service se pondrá en contacto contigo para más detalles.\n\n🔧 Baird Service`
        )
      }
    } catch (waErr) {
      console.error('Error enviando WhatsApp de confirmación al técnico:', waErr)
    }
  }

  return { ok: true, httpStatus: 200, body: { success: true } }
}

// ─────────────────────────────────────────────────────────────────
// cotizacion_enviada → en_proceso | esperando_repuesto | cotizacion_rechazada
// (aprobar-cotizacion) — solo particulares
// ─────────────────────────────────────────────────────────────────
export async function procesarAprobacionCotizacion(
  token: unknown,
  aprobado: unknown,
  comentario?: unknown,
): Promise<TransicionResult> {
  if (!token || typeof aprobado !== 'boolean') {
    return { ok: false, httpStatus: 400, body: { error: 'Faltan parámetros (token, aprobado)' } }
  }

  // Buscar solicitud por cotizacion.token (JSONB).
  // NOTA: este es un antipatrón documentado en docs/FLOWS.md § "Gaps" —
  // carga toda la tabla en estado=cotizacion_enviada y filtra en JS.
  // Migrar a columna generada cotizacion_token cuando se priorice.
  const { data: solicitudes } = await supabase
    .from('solicitudes_servicio')
    .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia, cotizacion, tecnico_asignado_id, siguiente_paso')
    .eq('estado', 'cotizacion_enviada')

  const solMatch = solicitudes?.find(s => {
    const cot = s.cotizacion as { token?: string } | null
    return cot?.token === token
  })

  if (!solMatch) {
    return { ok: false, httpStatus: 404, body: { error: 'Cotización no encontrada o ya fue procesada' } }
  }

  if (solMatch.es_garantia) {
    return {
      ok: false,
      httpStatus: 400,
      body: { error: 'Las cotizaciones solo aplican para servicios particulares' },
    }
  }

  const cot = solMatch.cotizacion as { diagnostico_tecnico: string; mano_obra: number; repuestos: number; total: number; token: string }
  const comentarioTexto = typeof comentario === 'string' ? comentario : undefined

  if (aprobado) {
    // ── APPROVED ──
    // Estado final según el siguiente_paso elegido por el técnico:
    //   esperar_repuesto → esperando_repuesto (admin gestiona llegada del repuesto)
    //   reparar (o default) → en_proceso (técnico procede con la reparación)
    // Antes: siempre en_proceso, lo que saltaba el ciclo de admin/repuestos.
    const estadoFinal = solMatch.siguiente_paso === 'esperar_repuesto'
      ? 'esperando_repuesto'
      : 'en_proceso'

    const updatedCotizacion = {
      ...cot,
      aprobado_at: new Date().toISOString(),
    }

    // Atomic UPDATE: cambio de estado + cotización en una sola operación.
    // Antes había 2 UPDATEs secuenciales con ventana de race
    // (gap #10 documentado en docs/FLOWS.md).
    //
    // NO tocamos `pago_tecnico` aquí: el neto que recibe el técnico (= costo
    // técnico íntegro) ya quedó fijado en el diagnóstico (/api/diagnostico,
    // rama "reparar") o en el admin gate (/api/cotizacion-precios, rama
    // "esperar_repuesto"). `cot.total` es el PRECIO AL CLIENTE
    // (costoTecnico × 1.309, con IVA + margen Baird); escribirlo aquí
    // sobrepagaba al técnico. Mismo criterio que /api/admin/actualizar-valor.
    const { error: updateErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        cotizacion: updatedCotizacion,
        estado: estadoFinal,
      })
      .eq('id', solMatch.id)
      .eq('estado', 'cotizacion_enviada')  // guard contra race

    if (updateErr) {
      return { ok: false, httpStatus: 500, body: { error: updateErr.message } }
    }

    await notificarCambioEstado(solMatch.id, 'cotizacion_enviada', estadoFinal)

    // Notificar al técnico que la cotización fue aprobada
    const waResult = await notificarCotizacionAprobada(solMatch.id)
    if (!waResult.ok) {
      console.error('Error notificando aprobación al técnico:', waResult.error)
    }

    return {
      ok: true,
      httpStatus: 200,
      body: {
        success: true,
        estado: estadoFinal,
        siguiente_paso: solMatch.siguiente_paso,
      },
    }
  } else {
    // ── REJECTED ──
    const updatedCotizacion = {
      ...cot,
      rechazado_at: new Date().toISOString(),
      comentario_rechazo: comentarioTexto?.trim() || null,
    }

    const { error: updateErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        cotizacion: updatedCotizacion,
        estado: 'cotizacion_rechazada',
      })
      .eq('id', solMatch.id)
      .eq('estado', 'cotizacion_enviada')  // guard contra race (igual que la rama de aprobación)

    if (updateErr) {
      return { ok: false, httpStatus: 500, body: { error: updateErr.message } }
    }

    await notificarCambioEstado(solMatch.id, 'cotizacion_enviada', 'cotizacion_rechazada')

    // Notify technician that quote was rejected
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('nombre_completo, whatsapp')
      .eq('id', solMatch.tecnico_asignado_id)
      .single()

    if (tecnico) {
      const nombreTecnico = tecnico.nombre_completo.split(' ')[0]
      const equipo = `${solMatch.tipo_equipo} ${solMatch.marca_equipo}`
      const razon = comentarioTexto ? `\n\n💬 Comentario del cliente: "${comentarioTexto.trim()}"` : ''

      try {
        await enviarMensajeTexto(
          tecnico.whatsapp,
          `😔 Hola ${nombreTecnico}, el cliente ${solMatch.cliente_nombre} ha rechazado la cotización para el servicio de ${equipo}.${razon}\n\n📋 El servicio ha sido marcado como rechazado.\n\n🔧 Baird Service`
        )
      } catch (waErr) {
        console.error('Error notificando rechazo al técnico:', waErr)
      }
    }

    return { ok: true, httpStatus: 200, body: { success: true, estado: 'cotizacion_rechazada' } }
  }
}

// ─────────────────────────────────────────────────────────────────
// repuesto_recibido → en_proceso  (reprogramar-repuesto)
// ─────────────────────────────────────────────────────────────────
export async function reprogramarRepuestoSolicitud(
  token: unknown,
  horario: unknown,
): Promise<TransicionResult> {
  if (!token || typeof horario !== 'string' || !horario.trim() || horario.length > 200) {
    return { ok: false, httpStatus: 400, body: { error: 'Parámetros inválidos' } }
  }

  const horarioElegido = horario.trim()

  // 1. Validar token
  const { data: sol, error: solErr } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado')
    .eq('reprogramacion_token', token)
    .single()

  if (solErr || !sol) {
    return { ok: false, httpStatus: 404, body: { error: 'Enlace inválido o expirado' } }
  }

  if (sol.estado !== 'repuesto_recibido') {
    return { ok: false, httpStatus: 400, body: { error: 'Esta reprogramación ya no está disponible' } }
  }

  // Validación de agenda: mínimo mañana + cupo por slot (día + franja).
  // Devuelve además la fecha estructurada que alimenta el mapa admin.
  const agenda = await validarHorarioAgendable(horarioElegido, sol.id)
  if (!agenda.ok) {
    return { ok: false, httpStatus: 400, body: { error: agenda.error } }
  }
  const fechaVisitaAt = agenda.fechaVisitaAt

  // 2. UPDATE atómico — solo si sigue en repuesto_recibido. Limpia el token
  //    para que el enlace no se pueda reusar.
  const { data: updated, error: updateErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      horario_confirmado: horarioElegido,
      horario_confirmado_at: new Date().toISOString(),
      fecha_visita_at: fechaVisitaAt,
      estado: 'en_proceso',
      reprogramacion_token: null,
    })
    .eq('id', sol.id)
    .eq('estado', 'repuesto_recibido')
    .select('id')
    .single()

  if (updateErr || !updated) {
    return { ok: false, httpStatus: 500, body: { error: 'No se pudo confirmar la nueva fecha' } }
  }

  // 3. Auditoría (append-only). No bloquea la respuesta si falla.
  try {
    await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'reagendamiento_confirmado',
      estado_previo: 'repuesto_recibido',
      estado_nuevo: 'en_proceso',
      actor: 'cliente',
      motivo: 'Cliente eligió nueva fecha tras llegada de repuesto',
      payload: { horario_confirmado: horarioElegido, tentativo: true },
    })
  } catch (err) {
    console.error('[reprogramar-repuesto] No se pudo registrar evento:', err)
  }

  // 4. Notificar al técnico asignado (plantilla repuesto_recibido_tecnico_v1 —
  //    funciona fuera de la ventana 24h, que para entonces suele estar cerrada).
  let tecnicoNotificado = false
  try {
    const notif = await notificarTecnicoVisitaReprogramada(sol.id, horarioElegido)
    tecnicoNotificado = notif.ok
  } catch (err) {
    console.error('[reprogramar-repuesto] notificarTecnicoVisitaReprogramada falló:', err)
  }

  // 5. Notificar a supervisores configurados (no bloquea ni revierte si falla).
  // registrarEvento:false — arriba se insertó el evento dedicado 'reagendamiento_confirmado'.
  await notificarCambioEstado(sol.id, 'repuesto_recibido', 'en_proceso', { registrarEvento: false })

  return {
    ok: true,
    httpStatus: 200,
    body: {
      success: true,
      horario: horarioElegido,
      tecnico_notificado: tecnicoNotificado,
    },
  }
}
