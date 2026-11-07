import { NextRequest, NextResponse } from 'next/server'
import { procesarCancelacionCliente } from '@/lib/services/whatsapp.service'
import { cobrarDiagnosticoSinReparacion, marcarDevolucionPendiente } from '@/lib/services/cobros.service'

// El servicio puede tardar varios segundos (3 envíos WhatsApp + DB).
export const maxDuration = 30

/**
 * POST /api/solicitud/cancelar
 *
 * Cancela una solicitud iniciada por el cliente desde /servicio/{cliente_token}.
 *
 * Body: { token: string, motivo: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const motivoRaw = typeof body.motivo === 'string' ? body.motivo.trim() : ''

    if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })
    if (!motivoRaw) return NextResponse.json({ error: 'Motivo requerido' }, { status: 400 })
    if (motivoRaw.length > 500) return NextResponse.json({ error: 'Motivo demasiado largo' }, { status: 400 })

    const result = await procesarCancelacionCliente(token, motivoRaw)

    if (!result.ok) {
      const status = result.error?.includes('Token inválido') ? 404 : 409
      return NextResponse.json({ error: result.error, estado_previo: result.estado_previo }, { status })
    }

    // (2026-11-05) Qué pasa con la plata — decisión del 2026-11-05:
    //   - visita ya hecha: se cobra el diagnóstico completo (menos lo pagado) y,
    //     si había abono de repuestos, ese abono se devuelve a mano;
    //   - sin visita y con anticipo pagado: devolución MANUAL (evento + alerta).
    // Todo best-effort: la cancelación ya quedó escrita.
    let cobroDiagnostico = 0
    if (result.diagnostico_hecho) {
      const cobro = await cobrarDiagnosticoSinReparacion(result.solicitud_id ?? '', 'cancelacion')
      cobroDiagnostico = cobro.saldo
      if (result.abono_pagado) {
        await marcarDevolucionPendiente(result.solicitud_id ?? '', {
          tipo: 'abono',
          monto: 0,
          motivo: 'El cliente canceló después del diagnóstico: se cobra solo la visita; el abono de repuestos se devuelve.',
        })
      }
    } else if (result.anticipo_pagado || (result.monto_pagado_online ?? 0) > 0) {
      await marcarDevolucionPendiente(result.solicitud_id ?? '', {
        tipo: 'anticipo',
        monto: result.monto_pagado_online ?? 0,
        motivo: `El cliente canceló antes de la visita${result.cancelado_tarde ? ' (con técnico asignado)' : ''}: se le devuelve el anticipo.`,
      })
    }

    return NextResponse.json({
      success: true,
      estado_previo: result.estado_previo,
      cancelado_tarde: result.cancelado_tarde,
      diagnostico_hecho: result.diagnostico_hecho ?? false,
      cobro_diagnostico: cobroDiagnostico,
      devolucion_pendiente: !result.diagnostico_hecho && Boolean(result.anticipo_pagado || (result.monto_pagado_online ?? 0) > 0),
    })
  } catch (err) {
    console.error('Error en /api/solicitud/cancelar:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
