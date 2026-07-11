import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { phoneToDigits, isValidPhone } from '@/lib/utils/phone'
import { hashCodigoSupervisor } from '@/lib/auth/supervisor'
import { enviarCodigoSupervisor } from '@/lib/services/whatsapp.service'

/**
 * POST /api/supervisor/enviar-codigo — paso 1 de la entrada de autoservicio
 * al portal de supervisores (/supervisor).
 *
 * Body: { telefono: string }
 *
 * Verifica que el número pertenezca a un supervisor ACTIVO, genera un OTP de
 * 6 dígitos (expira en 10 min, máx 5 intentos de verificación) y lo envía por
 * WhatsApp con la plantilla supervisor_codigo_v1 (AUTHENTICATION, APPROVED).
 * Solo se persiste el hash del código — ver hashCodigoSupervisor.
 *
 * Anti-abuso: cooldown de 60s por supervisor (codigo_acceso_enviado_at) +
 * rate limit por IP en middleware. El endpoint REVELA si el número pertenece
 * o no a un supervisor — decisión de producto explícita (el mensaje "este
 * número no está asociado a ningún supervisor" es requisito de UX); el rate
 * limit acota la enumeración.
 */
const CODIGO_TTL_MIN = 10
const REENVIO_COOLDOWN_MS = 60_000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const telefonoRaw = typeof body.telefono === 'string' ? body.telefono : ''

    if (!telefonoRaw || !isValidPhone(telefonoRaw)) {
      return NextResponse.json(
        { error: 'Ingresa un número de WhatsApp válido.' },
        { status: 400 },
      )
    }

    // supervisores.whatsapp se guarda como dígitos con país (trigger BD
    // normalizar_telefono_co) — normalizamos el input al mismo formato.
    const digits = phoneToDigits(telefonoRaw)

    const { data: sup, error } = await supabase
      .from('supervisores')
      .select('id, nombre, whatsapp, activo, codigo_acceso_enviado_at')
      .eq('whatsapp', digits)
      .maybeSingle()

    if (error) {
      console.error('[supervisor/enviar-codigo] Error consultando supervisor:', error.message)
      return NextResponse.json(
        { error: 'No pudimos verificar tu número en este momento. Intenta de nuevo.' },
        { status: 500 },
      )
    }

    if (!sup) {
      return NextResponse.json(
        { error: 'Lo sentimos, este número no está asociado a ningún supervisor. Verifica que sea el mismo WhatsApp donde recibes los avisos de Baird Service.' },
        { status: 404 },
      )
    }

    if (!sup.activo) {
      return NextResponse.json(
        { error: 'Tu acceso de supervisor está desactivado. Contacta al equipo Baird para reactivarlo.' },
        { status: 403 },
      )
    }

    // Cooldown de reenvío: evita spamear WhatsApp (cada envío tiene costo) y
    // frena el abuso aunque el rate limit por IP se salte con proxies.
    if (sup.codigo_acceso_enviado_at) {
      const desde = Date.now() - new Date(sup.codigo_acceso_enviado_at).getTime()
      if (desde >= 0 && desde < REENVIO_COOLDOWN_MS) {
        const espera = Math.ceil((REENVIO_COOLDOWN_MS - desde) / 1000)
        return NextResponse.json(
          { error: `Ya te enviamos un código hace poco. Espera ${espera}s para pedir otro.` },
          { status: 429 },
        )
      }
    }

    // OTP de 6 dígitos criptográficamente aleatorio (permite ceros a la izquierda)
    const codigo = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')

    const { error: updErr } = await supabase
      .from('supervisores')
      .update({
        codigo_acceso_hash: hashCodigoSupervisor(sup.id, codigo),
        codigo_acceso_expira_at: new Date(Date.now() + CODIGO_TTL_MIN * 60_000).toISOString(),
        codigo_acceso_intentos: 0,
        codigo_acceso_enviado_at: new Date().toISOString(),
      })
      .eq('id', sup.id)

    if (updErr) {
      console.error('[supervisor/enviar-codigo] Error guardando código:', updErr.message)
      return NextResponse.json(
        { error: 'No pudimos generar tu código. Intenta de nuevo en un momento.' },
        { status: 500 },
      )
    }

    const wa = await enviarCodigoSupervisor(sup.whatsapp, codigo)
    if (!wa.ok) {
      console.error('[supervisor/enviar-codigo] WhatsApp falló:', wa.error)
      // Invalidar el código que no llegó — evita estados confusos donde el
      // supervisor pide otro y el viejo sigue vigente.
      await supabase
        .from('supervisores')
        .update({ codigo_acceso_hash: null, codigo_acceso_expira_at: null })
        .eq('id', sup.id)
      return NextResponse.json(
        { error: 'No pudimos enviarte el código por WhatsApp. Intenta de nuevo en unos minutos o contacta al equipo Baird.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      expira_en_minutos: CODIGO_TTL_MIN,
      nombre: sup.nombre.split(' ')[0],
    })
  } catch (error) {
    console.error('[supervisor/enviar-codigo] Error:', error)
    return NextResponse.json(
      { error: 'Error interno. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
