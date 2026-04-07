import { NextResponse } from 'next/server'
import { WA_API_BASE, notificarTecnicos } from '@/lib/services/whatsapp.service'

export async function POST(request: Request) {
  try {
    const { to, solicitudId } = await request.json()

    // Mode 2: Test full notificarTecnicos flow with a real solicitud
    if (solicitudId) {
      try {
        const result = await notificarTecnicos(solicitudId)
        return NextResponse.json({
          success: true,
          mode: 'notificarTecnicos',
          ...result,
        })
      } catch (err) {
        return NextResponse.json({
          error: 'notificarTecnicos failed',
          message: err instanceof Error ? err.message : String(err),
        }, { status: 500 })
      }
    }

    // Mode 1: Simple text message test
    if (!to) {
      return NextResponse.json({ error: 'Missing "to" phone number or "solicitudId"' }, { status: 400 })
    }

    const phoneId = process.env.WHATSAPP_PHONE_ID
    const token = process.env.WHATSAPP_API_TOKEN

    if (!phoneId || !token) {
      return NextResponse.json(
        { error: 'WhatsApp env vars not configured', phoneId: !!phoneId, token: !!token },
        { status: 500 }
      )
    }

    // Strip non-digits, ensure Colombian format
    const digits = to.replace(/\D/g, '')
    const normalized = digits.startsWith('57') ? digits : `57${digits}`

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalized,
      type: 'text',
      text: {
        body: '✅ *Baird Service — Mensaje de prueba*\n\nEste es un mensaje de verificacion.\nTu sistema de WhatsApp esta funcionando correctamente.\n\n🔧 Baird Service — Red de tecnicos verificados',
        preview_url: false,
      },
    }

    const res = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'WhatsApp API error', status: res.status, details: data },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, messageId: data.messages?.[0]?.id, data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
