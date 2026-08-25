import { NextRequest, NextResponse } from 'next/server'
import { enviarMensajeTexto, verificarFirmaWebhook } from '@/lib/services/whatsapp.service'

// Número que recibe la alerta de cada mensaje entrante a la línea (2026-08-23).
// Mensaje libre (no plantilla): solo llega si este número tiene ventana de 24h
// abierta con la línea — basta con que le escriba cualquier cosa a la línea de
// vez en cuando. El fallo queda en logs, nunca rompe el webhook.
const ALERTA_ENTRANTES_PHONE = process.env.WHATSAPP_ALERT_PHONE ?? '573153019192'

type WebhookMessage = {
  from?: string
  type?: string
  timestamp?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
}

function describirContenido(msg: WebhookMessage): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? '(texto vacío)'
    case 'button':
      return `[Botón] ${msg.button?.text ?? ''}`.trim()
    case 'interactive':
      return `[Respuesta] ${msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? ''}`.trim()
    case 'image':
      return `[Imagen]${msg.image?.caption ? ` ${msg.image.caption}` : ''}`
    case 'video':
      return `[Video]${msg.video?.caption ? ` ${msg.video.caption}` : ''}`
    case 'audio':
      return '[Audio / nota de voz]'
    case 'document':
      return `[Documento] ${msg.document?.filename ?? ''}${msg.document?.caption ? ` — ${msg.document.caption}` : ''}`.trim()
    case 'location': {
      const loc = msg.location
      const etiqueta = [loc?.name, loc?.address].filter(Boolean).join(', ')
      return `[Ubicación] ${etiqueta || `${loc?.latitude ?? '?'}, ${loc?.longitude ?? '?'}`}`
    }
    case 'sticker':
      return '[Sticker]'
    case 'contacts':
      return '[Contacto compartido]'
    default:
      return `[${msg.type ?? 'mensaje'}]`
  }
}

/**
 * GET /api/whatsapp/webhook
 *
 * Verificación del webhook requerida por Meta al configurarlo en el panel.
 * Meta hace un GET con hub.mode, hub.verify_token y hub.challenge.
 * Si el verify_token coincide, responde con hub.challenge para confirmar.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Verificación exitosa')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[Webhook] Verificación fallida — token incorrecto')
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST /api/whatsapp/webhook
 *
 * Recibe eventos de la API de WhatsApp (mensajes entrantes de usuarios).
 * Actualmente solo se usa para verificar que la infraestructura funcione.
 *
 * La lógica de aceptación ocurre en /api/whatsapp/accept (cuando el técnico
 * abre el link /aceptar/{token} desde su browser), NO desde aquí.
 *
 * Si en el futuro se usan botones interactivos o respuestas de texto en lugar
 * de links, este handler procesaría los button_reply events.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // Verificar firma obligatoria (rechazar requests sin firma o con firma inválida)
    const signature = req.headers.get('x-hub-signature-256')
    if (!signature || !verificarFirmaWebhook(rawBody, signature)) {
      console.warn('[Webhook] Firma ausente o inválida — request rechazado')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = JSON.parse(rawBody)

    // Meta envía un ping de prueba con este formato — responder 200 siempre
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' })
    }

    // Log del evento para debugging (sin procesar lógica de negocio aquí aún)
    const entries = body.entry ?? []
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? []
        const contacts: { wa_id?: string; profile?: { name?: string } }[] = change.value?.contacts ?? []
        for (const msg of messages) {
          console.log(`[Webhook] Mensaje de ${msg.from}: tipo=${msg.type}`)

          // Alerta al admin por cada mensaje entrante (2026-08-23). Best-effort:
          // si el envío falla (p.ej. ventana de 24h cerrada con el admin) solo
          // se loguea — el webhook siempre responde 200 a Meta.
          if (msg.from && msg.from !== ALERTA_ENTRANTES_PHONE) {
            const nombre = contacts.find(c => c.wa_id === msg.from)?.profile?.name
            const alerta =
              `🔔 Esta persona necesita atención con un servicio.\n\n` +
              `👤 ${nombre ?? 'Sin nombre'}\n` +
              `📱 +${msg.from}\n` +
              `💬 ${describirContenido(msg as WebhookMessage)}`
            try {
              await enviarMensajeTexto(ALERTA_ENTRANTES_PHONE, alerta)
            } catch (err) {
              console.error(
                `[Webhook] Alerta de mensaje entrante NO enviada a ${ALERTA_ENTRANTES_PHONE}:`,
                err instanceof Error ? err.message : String(err),
              )
            }
          }
        }

        // Detección de envíos fallidos (2026-08-07). Meta acepta el POST de
        // enviarPlantilla (200 + wamid) aunque el número no exista — el fallo
        // real llega DESPUÉS por acá como status=failed (p.ej. error 131026
        // "message undeliverable" cuando el número no tiene WhatsApp o está
        // mal digitado). Caso real: cliente tipeó su celular con 9 dígitos,
        // la cotización "se envió" dos veces y nunca llegó. Este log hace el
        // fallo visible en los runtime logs de Vercel (buscar "UNDELIVERED").
        const statuses = change.value?.statuses ?? []
        for (const st of statuses) {
          if (st.status === 'failed') {
            const errores = (st.errors ?? [])
              .map((e: { code?: number; title?: string; message?: string }) =>
                `${e.code ?? '?'} ${e.title ?? e.message ?? ''}`.trim())
              .join('; ')
            console.error(
              `[Webhook] ⚠️ UNDELIVERED — mensaje ${st.id} a ${st.recipient_id} FALLÓ: ${errores || 'sin detalle'}. ` +
              `Revisar cliente_telefono/whatsapp del destinatario en la BD (¿número incompleto o sin WhatsApp?).`,
            )
          }
        }
      }
    }

    // Meta requiere respuesta 200 inmediata
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Webhook] Error procesando evento:', error)
    // Aún así respondemos 200 para evitar reintentos de Meta
    return NextResponse.json({ status: 'error_logged' })
  }
}
