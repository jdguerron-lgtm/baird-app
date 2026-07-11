import { supabase } from '@/lib/supabase'
import crypto from 'crypto'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'
import { phoneToDigits, isMobileColombiano } from '@/lib/utils/phone'
import { formatCOP, normalizeForMatch, cityTokenForMatch } from '@/lib/utils/format'
import { ESTADO_LABELS, ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'
import { validarHorarioAgendable } from '@/lib/services/agenda.service'
import {
  ESTADOS_CANCELABLES_POR_CLIENTE,
  ESTADOS_REAGENDABLES_POR_CLIENTE,
  MAX_REAGENDAMIENTOS_CLIENTE,
  precioClienteServicio,
} from '@/types/solicitud'

export const WA_API_BASE = 'https://graph.facebook.com/v22.0'

// Re-exports for backward compatibility
export { TIPO_A_ESPECIALIDAD }
export { formatCOP } from '@/lib/utils/format'
export { phoneToDigits as formatearTelefono } from '@/lib/utils/phone'

const TOKEN_EXPIRATION_MS = 3 * 60 * 60 * 1000 // 3 hours

// ─────────────────────────────────────────
// Test-mode whitelist (opt-in via env)
// Si BAIRD_TEST_PHONE_WHITELIST está definida, los envíos a números fuera
// de la lista se omiten silenciosamente (con log) — útil para probar
// flujos nuevos en dev sin alertar a técnicos reales.
// Formato: "573134951164,573001234567" (digits con país, separados por coma).
// Vacío/no definido = comportamiento normal (envía a todos).
// ─────────────────────────────────────────
// Exportada para que dapta.service reuse el MISMO gate de whitelist en la
// segunda línea de voz (no se duplica el algoritmo ni la env var).
export function isPhoneAllowed(rawPhone: string): boolean {
  const whitelist = process.env.BAIRD_TEST_PHONE_WHITELIST?.trim()
  if (!whitelist) return true
  const allowed = whitelist
    .split(',')
    .map(s => s.trim().replace(/\D/g, ''))
    .filter(Boolean)
  if (allowed.length === 0) return true
  const digits = phoneToDigits(rawPhone)
  return allowed.includes(digits)
}

function logFiltrado(primitive: string, raw: string): void {
  // WARN (no log) — esto es un signal real cuando se deja la env prendida
  // en prod por error. Buscar este string en Vercel logs si "no llega ningún
  // WhatsApp": probable que BAIRD_TEST_PHONE_WHITELIST quedó set.
  console.warn(`⚠️ [WhatsApp][TEST-MODE] FILTRADO ${primitive} → ${phoneToDigits(raw)} (no está en BAIRD_TEST_PHONE_WHITELIST)`)
}

/**
 * Helper para callers fire-and-forget: chequea filtered + errores y los
 * loguea de forma uniforme. Usar en lugar de `.catch(console.error)`
 * cuando no necesitas el return value pero quieres signal en logs.
 */
async function logEnvio(promise: Promise<EnvioResult>, contexto: string): Promise<void> {
  try {
    const r = await promise
    if (r.filtered) {
      console.warn(`⚠️ [${contexto}] Filtrado por BAIRD_TEST_PHONE_WHITELIST — el mensaje NO se envió.`)
    }
  } catch (err) {
    console.error(`[${contexto}] Error:`, err instanceof Error ? err.message : String(err))
  }
}

// ─────────────────────────────────────────
// Funciones de envío (primitivas)
// ─────────────────────────────────────────

export async function enviarMensajeTexto(para: string, texto: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneId || !token) throw new Error('Variables de entorno WhatsApp no configuradas')

  if (!isPhoneAllowed(para)) {
    logFiltrado('enviarMensajeTexto', para)
    return
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

  if (!isPhoneAllowed(para)) {
    logFiltrado('enviarImagen', para)
    return
  }

  const toDigits = phoneToDigits(para)

  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toDigits,
      type: 'image',
      image: { link: urlImagen, caption },
    }),
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error(`[WhatsApp][image] HTTP ${res.status} sending to ${toDigits} url=${urlImagen}:`, JSON.stringify(body))
    throw new Error(`WhatsApp image error ${res.status}: ${JSON.stringify(body)}`)
  }

  // Meta a veces responde 200 con un objeto error en el body — capturarlo.
  if (body.error) {
    console.error(`[WhatsApp][image] 200 OK pero body con error a ${toDigits} url=${urlImagen}:`, JSON.stringify(body.error))
    throw new Error(`WhatsApp image API error: ${JSON.stringify(body.error)}`)
  }

  // Sospecha frecuente: customer fuera de la ventana 24h. Meta responde 200
  // pero el message_status puede venir como "failed" o no entregarse.
  const messageStatus = body.messages?.[0]?.message_status
  if (messageStatus && messageStatus !== 'accepted') {
    console.warn(`[WhatsApp][image] message_status=${messageStatus} para ${toDigits} url=${urlImagen}`)
  }
  console.log(`[WhatsApp][image] sent to ${toDigits} url=${urlImagen}, message_id=${body.messages?.[0]?.id ?? 'unknown'}`)
}

/**
 * Resultado de un envío de plantilla.
 *
 * - `sent: true` → Meta aceptó el envío (200 OK + sin error en body).
 * - `sent: false, filtered: true` → el destino no está en
 *   BAIRD_TEST_PHONE_WHITELIST y se omitió silenciosamente (modo test/dev).
 * - Cualquier otro error (HTTP 4xx/5xx o body.error) sigue siendo throw —
 *   los callers que envuelven en try/catch ven el error.
 *
 * Esto reemplaza el `Promise<void>` previo que enmascaraba el caso
 * "filtrado", haciendo que callers (enviarCotizacionCliente, etc.)
 * pensaran que se envió cuando no fue así.
 */
export interface EnvioResult {
  sent: boolean
  filtered?: boolean
  messageId?: string
}

