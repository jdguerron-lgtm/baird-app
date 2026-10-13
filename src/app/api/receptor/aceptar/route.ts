import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { TYC_VERSION } from '@/types/solicitud'
import { PRIVACIDAD_VERSION } from '@/lib/constants/legal'

/**
 * POST /api/receptor/aceptar  (2026-10-13)
 *
 * El receptor (persona que recibe al técnico, distinta del titular) acepta
 * desde /receptor/{token} los Términos y Condiciones y la Política de
 * Privacidad. A partir de `receptor_acepto_at` el sistema le espeja los
 * WhatsApp del titular (ver enviarPlantillaCliente en whatsapp.service).
 *
 * Body: { token: string }
 * Idempotente: si ya aceptó, responde ok con la fecha previa.
 * Guard atómico: `.is('receptor_acepto_at', null)` evita pisar la primera
 * aceptación (misma técnica que procesarAceptacion).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, receptor_nombre, receptor_telefono, receptor_acepto_at')
      .eq('receptor_token', token)
      .maybeSingle()
    if (!sol || !sol.receptor_telefono) {
      return NextResponse.json({ error: 'Enlace inválido o vencido' }, { status: 404 })
    }
    if (sol.receptor_acepto_at) {
      return NextResponse.json({ success: true, ya_aceptado: true, acepto_at: sol.receptor_acepto_at })
    }

    const ahora = new Date().toISOString()
    const { data: upd, error } = await supabase
      .from('solicitudes_servicio')
      .update({
        receptor_acepto_at: ahora,
        receptor_tyc_version: `${TYC_VERSION} / privacidad ${PRIVACIDAD_VERSION}`,
      })
      .eq('id', sol.id)
      .is('receptor_acepto_at', null)
      .select('receptor_acepto_at')
      .maybeSingle()
    if (error) {
      console.error('[receptor/aceptar] UPDATE falló:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!upd) {
      // Carrera: otro request aceptó un instante antes. Igual es éxito.
      return NextResponse.json({ success: true, ya_aceptado: true })
    }

    // Rastro en el historial (best-effort). tipo 'mensaje_cliente' ya existe
    // en el CHECK y el admin lo lista en el historial consolidado.
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'mensaje_cliente',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: 'cliente',
        motivo: `✅ El receptor ${sol.receptor_nombre} (+${sol.receptor_telefono}) aceptó T&C y privacidad: desde ahora recibe los avisos del servicio en paralelo con el titular`,
        payload: { canal: 'web', origen: 'receptor', accion: 'acepto', tyc_version: TYC_VERSION, privacidad_version: PRIVACIDAD_VERSION },
      })
    } catch (err) {
      console.error('[receptor/aceptar] evento no registrado:', err)
    }

    return NextResponse.json({ success: true, acepto_at: ahora })
  } catch (error) {
    console.error('Error en /api/receptor/aceptar:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error interno' }, { status: 500 })
  }
}
