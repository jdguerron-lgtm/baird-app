import { NextRequest, NextResponse } from 'next/server'
import { notificarTecnicos } from '@/lib/services/whatsapp.service'

/**
 * POST /api/whatsapp/notify
 *
 * Recibe el ID de una solicitud recién creada y envía mensajes de
 * WhatsApp a todos los técnicos verificados compatibles (por especialidad
 * y ciudad). Cada técnico recibe un link único para aceptar el servicio.
 *
 * Llamado internamente desde el formulario del cliente, justo después
 * de que la solicitud se guarda en Supabase.
 *
 * Body: { solicitudId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { solicitudId } = body

    if (!solicitudId || typeof solicitudId !== 'string') {
      return NextResponse.json(
        { error: 'solicitudId es requerido' },
        { status: 400 }
      )
    }

    const notificados = await notificarTecnicos(solicitudId)

    return NextResponse.json({
      success: true,
      notificados,
      mensaje: notificados > 0
        ? `${notificados} técnico(s) notificado(s) por WhatsApp`
        : 'No se encontraron técnicos disponibles en la zona por ahora',
    })
  } catch (error: unknown) {
    console.error('[/api/whatsapp/notify] Error:', error)
    const mensaje = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json(
      { error: mensaje },
      { status: 500 }
    )
  }
}
