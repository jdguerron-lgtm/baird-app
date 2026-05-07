import { NextRequest, NextResponse } from 'next/server'
import { procesarReagendamientoCliente } from '@/lib/services/whatsapp.service'

export const maxDuration = 30

/**
 * POST /api/solicitud/reagendar
 *
 * Reagenda una solicitud iniciada por el cliente desde /servicio/{cliente_token}.
 *
 * Body: { token: string, horario: string, motivo?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const horario = typeof body.horario === 'string' ? body.horario.trim() : ''
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : undefined

    if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })
    if (!horario) return NextResponse.json({ error: 'horario requerido' }, { status: 400 })
    if (horario.length > 200) return NextResponse.json({ error: 'horario demasiado largo' }, { status: 400 })

    const result = await procesarReagendamientoCliente(token, horario, motivo)

    if (!result.ok) {
      const status = result.error?.includes('Token inválido') ? 404 : 409
      return NextResponse.json({ error: result.error, estado_previo: result.estado_previo }, { status })
    }

    return NextResponse.json({
      success: true,
      estado_previo: result.estado_previo,
      reagendamientos_count: result.reagendamientos_count,
    })
  } catch (err) {
    console.error('Error en /api/solicitud/reagendar:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
