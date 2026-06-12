import { NextRequest, NextResponse } from 'next/server'
import { reprogramarRepuestoSolicitud } from '@/lib/services/transiciones.service'

// notificarTecnicoVisitaReprogramada puede tardar (red WhatsApp)
export const maxDuration = 60

/**
 * POST /api/reprogramar-repuesto
 *
 * El cliente elige una NUEVA fecha de visita tras la llegada del repuesto.
 * Endpoint público gateado por reprogramacion_token (UUID secreto enviado en la
 * plantilla repuesto_recibido_cliente_v2). No requiere verificarAdmin.
 *
 * Transición: repuesto_recibido → en_proceso. Vive en transiciones.service
 * (única dueña), reutilizada por el webhook de Dapta (segunda línea —
 * propósito 'repuesto'). La fecha es TENTATIVA — el técnico la confirma según
 * su disponibilidad (se le notifica por WhatsApp).
 *
 * Body: { token: string, horario: string }
 *   El cliente elige libremente fecha + franja en /reprogramar-repuesto/[token].
 *   Acepta cualquier string no vacío de hasta 200 caracteres.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, horario } = await req.json()
    const r = await reprogramarRepuestoSolicitud(token, horario)
    return NextResponse.json(r.body, { status: r.httpStatus })
  } catch (error) {
    console.error('Error en /api/reprogramar-repuesto:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
