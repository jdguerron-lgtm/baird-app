import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { distanceMeters, FLAG_DISTANCE_METERS, POST_VISIT_DELAY_MINUTES } from '@/lib/utils/geo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/gps-followup
 *
 * Vercel Cron — frecuencia recomendada: cada 10 minutos.
 *
 * Para cada solicitud completada hace ~30min con GPS de completado pero sin
 * GPS de post_visita registrado:
 *   - Toma el último ping del técnico para esa solicitud (tabla gps_pings)
 *   - Calcula distancia al GPS de completado
 *   - Si distancia <= FLAG_DISTANCE_METERS → marca evidencia.gps_flagged = true
 *
 * Flagging es silencioso (no notifica al técnico). El admin lo ve en su UI.
 */
export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const limite = new Date(Date.now() - POST_VISIT_DELAY_MINUTES * 60 * 1000).toISOString()

  // Solicitudes con evidencia completada hace >=30 min, con GPS completado, sin gps_post_visita_at
  const { data: pendientes } = await supabase
    .from('evidencias_servicio')
    .select('id, solicitud_id, tecnico_id, gps_completado_lat, gps_completado_lng, completado_at')
    .lte('completado_at', limite)
    .is('gps_post_visita_at', null)
    .not('gps_completado_lat', 'is', null)
    .limit(50)

  let revisadas = 0
  let flagged = 0
  const errors: string[] = []

  if (!pendientes) {
    return NextResponse.json({ success: true, revisadas, flagged, errors })
  }

  for (const ev of pendientes) {
    revisadas++

    // Tomar el ping GPS más reciente de este técnico para esta solicitud
    const { data: ping } = await supabase
      .from('gps_pings')
      .select('lat, lng, capturado_at')
      .eq('solicitud_id', ev.solicitud_id)
      .eq('tecnico_id', ev.tecnico_id)
      .order('capturado_at', { ascending: false })
      .limit(1)
      .single()

    if (!ping) {
      // Sin pings recientes — silenciosamente saltamos
      continue
    }

    const dist = distanceMeters(
      ping.lat, ping.lng,
      Number(ev.gps_completado_lat), Number(ev.gps_completado_lng),
    )

    const shouldFlag = dist <= FLAG_DISTANCE_METERS

    const { error: updErr } = await supabase
      .from('evidencias_servicio')
      .update({
        gps_post_visita_lat: ping.lat,
        gps_post_visita_lng: ping.lng,
        gps_post_visita_at: new Date().toISOString(),
        gps_flagged: shouldFlag,
      })
      .eq('id', ev.id)

    if (updErr) {
      errors.push(`evidencia ${ev.id}: ${updErr.message}`)
      continue
    }

    if (shouldFlag) flagged++
  }

  const summary = { revisadas, flagged, errors_count: errors.length }
  console.log('[cron gps-followup]', summary)
  if (errors.length) console.error('[cron gps-followup] errors:', errors)

  return NextResponse.json({ success: true, ...summary, errors })
}
