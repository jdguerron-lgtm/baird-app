import { NextRequest, NextResponse } from 'next/server'
import { confirmarHorarioSolicitud } from '@/lib/services/transiciones.service'

// Permitir hasta 60s — notificarTecnicos puede tardar varios segundos por técnico
export const maxDuration = 60

/**
 * POST /api/confirmar-horario
 *
 * Recibe la confirmación de horario del cliente y dispara la notificación
 * a los técnicos. La transición vive en transiciones.service (única dueña),
 * reutilizada por el webhook de Dapta (segunda línea). Atomic update para
 * evitar doble confirmación.
 *
 * Body: { token: string, horario: string }
 *   El cliente puede elegir libremente fecha+franja horaria en /horario/[token].
 *   Acepta cualquier string no vacío de hasta 200 caracteres.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, horario } = await req.json()
    const r = await confirmarHorarioSolicitud(token, horario)
    return NextResponse.json(r.body, { status: r.httpStatus })
  } catch (error) {
    console.error('Error en /api/confirmar-horario:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
