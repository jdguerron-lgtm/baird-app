import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { notificarTecnicos } from '@/lib/services/whatsapp.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/oferta-escalonada
 *
 * Segunda ola del reparto escalonado (2026-10-19, ver reparto.service.ts).
 * Lo llama cada minuto el job pg_cron `oferta-escalonada-1min` de Supabase
 * (Vercel Hobby solo permite crons diarios) con `Bearer CRON_SECRET`.
 *
 * Toma las solicitudes cuyo `oferta_abierta_at` ya venció, lo limpia de forma
 * atómica (si dos invocaciones se cruzan, solo una envía) y, si la solicitud
 * sigue en 'notificada' sin técnico, manda la oferta a los candidatos que aún
 * no la tenían.
 *
 * Desde 2026-10-26 también libera la oferta a los técnicos retenidos por la
 * penalización de incumplimiento (`oferta_pendientes`): `notificarTecnicos`
 * decide quién ya cumplió su espera y vuelve a programar el despertador.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { data: vencidas, error } = await supabase
      .from('solicitudes_servicio')
      .select('id')
      .not('oferta_abierta_at', 'is', null)
      .lte('oferta_abierta_at', new Date().toISOString())
      .limit(20)

    if (error) {
      // Migración 20261019 sin aplicar: no hay nada que hacer.
      return NextResponse.json({ ok: true, abiertas: 0, aviso: error.message })
    }

    const resultados: { id: string; notificados: number; errors: string[] }[] = []
    for (const { id } of vencidas ?? []) {
      const { data: reclamada } = await supabase
        .from('solicitudes_servicio')
        .update({ oferta_abierta_at: null })
        .eq('id', id)
        .not('oferta_abierta_at', 'is', null)
        .select('id, estado, tecnico_asignado_id')
        .maybeSingle()

      if (!reclamada || reclamada.estado !== 'notificada' || reclamada.tecnico_asignado_id) continue

      try {
        const r = await notificarTecnicos(id, { soloNoNotificados: true })
        resultados.push({ id, notificados: r.notificados, errors: r.errors })
      } catch (err) {
        resultados.push({ id, notificados: 0, errors: [err instanceof Error ? err.message : String(err)] })
      }
    }

    if (resultados.length > 0) console.log('[cron/oferta-escalonada]', JSON.stringify(resultados))
    return NextResponse.json({ ok: true, abiertas: resultados.length, resultados })
  } catch (err) {
    console.error('[cron/oferta-escalonada] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
