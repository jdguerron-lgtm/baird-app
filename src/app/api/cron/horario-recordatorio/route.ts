import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
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
 * Solicitudes pendiente_horario (cliente aún no fija fecha):
 *
 * GARANTÍA (2026-08-07 — antes 1 solo recordatorio):
 *   → hasta 3 solicitudes de agendamiento, a las 24h / 48h / 72h desde
 *     created_at. Cada envío queda en el historial del servicio
 *     (solicitud_eventos tipo 'recordatorio_horario', payload {intento, max}).
 *   → sin_agendar 12h después del 3er recordatorio (>= 84h).
 *
 * PARTICULAR (comportamiento previo intacto):
 *   → 1 recordatorio a las 24h (también va al historial desde hoy).
 *   → sin_agendar a las 36h (24h + 12h de gracia).
 *
 * Contador en solicitudes_servicio.horario_recordatorio_count (migración
 * 20260807_llamadas_y_recordatorios.sql); horario_recordatorio_at guarda el
 * último envío.
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
  const GRACIA_FINAL_HORAS = HORARIO_FINAL_TIMEOUT_HORAS - HORARIO_TIMEOUT_HORAS // 12h tras el último recordatorio

  let recordatorios = 0
  let sinAgendar = 0
  const errors: string[] = []

  const { data: pendientes } = await supabase
    .from('solicitudes_servicio')
    .select('id, es_garantia, created_at, estado, horario_recordatorio_count')
    .eq('estado', 'pendiente_horario')

  for (const s of pendientes ?? []) {
    const maxIntentos = s.es_garantia ? 3 : 1
    const count = s.horario_recordatorio_count ?? 0
    const edadHoras = (now - new Date(s.created_at).getTime()) / 3600000

    if (count < maxIntentos && edadHoras >= HORARIO_TIMEOUT_HORAS * (count + 1)) {
      // Siguiente recordatorio (intento count+1)
      const r = await enviarRecordatorioHorario(s.id, { permitirReenvio: count > 0 })
      if (r.ok) {
        recordatorios++
        const intento = count + 1
        const { error: cntErr } = await supabase
          .from('solicitudes_servicio')
          .update({ horario_recordatorio_count: intento })
          .eq('id', s.id)
        if (cntErr) errors.push(`count ${s.id}: ${cntErr.message}`)

        // Historial: cada reenvío visible en /admin/solicitudes/[id].
        // Best-effort — si el CHECK aún no tiene el tipo (migración sin
        // aplicar) solo se loguea, el envío no se revierte.
        const { error: evErr } = await supabase.from('solicitud_eventos').insert({
          solicitud_id: s.id,
          tipo: 'recordatorio_horario',
          estado_previo: s.estado,
          estado_nuevo: s.estado,
          actor: 'sistema',
          motivo: `Solicitud de agendamiento enviada al cliente (${intento}/${maxIntentos})`,
          payload: { intento, max: maxIntentos },
        })
        if (evErr) console.error(`[cron horario-recordatorio] evento ${s.id} falló:`, evErr.message)
      } else {
        errors.push(`recordatorio ${s.id}: ${r.error}`)
      }
    } else if (
      count >= maxIntentos &&
      edadHoras >= HORARIO_TIMEOUT_HORAS * maxIntentos + GRACIA_FINAL_HORAS
    ) {
      // Todos los recordatorios enviados + gracia vencida → sin_agendar
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