export async function enviarPlantilla(para: string, templateName: string, languageCode: string, components?: Record<string, unknown>[]): Promise<EnvioResult> {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneId || !token) throw new Error('Variables de entorno WhatsApp no configuradas')

  if (!isPhoneAllowed(para)) {
    logFiltrado(`enviarPlantilla(${templateName})`, para)
    return { sent: false, filtered: true }
  }

  const toNumber = phoneToDigits(para)

  // Signal de drift de datos: si el destino no tiene forma de móvil
  // colombiano (573XXXXXXXXX), probablemente el `whatsapp` en BD quedó con
  // formato roto (+57, espacios, dashes) o es número fijo/extranjero. La
  // migración 20260513 normaliza datos existentes y agrega un trigger, pero
  // este warn ayuda a detectar drift que se cuele en el futuro.
  if (!isMobileColombiano(toNumber)) {
    console.warn(`[WhatsApp] ⚠️ Destino con formato inusual: "${para}" → "${toNumber}". Si era un técnico que no recibe el WhatsApp, revisar tecnicos.whatsapp en BD.`)
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  }
  if (components) template.components = components

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toNumber,
    type: 'template',
    template,
  }

  console.log(`[WhatsApp] Sending template "${templateName}" to ${toNumber}`)

  const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error(`[WhatsApp] Template error ${res.status}:`, JSON.stringify(body))
    throw new Error(`WhatsApp template error ${res.status}: ${JSON.stringify(body)}`)
  }

  // Meta can return 200 but with error details in the response
  if (body.error) {
    console.error(`[WhatsApp] API returned error in body:`, JSON.stringify(body.error))
    throw new Error(`WhatsApp API error: ${JSON.stringify(body.error)}`)
  }

  // Check message status
  const messageStatus = body.messages?.[0]?.message_status
  if (messageStatus && messageStatus !== 'accepted') {
    console.warn(`[WhatsApp] Message status: ${messageStatus} for ${toNumber}`)
  }

  const messageId = body.messages?.[0]?.id ?? 'unknown'
  console.log(`[WhatsApp] Template "${templateName}" sent to ${toNumber}, message_id: ${messageId}`)
  return { sent: true, messageId }
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

  if (!isPhoneAllowed(options.para)) {
    logFiltrado('enviarMensajeInteractivo', options.para)
    return
  }

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lineablanca.bairdservice.com'

  // 1. Obtener datos de la solicitud
  const { data: sol, error: solErr } = await supabase
    .from('solicitudes_servicio')
    .select('*')
    .eq('id', solicitudId)
    .single()

  if (solErr || !sol) throw new Error(`Solicitud no encontrada: ${solicitudId}`)

  const sendErrors: string[] = []

  // 2. Buscar técnicos con la especialidad requerida (accent/case-insensitive)
  const especialidadBuscada = TIPO_A_ESPECIALIDAD[sol.tipo_equipo] ?? sol.tipo_equipo
  const especialidadNorm = normalizeForMatch(especialidadBuscada)

  const { data: especialidades } = await supabase
    .from('especialidades_tecnico')
    .select('tecnico_id, especialidad')

  if (!especialidades || especialidades.length === 0) {
    return { notificados: 0, matched: 0, errors: [`Sin especialidades registradas en BD`] }
  }

  // null-safe: si algún registro tiene especialidad NULL, lo tratamos como string vacío
  // en vez de crashear con `normalizeForMatch(undefined)`.
  const especialidadesUnicas = [...new Set(especialidades.map(e => e.especialidad ?? ''))]
  const tecnicoIds = especialidades
    .filter((e: { especialidad: string | null }) => normalizeForMatch(e.especialidad ?? '') === especialidadNorm)
    .map((e: { tecnico_id: string }) => e.tecnico_id)

  if (tecnicoIds.length === 0) {
    return {
      notificados: 0, matched: 0,
      errors: [`Ningún técnico tiene especialidad "${especialidadBuscada}". Especialidades en BD: ${especialidadesUnicas.join(', ')}`],
    }
  }

  // 3. Filtrar por verificados, luego por ciudad compatible.
  //
  // Históricamente usábamos normalizeForMatch (lowercase + strip acentos), pero
  // hay casos donde el campo trae basura concatenada — p.ej. BITÁCORA importó
  // "BOGOTA /CR 123 13B 47" como ciudad_pueblo. cityTokenForMatch toma solo el
  // primer token antes de `/`, `,`, `;`, `-` y matchea correctamente con
  // "Bogotá" o "Bogota" del lado técnico.
  const ciudadNorm = cityTokenForMatch(sol.ciudad_pueblo ?? '')

  const { data: tecnicosConEsp } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, ciudad_pueblo, ciudades_cobertura, estado_verificacion')
    .in('id', tecnicoIds)

  if (!tecnicosConEsp || tecnicosConEsp.length === 0) {
    return { notificados: 0, matched: 0, errors: [`${tecnicoIds.length} técnico(s) con especialidad pero ninguno encontrado en tabla tecnicos`] }
  }

  const tecnicosVerificados = tecnicosConEsp.filter(t => t.estado_verificacion === 'verificado')

  if (tecnicosVerificados.length === 0) {
    const estados = tecnicosConEsp.map(t => `${t.nombre_completo}: ${t.estado_verificacion}`)
    return {
      notificados: 0, matched: 0,
      errors: [`${tecnicosConEsp.length} técnico(s) con especialidad pero ninguno verificado. Estados: ${estados.join(', ')}`],
    }
  }

  // Un técnico puede cubrir VARIAS ciudades/pueblos (`ciudades_cobertura`).
  // Matchea si CUALQUIERA de sus ciudades coincide con la de la solicitud.
  // Fallback a `ciudad_pueblo` para técnicos aún sin cobertura cargada.
  const tecnicos = tecnicosVerificados.filter(t => {
    if (!ciudadNorm) return true
    const cobertura: string[] = Array.isArray(t.ciudades_cobertura) && t.ciudades_cobertura.length > 0
      ? t.ciudades_cobertura
      : [t.ciudad_pueblo ?? '']
    const tokens = cobertura.map(c => cityTokenForMatch(c ?? '')).filter(Boolean)
    if (tokens.length === 0) return false
    return tokens.some(tc => tc.includes(ciudadNorm) || ciudadNorm.includes(tc))
  })

  if (tecnicos.length === 0) {
    const ciudades = tecnicosVerificados.map(t => {
      const cob = Array.isArray(t.ciudades_cobertura) && t.ciudades_cobertura.length > 0
        ? t.ciudades_cobertura
        : [t.ciudad_pueblo]
      return `${t.nombre_completo}: "${cob.join(', ')}"`
    })
    return {
      notificados: 0, matched: 0,
      errors: [`${tecnicosVerificados.length} técnico(s) verificado(s) pero ninguno en "${sol.ciudad_pueblo}". Ciudades: ${ciudades.join(', ')}`],
    }
  }

  // 4. Enviar mensaje a cada técnico con token único — EN PARALELO
  const notifModeloMatch = sol.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
  const notifNovedades = notifModeloMatch
    ? sol.novedades_equipo.replace(notifModeloMatch[0], '').trim()
    : sol.novedades_equipo

  const equipo = equipoConGarantia(sol)
  const problema = notifNovedades.substring(0, 100)
  // Ubicación para el técnico: dirección exacta + zona + ciudad. La dirección
  // le permite evaluar distancia/parqueo/acceso antes de aceptar. Si no está
  // cargada (caso raro), cae a zona + ciudad. Se colapsa el whitespace porque
  // `direccion` es texto libre del cliente y WhatsApp rechaza params con
  // saltos de línea o tabs.
  const ubicacion = [sol.direccion, sol.zona_servicio, sol.ciudad_pueblo]
    .map((parte) => parte?.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ')
  const horario = sol.horario_confirmado || sol.horario_visita_1 || 'Por coordinar'

  // Pre-generar tokens y registrar todas las notificaciones en paralelo
  const tokens = tecnicos.map(() => crypto.randomUUID())
  const insertResults = await Promise.allSettled(
    tecnicos.map((t, i) =>
      supabase.from('notificaciones_whatsapp').insert({
        solicitud_id: solicitudId,
        tecnico_id: t.id,
        token: tokens[i],
        estado: 'enviado',
      })
    )
  )

  // Solo enviar WhatsApp a los que se insertaron OK
  const enviables = tecnicos.map((t, i) => ({ tecnico: t, token: tokens[i], idx: i }))
    .filter(({ idx }) => insertResults[idx].status === 'fulfilled')

  const sendResults = await Promise.allSettled(
    enviables.map(({ tecnico, token }) => {
      const nombre = tecnico.nombre_completo.split(' ')[0]
      if (sol.es_garantia) {
        return enviarPlantilla(tecnico.whatsapp, 'nueva_solicitud_v4', 'es', [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombre },
              { type: 'text', text: equipo },
              { type: 'text', text: problema },
              { type: 'text', text: ubicacion },
              { type: 'text', text: horario },
              // Pago MÍNIMO garantizado al técnico. No se revela que es MABE
              // ni el desglose de tarifa/bono/margen — esa información es
              // privada de Baird. El técnico solo ve lo que va a recibir.
              // El monto real puede subir según complejidad real evaluada
              // en el diagnóstico + bonos por entrega a tiempo y satisfacción
              // del cliente. Cálculo en PAGO_MINIMO_TECNICO_GARANTIA.
              { type: 'text', text: `Servicio en garantía — pago desde $${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)} COP` },
            ],
          },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] },
        ])
      }
      const pagoDiagnostico = `${formatCOP(sol.pago_tecnico)} COP`
      return enviarPlantilla(tecnico.whatsapp, 'solicitud_particular_tecnico_v2', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombre },
            { type: 'text', text: equipo },
            { type: 'text', text: problema },
            { type: 'text', text: ubicacion },
            { type: 'text', text: horario },
            { type: 'text', text: pagoDiagnostico },
          ],
        },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] },
      ])
    })
  )

  // Marcar errores en BD para los que fallaron en send.
  //
  // CRÍTICO: enviarPlantilla() ahora retorna { sent, filtered? } en vez de
  // void (commit d38ddc2). Una promesa fulfilled NO implica que el
  // WhatsApp se haya enviado — puede haber sido filtrado por
  // BAIRD_TEST_PHONE_WHITELIST. Esto producía el bug "el técnico aparece
  // en la lista pero no le llegó nada" porque contábamos como notificados
  // a los filtrados.
  let notificados = 0
  await Promise.allSettled(
    enviables.map(async ({ tecnico, token }, i) => {
      const r = sendResults[i]
      if (r.status === 'fulfilled' && r.value?.sent) {
        notificados++
        return
      }
      if (r.status === 'fulfilled' && r.value?.filtered) {
        const phone = phoneToDigits(tecnico.whatsapp)
        const msg = `${tecnico.nombre_completo} (${phone}): filtrado por BAIRD_TEST_PHONE_WHITELIST`
        console.warn(`[notificarTecnicos] ${msg}`)
        sendErrors.push(msg)
        await supabase
          .from('notificaciones_whatsapp')
          .update({ estado: 'error' })
          .eq('token', token)
        return
      }
      if (r.status === 'rejected') {
        const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.error(`Error enviando WhatsApp a técnico ${tecnico.id} (${tecnico.whatsapp}):`, errMsg)
        sendErrors.push(`${tecnico.nombre_completo} (${phoneToDigits(tecnico.whatsapp)}): ${errMsg}`)
        await supabase
          .from('notificaciones_whatsapp')
          .update({ estado: 'error' })
          .eq('token', token)
      }
    })
  )

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

  // Ambos flujos van a 'asignada' (fusión 2026-07-09 — antes particular usaba
  // diagnostico_pendiente; es_garantia ya distingue el camino a seguir).
  const estadoAsignacion = 'asignada'

  // UPDATE atómico — solo asigna si aún no tiene técnico (evita race condition)
  const { data: updated, error: updateErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      tecnico_asignado_id: notif.tecnico_id,
      estado: estadoAsignacion,
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
      const techName = (await supabase.from('tecnicos').select('nombre_completo').eq('id', notif.tecnico_id).single()).data?.nombre_completo?.split(' ')[0] ?? 'Técnico'
      await logEnvio(
        enviarPlantilla(tecnico.whatsapp, 'servicio_no_disponible_v3', 'es', [
          {
            type: 'body',
            parameters: [{ type: 'text', text: techName }],
          },
        ]),
        'procesarAceptacion → servicio_no_disponible_v3',
      )
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

  // Avisar a supervisores que un técnico tomó el servicio (asignada).
  await notificarCambioEstado(sol.id, 'notificada', estadoAsignacion)

  // 4. Notificar al técnico ganador con los datos del cliente
  const clienteDigits = phoneToDigits(sol.cliente_telefono)

  if (tecnico) {
    const equipo = equipoConGarantia(sol)
    const direccion = `${sol.direccion}, ${sol.zona_servicio}`
    // Pago mostrado al técnico tras ganar el servicio.
    //
    // Garantía: mostramos el pago MÍNIMO neto al técnico sin revelar que es
    // MABE ni el desglose tarifa/bono/margen — esa info es privada de Baird.
    // El monto real puede subir según complejidad real + bonos por entrega
    // a tiempo y satisfacción del cliente.
    //
    // Particular: `pago_tecnico` es el NETO que recibe el técnico (catálogo ÷
    // 1.3447 × 0.8, o $35.000 fijo en diagnóstico); se lo mostramos tal cual.
    const pago = sol.es_garantia
      ? `Servicio en garantía — pago desde $${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)} COP`
      : `$${formatCOP(sol.pago_tecnico)} COP`
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    // Send assignment template to technician (with client contact + portal link)
    await logEnvio(
      enviarPlantilla(tecnico.whatsapp, 'servicio_asignado_tecnico_v4', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombreTecnico },
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: equipo },
            { type: 'text', text: direccion },
            { type: 'text', text: pago },
            { type: 'text', text: `+${clienteDigits}` },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: tecnico.portal_token }],
        },
      ]),
      'procesarAceptacion → servicio_asignado_tecnico_v4',
    )
  }

  // 5. Notificar al cliente con los datos del técnico
  const tecnicoDigits = phoneToDigits(tecnico?.whatsapp ?? '')
  const horarioServicio = sol.horario_confirmado || sol.horario_visita_1 || 'Por coordinar'

  if (sol.es_garantia) {
    // ── WARRANTY FLOW: template v5 with schedule + no-pay warning + T&C link ──
    await logEnvio(
      enviarPlantilla(sol.cliente_telefono, 'tecnico_asignado_cliente_v6', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico?.nombre_completo ?? 'Asignado' },
            { type: 'text', text: equipoConGarantia(sol) },
            { type: 'text', text: horarioServicio },
            { type: 'text', text: `+${tecnicoDigits}` },
          ],
        },
      ]),
      'procesarAceptacion → tecnico_asignado_cliente_v6',
    )
  } else {
    // ── NON-WARRANTY (PARTICULAR) FLOW: template with diagnostic fee info ──
    // Aquí mostramos al CLIENTE lo que él paga (precio de catálogo / total
    // cotizado, IVA incl.), NO el neto del técnico que vive en pago_tecnico.
    const precioCliente = precioClienteServicio(
      sol.tipo_equipo,
      sol.tipo_solicitud,
      sol.es_garantia,
      sol.cotizacion as { total?: number | null } | null,
    )
    const tarifaDiagnostico = formatCOP(precioCliente)
    const anticipo = formatCOP(Math.round(precioCliente * 0.5))

    await logEnvio(
      enviarPlantilla(sol.cliente_telefono, 'tecnico_asignado_particular_v1', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico?.nombre_completo ?? 'Asignado' },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: horarioServicio },
            { type: 'text', text: `+${tecnicoDigits}` },
            { type: 'text', text: tarifaDiagnostico },
            { type: 'text', text: anticipo },
          ],
        },
      ]),
      'procesarAceptacion → tecnico_asignado_particular_v1',
    )
  }

  // 6. Enviar foto de perfil y documento del técnico al cliente.
  //
  // ⚠️ Limitación Meta WhatsApp: los mensajes tipo `image` (free-form) requieren
  // que el cliente haya enviado un mensaje al negocio en las últimas 24h.
  // En el flujo customer-first el cliente solo interactúa vía botones URL
  // (que NO abren la ventana 24h), así que estos envíos suelen fallar con
  // error #131047 ("Re-engagement message"). Lo capturamos en el log para
  // diagnóstico, pero la fuente de verdad para verificación de identidad
  // del técnico es /servicio/{cliente_token}, que muestra ambas fotos sin
  // depender de WhatsApp.
  if (tecnico?.foto_perfil_url) {
    await enviarImagen(
      sol.cliente_telefono,
      tecnico.foto_perfil_url,
      `📷 ${tecnico.nombre_completo} — Tu técnico asignado`
    ).catch(err => console.error('[procesarAceptacion] foto perfil falló (24h?):', err))
  }

  if (tecnico?.foto_documento_url) {
    await enviarImagen(
      sol.cliente_telefono,
      tecnico.foto_documento_url,
      `🪪 ${tecnico.tipo_documento ?? 'Documento'}: ${tecnico.numero_documento ?? ''} — Identificación verificada`
    ).catch(err => console.error('[procesarAceptacion] foto documento falló (24h?):', err))
  }

  // 7. Marcar este token como aceptado e invalidar los demás
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

