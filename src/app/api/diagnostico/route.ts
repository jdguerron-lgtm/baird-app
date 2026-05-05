import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  enviarCotizacionCliente,
  enviarVerificacionPasoCliente,
} from '@/lib/services/whatsapp.service'
import crypto from 'crypto'
import type { SiguientePasoDiagnostico } from '@/types/solicitud'

/**
 * POST /api/diagnostico
 *
 * Registra el diagnóstico del técnico con oath firmado, datos del siguiente paso
 * (4 opciones) y dispara la notificación correspondiente al cliente.
 *
 * Cambios v2 (2026-04-27):
 * - oath del técnico obligatorio (firma + timestamp)
 * - 4 caminos de siguiente_paso: reparar, esperar_repuesto, no_reparable, negativa_cliente
 * - SKU obligatorio cuando se solicita repuesto
 * - GPS se captura desde el cliente vía /api/gps-ping (no en este route)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      solicitudId,
      portalToken,
      diagnostico,
      complejidad,
      // Oath
      oathFirma,
      oathFirmadoAt,
      // Siguiente paso
      siguientePaso,
      siguientePasoDetalle,
      repuestoSku,
      repuestoDescripcion,
      repuestoCosto,
      repuestoTiempoEstimado,
    } = body

    if (!solicitudId || !portalToken || !diagnostico || !complejidad) {
      return NextResponse.json({ error: 'Faltan parámetros básicos' }, { status: 400 })
    }
    if (!oathFirma || !oathFirmadoAt) {
      return NextResponse.json({ error: 'Falta firma del oath del técnico' }, { status: 400 })
    }
    if (!siguientePaso) {
      return NextResponse.json({ error: 'Falta siguiente_paso' }, { status: 400 })
    }
    const validSteps: SiguientePasoDiagnostico[] = ['reparar', 'esperar_repuesto', 'no_reparable', 'negativa_cliente']
    if (!validSteps.includes(siguientePaso)) {
      return NextResponse.json({ error: 'siguiente_paso inválido' }, { status: 400 })
    }
    if (siguientePaso === 'esperar_repuesto' && (!repuestoSku || !repuestoDescripcion || !repuestoTiempoEstimado)) {
      return NextResponse.json({ error: 'SKU, descripción y tiempo estimado son obligatorios para esperar_repuesto' }, { status: 400 })
    }

    // Verify portal token
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // Verify assignment
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()
    if (!sol) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    const validStates = ['asignada', 'diagnostico_pendiente']
    if (!validStates.includes(sol.estado ?? '')) {
      return NextResponse.json({ error: 'Este servicio ya fue diagnosticado o no está en estado válido' }, { status: 400 })
    }

    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
    const clienteNombre = sol.cliente_nombre.split(' ')[0]
    const nombreTecnico = tecnico.nombre_completo.split(' ')[0]

    // 1. Persistir oath en evidencias_servicio (crear o actualizar)
    const { data: evExistente } = await supabase
      .from('evidencias_servicio')
      .select('id')
      .eq('solicitud_id', solicitudId)
      .eq('tecnico_id', tecnico.id)
      .maybeSingle()

    if (evExistente) {
      await supabase
        .from('evidencias_servicio')
        .update({ oath_firma: oathFirma, oath_firmado_at: oathFirmadoAt })
        .eq('id', evExistente.id)
    } else {
      await supabase
        .from('evidencias_servicio')
        .insert({
          solicitud_id: solicitudId,
          tecnico_id: tecnico.id,
          oath_firma: oathFirma,
          oath_firmado_at: oathFirmadoAt,
          confirmacion_token: crypto.randomUUID(),
          fotos: [],
          checklist: {},
        })
    }

    // 2. Construir diagnostico_data y persistir solicitud
    let diagnosticoData: Record<string, unknown>
    let nuevoEstado: string

    if (sol.es_garantia) {
      const {
        codigoComplejidad, tarifaManoObra, bonoIncentivo, totalServicio,
        requiereRepuestos, repuestosDetalle, evidenciaUrls, diasTranscurridos, codigoFalla,
      } = body

      diagnosticoData = {
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

      if (codigoFalla) {
        diagnosticoData.codigo_falla = codigoFalla.codigo
        diagnosticoData.descripcion_falla = codigoFalla.descripcion
        diagnosticoData.familia_falla = codigoFalla.familia
        diagnosticoData.sistema_falla = codigoFalla.sistema
        diagnosticoData.componente_falla = codigoFalla.componente
        diagnosticoData.complejidad_falla = codigoFalla.complejidad
      }

      // GARANTÍA: el estado va a verificacion_pendiente — el cliente debe aprobar el paso propuesto
      nuevoEstado = 'verificacion_pendiente'
      const verificacionToken = crypto.randomUUID()

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          pago_tecnico: totalServicio,
          estado: nuevoEstado,
          siguiente_paso: siguientePaso,
          siguiente_paso_detalle: siguientePasoDetalle,
          siguiente_paso_at: new Date().toISOString(),
          verificacion_paso_token: verificacionToken,
        })
        .eq('id', sol.id)
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Pre-registrar repuesto si aplica (queda pendiente; admin solo gestiona si cliente aprueba)
      if (siguientePaso === 'esperar_repuesto') {
        const { error: repErr } = await supabase.from('repuestos_pendientes').insert({
          solicitud_id: sol.id,
          sku: repuestoSku,
          descripcion: repuestoDescripcion,
          costo: 0,
          tiempo_estimado: repuestoTiempoEstimado,
        })
        if (repErr) console.error('[diagnostico] Error insertando repuesto:', repErr)
      }

      // Enviar plantilla al cliente para aprobación
      const waResult = await enviarVerificacionPasoCliente(sol.id)
      if (!waResult.ok) console.error('Error enviando verificación:', waResult.error)

      return NextResponse.json({
        success: true,
        flow: 'garantia',
        estado: nuevoEstado,
        verificacion_paso_token: verificacionToken,
      })
    } else {
      // ── NON-WARRANTY (PARTICULAR) FLOW ──
      const {
        requiereRepuestos, repuestosDetalle,
        manoObraParticular, repuestosParticular, evidenciaUrls,
      } = body

      const manoObra = Number(manoObraParticular) || 0
      const repuestos = Number(repuestosParticular) || 0
      const totalCotizacion = manoObra + repuestos
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
      diagnosticoData = {
        diagnostico_tecnico: diagnostico.trim(),
        complejidad,
        requiere_repuestos: requiereRepuestos,
        repuestos_detalle: requiereRepuestos ? repuestosDetalle?.trim() : null,
        evidencias_diagnostico: evidenciaUrls,
        diagnosticado_at: new Date().toISOString(),
      }

      // Para no-garantía, el siguiente_paso siempre va a cotización primero
      // (el cliente aprueba; tras aprobación se aplica la lógica del paso)
      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          cotizacion: cotizacionData,
          estado: 'cotizacion_enviada',
          siguiente_paso: siguientePaso,
          siguiente_paso_detalle: siguientePasoDetalle,
          siguiente_paso_at: new Date().toISOString(),
        })
        .eq('id', sol.id)
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Insertar repuesto pendiente con costo (no garantía: cliente paga)
      if (siguientePaso === 'esperar_repuesto') {
        const { error: repErr } = await supabase.from('repuestos_pendientes').insert({
          solicitud_id: sol.id,
          sku: repuestoSku,
          descripcion: repuestoDescripcion,
          costo: repuestoCosto ?? 0,
          tiempo_estimado: repuestoTiempoEstimado,
        })
        if (repErr) console.error('[diagnostico] Error insertando repuesto (particular):', repErr)
      }

      const waResult = await enviarCotizacionCliente(sol.id)
      if (!waResult.ok) console.error('Error enviando cotización:', waResult.error)

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
