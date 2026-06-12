import { NextRequest, NextResponse } from 'next/server'
import { procesarAprobacionCotizacion } from '@/lib/services/transiciones.service'

/**
 * POST /api/aprobar-cotizacion
 *
 * Procesa la aprobación o rechazo de una cotización por parte del cliente.
 * Solo aplica para servicios particulares (es_garantia = false). La transición
 * vive en transiciones.service (única dueña), reutilizada por el webhook de
 * Dapta (segunda línea — propósito 'cotizacion').
 *
 * Body: { token: string, aprobado: boolean, comentario?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { token, aprobado, comentario } = await req.json()
    const r = await procesarAprobacionCotizacion(token, aprobado, comentario)
    return NextResponse.json(r.body, { status: r.httpStatus })
  } catch (error) {
    console.error('Error en /api/aprobar-cotizacion:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
