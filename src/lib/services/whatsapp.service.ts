import { supabase } from '@/lib/supabase'
import crypto from 'crypto'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'
import { phoneToDigits, isMobileColombiano } from '@/lib/utils/phone'
import { formatCOP, normalizeForMatch, cityTokenForMatch } from '@/lib/utils/format'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'
import {
  ESTADOS_CANCELABLES_POR_CLIENTE,
  ESTADOS_REAGENDABLES_POR_CLIENTE,
  MAX_REAGENDAMIENTOS_CLIENTE,
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
function isPhoneAllowed(rawPhone: string): boolean {
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
    .select('id, nombre_completo, whatsapp, ciudad_pueblo, estado_verificacion')
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

  const tecnicos = tecnicosVerificados.filter(t => {
    if (!ciudadNorm) return true
    const tecCiudad = cityTokenForMatch(t.ciudad_pueblo ?? '')
    if (!tecCiudad) return false
    return tecCiudad.includes(ciudadNorm) || ciudadNorm.includes(tecCiudad)
  })

  if (tecnicos.length === 0) {
    const ciudades = tecnicosVerificados.map(t => `${t.nombre_completo}: "${t.ciudad_pueblo}"`)
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

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
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
        return enviarPlantilla(tecnico.whatsapp, 'nueva_solicitud_v3', 'es', [
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
      return enviarPlantilla(tecnico.whatsapp, 'solicitud_particular_tecnico_v1', 'es', [
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

  // 2. Fetch solicitud to determine flow type BEFORE atomic update
  const { data: solPreview } = await supabase
    .from('solicitudes_servicio')
    .select('es_garantia')
    .eq('id', notif.solicitud_id)
    .single()

  // Non-warranty: goes to diagnostico_pendiente; Warranty: goes to asignada
  const estadoAsignacion = solPreview?.es_garantia === false ? 'diagnostico_pendiente' : 'asignada'

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

  // 4. Notificar al técnico ganador con los datos del cliente
  const clienteDigits = phoneToDigits(sol.cliente_telefono)

  if (tecnico) {
    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const direccion = `${sol.direccion}, ${sol.zona_servicio}`
    // Pago mostrado al técnico tras ganar el servicio.
    //
    // Garantía: mostramos el pago MÍNIMO neto al técnico sin revelar que es
    // MABE ni el desglose tarifa/bono/margen — esa info es privada de Baird.
    // El monto real puede subir según complejidad real + bonos por entrega
    // a tiempo y satisfacción del cliente.
    //
    // Particular: el cliente ya pagó la tarifa de diagnóstico por adelantado;
    // se la mostramos al técnico para que sepa cuánto recibió Baird.
    const pago = sol.es_garantia
      ? `Servicio en garantía — pago desde $${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)} COP`
      : `$${formatCOP(sol.pago_tecnico)} COP`
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    // Send assignment template to technician (with client contact + portal link)
    await logEnvio(
      enviarPlantilla(tecnico.whatsapp, 'servicio_asignado_tecnico_v3', 'es', [
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
      'procesarAceptacion → servicio_asignado_tecnico_v3',
    )
  }

  // 5. Notificar al cliente con los datos del técnico
  const tecnicoDigits = phoneToDigits(tecnico?.whatsapp ?? '')
  const horarioServicio = sol.horario_confirmado || sol.horario_visita_1 || 'Por coordinar'

  if (sol.es_garantia) {
    // ── WARRANTY FLOW: template v5 with schedule + no-pay warning + T&C link ──
    await logEnvio(
      enviarPlantilla(sol.cliente_telefono, 'tecnico_asignado_cliente_v5', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico?.nombre_completo ?? 'Asignado' },
            { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
            { type: 'text', text: horarioServicio },
            { type: 'text', text: `+${tecnicoDigits}` },
          ],
        },
      ]),
      'procesarAceptacion → tecnico_asignado_cliente_v5',
    )
  } else {
    // ── NON-WARRANTY (PARTICULAR) FLOW: template with diagnostic fee info ──
    const tarifaDiagnostico = formatCOP(sol.pago_tecnico)
    const anticipo = formatCOP(Math.round(sol.pago_tecnico * 0.5))

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
 * Envía la plantilla cliente_seleccion_horario_v1 al cliente con las 2 opciones
 * de horario propuestas en su solicitud y un CTA a /horario/{token}.
 */
export async function enviarSeleccionHorarioCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_visita_1, horario_visita_2, horario_token, horario_confirmado_at, estado')
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

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
  const cliente = sol.cliente_nombre.split(' ')[0]

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'cliente_seleccion_horario_v1', 'es', [
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
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_token, horario_recordatorio_at')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }
  if (!sol.horario_token) return { ok: false, error: 'horario_token no existe' }
  if (sol.horario_recordatorio_at) return { ok: false, error: 'Recordatorio ya enviado' }

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
  const cliente = sol.cliente_nombre.split(' ')[0]

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'recordatorio_horario_v1', 'es', [
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
 * Envía la plantilla verificar_siguiente_paso_v1 al cliente para que apruebe
 * el siguiente paso propuesto por el técnico (solo flujo garantía).
 */
export async function enviarVerificacionPasoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id, triaje_resultado, siguiente_paso, siguiente_paso_detalle, verificacion_paso_token')
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

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo?.split(' ')[0] ?? 'Técnico'

  try {
    const result = await enviarPlantilla(sol.cliente_telefono, 'verificar_siguiente_paso_v1', 'es', [
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
export async function enviarRepuestoRecibidoCliente(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id')
    .eq('id', solicitudId)
    .single()

  if (error || !sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
  const cliente = sol.cliente_nombre.split(' ')[0]
  const tecnico = tec?.nombre_completo ?? 'Técnico asignado'

  try {
    const r = await enviarPlantilla(sol.cliente_telefono, 'repuesto_recibido_cliente_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cliente },
          { type: 'text', text: equipo },
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
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
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
 * Notifica al cliente que el equipo no es reparable (terminal).
 */
export async function enviarFinalizadoSinReparacion(
  solicitudId: string,
  motivoTecnico: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id')
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' }

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
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

  const cot = sol.cotizacion as { diagnostico_tecnico: string; mano_obra: number; repuestos: number; total: number; token: string }

  // Get technician name
  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('nombre_completo')
    .eq('id', sol.tecnico_asignado_id)
    .single()

  try {
    const result = await enviarPlantilla(sol.cliente_telefono, 'cotizacion_cliente_v1', 'es', [
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
    const r = await enviarPlantilla(tecnico.whatsapp, 'cotizacion_aprobada_tecnico_v1', 'es', [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombreTecnico },
          { type: 'text', text: sol.cliente_nombre },
          { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
          { type: 'text', text: formatCOP(cot.total) },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: tecnico.portal_token ?? '' }],
      },
    ])
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
  tipo: 'cancelacion' | 'reagendamiento' | 'reagendamiento_confirmado' | 'cancelacion_revertida' | 'cambio_estado_admin' | 'nota_admin'
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
 * - Estado final = 'cancelada' (no se distingue cancelada_cliente que está
 *   reservado para la rama post-diagnóstico actual).
 */
export async function procesarCancelacionCliente(
  clienteToken: string,
  motivo: string,
): Promise<CancelacionResult> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_confirmado, horario_confirmado_at, es_garantia')
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

  // 2. Invalidar notificaciones activas a técnicos (pre-aceptación)
  await supabase
    .from('notificaciones_whatsapp')
    .update({ estado: 'invalidado' })
    .eq('solicitud_id', sol.id)
    .eq('estado', 'enviado')

  // 3. Notificar al cliente (texto libre — está dentro de su 24h por la interacción)
  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
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
 * - Post-aceptación (`asignada`, `diagnostico_pendiente`,
 *   `reagendamiento_pendiente`): conserva técnico, actualiza horario,
 *   notifica al técnico vía texto. Estado pasa a `reagendamiento_pendiente`
 *   transitoriamente y regresa al estado pre-reagendamiento (asignada o
 *   diagnostico_pendiente) inmediatamente — preservando el flujo.
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
    .select('id, estado, tecnico_asignado_id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_confirmado, reagendamientos_count, es_garantia')
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

  const horarioPrevio = sol.horario_confirmado
  const tieneTecnico = !!sol.tecnico_asignado_id

  // Determinar nuevo estado. Pre-aceptación mantenemos en notificada (si ya
  // notificamos) o pendiente_horario (si todavía no). Post-aceptación
  // conservamos el estado actual (asignada / diagnostico_pendiente).
  const estadoNuevo = tieneTecnico
    ? sol.estado === 'reagendamiento_pendiente'
      ? (sol.es_garantia ? 'asignada' : 'diagnostico_pendiente')
      : sol.estado
    : sol.estado === 'pendiente_horario'
      ? 'pendiente_horario'
      : 'notificada'

  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      horario_confirmado: horarioLimpio,
      horario_confirmado_at: new Date().toISOString(),
      estado: estadoNuevo,
      reagendamientos_count: count + 1,
      ultimo_reagendado_at: new Date().toISOString(),
    })
    .eq('id', sol.id)

  if (updErr) {
    return { ok: false, estado_previo: sol.estado, error: `Error actualizando solicitud: ${updErr.message}` }
  }

  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
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
