import { supabase } from '@/lib/supabase'
import crypto from 'crypto'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'

const WA_API_BASE = 'https://graph.facebook.com/v21.0'

// Re-export for backward compatibility with tests
export { TIPO_A_ESPECIALIDAD }

// ─────────────────────────────────────────
// Utilidades de formato
// ─────────────────────────────────────────

/**
 * Normaliza un número colombiano al formato internacional de WhatsApp (sin +).
 * Ejemplos:
 *   "3001234567"     → "573001234567"
 *   "+573001234567"  → "573001234567"
 *   "573001234567"   → "573001234567"
 */
export function formatearTelefono(tel: string): string {
  const digits = tel.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  if (digits.startsWith('57') && digits.length === 12) return digits
  return digits
}

export function formatCOP(valor: number): string {
  return new Intl.NumberFormat('es-CO').format(valor)
}

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
      to: formatearTelefono(para),
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
      to: formatearTelefono(para),
      type: 'image',
      image: { link: urlImagen, caption },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp image error ${res.status}: ${JSON.stringify(err)}`)
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
export async function notificarTecnicos(solicitudId: string): Promise<number> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird.app'

  // 1. Obtener datos de la solicitud
  const { data: sol, error: solErr } = await supabase
    .from('solicitudes_servicio')
    .select('*')
    .eq('id', solicitudId)
    .single()

  if (solErr || !sol) throw new Error(`Solicitud no encontrada: ${solicitudId}`)

  // 2. Buscar técnicos con la especialidad requerida
  const especialidadBuscada = TIPO_A_ESPECIALIDAD[sol.tipo_equipo] ?? sol.tipo_equipo

  const { data: especialidades } = await supabase
    .from('especialidades_tecnico')
    .select('tecnico_id')
    .eq('especialidad', especialidadBuscada)

  if (!especialidades || especialidades.length === 0) return 0

  const tecnicoIds = especialidades.map((e: { tecnico_id: string }) => e.tecnico_id)

  // 3. Filtrar por verificados y ciudad compatible
  const { data: tecnicos } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, ciudad_pueblo')
    .eq('estado_verificacion', 'verificado')
    .in('id', tecnicoIds)
    .ilike('ciudad_pueblo', `%${sol.ciudad_pueblo}%`)

  if (!tecnicos || tecnicos.length === 0) return 0

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

    // Construir mensaje con todos los detalles que necesita el técnico para decidir
    const diagnostico = sol.triaje_resultado?.posible_falla
    const mensaje = [
      `🔧 *Nueva solicitud — Baird Service*`,
      ``,
      `📋 *Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
      `📝 *Problema:* ${sol.novedades_equipo.substring(0, 120)}`,
      diagnostico ? `🤖 *Diagnóstico IA:* ${diagnostico}` : null,
      ``,
      `📍 *Ubicación del servicio:*`,
      `   ${sol.direccion}`,
      `   ${sol.zona_servicio}, ${sol.ciudad_pueblo}`,
      ``,
      `🕐 *Horarios propuestos por el cliente:*`,
      `   1️⃣ ${sol.horario_visita_1}`,
      `   2️⃣ ${sol.horario_visita_2}`,
      ``,
      `💰 *Valor del servicio: $${formatCOP(sol.pago_tecnico)} COP*`,
      `📌 _Pago a través de Baird Service. No se acepta efectivo._`,
      ``,
      `⚡ *El primer técnico en aceptar gana el servicio.*`,
      `👇 Toca el link para ver los detalles y aceptar:`,
      linkAceptar,
    ].filter(Boolean).join('\n')

    try {
      await enviarMensajeTexto(tecnico.whatsapp, mensaje)
      notificados++
    } catch (e) {
      console.error(`Error enviando WhatsApp a técnico ${tecnico.id}:`, e)
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

  return notificados
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
export async function procesarAceptacion(token: string): Promise<{
  ganado: boolean
  mensaje: string
}> {
  // 1. Validar token
  const { data: notif } = await supabase
    .from('notificaciones_whatsapp')
    .select('solicitud_id, tecnico_id, estado')
    .eq('token', token)
    .single()

  if (!notif) {
    return { ganado: false, mensaje: 'Token inválido o expirado' }
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
        '❌ *Servicio no disponible*\n\nEste servicio ya fue asignado a otro técnico. ¡Sigue atento a nuevas solicitudes! 💪'
      ).catch(console.error)
    }

    return { ganado: false, mensaje: 'Este servicio ya fue tomado por otro técnico' }
  }

  // 3. ¡Ganó! Obtener datos completos del técnico
  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, foto_perfil_url, foto_documento_url, tipo_documento, numero_documento')
    .eq('id', notif.tecnico_id)
    .single()

  const sol = updated // aliás semántico

  // 4. Notificar al técnico ganador con los datos del cliente
  if (tecnico) {
    const msgTecnico = [
      `✅ *¡Servicio asignado! Lo lograste, ${tecnico.nombre_completo}.*`,
      ``,
      `👤 *Cliente:* ${sol.cliente_nombre}`,
      `📱 *Teléfono:* ${sol.cliente_telefono}`,
      `📍 *Dirección:* ${sol.direccion}`,
      `   ${sol.zona_servicio}, ${sol.ciudad_pueblo}`,
      `📋 *Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
      `📝 *Problema:* ${sol.novedades_equipo.substring(0, 150)}`,
      ``,
      `🕐 *Horarios propuestos por el cliente:*`,
      `   1️⃣ ${sol.horario_visita_1}`,
      `   2️⃣ ${sol.horario_visita_2}`,
      ``,
      `Confirma el horario definitivo directamente con el cliente por WhatsApp.`,
      ``,
      `💰 *Valor del servicio: $${formatCOP(sol.pago_tecnico)} COP — Pago vía Baird Service*`,
    ].join('\n')

    await enviarMensajeTexto(tecnico.whatsapp, msgTecnico).catch(console.error)
  }

  // 5. Notificar al cliente con los datos del técnico
  const msgCliente = [
    `🎉 *¡Tu técnico ha sido asignado — Baird Service!*`,
    ``,
    `👨‍🔧 *Técnico:* ${tecnico?.nombre_completo ?? 'Asignado'}`,
    `📱 *WhatsApp:* +${formatearTelefono(tecnico?.whatsapp ?? '')}`,
    tecnico?.tipo_documento
      ? `🆔 *Documento:* ${tecnico.tipo_documento} ${tecnico.numero_documento} ✅ Verificado por Baird`
      : null,
    ``,
    `🕐 *Tus horarios propuestos:*`,
    `   1️⃣ ${sol.horario_visita_1}`,
    `   2️⃣ ${sol.horario_visita_2}`,
    ``,
    `Coordina el horario definitivo con tu técnico por WhatsApp.`,
    ``,
    `💰 *Valor del servicio: $${formatCOP(sol.pago_tecnico)} COP*`,
    `📌 _El pago se realiza a Baird Service por medios electrónicos. No se acepta efectivo._`,
  ].filter(Boolean).join('\n')

  await enviarMensajeTexto(sol.cliente_telefono, msgCliente).catch(console.error)

  // 6. Enviar foto de perfil del técnico al cliente
  if (tecnico?.foto_perfil_url) {
    await enviarImagen(
      sol.cliente_telefono,
      tecnico.foto_perfil_url,
      `📸 Foto de ${tecnico.nombre_completo} — tu técnico asignado`
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
