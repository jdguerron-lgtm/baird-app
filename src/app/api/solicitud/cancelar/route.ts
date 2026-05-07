import { NextRequest, NextResponse } from 'next/server'
import { procesarCancelacionCliente } from '@/lib/services/whatsapp.service'

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

    return NextResponse.json({
      success: true,
      estado_previo: result.estado_previo,
      cancelado_tarde: result.cancelado_tarde,
    })
  } catch (err) {
    console.error('Error en /api/solicitud/cancelar:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
