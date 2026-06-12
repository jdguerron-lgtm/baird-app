import { NextRequest, NextResponse } from 'next/server'
import { confirmarServicioCliente } from '@/lib/services/transiciones.service'

/**
 * POST /api/confirmar-servicio
 *
 * El cliente confirma (o reporta) el cierre del servicio. La transición vive
 * en transiciones.service (única dueña), reutilizada por el webhook de Dapta
 * (segunda línea — propósito 'cierre').
 *
 * Body: { confirmacionToken: string, confirmado: boolean, comentario?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { confirmacionToken, confirmado, comentario } = await req.json()
    const r = await confirmarServicioCliente(confirmacionToken, confirmado, comentario)
    return NextResponse.json(r.body, { status: r.httpStatus })
  } catch (error) {
    console.error('Error en confirmar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
