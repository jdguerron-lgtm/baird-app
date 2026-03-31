import { supabase } from '@/lib/supabase'
import crypto from 'crypto'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'
import { phoneToDigits } from '@/lib/utils/phone'
import { formatCOP, escapeLikePattern } from '@/lib/utils/format'

const WA_API_BASE = 'https://graph.facebook.com/v21.0'

// Re-exports for backward compatibility
export { TIPO_A_ESPECIALIDAD }
export { formatCOP } from '@/lib/utils/format'
export { phoneToDigits as formatearTelefono } from '@/lib/utils/phone'

const TOKEN_EXPIRATION_MS = 30 * 60 * 1000 // 30 minutes

// ─────────────────────────────────────────
// Funciones de envío (primitivas)
// ─────────────────────────────────────────

async function enviarMensajeTexto(para: string, texto: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneId || !token) throw new Error('Variables de entorno WhatsApp no configuradas')

  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneToDigits(para),
      type: 'text',
      text: { body: texto, preview_url: true },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(err)}`)
  }
}

async function enviarImagen(para: string, urlImagen: string, caption: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneId || !token) throw new Error('Variables de entorno WhatsApp no configuradas')

  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneToDigits(para),
      type: 'image',
      image: { link: urlImagen, caption },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp image error ${res.status}: ${JSON.stringify(err)}`)
  }
}

