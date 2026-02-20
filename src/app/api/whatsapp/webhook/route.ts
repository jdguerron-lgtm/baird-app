import { NextRequest, NextResponse } from 'next/server'
import { verificarFirmaWebhook } from '@/lib/services/whatsapp.service'

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

    // Verificar firma para seguridad (rechazar requests no auténticos de Meta)
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    if (signature && !verificarFirmaWebhook(rawBody, signature)) {
      console.warn('[Webhook] Firma inválida — request rechazado')
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
        for (const msg of messages) {
          console.log(`[Webhook] Mensaje de ${msg.from}: tipo=${msg.type}`)
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
