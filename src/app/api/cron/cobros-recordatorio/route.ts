import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { enviarRecordatoriosCobro } from '@/lib/services/cobros.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/cobros-recordatorio  (2026-11-05)
 *
 * Vercel Cron diario (vercel.json: '0 14 * * *' UTC = 9:00 am Bogotá).
 *
 * Para cada servicio PARTICULAR con un cobro pendiente (anticipo, abono de
 * repuestos, saldo o diagnóstico sin reparación) cuyo último link de pago
 * salió hace ≥ 24 h, reenvía el link por WhatsApp (máximo 2 recordatorios por
 * cobro) y, en el 2.º recordatorio (≈ 48 h sin pago), avisa al equipo
 * (WHATSAPP_ALERT_PHONE) para que gestione a mano. No cambia estados ni
 * montos. Decisión del 2026-11-05.
 *
 * Query: ?dry=1 (calcula sin enviar).
 * Kill-switch: COBROS_RECORDATORIO_ENABLED=false. Seguridad: `cronAutorizado`.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const dry = new URL(req.url).searchParams.get('dry') === '1'
  try {
    const resultado = await enviarRecordatoriosCobro({ dry })
    console.log('[cron/cobros-recordatorio]', JSON.stringify({ ...resultado, dry }))
    return NextResponse.json({ ok: true, dry, ...resultado })
  } catch (err) {
    console.error('[cron/cobros-recordatorio] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
