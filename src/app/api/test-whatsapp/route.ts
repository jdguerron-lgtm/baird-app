import { NextResponse } from 'next/server'
import { WA_API_BASE, notificarTecnicos } from '@/lib/services/whatsapp.service'

/**
 * GET /api/test-whatsapp  — diagnóstico de configuración WhatsApp en runtime.
 *
 * Existe porque el fallo "no llega ningún WhatsApp" casi nunca es un bug de
 * código: es una env var mal seteada en el entorno donde corre la app
 * (típicamente Vercel prod). Este endpoint reporta, SIN filtrar secretos, el
 * estado real que ve el runtime:
 *   - presencia de WHATSAPP_PHONE_ID / WHATSAPP_API_TOKEN
 *   - si BAIRD_TEST_PHONE_WHITELIST está set (causa #1: silencia TODOS los envíos)
 *   - validez del token (debug_token: is_valid, app_id, expiración)
 *   - salud del número (quality_rating, name_status)
 *
 * Mismo gate que el POST: ENABLE_TEST_ENDPOINTS=true + Bearer CRON_SECRET.
 * Hit desde prod: `curl -H "Authorization: Bearer $CRON_SECRET"
 *   https://lineablanca.bairdservice.com/api/test-whatsapp`
 */
export async function GET(request: Request) {
  try {
    if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const phoneId = process.env.WHATSAPP_PHONE_ID
    const token = process.env.WHATSAPP_API_TOKEN
    const whitelistRaw = process.env.BAIRD_TEST_PHONE_WHITELIST?.trim()
    const whitelistEntries = whitelistRaw
      ? whitelistRaw.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean)
      : []

    // La causa #1 de "no se envía nada": whitelist prendida en prod. Si hay
    // entradas, TODO envío a un número fuera de la lista se descarta en silencio.
    const diagnostico: Record<string, unknown> = {
      env: {
        WHATSAPP_PHONE_ID_present: !!phoneId,
        WHATSAPP_API_TOKEN_present: !!token,
        WHATSAPP_API_TOKEN_length: token?.length ?? 0,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
      },
      whitelist: {
        // ⚠️ Si active=true en producción: ESA es la razón por la que no llega
        // ningún WhatsApp. Borrar/vaciar BAIRD_TEST_PHONE_WHITELIST en Vercel.
        active: whitelistEntries.length > 0,
        entries: whitelistEntries.length,
      },
    }

    if (!phoneId || !token) {
      diagnostico.veredicto = 'FALTAN_ENV_VARS — WHATSAPP_PHONE_ID y/o WHATSAPP_API_TOKEN no están definidas en este entorno.'
      return NextResponse.json(diagnostico, { status: 200 })
    }

    // Validar token + número contra la Graph API (fuente de verdad de Meta).
    const [tokenRes, phoneRes] = await Promise.allSettled([
      fetch(`${WA_API_BASE}/debug_token?input_token=${token}&access_token=${token}`),
      fetch(`${WA_API_BASE}/${phoneId}?fields=verified_name,display_phone_number,quality_rating,name_status,platform_type,code_verification_status&access_token=${token}`),
    ])

    if (tokenRes.status === 'fulfilled') {
      const body = await tokenRes.value.json().catch(() => ({}))
      const d = body?.data ?? {}
      diagnostico.token = {
        is_valid: d.is_valid ?? false,
        app_id: d.app_id ?? null,
        type: d.type ?? null,
        expires_at: d.expires_at ?? null, // 0 = permanente (System User)
        error: body?.error ?? null,
      }
    } else {
      diagnostico.token = { error: 'No se pudo consultar debug_token', reason: String(tokenRes.reason) }
    }

    if (phoneRes.status === 'fulfilled') {
      const body = await phoneRes.value.json().catch(() => ({}))
      diagnostico.phone = body?.error ? { error: body.error } : body
    } else {
      diagnostico.phone = { error: 'No se pudo consultar el número', reason: String(phoneRes.reason) }
    }

    // Veredicto legible de un vistazo.
    const tokenOk = (diagnostico.token as { is_valid?: boolean })?.is_valid === true
    if (whitelistEntries.length > 0) {
      diagnostico.veredicto = `WHITELIST_ACTIVA — BAIRD_TEST_PHONE_WHITELIST tiene ${whitelistEntries.length} número(s). Todo envío fuera de esa lista se descarta en silencio. Vaciarla en Vercel para reanudar envíos.`
    } else if (!tokenOk) {
      diagnostico.veredicto = 'TOKEN_INVALIDO — el WHATSAPP_API_TOKEN de este entorno no es válido para Meta (revisar/rotar en Vercel).'
    } else {
      diagnostico.veredicto = 'OK — token válido y sin whitelist. La configuración de este entorno permite enviar.'
    }

    return NextResponse.json(diagnostico, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Endpoint de prueba: apagado por defecto en producción (defensa en
    // profundidad sobre el CRON_SECRET). Para usarlo manualmente, setear
    // ENABLE_TEST_ENDPOINTS=true en el entorno. Sin la flag → 404 (no revela
    // que el endpoint existe).
    if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

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