async function enviarMensajeInteractivo(options: {
  para: string
  headerText?: string
  bodyText: string
  footerText?: string
  buttonLabel: string
  buttonUrl: string
}): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneId || !token) throw new Error('Variables de entorno WhatsApp no configuradas')

  const interactive: Record<string, unknown> = {
    type: 'cta_url',
    body: { text: options.bodyText },
    action: {
      name: 'cta_url',
      parameters: {
        display_text: options.buttonLabel,
        url: options.buttonUrl,
      },
    },
  }

  if (options.headerText) {
    interactive.header = { type: 'text', text: options.headerText }
  }
  if (options.footerText) {
    interactive.footer = { text: options.footerText }
  }

  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneToDigits(options.para),
      type: 'interactive',
      interactive,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp interactive error ${res.status}: ${JSON.stringify(err)}`)
  }
}

// ─────────────────────────────────────────
// Lógica de negocio
// ─────────────────────────────────────────

/**
 * Busca técnicos verificados compatibles con la solicitud y envía a cada uno
 * un mensaje de WhatsApp con los detalles del servicio y un link único para aceptar.
 *
 * @returns número de técnicos notificados exitosamente
 */
export interface NotifyResult {
  notificados: number
  matched: number
  errors: string[]
}

export async function notificarTecnicos(solicitudId: string): Promise<NotifyResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird.app'

  // 1. Obtener datos de la solicitud
  const { data: sol, error: solErr } = await supabase
    .from('solicitudes_servicio')
    .select('*')
    .eq('id', solicitudId)
    .single()

  if (solErr || !sol) throw new Error(`Solicitud no encontrada: ${solicitudId}`)

  const sendErrors: string[] = []

  // 2. Buscar técnicos con la especialidad requerida
  const especialidadBuscada = TIPO_A_ESPECIALIDAD[sol.tipo_equipo] ?? sol.tipo_equipo

  const { data: especialidades } = await supabase
    .from('especialidades_tecnico')
    .select('tecnico_id')
    .eq('especialidad', especialidadBuscada)

  if (!especialidades || especialidades.length === 0) return { notificados: 0, matched: 0, errors: [] }

  const tecnicoIds = especialidades.map((e: { tecnico_id: string }) => e.tecnico_id)

  // 3. Filtrar por verificados y ciudad compatible (trim + case-insensitive)
  const ciudadNorm = sol.ciudad_pueblo?.trim() || ''
  const { data: tecnicos } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, ciudad_pueblo')
    .eq('estado_verificacion', 'verificado')
    .in('id', tecnicoIds)
    .ilike('ciudad_pueblo', `%${escapeLikePattern(ciudadNorm)}%`)

  if (!tecnicos || tecnicos.length === 0) return { notificados: 0, matched: 0, errors: [] }

  // 4. Enviar mensaje a cada técnico con token único
  let notificados = 0

  for (const tecnico of tecnicos) {
    const token = crypto.randomUUID()
    const linkAceptar = `${appUrl}/aceptar/${token}`

    // Registrar la notificación en la BD antes de enviar
    const { error: insertErr } = await supabase
      .from('notificaciones_whatsapp')
      .insert({
        solicitud_id: solicitudId,
        tecnico_id: tecnico.id,
        token,
        estado: 'enviado',
      })

    if (insertErr) {
      console.error(`Error registrando notificación para técnico ${tecnico.id}:`, insertErr)
      continue
    }

    // Construir mensaje limpio (sin emojis multi-codepoint que causan "?")
    // Body max 1024 chars para mensajes interactivos CTA

    // Extract model from novedades if present
    const notifModeloMatch = sol.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
    const notifModelo = notifModeloMatch ? notifModeloMatch[1] : null
    const notifNovedades = notifModeloMatch
      ? sol.novedades_equipo.replace(notifModeloMatch[0], '').trim()
      : sol.novedades_equipo

    const diagnostico = sol.triaje_resultado?.posible_falla
    const esGarantia = sol.es_garantia ? '🛡️ *GARANTIA*' : null
    const bodyLines = [
      `🔧 *Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
      notifModelo ? `📦 *Modelo:* ${notifModelo}` : null,
      `📋 *Problema:* ${notifNovedades.substring(0, 100)}`,
      diagnostico ? `🤖 *Diagnostico IA:* ${diagnostico}` : null,
      esGarantia,
      ``,
      `📍 *Zona:* ${sol.zona_servicio}, ${sol.ciudad_pueblo}`,
      ``,
      `💰 *TARIFA: $${formatCOP(sol.pago_tecnico)} COP*`,
      `💳 Pago a traves de Baird Service.`,
      ``,
      `⚡ _El primer tecnico en aceptar gana el servicio._`,
    ].filter(Boolean).join('\n')

    try {
      await enviarMensajeInteractivo({
        para: tecnico.whatsapp,
        headerText: '🆕 Nueva solicitud - Baird Service',
        bodyText: bodyLines,
        footerText: '👇 Toca el boton para aceptar',
        buttonLabel: '✅ Aceptar servicio',
        buttonUrl: linkAceptar,
      })
      notificados++
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error(`Error enviando WhatsApp a técnico ${tecnico.id}:`, errMsg)
      sendErrors.push(`${tecnico.nombre_completo}: error de envio`)
      // Marcar como error pero continuar con el siguiente
      await supabase
        .from('notificaciones_whatsapp')
        .update({ estado: 'error' })
        .eq('token', token)
    }
  }

  // 5. Actualizar estado de la solicitud
  if (notificados > 0) {
    await supabase
      .from('solicitudes_servicio')
      .update({
        estado: 'notificada',
        notificados_at: new Date().toISOString(),
      })
      .eq('id', solicitudId)
  }

  return { notificados, matched: tecnicos.length, errors: sendErrors }
}

/**
 * Procesa la aceptación de un servicio por un técnico.
 * Usa un UPDATE atómico para garantizar que solo UN técnico puede ganar.
 *
 * Después de asignar:
 * - Notifica al técnico ganador con los datos del cliente
 * - Notifica al cliente con los datos del técnico (nombre, foto, documento, horarios)
 * - Invalida los tokens de los demás técnicos notificados
 *
 * @returns { ganado: boolean, mensaje: string }
 */
