import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarRecordatorioHorario, enviarSolicitudExpiradaCliente, notificarCambioEstado } from '@/lib/services/whatsapp.service'
import { HORARIO_TIMEOUT_HORAS, HORARIO_FINAL_TIMEOUT_HORAS } from '@/types/solicitud'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/horario-recordatorio
 *
 * Vercel Cron — frecuencia recomendada: cada hora.
 * Configurar en vercel.ts:
 *   crons: [{ path: '/api/cron/horario-recordatorio', schedule: '0 * * * *' }]
 *
 * 1. Solicitudes pendiente_horario sin recordatorio enviado y con created_at > 24h:
 *    → enviar plantilla recordatorio_horario_v2
 * 2. Solicitudes pendiente_horario con recordatorio enviado y created_at > 36h
 *    (24h + 12h adicionales):
 *    → marcar estado='sin_agendar' (terminal)
 */
export async function GET(req: Request) {
  // Verificar Vercel Cron header opcional (opcional — Vercel envía x-vercel-cron-signature)
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = Date.now()
  const horaRecordatorio = new Date(now - HORARIO_TIMEOUT_HORAS * 3600 * 1000).toISOString()
  const horaSinAgendar = new Date(now - HORARIO_FINAL_TIMEOUT_HORAS * 3600 * 1000).toISOString()

  let recordatorios = 0
  let sinAgendar = 0
  const errors: string[] = []

  // 1. Recordatorios — solicitudes pendiente_horario sin recordatorio enviado y con created_at > 24h
  const { data: paraRecordar } = await supabase
    .from('solicitudes_servicio')
    .select('id')
    .eq('estado', 'pendiente_horario')
    .is('horario_recordatorio_at', null)
    .lte('created_at', horaRecordatorio)

  if (paraRecordar) {
    for (const s of paraRecordar) {
      const r = await enviarRecordatorioHorario(s.id)
      if (r.ok) recordatorios++
      else errors.push(`recordatorio ${s.id}: ${r.error}`)
    }
  }

  // 2. Sin agendar — recordatorio enviado y created_at > 36h
  const { data: paraExpirar } = await supabase
    .from('solicitudes_servicio')
    .select('id')
    .eq('estado', 'pendiente_horario')
    .not('horario_recordatorio_at', 'is', null)
    .lte('created_at', horaSinAgendar)

  if (paraExpirar) {
    for (const s of paraExpirar) {
      const { error: updErr } = await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'sin_agendar' })
        .eq('id', s.id)
      if (!updErr) {
        sinAgendar++
        await notificarCambioEstado(s.id, 'pendiente_horario', 'sin_agendar')
        // Avisar al cliente que la solicitud expiró (gap 1 — antes no recibía nada).
        // Best-effort: si falla queda en errors del summary pero no bloquea el cron.
        const exp = await enviarSolicitudExpiradaCliente(s.id)
        if (!exp.ok) errors.push(`expirada_cliente ${s.id}: ${exp.error}`)
      } else errors.push(`sin_agendar ${s.id}: ${updErr.message}`)
    }
  }

  const summary = { recordatorios, sin_agendar: sinAgendar, errors_count: errors.length }
  console.log('[cron horario-recordatorio]', summary)
  if (errors.length) console.error('[cron horario-recordatorio] errors:', errors)

  return NextResponse.json({ success: true, ...summary, errors })
}
