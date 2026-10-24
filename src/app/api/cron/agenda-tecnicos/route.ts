import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { enviarAgendaTecnicos } from '@/lib/services/confirmacion-visita.service'
import { esYMDValido } from '@/lib/utils/agenda-slots'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/agenda-tecnicos
 *
 * Vercel Cron diario (vercel.json: '15 22 * * *' UTC = 5:15 pm Bogotá; este
 * plan solo permite crons diarios, con hasta ~1 h de retraso).
 *
 * Manda a cada técnico con visitas Baird MAÑANA su agenda del día: servicios
 * Baird (✅ confirmada / ⏳ sin confirmar) + los compromisos propios que
 * registró en /tecnico/{token}/agenda. Pide confirmar cada visita en el
 * portal o marcar "No alcanzo" para reasignarla a tiempo. Texto libre con
 * fallback a la plantilla `agenda_manana_tecnico_v1` (ventana 24h cerrada).
 * Idempotente por día CO (`tecnicos.agenda_aviso_at`).
 *
 * Query:
 *   ?dry=1              arma los textos y los devuelve SIN enviar
 *   ?force=1            reenvía aunque ya se haya enviado hoy
 *   ?fecha=YYYY-MM-DD   día a resumir (default mañana CO; pruebas)
 *
 * Kill-switch: AGENDA_TECNICOS_ENABLED=false → no envía nada.
 * Seguridad: `cronAutorizado` (Bearer CRON_SECRET).
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
  const force = params.get('force') === '1'
  const fechaParam = params.get('fecha')
  const fechaYMD = fechaParam && esYMDValido(fechaParam) ? fechaParam : undefined

  try {
    const resultado = await enviarAgendaTecnicos({ fechaYMD, dry, force })
    console.log('[cron/agenda-tecnicos]', JSON.stringify({
      fecha: resultado.fecha,
      dry,
      tecnicos: resultado.tecnicos.map(t => ({ nombre: t.nombre, canal: t.canal, servicios: t.servicios, pendientes: t.pendientes, error: t.error })),
    }))
    return NextResponse.json({ ok: true, dry, ...resultado })
  } catch (err) {
    console.error('[cron/agenda-tecnicos] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
