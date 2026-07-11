import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { phoneToDigits, isValidPhone } from '@/lib/utils/phone'
import { hashCodigoSupervisor, compararHashCodigo } from '@/lib/auth/supervisor'

/**
 * POST /api/supervisor/verificar-codigo — paso 2 de la entrada de autoservicio
 * al portal de supervisores (/supervisor).
 *
 * Body: { telefono: string, codigo: string }
 *
 * Valida el OTP contra el hash persistido (tiempo constante). Si es correcto,
 * invalida el código y devuelve la URL del portal del supervisor
 * (/supervisor/{portal_token} — el portal_token sigue siendo la credencial,
 * mismo modelo que el link mágico que envía el admin).
 *
 * Controles: expiración 10 min, máximo MAX_INTENTOS intentos por código (al
 * agotarse se invalida), rate limit por IP en middleware.
 */
const MAX_INTENTOS = 5

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const telefonoRaw = typeof body.telefono === 'string' ? body.telefono : ''
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''

    if (!telefonoRaw || !isValidPhone(telefonoRaw)) {
      return NextResponse.json(
        { error: 'Ingresa un número de WhatsApp válido.' },
        { status: 400 },
      )
    }
    if (!/^\d{6}$/.test(codigo)) {
      return NextResponse.json(
        { error: 'El código debe tener exactamente 6 dígitos.' },
        { status: 400 },
      )
    }

    const digits = phoneToDigits(telefonoRaw)

    const { data: sup, error } = await supabase
      .from('supervisores')
      .select('id, activo, portal_token, codigo_acceso_hash, codigo_acceso_expira_at, codigo_acceso_intentos')
      .eq('whatsapp', digits)
      .maybeSingle()

    if (error) {
      console.error('[supervisor/verificar-codigo] Error consultando supervisor:', error.message)
      return NextResponse.json(
        { error: 'No pudimos verificar tu código en este momento. Intenta de nuevo.' },
        { status: 500 },
      )
    }

    if (!sup) {
      return NextResponse.json(
        { error: 'Lo sentimos, este número no está asociado a ningún supervisor.' },
        { status: 404 },
      )
    }
    if (!sup.activo) {
      return NextResponse.json(
        { error: 'Tu acceso de supervisor está desactivado. Contacta al equipo Baird para reactivarlo.' },
        { status: 403 },
      )
    }

    if (!sup.codigo_acceso_hash || !sup.codigo_acceso_expira_at) {
      return NextResponse.json(
        { error: 'No hay un código vigente para este número. Solicita uno nuevo.' },
        { status: 400 },
      )
    }

    if (new Date(sup.codigo_acceso_expira_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'El código expiró. Solicita uno nuevo.' },
        { status: 410 },
      )
    }

    const intentos = sup.codigo_acceso_intentos ?? 0
    if (intentos >= MAX_INTENTOS) {
      // Defensa en profundidad: el código ya debería estar invalidado abajo,
      // pero si una carrera dejó el contador al tope sin limpiar, rechazamos.
      return NextResponse.json(
        { error: 'Demasiados intentos fallidos. Solicita un código nuevo.' },
        { status: 429 },
      )
    }

    const esperado = sup.codigo_acceso_hash
    const recibido = hashCodigoSupervisor(sup.id, codigo)

    if (!compararHashCodigo(esperado, recibido)) {
      const nuevosIntentos = intentos + 1
      const agotado = nuevosIntentos >= MAX_INTENTOS
      await supabase
        .from('supervisores')
        .update(
          agotado
            ? { codigo_acceso_hash: null, codigo_acceso_expira_at: null, codigo_acceso_intentos: nuevosIntentos }
            : { codigo_acceso_intentos: nuevosIntentos },
        )
        .eq('id', sup.id)

      return NextResponse.json(
        {
          error: agotado
            ? 'Demasiados intentos fallidos. El código quedó invalidado — solicita uno nuevo.'
            : `Código incorrecto. Te quedan ${MAX_INTENTOS - nuevosIntentos} intento(s).`,
        },
        { status: agotado ? 429 : 401 },
      )
    }

    // Código correcto: invalidarlo (un solo uso) y entregar el portal.
    await supabase
      .from('supervisores')
      .update({ codigo_acceso_hash: null, codigo_acceso_expira_at: null, codigo_acceso_intentos: 0 })
      .eq('id', sup.id)

    return NextResponse.json({
      success: true,
      url: `/supervisor/${sup.portal_token}`,
    })
  } catch (error) {
    console.error('[supervisor/verificar-codigo] Error:', error)
    return NextResponse.json(
      { error: 'Error interno. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
