import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { notificarCotizacionAprobada, enviarMensajeTexto } from '@/lib/services/whatsapp.service'

/**
 * POST /api/aprobar-cotizacion
 *
 * Procesa la aprobación o rechazo de una cotización por parte del cliente.
 * Solo aplica para servicios particulares (es_garantia = false).
 *
 * Body: { token: string, aprobado: boolean, comentario?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { token, aprobado, comentario } = await req.json()

    if (!token || typeof aprobado !== 'boolean') {
      return NextResponse.json({ error: 'Faltan parámetros (token, aprobado)' }, { status: 400 })
    }

    // Find solicitud by cotizacion token
    const { data: sol, error } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia, cotizacion, tecnico_asignado_id')
      .eq('estado', 'cotizacion_enviada')
      .single()

    // Since we can't query JSONB directly via .eq on nested fields easily,
    // search all cotizacion_enviada and filter by token
    const { data: solicitudes } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia, cotizacion, tecnico_asignado_id')
      .eq('estado', 'cotizacion_enviada')

    const solMatch = solicitudes?.find(s => {
      const cot = s.cotizacion as { token?: string } | null
      return cot?.token === token
    })

    if (!solMatch) {
      return NextResponse.json({ error: 'Cotización no encontrada o ya fue procesada' }, { status: 404 })
    }

    if (solMatch.es_garantia) {
      return NextResponse.json({ error: 'Las cotizaciones solo aplican para servicios particulares' }, { status: 400 })
    }

    const cot = solMatch.cotizacion as { diagnostico_tecnico: string; mano_obra: number; repuestos: number; total: number; token: string }

    if (aprobado) {
      // ── APPROVED ──
      const updatedCotizacion = {
        ...cot,
        aprobado_at: new Date().toISOString(),
      }

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          cotizacion: updatedCotizacion,
          pago_tecnico: cot.total,  // Update payment to approved quote total
          estado: 'cotizacion_aprobada',
        })
        .eq('id', solMatch.id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      // Notify technician that quote was approved
      const waResult = await notificarCotizacionAprobada(solMatch.id)
      if (!waResult.ok) {
        console.error('Error notificando aprobación al técnico:', waResult.error)
      }

      // Then move to en_proceso so technician can proceed with repair
      await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'en_proceso' })
        .eq('id', solMatch.id)

      return NextResponse.json({ success: true, estado: 'cotizacion_aprobada' })

    } else {
      // ── REJECTED ──
      const updatedCotizacion = {
        ...cot,
        rechazado_at: new Date().toISOString(),
        comentario_rechazo: comentario?.trim() || null,
      }

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          cotizacion: updatedCotizacion,
          estado: 'cotizacion_rechazada',
        })
        .eq('id', solMatch.id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      // Notify technician that quote was rejected
      const { data: tecnico } = await supabase
        .from('tecnicos')
        .select('nombre_completo, whatsapp')
        .eq('id', solMatch.tecnico_asignado_id)
        .single()

      if (tecnico) {
        const nombreTecnico = tecnico.nombre_completo.split(' ')[0]
        const equipo = `${solMatch.tipo_equipo} ${solMatch.marca_equipo}`
        const razon = comentario ? `\n\n💬 Comentario del cliente: "${comentario.trim()}"` : ''

        try {
          await enviarMensajeTexto(
            tecnico.whatsapp,
            `😔 Hola ${nombreTecnico}, el cliente ${solMatch.cliente_nombre} ha rechazado la cotización para el servicio de ${equipo}.${razon}\n\n📋 El servicio ha sido marcado como rechazado.\n\n🔧 Baird Service`
          )
        } catch (waErr) {
          console.error('Error notificando rechazo al técnico:', waErr)
        }
      }

      return NextResponse.json({ success: true, estado: 'cotizacion_rechazada' })
    }
  } catch (error) {
    console.error('Error en /api/aprobar-cotizacion:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
