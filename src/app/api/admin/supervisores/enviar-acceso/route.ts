import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import { enviarAccesoSupervisor } from '@/lib/services/whatsapp.service'

/**
 * Envía (o reenvía) al supervisor su link mágico de acceso al panel de solo
 * lectura, por WhatsApp (plantilla supervisor_acceso_v1).
 *
 * Siempre devuelve el `link` en la respuesta para que el admin pueda copiarlo y
 * mandarlo a mano — útil mientras la plantilla no esté APPROVED en Meta o si el
 * envío se filtra por la whitelist de test.
 *
 * Solo admin (verificarAdmin).
 */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://lineablanca.bairdservice.com'

export async function POST(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const { data: sup, error } = await supabase
    .from('supervisores')
    .select('id, nombre, whatsapp, ambito, marca, estados, activo, portal_token')
    .eq('id', id)
    .maybeSingle()

  if (error || !sup) {
    return NextResponse.json({ error: 'Supervisor no encontrado' }, { status: 404 })
  }

  const link = `${APP_URL}/supervisor/${sup.portal_token}`

  // Intento de envío por WhatsApp (best-effort).
  const wa = await enviarAccesoSupervisor({
    nombre: sup.nombre,
    whatsapp: sup.whatsapp,
    ambito: sup.ambito,
    marca: sup.marca,
    estados: sup.estados,
    portal_token: sup.portal_token,
  })

  // Registrar el intento (aunque el WhatsApp falle: el admin igual tiene el link).
  await supabase
    .from('supervisores')
    .update({ acceso_enviado_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({
    link,
    whatsapp_ok: wa.ok,
    ...(wa.error ? { whatsapp_error: wa.error } : {}),
  })
}
