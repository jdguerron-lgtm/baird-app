import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  enviarMensajeTexto,
  enviarEsperandoRepuestoCliente,
  enviarFinalizadoSinReparacion,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'
import type { SiguientePasoDiagnostico } from '@/types/solicitud'

/**
 * POST /api/verificar-paso
 *
 * Cliente aprueba o rechaza el siguiente paso propuesto por el técnico.
 *
 * Body: { token: string, decision: 'aprobado' | 'rechazado', comentario?: string }
 *
 * APROBADO: transiciona al estado final correspondiente al siguiente_paso
 *           y envía el WhatsApp de seguimiento (en_proceso, esperando_repuesto, etc.)
 * RECHAZADO: estado → en_disputa (admin debe intervenir)
 */
export async function POST(req: NextRequest) {
  try {
    const { token, decision, comentario } = await req.json()

    if (!token || (decision !== 'aprobado' && decision !== 'rechazado')) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, tecnico_asignado_id, siguiente_paso, siguiente_paso_detalle, verificacion_paso_decision')
      .eq('verificacion_paso_token', token)
      .single()

    if (solErr || !sol) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
    }

    if (sol.verificacion_paso_decision) {
      return NextResponse.json({ error: 'Esta verificación ya fue resuelta' }, { status: 400 })
    }

    if (sol.estado !== 'verificacion_pendiente') {
      return NextResponse.json({ error: 'Solicitud no está esperando verificación' }, { status: 400 })
    }

    if (!sol.siguiente_paso) {
      return NextResponse.json({ error: 'siguiente_paso no definido' }, { status: 400 })
    }

    // RECHAZADO: a disputa
    if (decision === 'rechazado') {
      const { error: updErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          estado: 'en_disputa',
          verificacion_paso_decision: 'rechazado',
          verificacion_paso_at: new Date().toISOString(),
          verificacion_paso_comentario: comentario ?? null,
        })
        .eq('id', sol.id)

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

      await notificarCambioEstado(sol.id, sol.estado, 'en_disputa')

      // Notificar técnico (texto libre)
      const { data: tec } = await supabase
        .from('tecnicos').select('whatsapp, nombre_completo').eq('id', sol.tecnico_asignado_id).single()
      if (tec?.whatsapp) {
        const nombreTec = tec.nombre_completo.split(' ')[0]
        const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
        const motivo = comentario ? `\n\nMotivo: ${comentario}` : ''
        enviarMensajeTexto(
          tec.whatsapp,
          `⚠️ Hola ${nombreTec}, el cliente ${sol.cliente_nombre} RECHAZÓ el siguiente paso propuesto para ${equipo}.${motivo}\n\nNo procedas con ninguna acción. El equipo de Baird Service se contactará contigo para resolver.`,
        ).catch(err => console.error('Error notificando rechazo al tec:', err))
      }

      return NextResponse.json({ success: true, decision: 'rechazado', estado: 'en_disputa' })
    }

    // APROBADO: transición al estado correspondiente al siguiente_paso
    const paso = sol.siguiente_paso as SiguientePasoDiagnostico
    let nuevoEstado: string
    switch (paso) {
      case 'reparar': nuevoEstado = 'en_proceso'; break
      case 'esperar_repuesto': nuevoEstado = 'esperando_repuesto'; break
      case 'no_reparable': nuevoEstado = 'finalizado_sin_reparacion'; break
      case 'negativa_cliente': nuevoEstado = 'cancelada_cliente'; break
      default: return NextResponse.json({ error: 'siguiente_paso no reconocido' }, { status: 400 })
    }

    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        estado: nuevoEstado,
        verificacion_paso_decision: 'aprobado',
        verificacion_paso_at: new Date().toISOString(),
        verificacion_paso_comentario: comentario ?? null,
      })
      .eq('id', sol.id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await notificarCambioEstado(sol.id, sol.estado, nuevoEstado)

    // Enviar WhatsApp de seguimiento al cliente y/o técnico
    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const cliente = sol.cliente_nombre.split(' ')[0]

    const { data: tec } = await supabase
      .from('tecnicos').select('whatsapp, nombre_completo').eq('id', sol.tecnico_asignado_id).single()
    const nombreTec = tec?.nombre_completo?.split(' ')[0] ?? 'Técnico'

    try {
      if (paso === 'reparar') {
        await enviarMensajeTexto(
          sol.cliente_telefono,
          `✅ Hola ${cliente}, aprobaste la reparación de tu ${equipo}. El técnico ${nombreTec} está procediendo.\n\nTe avisaremos al completar el servicio. 🔧 Baird Service`,
        )
        if (tec?.whatsapp) {
          await enviarMensajeTexto(
            tec.whatsapp,
            `✅ ${nombreTec}, el cliente ${sol.cliente_nombre} APROBÓ la reparación. Procede según lo acordado.`,
          )
        }
      } else if (paso === 'esperar_repuesto') {
        // Buscar el repuesto recién registrado
        const { data: rep } = await supabase
          .from('repuestos_pendientes')
          .select('sku, descripcion, tiempo_estimado')
          .eq('solicitud_id', sol.id)
          .eq('estado', 'pendiente')
          .order('solicitado_at', { ascending: false })
          .limit(1)
          .single()
        if (rep) {
          await enviarEsperandoRepuestoCliente(sol.id, rep.sku, rep.descripcion, rep.tiempo_estimado ?? 'Por confirmar')
        }
      } else if (paso === 'no_reparable') {
        await enviarFinalizadoSinReparacion(sol.id, sol.siguiente_paso_detalle ?? 'Daño no reparable')
      } else if (paso === 'negativa_cliente') {
        await enviarMensajeTexto(
          sol.cliente_telefono,
          `Hola ${cliente}, registramos tu decisión de no proceder con la reparación de tu ${equipo}. Cualquier duda escríbenos. Gracias por confiar en Baird Service.`,
        )
      }
    } catch (waErr) {
      console.error('Error WhatsApp post-verificación:', waErr)
    }

    return NextResponse.json({ success: true, decision: 'aprobado', estado: nuevoEstado })
  } catch (error) {
    console.error('Error en /api/verificar-paso:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