// ─────────────────────────────────────────
// Customer-first scheduling
// ─────────────────────────────────────────

/**
 * Envía la plantilla cliente_seleccion_horario_v2 al cliente con las 2 opciones
 * de horario propuestas en su solicitud y un CTA a /horario/{token}.
 */
export async function enviarSeleccionHorarioCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_visita_1, horario_visita_2, horario_token, horario_confirmado_at, estado, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }

  // Guard contra doble envío: si el cliente ya confirmó horario, no
  // re-disparamos la plantilla. Esto previene duplicados cuando varios
  // triggers concurrentes (admin "reenviar", carga-masiva, cron) intentan
  // re-enviar sin saber que el cliente ya respondió.
  if (sol.horario_confirmado_at) {
    return { ok: false, error: 'El cliente ya confirmó horario; no se reenvía la plantilla de selección.' }
  }
  // Guard secundario: si el estado no es pendiente_horario ni sin_agendar,
  // el flujo ya avanzó — tampoco tiene sentido.
  if (sol.estado !== 'pendiente_horario' && sol.estado !== 'sin_agendar') {
    return { ok: false, error: `Solicitud en estado "${sol.estado}" — la plantilla de selección de horario no aplica.` }
  }

  // Self-heal: si la solicitud es vieja (creada antes de la migración
  // 20260427_customer_first_scheduling.sql o vía la versión vieja de
  // carga-masiva) puede no tener horario_token. En vez de fallar,
  // generamos uno nuevo y lo persistimos atómicamente.
  let horarioToken = sol.horario_token as string | null
  if (!horarioToken) {
    const nuevoToken = crypto.randomUUID()
    const { data: updated, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ horario_token: nuevoToken })
      .eq('id', solicitudId)
      .is('horario_token', null)
      .select('horario_token')
      .single()
    if (updErr || !updated?.horario_token) {
      // Carrera: otro proceso pudo haberle puesto un token; releer.
      const { data: refetch } = await supabase
        .from('solicitudes_servicio')
        .select('horario_token')
        .eq('id', solicitudId)
        .single()
      horarioToken = refetch?.horario_token ?? null
      if (!horarioToken) {
        return { ok: false, error: `No se pudo generar horario_token: ${updErr?.message ?? 'desconocido'}` }
      }
    } else {
      horarioToken = updated.horario_token
    }
  }

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'cliente_seleccion_horario_v2', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: equipo },
          { type: 'text', text: sol.horario_visita_1 || 'Por coordinar' },
          { type: 'text', text: sol.horario_visita_2 || 'Por coordinar' },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: horarioToken }],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Envía recordatorio si el cliente no confirmó el horario tras 24h.
 * Llamado por el cron job /api/cron/horario-recordatorio.
 */
export async function enviarRecordatorioHorario(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_token, horario_recordatorio_at, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.horario_token) return { ok: false, error: 'horario_token no existe' }
  if (sol.horario_recordatorio_at) return { ok: false, error: 'Recordatorio ya enviado' }

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'recordatorio_horario_v2', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: equipo },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: sol.horario_token }],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }

    await supabase
      .from('solicitudes_servicio')
      .update({ horario_recordatorio_at: new Date().toISOString() })
      .eq('id', solicitudId)

    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─────────────────────────────────────────
// Post-diagnóstico — siguiente paso (4 opciones)
// ─────────────────────────────────────────

/**
 * Construye el texto descriptivo del siguiente paso para mostrarlo al cliente.
 */
export function describirSiguientePaso(
  paso: string,
  detalle?: string | null,
  repuesto?: { sku?: string; descripcion?: string; tiempoEstimado?: string } | null,
): string {
  switch (paso) {
    case 'reparar':
      return 'Proceder con la reparación inmediata. El técnico cuenta con todo lo necesario.'
    case 'esperar_repuesto':
      if (repuesto?.sku && repuesto?.descripcion) {
        const tiempo = repuesto.tiempoEstimado ? ` Tiempo estimado: ${repuesto.tiempoEstimado}.` : ''
        return `Esperar repuesto SKU ${repuesto.sku} (${repuesto.descripcion}).${tiempo}`
      }
      return 'Esperar la llegada de un repuesto antes de continuar la reparación.'
    case 'no_reparable':
      return `Imposibilidad de reparación. ${detalle ? `Motivo: ${detalle}` : ''}`.trim()
    case 'negativa_cliente':
      return `Tu decisión de no proceder con la reparación. ${detalle ? `(${detalle})` : ''}`.trim()
    default:
      return paso
  }
}

/**
 * Envía la plantilla verificar_siguiente_paso_v2 al cliente para que apruebe
 * el siguiente paso propuesto por el técnico (solo flujo garantía).
 */
export async function enviarVerificacionPasoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, triaje_resultado, siguiente_paso, siguiente_paso_detalle, verificacion_paso_token, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.verificacion_paso_token) return { ok: false, error: 'verificacion_paso_token no generado' }
  if (!sol.siguiente_paso) return { ok: false, error: 'siguiente_paso no definido' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  // Buscar repuesto pendiente si aplica
  let repuesto: { sku?: string; descripcion?: string; tiempoEstimado?: string } | null = null
  if (sol.siguiente_paso === 'esperar_repuesto') {
    const { data: rep } = await supabase
      .from('repuestos_pendientes')
      .select('sku, descripcion, tiempo_estimado')
      .eq('solicitud_id', solicitudId)
      .eq('estado', 'pendiente')
      .order('solicitado_at', { ascending: false })
      .limit(1)
      .single()
    if (rep) repuesto = { sku: rep.sku, descripcion: rep.descripcion, tiempoEstimado: rep.tiempo_estimado }
  }

  const triajeJson = (sol.triaje_resultado ?? {}) as { diagnostico_tecnico?: string }
  const diagnostico = (triajeJson.diagnostico_tecnico ?? 'Diagnóstico realizado').substring(0, 200)
  const accion = describirSiguientePaso(sol.siguiente_paso, sol.siguiente_paso_detalle, repuesto).substring(0, 250)

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo?.split(' ')[0] ?? 'Técnico'

  try {
    const result = await enviarPlantilla(sol.cliente_telefono, 'verificar_siguiente_paso_v2', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: tecnico },
          { type: 'text', text: equipo },
          { type: 'text', text: diagnostico },
          { type: 'text', text: accion },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: sol.verificacion_paso_token }],
      },
    ])
    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al cliente cuando el repuesto que estaba esperando ya llegó.
 */
/**
 * Notifica al cliente que su repuesto llegó y debe elegir una NUEVA fecha de
 * visita (plantilla repuesto_recibido_cliente_v2, con botón URL a
 * /reprogramar-repuesto/{token}).
 *
 * El token sale de solicitudes_servicio.reprogramacion_token. Si la fila no lo
 * tiene (p.ej. reenvío manual desde admin sobre una fila vieja), se autogenera
 * y persiste — mismo patrón self-heal que enviarSeleccionHorarioCliente.
 *
 * IMPORTANTE: la fecha que el cliente elige es TENTATIVA, sujeta a la
 * disponibilidad del técnico asignado; el copy de la plantilla lo deja claro.
 */
export async function enviarRepuestoRecibidoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, reprogramacion_token, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }

  // Self-heal: la fila debería tener reprogramacion_token (se fija al entrar a
  // repuesto_recibido). Si falta, lo generamos atómicamente.
  let reprogToken = sol.reprogramacion_token as string | null
  if (!reprogToken) {
    const nuevoToken = crypto.randomUUID()
    const { data: updated } = await supabase
      .from('solicitudes_servicio')
      .update({ reprogramacion_token: nuevoToken })
      .eq('id', solicitudId)
      .is('reprogramacion_token', null)
      .select('reprogramacion_token')
      .single()
    if (updated?.reprogramacion_token) {
      reprogToken = updated.reprogramacion_token
    } else {
      // Carrera: otro proceso pudo asignarlo; releer.
      const { data: refetch } = await supabase
        .from('solicitudes_servicio')
        .select('reprogramacion_token')
        .eq('id', solicitudId)
        .single()
      reprogToken = refetch?.reprogramacion_token ?? null
    }
    if (!reprogToken) return { ok: false, error: 'No se pudo generar reprogramacion_token' }
  }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo ?? 'Técnico asignado'

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'repuesto_recibido_cliente_v2', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: equipo },
          { type: 'text', text: tecnico },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: reprogToken }],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al técnico asignado que el cliente eligió una NUEVA fecha (tentativa)
 * tras la llegada del repuesto. La solicitud ya quedó en en_proceso; este mensaje
 * es la señal para que coordine con el cliente, confirme disponibilidad y complete
 * la reparación.
 *
 * Usa la plantilla `repuesto_recibido_tecnico_v1` (NO texto libre): entre el
 * diagnóstico y la llegada del repuesto pasan semanas, así que la ventana 24h del
 * técnico casi siempre está cerrada y un mensaje free-form fallaría en silencio.
 * Una plantilla funciona fuera de la ventana.
 */
export async function notificarTecnicoVisitaReprogramada(
  solicitudId: string,
  horario: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.tecnico_asignado_id) return { ok: false, error: 'Solicitud sin técnico asignado' }

  const { data: tec } = await supabase
    .from('tecnicos')
    .select('nombre_completo, whatsapp, portal_token')
    .eq('id', sol.tecnico_asignado_id)
    .single()

  if (!tec?.whatsapp) return { ok: false, error: 'Técnico sin WhatsApp' }
  if (!tec.portal_token) return { ok: false, error: 'Técnico sin portal_token' }

  const nombreTec = tec.nombre_completo.split(' ')[0]
  const equipo = equipoConGarantia(sol)

  try {
    await enviarPlantilla(tec.whatsapp, 'repuesto_recibido_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombreTec },
          { type: 'text', text: equipo },
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: horario },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: tec.portal_token }],
      },
    ])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * SKUs de los repuestos registrados para una solicitud (excluye cancelados),
 * en una sola línea "SKU1, SKU2" — apto como parámetro de plantilla Meta
 * (los parámetros no admiten saltos de línea). '—' si no hay registros.
 */
