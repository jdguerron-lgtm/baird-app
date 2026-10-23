import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { enviarAlertaAdminVisitas } from '@/lib/services/confirmacion-visita.service'
import { esYMDValido } from '@/lib/utils/agenda-slots'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/alerta-visitas
 *
 * Vercel Cron diario (vercel.json: '0 1 * * *' UTC = 8:00 pm Bogotá del día
 * anterior a la visita).
 *
 * Texto libre a WHATSAPP_ALERT_PHONE con las visitas de MAÑANA que piden
 * acción del equipo: con técnico pero sin confirmar (llamarlo; si no va,
 * "Liberar técnico y reofertar" en la ficha) y sin técnico. Si todo está
 * confirmado no manda nada. Sin liberación automática (decisión 2026-10-22).
 *
 * Query: ?dry=1 (devuelve el texto sin enviar) · ?fecha=YYYY-MM-DD (pruebas).
 * Kill-switch: AGENDA_TECNICOS_ENABLED=false. Seguridad: `cronAutorizado`.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (process.env.AGENDA_TECNICOS_ENABLED === 'false') {
    return NextResponse.json({ ok: true, skipped: true, motivo: 'AGENDA_TECNICOS_ENABLED=false' })
  }

  const params = new URL(req.url).searchParams
  const dry = params.get('dry') === '1'
  const fechaParam = params.get('fecha')
  const fechaYMD = fechaParam && esYMDValido(fechaParam) ? fechaParam : undefined

  try {
    const resultado = await enviarAlertaAdminVisitas({ fechaYMD, dry })
    console.log('[cron/alerta-visitas]', JSON.stringify({ ...resultado, texto: undefined }))
    return NextResponse.json({ ok: true, dry, ...resultado })
  } catch (err) {
    console.error('[cron/alerta-visitas] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
