import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  notificarTecnicos,
  enviarSeleccionHorarioCliente,
} from '@/lib/services/whatsapp.service'

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
 * Requiere autenticación de admin. Body: { solicitudId: string }
 *
 * Branch por estado (customer-first scheduling, v2):
 *  - pendiente_horario o sin_agendar (cliente no ha confirmado horario, o
 *    la solicitud expiró): re-envía la plantilla de SELECCIÓN DE HORARIO
 *    al cliente. Si está en sin_agendar, también la "revive" a
 *    pendiente_horario para que pueda confirmar.
 *  - resto de estados (cliente ya confirmó): notifica/re-notifica técnicos
 *    compatibles para que tomen el servicio.
 *
 * Esta lógica refleja el principio: el flujo arranca con el horario del
 * cliente. Si no hay horario, no tiene sentido despertar a los técnicos.
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

    // Estado actual para decidir destino del reenvío
    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, horario_confirmado_at, horario_token')
      .eq('id', solicitudId)
      .single()

    if (solErr || !sol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    const necesitaHorarioCliente =
      !sol.horario_confirmado_at &&
      (sol.estado === 'pendiente_horario' || sol.estado === 'sin_agendar')

    if (necesitaHorarioCliente) {
      // Si expiró, revivir a pendiente_horario para que el cliente pueda confirmar
      if (sol.estado === 'sin_agendar') {
        await supabase
          .from('solicitudes_servicio')
          .update({ estado: 'pendiente_horario', horario_recordatorio_at: null })
          .eq('id', sol.id)
      }

      const result = await enviarSeleccionHorarioCliente(solicitudId)
      return NextResponse.json({
        success: result.ok,
        accion: 'cliente_horario',
        notificados: 0,
        matched: 0,
        errors: result.ok ? 0 : 1,
        diagnostico: result.ok ? [] : [result.error ?? 'Error desconocido'],
        mensaje: result.ok
          ? 'Plantilla de selección de horario re-enviada al cliente'
          : `No se pudo re-enviar al cliente: ${result.error ?? 'error desconocido'}`,
      })
    }

    // Resto: re-notificar técnicos compatibles
    const result = await notificarTecnicos(solicitudId)

    return NextResponse.json({
      success: true,
      accion: 'tecnicos',
      notificados: result.notificados,
      matched: result.matched,
      errors: result.errors.length,
      diagnostico: result.errors,
      mensaje: result.notificados > 0
        ? `${result.notificados} tecnico(s) notificado(s) por WhatsApp`
        : result.matched > 0
          ? `Se encontraron ${result.matched} tecnico(s) pero fallo el envio: ${result.errors.join('; ')}`
          : result.errors.length > 0
            ? result.errors[0]
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
