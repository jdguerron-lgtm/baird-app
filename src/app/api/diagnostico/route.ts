import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarMensajeTexto, enviarCotizacionCliente } from '@/lib/services/whatsapp.service'
import crypto from 'crypto'

/**
 * POST /api/diagnostico
 *
 * Registra el diagnóstico del técnico y notifica al cliente por WhatsApp.
 *
 * WARRANTY flow:      saves diagnostic + warranty tariff → estado: en_proceso → WhatsApp "working on repair"
 * NON-WARRANTY flow:  saves diagnostic + quote → estado: cotizacion_enviada → WhatsApp cotización to customer
 *
 * Body (warranty):     { solicitudId, portalToken, diagnostico, complejidad, codigoComplejidad, tarifaManoObra, bonoIncentivo, totalServicio, ... }
 * Body (non-warranty): { solicitudId, portalToken, diagnostico, complejidad, requiereRepuestos, repuestosDetalle, manoObraParticular, repuestosParticular, evidenciaUrls }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      solicitudId,
      portalToken,
      diagnostico,
      complejidad,
    } = body

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

    // Verify this technician is assigned to this solicitud
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()

    if (!sol) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    // Valid states for diagnostic: 'asignada' (warranty) or 'diagnostico_pendiente' (non-warranty)
    const validStates = ['asignada', 'diagnostico_pendiente']
    if (!validStates.includes(sol.estado ?? '')) {
      return NextResponse.json({ error: 'Este servicio ya fue diagnosticado o no está en estado válido' }, { status: 400 })
    }

    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const clienteNombre = sol.cliente_nombre.split(' ')[0]
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    if (sol.es_garantia) {
      // ══════════════════════════════════════════
      // WARRANTY FLOW (unchanged)
      // ══════════════════════════════════════════
      const {
        codigoComplejidad,
        tarifaManoObra,
        bonoIncentivo,
        totalServicio,
        requiereRepuestos,
        repuestosDetalle,
        evidenciaUrls,
        diasTranscurridos,
        codigoFalla,
      } = body

      const diagnosticoData: Record<string, unknown> = {
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

      // Add fault code if selected
      if (codigoFalla) {
        diagnosticoData.codigo_falla = codigoFalla.codigo
        diagnosticoData.descripcion_falla = codigoFalla.descripcion
        diagnosticoData.familia_falla = codigoFalla.familia
        diagnosticoData.sistema_falla = codigoFalla.sistema
        diagnosticoData.componente_falla = codigoFalla.componente
        diagnosticoData.complejidad_falla = codigoFalla.complejidad
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

      // Notify customer — warranty: "working on repair"
      try {
        await enviarMensajeTexto(
          sol.cliente_telefono,
          `👋 Hola ${clienteNombre}, el técnico 👨‍🔧 ${nombreTecnico} ya realizó el diagnóstico de tu ${equipo}.\n\n🛠️ Está trabajando en la reparación. Te notificaremos cuando el servicio esté completado. ✅\n\n🔧 Baird Service`
        )
      } catch (waErr) {
        console.error('Error enviando WhatsApp de diagnóstico al cliente:', waErr)
      }

      return NextResponse.json({ success: true, flow: 'garantia' })

    } else {
      // ══════════════════════════════════════════
      // NON-WARRANTY (PARTICULAR) FLOW
      // ══════════════════════════════════════════
      const {
        requiereRepuestos,
        repuestosDetalle,
        manoObraParticular,
        repuestosParticular,
        evidenciaUrls,
      } = body

      const manoObra = Number(manoObraParticular) || 0
      const repuestos = Number(repuestosParticular) || 0
      const totalCotizacion = manoObra + repuestos

      // Generate unique token for quote approval page
      const cotizacionToken = crypto.randomUUID()

      const cotizacionData = {
        diagnostico_tecnico: diagnostico.trim(),
        mano_obra: manoObra,
        repuestos,
        repuestos_detalle: requiereRepuestos ? repuestosDetalle?.trim() : null,
        total: totalCotizacion,
        evidencias_diagnostico: evidenciaUrls || [],
        cotizado_at: new Date().toISOString(),
        token: cotizacionToken,
      }

      const diagnosticoData = {
        diagnostico_tecnico: diagnostico.trim(),
        complejidad,
        requiere_repuestos: requiereRepuestos,
        repuestos_detalle: requiereRepuestos ? repuestosDetalle?.trim() : null,
        evidencias_diagnostico: evidenciaUrls,
        diagnosticado_at: new Date().toISOString(),
      }

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          cotizacion: cotizacionData,
          estado: 'cotizacion_enviada',
        })
        .eq('id', sol.id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      // Send quote to customer via WhatsApp
      const waResult = await enviarCotizacionCliente(sol.id)
      if (!waResult.ok) {
        console.error('Error enviando cotización al cliente:', waResult.error)
      }

      return NextResponse.json({ success: true, flow: 'particular', cotizacionToken })
    }
  } catch (error) {
    console.error('Error en /api/diagnostico:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