async function listarSkusSolicitud(solicitudId: string): Promise<string> {
  const { data } = await supabase
    .from('repuestos_pendientes')
    .select('sku')
    .eq('solicitud_id', solicitudId)
    .neq('estado', 'cancelado')
    .order('solicitado_at', { ascending: true })
  const skus = (data ?? []).map(r => r.sku).filter(Boolean)
  return skus.length > 0 ? skus.join(', ') : '—'
}

/** Dirección completa del cliente en una línea (dirección, zona, ciudad). */
function direccionUnaLinea(sol: {
  direccion?: string | null
  zona_servicio?: string | null
  ciudad_pueblo?: string | null
}): string {
  return [sol.direccion, sol.zona_servicio, sol.ciudad_pueblo].filter(Boolean).join(', ') || '—'
}

/**
 * Texto del equipo para los mensajes WhatsApp, con el No. de garantía anexado
 * cuando aplica: `"Nevera Mabe · Garantía 9415091231"`. Para servicios que NO
 * son garantía (o sin número cargado) devuelve solo el equipo: `"Nevera LG"`.
 *
 * Se usa en TODOS los mensajes de actualización del flujo garantía para que el
 * supervisor/técnico/cliente vea el No. de garantía (orden de la marca) sin
 * re-aprobar plantillas en Meta — el número viaja dentro del parámetro `equipo`
 * que esas plantillas ya tienen. NO se usa en los mensajes que ya llevan el
 * número en su propia línea (esperando_repuesto_tecnico_v1,
 * supervisor_repuesto_garantia_v1) para no duplicarlo.
 */
function equipoConGarantia(sol: {
  tipo_equipo?: string | null
  marca_equipo?: string | null
  es_garantia?: boolean | null
  numero_serie_factura?: string | null
}): string {
  const base = `${sol.tipo_equipo ?? ''} ${sol.marca_equipo ?? ''}`.trim()
  const num = sol.numero_serie_factura?.replace(/\s+/g, ' ').trim()
  return sol.es_garantia && num ? `${base} · Garantía ${num}` : base
}

/**
 * Modelo del equipo, embebido como prefijo "[Modelo: X]" en `novedades_equipo`
 * (mismo formato que parsea notificarTecnicos). Saneado para parámetro Meta
 * (sin saltos de línea). '—' si no viene.
 */
function modeloDeNovedades(novedades?: string | null): string {
  const m = novedades?.match(/^\[Modelo:\s*(.+?)\]\s*/)
  const modelo = (m?.[1] ?? '').replace(/\s+/g, ' ').trim()
  return modelo ? modelo.substring(0, 80) : '—'
}

/**
 * Diagnóstico del técnico desde `triaje_resultado.diagnostico_tecnico` (flujo
 * garantía). Saneado para parámetro Meta (colapsa whitespace, sin saltos de
 * línea, tope 200). Default legible si no hay texto.
 */
function diagnosticoDeTriaje(triaje: unknown): string {
  const d = (triaje as { diagnostico_tecnico?: string } | null)?.diagnostico_tecnico
  const limpio = (d ?? '').replace(/\s+/g, ' ').trim()
  return limpio ? limpio.substring(0, 200) : 'Diagnóstico realizado'
}

/**
 * Infere QUIÉN disparó una transición de estado a partir del par
 * (estado_previo → estado_nuevo). Funciona porque cada transición tiene un
 * único endpoint dueño (ver "transition owners" en docs/ARQUITECTURA.md) y
 * cada endpoint está gateado a un solo rol (token de portal técnico, token
 * de cliente, Supabase Auth admin, o cron).
 *
 * Se usa para el `actor` del evento 'cambio_estado' en solicitud_eventos
 * (historial de estados del panel admin). Si el flujo cambia de dueños,
 * actualizar este mapa.
 */
function inferirActorTransicion(estadoPrevio: string | null, estadoNuevo: string): string {
  switch (estadoNuevo) {
    case 'pendiente_horario': return 'admin'        // re-notificar tras sin_agendar (/api/whatsapp/notify)
    case 'notificada': return 'cliente'             // confirmó horario (/api/confirmar-horario)
    case 'asignada': return 'tecnico'               // aceptó el servicio (procesarAceptacion)
    case 'pendiente_pricing': return 'tecnico'      // diagnóstico con esperar_repuesto (/api/diagnostico)
    case 'aprobacion_paso_pendiente':
    case 'cotizacion_enviada':
      // pendiente_pricing → admin fijó precios (/api/cotizacion-precios);
      // si no, viene del diagnóstico del técnico (/api/diagnostico).
      return estadoPrevio === 'pendiente_pricing' ? 'admin' : 'tecnico'
    case 'cotizacion_rechazada': return 'cliente'   // decidió la cotización (/api/aprobar-cotizacion)
    case 'esperando_repuesto': return 'cliente'     // aprobó esperar el repuesto
    case 'repuesto_recibido': return 'admin'        // marcó el repuesto recibido (/api/repuesto-recibido)
    case 'en_proceso': return 'cliente'             // aprobó reparar/cotización o eligió fecha tras repuesto
    case 'confirmacion_pendiente': return 'tecnico' // completó el servicio (/api/completar-servicio)
    case 'completada':
    case 'en_disputa': return 'cliente'             // confirmó satisfacción o reportó problema
    case 'finalizado_sin_reparacion':
    case 'reparacion_rechazada':
      // Vía aprobación de paso → decisión del cliente; directo del diagnóstico → técnico.
      return estadoPrevio === 'aprobacion_paso_pendiente' ? 'cliente' : 'tecnico'
    case 'sin_agendar': return 'sistema'            // cron horario-recordatorio (timeout)
    case 'cancelada': return 'cliente'
    default: return 'sistema'
  }
}

/**
 * Notifica a los supervisores configurados cuando una solicitud cambia de estado
 * Y registra la transición en el historial (`solicitud_eventos`, tipo
 * 'cambio_estado', actor inferido con `inferirActorTransicion`).
 *
 * NUNCA lanza: atrapa y loguea todos los errores. Los call-sites pueden await sin
 * try/catch — si falla, no rompe la transición que lo disparó.
 *
 * opciones.registrarEvento (default true): pasar `false` desde call-sites que
 * YA insertan su propio evento de cambio de estado (cancelacion,
 * reagendamiento, reagendamiento_confirmado, cambio_estado_admin) para no
 * duplicar filas en el historial.
 *
 * Filtrado por supervisor (tabla `supervisores`, solo activo = true):
 *   - ambito:  'todos' → siempre | 'garantia' → solo es_garantia | 'particular' → solo !es_garantia
 *   - marca:   null → todas | string → solo si coincide con marca_equipo (normalizeForMatch)
 *   - estados: null/[] → todos | string[] → solo si estadoNuevo está en la lista
 *
 * Plantillas (ambas funcionan fuera de la ventana 24h — los supervisores no
 * interactúan con el WhatsApp del negocio):
 *   - `supervisor_repuesto_garantia_v1` cuando el cambio es un evento de repuesto
 *     en GARANTÍA (→ esperando_repuesto | repuesto_recibido): incluye No. de
 *     garantía, SKU(s), dirección del cliente, modelo del equipo y diagnóstico
 *     del técnico — los datos con los que se gestiona el repuesto ante la marca.
 *     Si Meta aún no la aprueba, cae a la genérica para no perder el aviso.
 *   - `supervisor_cambio_estado_v1` (genérica) para todo lo demás — incluido
 *     cualquier evento de repuesto en flujo particular, que se mantiene igual.
 */
export async function notificarCambioEstado(
  solicitudId: string,
  estadoPrevio: string | null,
  estadoNuevo: string,
  opciones?: { registrarEvento?: boolean },
): Promise<void> {
  try {
    if (estadoPrevio === estadoNuevo) return

    // Historial de estados: registro append-only de la transición con su actor.
    // Best-effort (logEvento nunca lanza). Requiere migración
    // 20260612_evento_cambio_estado.sql (tipo 'cambio_estado' en el CHECK).
    if (opciones?.registrarEvento !== false) {
      await logEvento({
        solicitudId,
        tipo: 'cambio_estado',
        estadoPrevio,
        estadoNuevo,
        actor: inferirActorTransicion(estadoPrevio, estadoNuevo),
        payload: { origen: 'flujo' },
      })
    }

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, es_garantia, numero_serie_factura, direccion, zona_servicio, novedades_equipo, triaje_resultado')
      .eq('id', solicitudId)
      .single()
    if (!sol) return

    const { data: supervisores } = await supabase
      .from('supervisores')
      .select('nombre, whatsapp, ambito, marca, estados')
      .eq('activo', true)
    if (!supervisores || supervisores.length === 0) return

    const marcaSol = normalizeForMatch(sol.marca_equipo ?? '')

    const destinatarios = supervisores.filter(s => {
      if (s.ambito === 'garantia' && !sol.es_garantia) return false
      if (s.ambito === 'particular' && sol.es_garantia) return false
      if (s.marca && normalizeForMatch(s.marca) !== marcaSol) return false
      if (Array.isArray(s.estados) && s.estados.length > 0 && !s.estados.includes(estadoNuevo)) return false
      return true
    })
    if (destinatarios.length === 0) return

    const equipoPlano = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const tipoFlujo = sol.es_garantia ? 'Garantía' : 'Particular'
    const estadoLabel = ESTADO_LABELS[estadoNuevo] ?? estadoNuevo

    // Evento de repuesto en garantía → plantilla con datos de gestión del repuesto.
    const esEventoRepuestoGarantia =
      sol.es_garantia && (estadoNuevo === 'esperando_repuesto' || estadoNuevo === 'repuesto_recibido')
    const detalleRepuesto = esEventoRepuestoGarantia
      ? {
          novedad: estadoNuevo === 'esperando_repuesto' ? 'Repuesto requerido' : 'Repuesto entregado al cliente',
          garantia: sol.numero_serie_factura ?? '—',
          skus: await listarSkusSolicitud(solicitudId),
          direccion: direccionUnaLinea(sol),
          modelo: modeloDeNovedades(sol.novedades_equipo),
          diagnostico: diagnosticoDeTriaje(sol.triaje_resultado),
        }
      : null

    await Promise.all(
      destinatarios.map(async s => {
        try {
          if (detalleRepuesto) {
            try {
              await enviarPlantilla(s.whatsapp, 'supervisor_repuesto_garantia_v1', 'es', [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: s.nombre.split(' ')[0] },
                    { type: 'text', text: detalleRepuesto.novedad },
                    { type: 'text', text: sol.cliente_nombre },
                    { type: 'text', text: equipoPlano },
                    { type: 'text', text: detalleRepuesto.modelo },
                    { type: 'text', text: detalleRepuesto.garantia },
                    { type: 'text', text: detalleRepuesto.skus },
                    { type: 'text', text: detalleRepuesto.direccion },
                    { type: 'text', text: detalleRepuesto.diagnostico },
                  ],
                },
              ])
              return
            } catch (err) {
              // Fallback mientras supervisor_repuesto_garantia_v1 no esté APPROVED
              // en Meta: el supervisor recibe al menos el cambio de estado genérico.
              console.error(`[notificarCambioEstado] supervisor_repuesto_garantia_v1 falló para ${s.nombre}, fallback a genérica:`, err)
            }
          }
          await enviarPlantilla(s.whatsapp, 'supervisor_cambio_estado_v1', 'es', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: s.nombre.split(' ')[0] },
                { type: 'text', text: sol.cliente_nombre },
                { type: 'text', text: equipoConGarantia(sol) },
                { type: 'text', text: sol.ciudad_pueblo ?? '—' },
                { type: 'text', text: tipoFlujo },
                { type: 'text', text: estadoLabel },
              ],
            },
          ])
        } catch (err) {
          console.error(`[notificarCambioEstado] Error notificando a ${s.nombre}:`, err)
        }
      }),
    )
  } catch (err) {
    console.error('[notificarCambioEstado] Error general:', err)
  }
}

