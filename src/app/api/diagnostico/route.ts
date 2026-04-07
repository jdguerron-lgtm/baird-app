import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarMensajeTexto } from '@/lib/services/whatsapp.service'

/**
 * POST /api/diagnostico
 *
 * Registra el diagnóstico del técnico y notifica al cliente por WhatsApp.
 * Body: { solicitudId, portalToken, diagnostico, complejidad, requiereRepuestos, repuestosDetalle, evidenciaUrls, pagoTecnico }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      solicitudId,
      portalToken,
      diagnostico,
      complejidad,
      codigoComplejidad,
      tarifaManoObra,
      bonoIncentivo,
      totalServicio,
      requiereRepuestos,
      repuestosDetalle,
      evidenciaUrls,
      diasTranscurridos,
    } = await req.json()

    if (!solicitudId || !portalToken || !diagnostico || !complejidad) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // Verify portal token belongs to a technician
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()

    if (!tecnico) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // Verify this technician is assigned to this solicitud and it's in 'asignada' state
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()

    if (!sol) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    if (sol.estado !== 'asignada') {
      return NextResponse.json({ error: 'Este servicio ya fue diagnosticado' }, { status: 400 })
    }

    // Store diagnostic in triaje_resultado and update estado
    const diagnosticoData = {
      diagnostico_tecnico: diagnostico.trim(),
      complejidad,
      codigo_complejidad: codigoComplejidad,
      tarifa_mano_obra: tarifaManoObra,
      bono_incentivo: bonoIncentivo,
      total_servicio: totalServicio,
      requiere_repuestos: requiereRepuestos,
      repuestos_detalle: requiereRepuestos ? repuestosDetalle?.trim() : null,
      evidencias_diagnostico: evidenciaUrls,
      diagnosticado_at: new Date().toISOString(),
      dias_transcurridos: diasTranscurridos,
    }

    const { error: updateErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        triaje_resultado: diagnosticoData,
        pago_tecnico: totalServicio,
        estado: 'en_proceso',
      })
      .eq('id', sol.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Send WhatsApp notification to customer
    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const clienteNombre = sol.cliente_nombre.split(' ')[0]
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    try {
      await enviarMensajeTexto(
        sol.cliente_telefono,
        `👋 Hola ${clienteNombre}, el técnico 👨‍🔧 ${nombreTecnico} ya realizó el diagnóstico de tu ${equipo}.\n\n🛠️ Está trabajando en la reparación. Te notificaremos cuando el servicio esté completado. ✅\n\n🔧 Baird Service`
      )
    } catch (waErr) {
      console.error('Error enviando WhatsApp de diagnóstico al cliente:', waErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en /api/diagnostico:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
