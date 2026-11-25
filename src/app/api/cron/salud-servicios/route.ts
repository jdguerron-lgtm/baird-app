import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarMensajeTexto } from '@/lib/services/whatsapp.service'
import { fallasDe, revisarServicios, textoAlerta } from '@/lib/services/salud-servicios.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/salud-servicios — 2026-10-26.
 *
 * Vercel Cron diario (vercel.json: '0 12 * * *' UTC = 7:00 am Bogotá).
 * Revisa desde el servidor, con las credenciales reales, que respondan Supabase, WhatsApp (Meta,
 * calidad del número), Wompi, Siigo, Resend y Google Maps. Solo lectura. Si algún servicio
 * CONFIGURADO falla, manda un texto a WHATSAPP_ALERT_PHONE (best-effort: nunca rompe la respuesta).
 * Los no configurados salen `sin_configurar` (kill-switch) y no alertan.
 *
 * Query: ?dry=1 → devuelve el resultado sin alertar.
 * Seguridad: `cronAutorizado` (Bearer CRON_SECRET). La respuesta no incluye secretos.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const resultados = await revisarServicios({
    fetch,
    env: process.env,
    pingSupabase: async () => {
      const { error } = await supabase.from('tecnicos').select('id').limit(1)
      if (error) throw new Error(error.message)
    },
  })
  const fallas = fallasDe(resultados)

  let alerta: 'no_necesaria' | 'enviada' | 'dry' | 'error' = 'no_necesaria'
  if (fallas.length > 0) {
    if (dry) {
      alerta = 'dry'
    } else {
      try {
        await enviarMensajeTexto(process.env.WHATSAPP_ALERT_PHONE ?? '573153019192', textoAlerta(resultados))
        alerta = 'enviada'
      } catch (err) {
        alerta = 'error'
        console.error('[cron/salud-servicios] no se pudo enviar la alerta:', err instanceof Error ? err.message : err)
      }
    }
  }

  console.log('[cron/salud-servicios]', JSON.stringify({ fallas: fallas.map(f => f.servicio), alerta }))
  return NextResponse.json({ ok: fallas.length === 0, dry, alerta, resultados })
}