/**
 * Envía ON-DEMAND el pedido de repuesto en GARANTÍA a los supervisores con
 * VISIBILIDAD DE LA MARCA del servicio (activos, ámbito todos|garantía, y marca
 * null o == marca del equipo). Mismo mensaje (supervisor_repuesto_garantia_v1)
 * que dispara notificarCambioEstado al pasar a esperando_repuesto, pero gatillado
 * desde el botón "Pedir repuestos en garantía" del admin
 * (POST /api/admin/pedir-repuesto-supervisores). NO cambia estado. Solo GARANTÍA.
 *
 * NO filtra por el campo `estados` del supervisor: es un pedido on-demand, no un
 * cambio de estado, así que cualquier supervisor que vea la marca debe recibirlo.
 *
 * NUNCA lanza. Devuelve cuántos supervisores recibieron el aviso.
 *
 * ⚠️ El bloque de parámetros de supervisor_repuesto_garantia_v1 (9 params) está
 * duplicado a propósito respecto a notificarCambioEstado: no se comparte para no
 * tocar el path automático crítico. Si cambian los params de la plantilla,
 * actualizar AMBOS lugares.
 */
export async function notificarRepuestoSupervisores(
  solicitudId: string,
): Promise<{ enviados: number; total: number; error?: string }> {
  try {
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, es_garantia, numero_serie_factura, direccion, zona_servicio, novedades_equipo, triaje_resultado')
      .eq('id', solicitudId)
      .single()
    if (!sol) return { enviados: 0, total: 0, error: 'Solicitud no encontrada' }
    if (!sol.es_garantia) {
      return { enviados: 0, total: 0, error: 'El pedido de repuesto a supervisores es solo para servicios en garantía' }
    }

    const { data: supervisores } = await supabase
      .from('supervisores')
      .select('nombre, whatsapp, ambito, marca')
      .eq('activo', true)
    if (!supervisores || supervisores.length === 0) {
      return { enviados: 0, total: 0, error: 'No hay supervisores activos configurados' }
    }

    const marcaSol = normalizeForMatch(sol.marca_equipo ?? '')
    // Visibilidad de marca: ámbito incluye garantía (todos|garantia) + marca
    // null (todas) o coincidente con la del equipo.
    const destinatarios = supervisores.filter(s => {
      if (s.ambito === 'particular') return false
      if (s.marca && normalizeForMatch(s.marca) !== marcaSol) return false
      return true
    })
    if (destinatarios.length === 0) {
      return { enviados: 0, total: 0, error: 'Ningún supervisor con visibilidad de esta marca' }
    }

    const equipoPlano = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const detalle = {
      novedad: 'Repuesto requerido',
      garantia: sol.numero_serie_factura ?? '—',
      skus: await listarSkusSolicitud(solicitudId),
      direccion: direccionUnaLinea(sol),
      modelo: modeloDeNovedades(sol.novedades_equipo),
      diagnostico: diagnosticoDeTriaje(sol.triaje_resultado),
    }
    const estadoLabelRepuesto = ESTADO_LABELS['esperando_repuesto'] ?? 'Esperando repuesto'

    let enviados = 0
    await Promise.all(
      destinatarios.map(async s => {
        try {
          try {
            await enviarPlantilla(s.whatsapp, 'supervisor_repuesto_garantia_v1', 'es', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: s.nombre.split(' ')[0] },
                  { type: 'text', text: detalle.novedad },
                  { type: 'text', text: sol.cliente_nombre },
                  { type: 'text', text: equipoPlano },
                  { type: 'text', text: detalle.modelo },
                  { type: 'text', text: detalle.garantia },
                  { type: 'text', text: detalle.skus },
                  { type: 'text', text: detalle.direccion },
                  { type: 'text', text: detalle.diagnostico },
                ],
              },
            ])
          } catch (err) {
            // Fallback mientras supervisor_repuesto_garantia_v1 no esté APPROVED.
            console.error(`[notificarRepuestoSupervisores] v1 falló para ${s.nombre}, fallback a genérica:`, err)
            await enviarPlantilla(s.whatsapp, 'supervisor_cambio_estado_v1', 'es', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: s.nombre.split(' ')[0] },
                  { type: 'text', text: sol.cliente_nombre },
                  { type: 'text', text: equipoConGarantia(sol) },
                  { type: 'text', text: sol.ciudad_pueblo ?? '—' },
                  { type: 'text', text: 'Garantía' },
                  { type: 'text', text: estadoLabelRepuesto },
                ],
              },
            ])
          }
          enviados++
        } catch (err) {
          console.error(`[notificarRepuestoSupervisores] Error notificando a ${s.nombre}:`, err)
        }
      }),
    )

    return { enviados, total: destinatarios.length }
  } catch (err) {
    console.error('[notificarRepuestoSupervisores] Error general:', err)
    return { enviados: 0, total: 0, error: err instanceof Error ? err.message : 'Error interno' }
  }
}

/**
 * Describe en lenguaje natural el alcance de un supervisor, para la plantilla
 * de bienvenida. Combina ámbito + marca + estados:
 *   - todos + sin marca       → "todos los servicios y marcas"
 *   - garantia + MABE         → "los servicios de garantía de la marca MABE"
 *   - particular + sin marca  → "los servicios particulares de todas las marcas"
 * Si hay filtro de estados, lo añade al final ("…, solo cuando pasan a: X, Y").
 */
export function describirAmbitoSupervisor(
  ambito: string | null,
  marca: string | null,
  estados: string[] | null,
): string {
  const amb = ambito === 'garantia' || ambito === 'particular' ? ambito : 'todos'
  const base =
    amb === 'garantia'
      ? 'los servicios de garantía'
      : amb === 'particular'
        ? 'los servicios particulares'
        : 'todos los servicios'

  let scope: string
  if (amb === 'todos' && !marca) {
    scope = 'todos los servicios y marcas'
  } else if (marca) {
    scope = `${base} de la marca ${marca}`
  } else {
    scope = `${base} de todas las marcas`
  }

  if (Array.isArray(estados) && estados.length > 0) {
    const labels = estados.map(e => ESTADO_LABELS[e] ?? e).join(', ')
    scope += `, solo cuando pasan a: ${labels}`
  }
  return scope
}

/**
 * Envía el WhatsApp de bienvenida a un supervisor recién creado/activado.
 * Best-effort: no lanza, devuelve { ok, error? }. Usa la plantilla
 * `supervisor_bienvenida_v1` (funciona fuera de la ventana 24h: el supervisor
 * no interactúa con el WhatsApp del negocio). El cuerpo le confirma su alcance
 * (ámbito + marca + estados) y que recibirá los cambios de estado por aquí.
 */
export async function enviarBienvenidaSupervisor(supervisor: {
  nombre: string
  whatsapp: string
  ambito: string | null
  marca: string | null
  estados: string[] | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const scope = describirAmbitoSupervisor(supervisor.ambito, supervisor.marca, supervisor.estados)
    const result = await enviarPlantilla(supervisor.whatsapp, 'supervisor_bienvenida_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: supervisor.nombre.split(' ')[0] },
          { type: 'text', text: scope },
        ],
      },
    ])
    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Envía al supervisor su link mágico de acceso al panel de solo lectura
 * (plantilla supervisor_acceso_v1). El botón URL dinámico apunta a
 * /supervisor/{portal_token}. Best-effort: si la plantilla aún no está APPROVED
 * en Meta, falla y el admin puede copiar el link manualmente (el endpoint lo
 * devuelve igual).
 */
export async function enviarAccesoSupervisor(supervisor: {
  nombre: string
  whatsapp: string
  ambito: string | null
  marca: string | null
  estados: string[] | null
  portal_token: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const scope = describirAmbitoSupervisor(supervisor.ambito, supervisor.marca, supervisor.estados)
    const result = await enviarPlantilla(supervisor.whatsapp, 'supervisor_acceso_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: supervisor.nombre.split(' ')[0] },
          { type: 'text', text: scope },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: supervisor.portal_token }],
      },
    ])
    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Envía al supervisor el código OTP de 6 dígitos para entrar por /supervisor
 * (plantilla supervisor_codigo_v1, categoría AUTHENTICATION — APPROVED
 * 2026-07-09). En las plantillas de autenticación Meta exige el código dos
 * veces: como parámetro del body Y como parámetro del botón COPY_CODE.
 */
export async function enviarCodigoSupervisor(
  whatsapp: string,
  codigo: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await enviarPlantilla(whatsapp, 'supervisor_codigo_v1', 'es', [
      {
        type: 'body',
        parameters: [{ type: 'text', text: codigo }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: codigo }],
      },
    ])
    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al cliente cuando se necesita esperar repuesto (incluye SKU).
 */
