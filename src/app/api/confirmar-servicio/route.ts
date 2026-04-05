import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarMensajeTexto } from '@/lib/services/whatsapp.service'

export async function POST(req: NextRequest) {
  try {
    const { confirmacionToken, confirmado, comentario } = await req.json()

    if (!confirmacionToken || typeof confirmado !== 'boolean') {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // Find evidence by confirmation token
    const { data: evidencia } = await supabase
      .from('evidencias_servicio')
      .select('id, solicitud_id, tecnico_id, confirmado')
      .eq('confirmacion_token', confirmacionToken)
      .single()

    if (!evidencia) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
    }

    if (evidencia.confirmado !== null) {
      return NextResponse.json({ error: 'Ya fue confirmado anteriormente' }, { status: 400 })
    }

    // Update evidence
    await supabase
      .from('evidencias_servicio')
      .update({
        confirmado,
        confirmado_at: new Date().toISOString(),
        cliente_comentario: comentario || null,
      })
      .eq('id', evidencia.id)

    // Update solicitud estado
    const nuevoEstado = confirmado ? 'completada' : 'en_disputa'
    await supabase
      .from('solicitudes_servicio')
      .update({ estado: nuevoEstado })
      .eq('id', evidencia.solicitud_id)

    // Fetch solicitud and technician data to send WhatsApp notifications
    const [{ data: sol }, { data: tecnico }] = await Promise.all([
      supabase
        .from('solicitudes_servicio')
        .select('tipo_equipo, marca_equipo, cliente_nombre')
        .eq('id', evidencia.solicitud_id)
        .single(),
      supabase
        .from('tecnicos')
        .select('nombre_completo, whatsapp')
        .eq('id', evidencia.tecnico_id)
        .single(),
    ])

    // Send WhatsApp notification to technician
    if (tecnico?.whatsapp && sol) {
      const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
      const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

      try {
        if (confirmado) {
          await enviarMensajeTexto(
            tecnico.whatsapp,
            `Hola ${nombreTecnico}, el cliente ${sol.cliente_nombre} ha confirmado que el servicio de ${equipo} fue completado exitosamente. ¡Buen trabajo! 🎉\n\n— Baird Service`
          )
        } else {
          await enviarMensajeTexto(
            tecnico.whatsapp,
            `Hola ${nombreTecnico}, el cliente ${sol.cliente_nombre} ha reportado un problema con el servicio de ${equipo}. El equipo de Baird Service se pondrá en contacto contigo para más detalles.\n\n— Baird Service`
          )
        }
      } catch (waErr) {
        console.error('Error enviando WhatsApp de confirmación al técnico:', waErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en confirmar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
