import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { notificarTecnicos } from '@/lib/services/whatsapp.service'

async function verificarAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) return false

  const { data: { user } } = await supabase.auth.getUser(token)
  return !!user
}

/**
 * POST /api/whatsapp/notify
 *
 * Requiere autenticacion de admin.
 * Body: { solicitudId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { solicitudId } = body

    if (!solicitudId || typeof solicitudId !== 'string') {
      return NextResponse.json(
        { error: 'solicitudId es requerido' },
        { status: 400 }
      )
    }

    const result = await notificarTecnicos(solicitudId)

    return NextResponse.json({
      success: true,
      notificados: result.notificados,
      matched: result.matched,
      errors: result.errors.length,
      mensaje: result.notificados > 0
        ? `${result.notificados} tecnico(s) notificado(s) por WhatsApp`
        : result.matched > 0
          ? `Se encontraron ${result.matched} tecnico(s) pero fallo el envio`
          : 'No se encontraron tecnicos disponibles en la zona por ahora',
    })
  } catch (error: unknown) {
    console.error('[/api/whatsapp/notify] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