export async function enviarEsperandoRepuestoCliente(
  solicitudId: string,
  sku: string,
  descripcionRepuesto: string,
  tiempoEstimado: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo?.split(' ')[0] ?? 'Técnico'

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'esperando_repuesto_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: tecnico },
          { type: 'text', text: equipo },
          { type: 'text', text: sku },
          { type: 'text', text: descripcionRepuesto },
          { type: 'text', text: tiempoEstimado },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al TÉCNICO que quedó aprobada la espera del repuesto (solo GARANTÍA).
 *
 * Incluye los datos con los que se gestiona el repuesto ante la marca:
 * No. de garantía (numero_serie_factura), SKU(s) solicitados y dirección del
 * cliente (la marca despacha el repuesto a esa dirección).
 *
 * En particular NO se envía (guard interno): el técnico ya recibe
 * `cotizacion_aprobada_tecnico_v2` al aprobarse la cotización y el repuesto
 * lo gestiona él dentro de su costo — ese flujo se mantiene como está.
 *
 * Usa la plantilla `esperando_repuesto_tecnico_v1` (NO texto libre): la
 * aprobación del cliente puede llegar días después de la visita, con la
 * ventana 24h del técnico cerrada.
 */
export async function enviarEsperandoRepuestoTecnico(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, es_garantia, numero_serie_factura, direccion, zona_servicio, ciudad_pueblo')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.es_garantia) return { ok: false, error: 'Solo aplica a flujo garantía (particular se mantiene igual)' }
  if (!sol.tecnico_asignado_id) return { ok: false, error: 'Solicitud sin técnico asignado' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo, whatsapp').eq('id', sol.tecnico_asignado_id).single()
  if (!tec?.whatsapp) return { ok: false, error: 'Técnico sin WhatsApp' }

  const skus = await listarSkusSolicitud(solicitudId)

  try {
    const r = await enviarPlantilla(tec.whatsapp, 'esperando_repuesto_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: tec.nombre_completo.split(' ')[0] },
          { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: sol.numero_serie_factura ?? '—' },
          { type: 'text', text: skus },
          { type: 'text', text: direccionUnaLinea(sol) },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al TÉCNICO que el repuesto ya fue entregado al cliente (AMBOS flujos).
 *
 * Se dispara al marcar el último repuesto como recibido (/api/repuesto-recibido),
 * en paralelo al aviso al cliente. Es informativo: la nueva fecha tentativa le
 * llega después vía `repuesto_recibido_tecnico_v1` cuando el cliente la elige
 * en /reprogramar-repuesto.
 *
 * Usa la plantilla `repuesto_llegado_tecnico_v1` (NO texto libre): entre el
 * diagnóstico y la llegada del repuesto pasan semanas → ventana 24h cerrada.
 */
export async function enviarRepuestoLlegadoTecnico(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.tecnico_asignado_id) return { ok: false, error: 'Solicitud sin técnico asignado' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo, whatsapp').eq('id', sol.tecnico_asignado_id).single()
  if (!tec?.whatsapp) return { ok: false, error: 'Técnico sin WhatsApp' }

  try {
    const r = await enviarPlantilla(tec.whatsapp, 'repuesto_llegado_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: tec.nombre_completo.split(' ')[0] },
          { type: 'text', text: equipoConGarantia(sol) },
          { type: 'text', text: sol.cliente_nombre },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─────────────────────────────────────────────────────────────────
// Plantillas de cierre de gaps (2026-07-06) — aprobadas en Meta desde antes,
// cableadas acá. Todas best-effort: el caller decide el fallback (texto libre
// o nada). OJO: los parámetros de plantilla NO admiten saltos de línea.
// ─────────────────────────────────────────────────────────────────

/**
 * Confirma al CLIENTE por WhatsApp que su horario quedó agendado (gap H1) y le
 * entrega el link permanente de gestión (botón → /servicio/{cliente_token},
 * cubre el gap 9 sin plantilla aparte — enviar además `gestionar_servicio_v1`
 * sería redundante). Disparada tras confirmar-horario. Plantilla
 * `horario_confirmado_cliente_v1` (3 params + botón URL).
 */
export async function enviarHorarioConfirmadoCliente(solicitudId: string, horario: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, es_garantia, numero_serie_factura, cliente_token')
    .eq('id', solicitudId)
    .single()

  if (!sol?.cliente_telefono) return { ok: false, error: 'Solicitud sin teléfono de cliente' }
  if (!sol.cliente_token) return { ok: false, error: 'Solicitud sin cliente_token' }

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'horario_confirmado_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: sol.cliente_nombre.split(' ')[0] },
          { type: 'text', text: equipoConGarantia(sol) },
          { type: 'text', text: horario },
        ],
      },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: sol.cliente_token }] },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Avisa al CLIENTE que su solicitud expiró por no confirmar horario (gap 1).
 * Disparada por el cron horario-recordatorio al transicionar a `sin_agendar`.
 * Plantilla `solicitud_expirada_cliente_v1` (2 params; botón con URL estática
 * a /solicitar — no lleva parámetro).
 */
export async function enviarSolicitudExpiradaCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo')
    .eq('id', solicitudId)
    .single()

  if (!sol?.cliente_telefono) return { ok: false, error: 'Solicitud sin teléfono de cliente' }

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'solicitud_expirada_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: sol.cliente_nombre.split(' ')[0] },
          { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Confirma al CLIENTE que su aprobación del siguiente paso quedó registrada
 * (gaps 3 y 4 — antes era texto libre, que fuera de la ventana 24h no llega).
 * `accion`/`detalle` los arma el caller (/api/verificar-paso) según el paso.
 * Plantilla `paso_aprobado_cliente_v1` (4 params, sin botón).
 */
export async function enviarPasoAprobadoCliente(solicitudId: string, accion: string, detalle: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol?.cliente_telefono) return { ok: false, error: 'Solicitud sin teléfono de cliente' }

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'paso_aprobado_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: sol.cliente_nombre.split(' ')[0] },
          { type: 'text', text: equipoConGarantia(sol) },
          { type: 'text', text: accion },
          { type: 'text', text: detalle },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Confirma al CLIENTE que su rechazo del siguiente paso quedó registrado y que
 * Baird lo contactará (gap 5 — antes el cliente no recibía NADA por WhatsApp).
 * Plantilla `paso_rechazado_cliente_v1` (2 params, sin botón).
 */
export async function enviarPasoRechazadoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol?.cliente_telefono) return { ok: false, error: 'Solicitud sin teléfono de cliente' }

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'paso_rechazado_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: sol.cliente_nombre.split(' ')[0] },
          { type: 'text', text: equipoConGarantia(sol) },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Avisa al TÉCNICO la decisión del cliente sobre el siguiente paso (gap 6 —
 * antes era texto libre, que puede no llegar si su ventana 24h está cerrada).
 * `decision` es el texto que ve el técnico ('APROBÓ' | 'RECHAZÓ'); `detalle`
 * lo arma el caller. Plantilla `paso_resuelto_tecnico_v1` (5 params + botón
 * URL → /tecnico/{portal_token}).
 */
export async function enviarPasoResueltoTecnico(solicitudId: string, decision: string, detalle: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, tipo_equipo, marca_equipo, es_garantia, numero_serie_factura, tecnico_asignado_id')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.tecnico_asignado_id) return { ok: false, error: 'Solicitud sin técnico asignado' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo, whatsapp, portal_token').eq('id', sol.tecnico_asignado_id).single()
  if (!tec?.whatsapp) return { ok: false, error: 'Técnico sin WhatsApp' }
  if (!tec.portal_token) return { ok: false, error: 'Técnico sin portal_token' }

  try {
    const r = await enviarPlantilla(tec.whatsapp, 'paso_resuelto_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: tec.nombre_completo.split(' ')[0] },
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: decision },
          { type: 'text', text: equipoConGarantia(sol) },
          { type: 'text', text: detalle },
        ],
      },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: tec.portal_token }] },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Avisa al TÉCNICO que el cliente confirmó satisfacción y el servicio cerró
 * (gap 8). La calificación viene embebida en el comentario del cliente
 * ("Calificacion: N/10 ..." — la arma /confirmar); el caller la parsea.
 * Plantilla `servicio_confirmado_tecnico_v1` (4 params, sin botón).
 * `tecnicoId` explícito: la evidencia guarda su propio tecnico_id.
 */
export async function enviarServicioConfirmadoTecnico(solicitudId: string, tecnicoId: string, calificacion: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_nombre, tipo_equipo, marca_equipo, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo, whatsapp').eq('id', tecnicoId).single()
  if (!tec?.whatsapp) return { ok: false, error: 'Técnico sin WhatsApp' }

  try {
    const r = await enviarPlantilla(tec.whatsapp, 'servicio_confirmado_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: tec.nombre_completo.split(' ')[0] },
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: equipoConGarantia(sol) },
          { type: 'text', text: calificacion },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al cliente que el equipo no es reparable (terminal).
 */
export async function enviarFinalizadoSinReparacion(
  solicitudId: string,
  motivoTecnico: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = equipoConGarantia(sol)
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo?.split(' ')[0] ?? 'Técnico'

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'finalizado_sin_reparacion_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: equipo },
          { type: 'text', text: motivoTecnico.substring(0, 200) },
          { type: 'text', text: tecnico },
        ],
      },
    ])
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─────────────────────────────────────────
// Cotización — Servicio particular (non-warranty)
// ─────────────────────────────────────────

/**
 * Envía la cotización de reparación al cliente para aprobación.
 * Solo aplica para servicios particulares (es_garantia = false).
 */
export async function enviarCotizacionCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('*, cotizacion')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (sol.es_garantia) return { ok: false, error: 'Las cotizaciones solo aplican para servicios particulares' }
  if (!sol.cotizacion) return { ok: false, error: 'No hay cotización registrada' }

  const cot = sol.cotizacion as {
    diagnostico_tecnico: string; mano_obra: number; repuestos: number; total: number; token: string
    tiempo_entrega?: string | null
  }

  // Get technician name
  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('nombre_completo')
    .eq('id', sol.tecnico_asignado_id)
    .single()

  try {
    // v3 (APPROVED 2026-07-06): diagnóstico + total único con IVA + tiempo de
    // inicio + botón "Aprobar cotización" → /cotizacion/{token}. Reemplaza a
    // _v2, que mostraba "Mano de obra: $0 / Repuestos: $0" (desde 2026-05-12
    // esos campos se persisten en 0) y generaba desconfianza en el cliente.
    // Fallback a _v2 si Meta rechaza el envío de v3 — nunca dejar al cliente
    // sin cotización por un problema de plantilla.
    const botonToken = {
      type: 'button' as const,
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: cot.token }],
    }

    let result
    try {
      result = await enviarPlantilla(sol.cliente_telefono, 'cotizacion_cliente_v3', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico?.nombre_completo ?? 'Técnico asignado' },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: cot.diagnostico_tecnico.substring(0, 200) },
            { type: 'text', text: formatCOP(cot.total) },
            { type: 'text', text: cot.tiempo_entrega || 'inmediato tras tu aprobación' },
          ],
        },
        botonToken,
      ])
    } catch (v3Err) {
      console.error('[cotizacion] cotizacion_cliente_v3 falló, fallback a v2:', v3Err)
      result = await enviarPlantilla(sol.cliente_telefono, 'cotizacion_cliente_v2', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico?.nombre_completo ?? 'Técnico asignado' },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: cot.diagnostico_tecnico.substring(0, 200) },
            { type: 'text', text: formatCOP(cot.mano_obra) },
            { type: 'text', text: formatCOP(cot.repuestos) },
            { type: 'text', text: formatCOP(cot.total) },
          ],
        },
        botonToken,
      ])
    }

    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }

    // Update state — solo si efectivamente se envió
    await supabase
      .from('solicitudes_servicio')
      .update({ estado: 'cotizacion_enviada' })
      .eq('id', solicitudId)

    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al CLIENTE que el valor de su servicio particular se actualizó.
 *
 * Pura: solo envía la plantilla `valor_actualizado_cliente_v1` con el nuevo
 * total que ya quedó persistido en `cotizacion.total`. NO cambia el estado ni
 * la cotización — eso lo hace /api/admin/actualizar-valor antes de llamar acá.
 *
 * El botón URL lleva al cliente a /cotizacion/{token} para re-aprobar (el
 * endpoint dejó la solicitud en `cotizacion_enviada`).
 */
