import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  enviarRepuestoEnCaminoCliente,
  notificarRepuestoSupervisores,
} from '@/lib/services/whatsapp.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/repuesto-recordatorio
 *
 * Vercel Cron — diario (vercel.json: '45 9 * * *' UTC = 4:45am Bogotá, tras
 * horario-recordatorio a las 9:00 y gps-followup a las 9:30).
 *
 * Red de seguridad para el ciclo de repuesto, que antes podía quedar semanas
 * estancado en silencio (no había ningún recordatorio):
 *
 * ETAPA esperando_repuesto (el supervisor aún no sube la guía de envío):
 *   → SOLO GARANTÍA: re-envía el requerimiento del repuesto a los
 *     supervisores con visibilidad de la marca (supervisor_repuesto_garantia_v1
 *     vía notificarRepuestoSupervisores — mismo mensaje del pedido on-demand
 *     del admin, ignora el filtro `estados`). Particular no aplica: ahí la
 *     gestión del repuesto es del equipo Baird (admin), no del supervisor.
 *   → cadencia: a los 3 días del diagnóstico y luego cada 3 días, máx 3.
 *
 * ETAPA repuesto_en_camino (guía subida, el cliente aún no agenda la visita
 * de finalización):
 *   → re-envía repuesto_en_camino_cliente_v1 al cliente (botón "Agendar
 *     visita" → /reprogramar-repuesto/{token}).
 *   → cadencia: a los 3 días de la guía y luego cada 3 días, máx 2.
 *
 * Tracking en solicitudes_servicio.repuesto_recordatorio_count/at (migración
 * 20260825_repuesto_recordatorios.sql — aplicarla ANTES de activar el cron).
 * El contador NO se resetea al cambiar de etapa: si repuesto_recordatorio_at
 * es anterior al inicio de la etapa actual (guia_envio_at), el contador
 * efectivo arranca en 0. Así ningún route de producción tiene que tocar las
 * columnas nuevas.
 *
 * Cada envío queda en el historial (solicitud_eventos tipo
 * 'recordatorio_repuesto', payload { etapa, intento, max }) — best-effort.
 */
const INTERVALO_DIAS = 3
const MAX_ESPERANDO = 3 // re-avisos a supervisores
const MAX_EN_CAMINO = 2 // re-avisos al cliente

export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = Date.now()
  const INTERVALO_MS = INTERVALO_DIAS * 24 * 3600000

  let supervisores = 0
  let clientes = 0
  const errors: string[] = []

  const { data: estancadas, error: selErr } = await supabase
    .from('solicitudes_servicio')
    .select(
      'id, estado, es_garantia, created_at, diagnosticado_at, siguiente_paso_at, guia_envio_at, repuesto_recordatorio_count, repuesto_recordatorio_at',
    )
    .in('estado', ['esperando_repuesto', 'repuesto_en_camino'])
  if (selErr) {
    // Columna repuesto_recordatorio_* inexistente = migración 20260825 sin aplicar.
    console.error('[cron repuesto-recordatorio] SELECT falló:', selErr.message)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  for (const s of estancadas ?? []) {
    const enCamino = s.estado === 'repuesto_en_camino'

    // Garantía: el supervisor gestiona el repuesto. En particular solo aplica
    // la etapa de cliente (agendar tras la guía).
    if (!enCamino && !s.es_garantia) continue

    // Inicio de la etapa actual: la guía (en camino) o el diagnóstico (esperando).
    const baseIso = enCamino
      ? s.guia_envio_at
      : (s.siguiente_paso_at ?? s.diagnosticado_at ?? s.created_at)
    if (!baseIso) continue
    const baseMs = new Date(baseIso).getTime()

    // Contador efectivo de ESTA etapa: los recordatorios previos a la etapa
    // (p.ej. los enviados en esperando_repuesto cuando ya está en camino) no cuentan.
    const ultimoMs = s.repuesto_recordatorio_at ? new Date(s.repuesto_recordatorio_at).getTime() : 0
    const enEtapa = ultimoMs >= baseMs
    const count = enEtapa ? (s.repuesto_recordatorio_count ?? 0) : 0
    const max = enCamino ? MAX_EN_CAMINO : MAX_ESPERANDO
    const desdeMs = enEtapa ? ultimoMs : baseMs

    if (count >= max || now - desdeMs < INTERVALO_MS) continue

    const etapa = s.estado as string
    const intento = count + 1
    let ok = false
    if (enCamino) {
      const r = await enviarRepuestoEnCaminoCliente(s.id)
      ok = r.ok
      if (r.ok) clientes++
      else errors.push(`cliente ${s.id}: ${r.error}`)
    } else {
      const r = await notificarRepuestoSupervisores(s.id)
      ok = r.enviados > 0
      if (ok) supervisores++
      else errors.push(`supervisores ${s.id}: ${r.error ?? 'ningún envío salió'}`)
    }
    if (!ok) continue

    const { error: cntErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        repuesto_recordatorio_count: intento,
        repuesto_recordatorio_at: new Date().toISOString(),
      })
      .eq('id', s.id)
    if (cntErr) errors.push(`count ${s.id}: ${cntErr.message}`)

    // Historial — best-effort: si el CHECK aún no tiene el tipo (migración
    // sin aplicar) solo se loguea, el envío no se revierte.
    const { error: evErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: s.id,
      tipo: 'recordatorio_repuesto',
      estado_previo: etapa,
      estado_nuevo: etapa,
      actor: 'sistema',
      motivo: enCamino
        ? `Recordatorio al cliente para agendar la visita de finalización (${intento}/${max})`
        : `Re-aviso del repuesto requerido a supervisores (${intento}/${max})`,
      payload: { etapa, intento, max },
    })
    if (evErr) console.error(`[cron repuesto-recordatorio] evento ${s.id} falló:`, evErr.message)
  }

  const summary = { supervisores, clientes, errors_count: errors.length }
  console.log('[cron repuesto-recordatorio]', summary)
  if (errors.length) console.error('[cron repuesto-recordatorio] errors:', errors)

  return NextResponse.json({ success: true, ...summary, errors })
}