export async function procesarAceptacion(token: string, horarioSeleccionado?: 1 | 2 | string): Promise<{
  ganado: boolean
  mensaje: string
}> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird-app.vercel.app'

  // 1. Validar token
  const { data: notif } = await supabase
    .from('notificaciones_whatsapp')
    .select('solicitud_id, tecnico_id, estado, enviado_at')
    .eq('token', token)
    .single()

  if (!notif) {
    return { ganado: false, mensaje: 'Token invalido o expirado' }
  }

  // Verificar expiracion del token
  const tokenAge = Date.now() - new Date(notif.enviado_at).getTime()
  if (tokenAge > TOKEN_EXPIRATION_MS) {
    await supabase
      .from('notificaciones_whatsapp')
      .update({ estado: 'expirado' })
      .eq('token', token)
    return { ganado: false, mensaje: 'Este enlace ha expirado. El tiempo limite es de 30 minutos.' }
  }

  if (notif.estado !== 'enviado') {
    const msg = notif.estado === 'aceptado'
      ? '¡Ya aceptaste este servicio!'
      : 'Este servicio ya no está disponible'
    return { ganado: false, mensaje: msg }
  }

  // 2. UPDATE atómico — solo asigna si aún no tiene técnico (evita race condition)
  const { data: updated, error: updateErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      tecnico_asignado_id: notif.tecnico_id,
      estado: 'asignada',
    })
    .eq('id', notif.solicitud_id)
    .is('tecnico_asignado_id', null)  // ← clave anti race-condition
    .select('*')
    .single()

  if (updateErr || !updated) {
    // El servicio ya fue tomado por otro técnico
    await supabase
      .from('notificaciones_whatsapp')
      .update({ estado: 'invalidado' })
      .eq('token', token)

    // Notificar al técnico que llegó tarde
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('whatsapp')
      .eq('id', notif.tecnico_id)
      .single()

    if (tecnico?.whatsapp) {
      await enviarMensajeTexto(
        tecnico.whatsapp,
        '😔 *Servicio no disponible*\n\nEste servicio ya fue asignado a otro tecnico.\n\n💪 Sigue atento a nuevas solicitudes, la proxima puede ser tuya!'
      ).catch(console.error)
    }

    return { ganado: false, mensaje: 'Este servicio ya fue tomado por otro técnico' }
  }

  // 3. ¡Ganó! Obtener datos completos del técnico (incluyendo portal_token)
  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, foto_perfil_url, foto_documento_url, tipo_documento, numero_documento, portal_token')
    .eq('id', notif.tecnico_id)
    .single()

  // Generar portal_token si no existe (con verificación de persistencia)
  if (tecnico && !tecnico.portal_token) {
    const newToken = crypto.randomUUID()
    const { error: tokenErr } = await supabase
      .from('tecnicos')
      .update({ portal_token: newToken })
      .eq('id', tecnico.id)

    if (!tokenErr) {
      tecnico.portal_token = newToken
    } else {
      console.error('Error generando portal_token:', tokenErr)
    }
  }

  const sol = updated // aliás semántico

  // Extract model from novedades if present: "[Modelo: ...] description"
  const modeloMatch = sol.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
  const modeloEquipo = modeloMatch ? modeloMatch[1] : null

  // horarioConfirmado: string directo (3-day picker) o legacy 1|2
  const horarioConfirmado = typeof horarioSeleccionado === 'string'
    ? horarioSeleccionado
    : horarioSeleccionado === 1
      ? sol.horario_visita_1
      : horarioSeleccionado === 2
        ? sol.horario_visita_2
        : null

  // 4. Notificar al técnico ganador con los datos del cliente
  if (tecnico) {
    const msgTecnico = [
      `🎉 *Servicio asignado - Baird Service*`,
      ``,
      `Felicidades *${tecnico.nombre_completo}*! Ganaste este servicio. 🏆`,
      ``,
      `👤 *Cliente:* ${sol.cliente_nombre}`,
      `📞 *Telefono:* ${sol.cliente_telefono}`,
      `📍 *Direccion:* ${sol.direccion}`,
      `🏘️ ${sol.zona_servicio}, ${sol.ciudad_pueblo}`,
      ``,
      `🔧 *Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
      modeloEquipo ? `📦 *Modelo:* ${modeloEquipo}` : null,
      `📋 *Problema:* ${sol.novedades_equipo.substring(0, 150)}`,
      ``,
      horarioConfirmado
        ? `🕐 *Horario confirmado:* ${horarioConfirmado}`
        : `🕐 *Horarios propuestos:*\n  • ${sol.horario_visita_1}\n  • ${sol.horario_visita_2}`,
      ``,
      `📱 Coordina con el cliente por WhatsApp para confirmar la visita.`,
      ``,
      `💰 *Valor del servicio: $${formatCOP(sol.pago_tecnico)} COP*`,
      `💳 Pago a traves de Baird Service.`,
    ].filter(Boolean).join('\n')

    // Enviar mensaje con link al portal
    const portalUrl = `${appUrl}/tecnico/${tecnico.portal_token}`
    await enviarMensajeInteractivo({
      para: tecnico.whatsapp,
      headerText: '🎉 Servicio asignado - Baird Service',
      bodyText: msgTecnico,
      footerText: '✅ Cuando completes el servicio, registra la evidencia',
      buttonLabel: '📋 Ver mis servicios',
      buttonUrl: portalUrl,
    }).catch(console.error)
  }

  // 5. Notificar al cliente con los datos del técnico
  const msgCliente = [
    `✅ *Tecnico asignado - Baird Service*`,
    ``,
    `¡Buenas noticias! Ya tenemos un tecnico verificado para tu servicio. 🙌`,
    ``,
    `🧑‍🔧 *Tecnico:* ${tecnico?.nombre_completo ?? 'Asignado'}`,
    `📞 *WhatsApp:* +${phoneToDigits(tecnico?.whatsapp ?? '')}`,
    tecnico?.tipo_documento
      ? `🪪 *Documento:* ${tecnico.tipo_documento} ${tecnico.numero_documento} _(Verificado por Baird)_`
      : null,
    ``,
    horarioConfirmado
      ? `🕐 *Horario confirmado por el tecnico:* ${horarioConfirmado}`
      : `🕐 *Tus horarios propuestos:*\n  • ${sol.horario_visita_1}\n  • ${sol.horario_visita_2}`,
    ``,
    `📱 Tu tecnico se comunicara contigo por WhatsApp para confirmar la visita.`,
    ``,
    `💰 *Valor del servicio: $${formatCOP(sol.pago_tecnico)} COP*`,
    `💳 _El pago se realiza a Baird Service por medios electronicos. No se acepta efectivo._`,
  ].filter(Boolean).join('\n')

  await enviarMensajeTexto(sol.cliente_telefono, msgCliente).catch(console.error)

  // 6. Enviar foto de perfil del técnico al cliente
  if (tecnico?.foto_perfil_url) {
    await enviarImagen(
      sol.cliente_telefono,
      tecnico.foto_perfil_url,
      `📸 ${tecnico.nombre_completo} — tu tecnico asignado por Baird Service`
    ).catch(console.error)
  }

  // 7. Enviar foto del documento del técnico al cliente
  if (tecnico?.foto_documento_url) {
    await enviarImagen(
      sol.cliente_telefono,
      tecnico.foto_documento_url,
      `🪪 Documento de identidad verificado por Baird Service`
    ).catch(console.error)
  }

  // 8. Marcar este token como aceptado e invalidar los demás
  await supabase
    .from('notificaciones_whatsapp')
    .update({ estado: 'aceptado', respondido_at: new Date().toISOString() })
    .eq('token', token)

  await supabase
    .from('notificaciones_whatsapp')
    .update({ estado: 'invalidado' })
    .eq('solicitud_id', notif.solicitud_id)
    .neq('token', token)
    .eq('estado', 'enviado')

  return { ganado: true, mensaje: '¡Servicio asignado exitosamente!' }
}

/**
 * Verifica la firma HMAC-SHA256 del webhook de Meta.
 * @param rawBody  Body del request como string (sin parsear)
 * @param signature  Valor del header X-Hub-Signature-256
 */
export function verificarFirmaWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!secret) return false

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}