export async function enviarValorActualizadoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('*, cotizacion')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (sol.es_garantia) return { ok: false, error: 'El ajuste de valor solo aplica para servicios particulares' }
  if (!sol.cotizacion) return { ok: false, error: 'No hay cotización registrada' }

  const cot = sol.cotizacion as { total: number; token: string }
  if (!cot.token) return { ok: false, error: 'La cotización no tiene token de aprobación' }

  try {
    const result = await enviarPlantilla(sol.cliente_telefono, 'valor_actualizado_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
          { type: 'text', text: formatCOP(cot.total) },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: cot.token }],
      },
    ])

    if (result.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Notifica al técnico que el cliente aprobó la cotización.
 */
export async function notificarCotizacionAprobada(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('*, cotizacion')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }

  const cot = sol.cotizacion as { total: number }

  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('nombre_completo, whatsapp, portal_token')
    .eq('id', sol.tecnico_asignado_id)
    .single()

  if (!tecnico) return { ok: false, error: 'Técnico no encontrado' }

  const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

  try {
    // v3 (APPROVED 2026-07-06): separa explícitamente el PAGO NETO al técnico
    // (pago_tecnico, lo que recibe íntegro) del total que paga el cliente
    // (con utilidad Baird + IVA). _v2 mostraba solo el total del cliente
    // rotulado "Total aprobado" y el técnico lo confundía con su pago
    // (auditoría 2026-07-05). Fallback a _v2 si Meta rechaza el envío de v3.
    const botonPortal = {
      type: 'button' as const,
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: tecnico.portal_token ?? '' }],
    }

    let r
    try {
      r = await enviarPlantilla(tecnico.whatsapp, 'cotizacion_aprobada_tecnico_v3', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombreTecnico },
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: formatCOP(sol.pago_tecnico ?? 0) },
            { type: 'text', text: formatCOP(cot.total) },
          ],
        },
        botonPortal,
      ])
    } catch (v3Err) {
      console.error('[cotizacion] cotizacion_aprobada_tecnico_v3 falló, fallback a v2:', v3Err)
      r = await enviarPlantilla(tecnico.whatsapp, 'cotizacion_aprobada_tecnico_v2', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombreTecnico },
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: formatCOP(cot.total) },
          ],
        },
        botonPortal,
      ])
    }
    if (r.filtered) return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─────────────────────────────────────────
// Notificación de registro de técnico
// ─────────────────────────────────────────

/**
 * Envía un mensaje de bienvenida al técnico recién registrado y
 * notifica al admin que hay un nuevo técnico pendiente de verificación.
 */
export async function notificarRegistroTecnico(tecnicoId: string): Promise<{ ok: boolean; error?: string }> {
  // 1. Obtener datos del técnico
  const { data: tecnico, error } = await supabase
    .from('tecnicos')
    .select('nombre_completo, whatsapp, ciudad_pueblo, especialidad_principal')
    .eq('id', tecnicoId)
    .single()

  if (error || !tecnico) {
    return { ok: false, error: `Técnico no encontrado: ${error?.message}` }
  }

  const nombre = tecnico.nombre_completo.split(' ')[0] // primer nombre

  // 2. Mensaje de bienvenida al técnico (usando plantilla aprobada)
  try {
    const r = await enviarPlantilla(tecnico.whatsapp, 'registro_bienvenida_v3', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: tecnico.ciudad_pueblo },
          { type: 'text', text: tecnico.especialidad_principal },
        ],
      },
    ])
    if (r.filtered) {
      return { ok: false, error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode)' }
    }
  } catch (err) {
    console.error('[notificarRegistroTecnico] Error enviando bienvenida:', err)
    return { ok: false, error: `Error WhatsApp: ${err instanceof Error ? err.message : String(err)}` }
  }

  return { ok: true }
}

// ─────────────────────────────────────────
// Self-service del cliente: cancelar / reagendar
// ─────────────────────────────────────────

/**
 * Inserta un evento en la bitácora append-only.
 * No lanza si falla — el log no debe romper el flujo principal.
 */
async function logEvento(params: {
  solicitudId: string
  tipo: 'cancelacion' | 'reagendamiento' | 'reagendamiento_confirmado' | 'cancelacion_revertida' | 'cambio_estado_admin' | 'nota_admin' | 'cambio_estado'
  estadoPrevio: string | null
  estadoNuevo: string | null
  actor: string
  motivo?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.from('solicitud_eventos').insert({
      solicitud_id: params.solicitudId,
      tipo: params.tipo,
      estado_previo: params.estadoPrevio,
      estado_nuevo: params.estadoNuevo,
      actor: params.actor,
      motivo: params.motivo ?? null,
      payload: params.payload ?? {},
    })
  } catch (err) {
    console.error('[logEvento] Error inserting event:', err)
  }
}

export interface CancelacionResult {
  ok: boolean
  estado_previo?: string
  cancelado_tarde?: boolean
  error?: string
}

/**
 * Procesa la cancelación de una solicitud iniciada por el cliente desde
 * el portal /servicio/{cliente_token}.
 *
 * Reglas:
 * - Solo permitido desde estados en ESTADOS_CANCELABLES_POR_CLIENTE.
 * - Si había técnico asignado, se le notifica vía texto (24h-window OK porque
 *   tuvo interacción reciente). Se marca cancelado_tarde=true para
 *   diferencia de liquidación.
 * - Las notificaciones activas a técnicos se invalidan.
 * - Estado final = 'cancelada' (no se distingue reparacion_rechazada que está
 *   reservado para la negativa del cliente post-diagnóstico).
 */
export async function procesarCancelacionCliente(
  clienteToken: string,
  motivo: string,
): Promise<CancelacionResult> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_confirmado, horario_confirmado_at, es_garantia, numero_serie_factura')
    .eq('cliente_token', clienteToken)
    .single()

  if (error || !sol) return { ok: false, error: 'Token inválido' }

  if (!ESTADOS_CANCELABLES_POR_CLIENTE.has(sol.estado)) {
    return { ok: false, estado_previo: sol.estado, error: `No se puede cancelar desde el estado "${sol.estado}"` }
  }

  const fueTarde = !!sol.tecnico_asignado_id

  // 1. Update solicitud a cancelada
  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      estado: 'cancelada',
      cancelado_at: new Date().toISOString(),
      cancelado_por: 'cliente',
      motivo_cancelacion: motivo.substring(0, 500),
      cancelado_tarde: fueTarde,
    })
    .eq('id', sol.id)

  if (updErr) {
    return { ok: false, estado_previo: sol.estado, error: `Error actualizando solicitud: ${updErr.message}` }
  }

  // registrarEvento:false — abajo se inserta el evento dedicado 'cancelacion'.
  await notificarCambioEstado(sol.id, sol.estado, 'cancelada', { registrarEvento: false })

  // 2. Invalidar notificaciones activas a técnicos (pre-aceptación)
  await supabase
    .from('notificaciones_whatsapp')
    .update({ estado: 'invalidado' })
    .eq('solicitud_id', sol.id)
    .eq('estado', 'enviado')

  // 3. Notificar al cliente (texto libre — está dentro de su 24h por la interacción)
  const equipo = equipoConGarantia(sol)
  const clienteNombre = sol.cliente_nombre.split(' ')[0]
  await enviarMensajeTexto(
    sol.cliente_telefono,
    `Hola ${clienteNombre}, hemos cancelado tu solicitud de ${equipo}. Si necesitas reagendarla más adelante, puedes crear una nueva solicitud en ${process.env.NEXT_PUBLIC_APP_URL || 'https://lineablanca.bairdservice.com'}/solicitar 🔧`,
  ).catch(err => console.error('[procesarCancelacionCliente] error notificando cliente:', err))

  // 4. Notificar al técnico asignado (si lo hay)
  if (sol.tecnico_asignado_id) {
    const { data: tec } = await supabase
      .from('tecnicos')
      .select('whatsapp, nombre_completo')
      .eq('id', sol.tecnico_asignado_id)
      .single()
    if (tec?.whatsapp) {
      const tecNombre = tec.nombre_completo.split(' ')[0]
      const horario = sol.horario_confirmado || 'sin horario confirmado'
      await enviarMensajeTexto(
        tec.whatsapp,
        `Hola ${tecNombre}, el cliente ${sol.cliente_nombre} canceló su servicio de ${equipo} (horario: ${horario}). Si ya estabas en camino o gastaste tiempo, repórtalo a Baird Service para gestionar la liquidación. — Baird Service`,
      ).catch(err => console.error('[procesarCancelacionCliente] error notificando técnico:', err))
    }
  }

  // 5. Audit
  await logEvento({
    solicitudId: sol.id,
    tipo: 'cancelacion',
    estadoPrevio: sol.estado,
    estadoNuevo: 'cancelada',
    actor: 'cliente',
    motivo,
    payload: {
      cancelado_tarde: fueTarde,
      tenia_tecnico_asignado: !!sol.tecnico_asignado_id,
      horario_confirmado: sol.horario_confirmado,
      es_garantia: sol.es_garantia,
    },
  })

  return { ok: true, estado_previo: sol.estado, cancelado_tarde: fueTarde }
}

export interface ReagendamientoResult {
  ok: boolean
  estado_previo?: string
  reagendamientos_count?: number
  error?: string
}

/**
 * Procesa un reagendamiento iniciado por el cliente.
 *
 * - Pre-aceptación (`pendiente_horario`, `notificada`): conserva el
 *   horario_token, invalida notificaciones activas a técnicos, vuelve a
 *   estado `notificada` con el nuevo horario y NO repuebla la cola
 *   (los técnicos verán el horario actualizado en el portal). Si no hay
 *   notifs activas, regresa a `pendiente_horario` para que el flujo normal
 *   las reenvíe.
 * - Post-aceptación (`asignada`): conserva técnico y estado, actualiza
 *   horario y notifica al técnico vía texto.
 */
export async function procesarReagendamientoCliente(
  clienteToken: string,
  nuevoHorario: string,
  motivo?: string,
): Promise<ReagendamientoResult> {
  const horarioLimpio = nuevoHorario.trim()
  if (!horarioLimpio || horarioLimpio.length > 200) {
    return { ok: false, error: 'Horario inválido' }
  }

  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_confirmado, reagendamientos_count, es_garantia, numero_serie_factura')
    .eq('cliente_token', clienteToken)
    .single()

  if (error || !sol) return { ok: false, error: 'Token inválido' }

  if (!ESTADOS_REAGENDABLES_POR_CLIENTE.has(sol.estado)) {
    return { ok: false, estado_previo: sol.estado, error: `No se puede reagendar desde el estado "${sol.estado}"` }
  }

  const count = sol.reagendamientos_count ?? 0
  if (count >= MAX_REAGENDAMIENTOS_CLIENTE) {
    return { ok: false, estado_previo: sol.estado, error: `Llegaste al máximo de ${MAX_REAGENDAMIENTOS_CLIENTE} reagendamientos. Contáctanos por WhatsApp para asistencia.` }
  }

  // Validación de agenda (agenda.service): mínimo mañana (TZ Colombia) +
  // cupo de MAX_RESERVAS_POR_FRANJA por slot. La propia solicitud no cuenta
  // contra su cupo (su fecha_visita_at previo se está reemplazando).
  const agenda = await validarHorarioAgendable(horarioLimpio, sol.id)
  if (!agenda.ok) {
    return { ok: false, estado_previo: sol.estado, error: agenda.error }
  }

  const horarioPrevio = sol.horario_confirmado
  const tieneTecnico = !!sol.tecnico_asignado_id

  // Determinar nuevo estado. Pre-aceptación mantenemos en notificada (si ya
  // notificamos) o pendiente_horario (si todavía no). Post-aceptación
  // conservamos el estado actual (asignada).
  const estadoNuevo = tieneTecnico
    ? sol.estado
    : sol.estado === 'pendiente_horario'
      ? 'pendiente_horario'
      : 'notificada'

  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      horario_confirmado: horarioLimpio,
      horario_confirmado_at: new Date().toISOString(),
      // fecha_visita_at se re-materializa con el nuevo horario (antes quedaba
      // stale: el mapa admin seguía mostrando la fecha vieja tras reagendar).
      fecha_visita_at: agenda.fechaVisitaAt,
      estado: estadoNuevo,
      reagendamientos_count: count + 1,
      ultimo_reagendado_at: new Date().toISOString(),
    })
    .eq('id', sol.id)

  if (updErr) {
    return { ok: false, estado_previo: sol.estado, error: `Error actualizando solicitud: ${updErr.message}` }
  }

  // Notificar a supervisores configurados (short-circuit si estadoNuevo === sol.estado).
  // registrarEvento:false — abajo se inserta el evento dedicado 'reagendamiento'.
  await notificarCambioEstado(sol.id, sol.estado, estadoNuevo, { registrarEvento: false })

  const equipo = equipoConGarantia(sol)
  const clienteNombre = sol.cliente_nombre.split(' ')[0]

  // Confirmar al cliente
  await enviarMensajeTexto(
    sol.cliente_telefono,
    `Hola ${clienteNombre} 👋 Tu servicio de ${equipo} fue reagendado para: ${horarioLimpio}. ${tieneTecnico ? 'Ya le avisamos al técnico asignado.' : 'Estamos buscando un técnico verificado y te avisamos cuando alguno acepte.'}`,
  ).catch(err => console.error('[procesarReagendamientoCliente] error notificando cliente:', err))

  // Notificar técnico asignado si lo hay
  if (tieneTecnico && sol.tecnico_asignado_id) {
    const { data: tec } = await supabase
      .from('tecnicos')
      .select('whatsapp, nombre_completo')
      .eq('id', sol.tecnico_asignado_id)
      .single()
    if (tec?.whatsapp) {
      const tecNombre = tec.nombre_completo.split(' ')[0]
      await enviarMensajeTexto(
        tec.whatsapp,
        `Hola ${tecNombre}, el cliente ${sol.cliente_nombre} reagendó el servicio de ${equipo}. Nuevo horario: ${horarioLimpio}. Si no puedes asistir, contáctanos por este chat.`,
      ).catch(err => console.error('[procesarReagendamientoCliente] error notificando técnico:', err))
    }
  }

  await logEvento({
    solicitudId: sol.id,
    tipo: 'reagendamiento',
    estadoPrevio: sol.estado,
    estadoNuevo,
    actor: 'cliente',
    motivo: motivo ?? null,
    payload: {
      horario_previo: horarioPrevio,
      horario_nuevo: horarioLimpio,
      tenia_tecnico_asignado: tieneTecnico,
      reagendamientos_count: count + 1,
    },
  })

  return { ok: true, estado_previo: sol.estado, reagendamientos_count: count + 1 }
}

/**
 * Notifica a los supervisores con visibilidad del servicio que su FECHA fue
 * reprogramada por el admin (plantilla supervisor_reagendamiento_v1). Mismo
 * filtrado por ámbito/marca que notificarCambioEstado, pero SIN filtro por
 * `estados`: no es un cambio de estado sino un evento on-demand (igual que
 * notificarRepuestoSupervisores). Funciona fuera de la ventana 24h (los
 * supervisores no chatean con el número del negocio). NUNCA lanza.
 *
 * ⚠️ El bloque de parámetros (6) está duplicado a propósito respecto a otras
 * plantillas de supervisor para no acoplar paths. Si cambian los params de
 * supervisor_reagendamiento_v1, actualizar aquí y en scripts/upload-templates.mjs.
 */
async function notificarReagendamientoSupervisores(
  sol: {
    cliente_nombre: string
    tipo_equipo: string | null
    marca_equipo: string | null
    ciudad_pueblo: string | null
    es_garantia: boolean | null
    numero_serie_factura: string | null
  },
  nuevoHorario: string,
): Promise<{ enviados: number; total: number }> {
  try {
    const { data: supervisores } = await supabase
      .from('supervisores')
      .select('nombre, whatsapp, ambito, marca')
      .eq('activo', true)
    if (!supervisores || supervisores.length === 0) return { enviados: 0, total: 0 }

    const marcaSol = normalizeForMatch(sol.marca_equipo ?? '')
    const destinatarios = supervisores.filter(s => {
      if (s.ambito === 'garantia' && !sol.es_garantia) return false
      if (s.ambito === 'particular' && sol.es_garantia) return false
      if (s.marca && normalizeForMatch(s.marca) !== marcaSol) return false
      return true
    })
    if (destinatarios.length === 0) return { enviados: 0, total: 0 }

    const tipoFlujo = sol.es_garantia ? 'Garantía' : 'Particular'

    const results = await Promise.all(
      destinatarios.map(async s => {
        try {
          await enviarPlantilla(s.whatsapp, 'supervisor_reagendamiento_v1', 'es', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: s.nombre.split(' ')[0] },
                { type: 'text', text: sol.cliente_nombre },
                { type: 'text', text: equipoConGarantia(sol) },
                { type: 'text', text: sol.ciudad_pueblo ?? '—' },
                { type: 'text', text: tipoFlujo },
                { type: 'text', text: nuevoHorario },
              ],
            },
          ])
          return true
        } catch (err) {
          console.error(`[notificarReagendamientoSupervisores] Error notificando a ${s.nombre}:`, err)
          return false
        }
      }),
    )
    return { enviados: results.filter(Boolean).length, total: destinatarios.length }
  } catch (err) {
    console.error('[notificarReagendamientoSupervisores] Error general:', err)
    return { enviados: 0, total: 0 }
  }
}

export interface ReagendamientoAdminResult {
  ok: boolean
  error?: string
  estado?: string
  horarioPrevio?: string | null
  teniaTecnico?: boolean
  clienteNotificado?: boolean
  tecnicoNotificado?: boolean
  supervisores?: { enviados: number; total: number }
}

/**
 * Reagendamiento iniciado por el ADMIN desde el panel
 * (/admin/solicitudes/[id], POST /api/admin/reagendar-solicitud).
 *
 * A diferencia de `procesarReagendamientoCliente`:
 *   - Se identifica por `id` (no por cliente_token) y NO aplica el cap de
 *     MAX_REAGENDAMIENTOS_CLIENTE: el admin puede forzar.
 *   - NO cambia el estado del servicio (solo mueve la fecha). Por eso notifica a
 *     supervisores con plantilla propia (supervisor_reagendamiento_v1) en vez de
 *     depender de notificarCambioEstado, que solo dispara si el estado cambia.
 *   - `fecha_visita_at` ya viene materializado (agenda.service) para que la vista
 *     de calendario del panel ubique el servicio en su slot.
 *
 * Notifica a los tres: cliente y técnico por texto libre (mejor esfuerzo dentro
 * de la ventana 24h), supervisores por plantilla (fuera de ventana). NUNCA lanza
 * por un fallo de notificación — la fecha ya quedó guardada.
 */
export async function procesarReagendamientoAdmin(
  solicitudId: string,
  nuevoHorario: string,
  fechaVisitaAt: string | null,
): Promise<ReagendamientoAdminResult> {
  const horarioLimpio = nuevoHorario.trim()
  if (!horarioLimpio || horarioLimpio.length > 200) {
    return { ok: false, error: 'Horario inválido' }
  }

  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, horario_confirmado, reagendamientos_count, es_garantia, numero_serie_factura')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }

  // El admin fuerza fecha/franja, pero reprogramar un servicio ya cerrado
  // (completado/cancelado/etc.) casi siempre es un error de clic — se bloquea.
  if (ESTADOS_TERMINALES.has(sol.estado)) {
    return {
      ok: false,
      estado: sol.estado,
      error: `No se puede reprogramar un servicio en estado "${ESTADO_LABELS[sol.estado] ?? sol.estado}"`,
    }
  }

  const count = sol.reagendamientos_count ?? 0
  const horarioPrevio = sol.horario_confirmado
  const tieneTecnico = !!sol.tecnico_asignado_id
  const now = new Date().toISOString()

  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      horario_confirmado: horarioLimpio,
      horario_confirmado_at: now,
      // Materializa el slot para la vista de calendario (mismo timestamp que el
      // cupo de agenda.service). Antes el admin editaba horario como texto libre
      // y fecha_visita_at quedaba stale → el servicio no aparecía en el calendario.
      fecha_visita_at: fechaVisitaAt,
      ultimo_reagendado_at: now,
      reagendamientos_count: count + 1,
    })
    .eq('id', sol.id)

  if (updErr) {
    return { ok: false, estado: sol.estado, error: `Error actualizando solicitud: ${updErr.message}` }
  }

  const equipo = equipoConGarantia(sol)
  const clienteNombre = sol.cliente_nombre.split(' ')[0]

  // Cliente — texto libre (mejor esfuerzo dentro de la ventana 24h).
  let clienteNotificado = false
  try {
    await enviarMensajeTexto(
      sol.cliente_telefono,
      `Hola ${clienteNombre} 👋 Reprogramamos tu servicio de ${equipo}. 📅 Nueva fecha: ${horarioLimpio}. ${tieneTecnico ? 'Ya le avisamos al técnico asignado.' : 'Estamos buscando un técnico verificado y te avisamos cuando alguno acepte.'}`,
    )
    clienteNotificado = true
  } catch (err) {
    console.error('[procesarReagendamientoAdmin] error notificando cliente:', err)
  }

  // Técnico asignado — texto libre.
  let tecnicoNotificado = false
  if (tieneTecnico && sol.tecnico_asignado_id) {
    const { data: tec } = await supabase
      .from('tecnicos')
      .select('whatsapp, nombre_completo')
      .eq('id', sol.tecnico_asignado_id)
      .single()
    if (tec?.whatsapp) {
      const tecNombre = tec.nombre_completo.split(' ')[0]
      try {
        await enviarMensajeTexto(
          tec.whatsapp,
          `Hola ${tecNombre}, Baird reprogramó el servicio de ${sol.cliente_nombre} (${equipo}). 📅 Nueva fecha: ${horarioLimpio}. Si no puedes asistir, contáctanos por este chat.`,
        )
        tecnicoNotificado = true
      } catch (err) {
        console.error('[procesarReagendamientoAdmin] error notificando técnico:', err)
      }
    }
  }

  // Supervisores — plantilla (fuera de la ventana 24h).
  const supervisores = await notificarReagendamientoSupervisores(sol, horarioLimpio)

  return {
    ok: true,
    estado: sol.estado,
    horarioPrevio,
    teniaTecnico: tieneTecnico,
    clienteNotificado,
    tecnicoNotificado,
    supervisores,
  }
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
