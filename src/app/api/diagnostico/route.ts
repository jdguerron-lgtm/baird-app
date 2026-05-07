import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarVerificacionPasoCliente } from '@/lib/services/whatsapp.service'
import crypto from 'crypto'
import type { ProductoNecesario, ProductoRecomendado, SiguientePasoDiagnostico } from '@/types/solicitud'

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
      // Productos (NEW 2026-05-07): técnico solo aporta SKU + descripción + cantidad.
      // Precio y tiempo de entrega los fija el equipo Baird desde admin.
      productosNecesarios,
      productosRecomendados,
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

    // Sanitizar listas de productos
    const necesarios: ProductoNecesario[] = Array.isArray(productosNecesarios)
      ? productosNecesarios
          .map((p: ProductoNecesario) => ({
            sku: typeof p.sku === 'string' ? p.sku.trim().toUpperCase() : '',
            descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
            cantidad: Math.max(1, Number(p.cantidad) || 1),
          }))
          .filter((p: ProductoNecesario) => p.sku && p.descripcion)
      : []
    const recomendados: ProductoRecomendado[] = Array.isArray(productosRecomendados)
      ? productosRecomendados
          .map((p: ProductoRecomendado) => ({
            nombre: typeof p.nombre === 'string' ? p.nombre.trim() : '',
            descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
          }))
          .filter((p: ProductoRecomendado) => p.nombre)
      : []

    if (siguientePaso === 'esperar_repuesto' && necesarios.length === 0) {
      return NextResponse.json(
        { error: 'Si el siguiente paso es esperar_repuesto debes incluir al menos un producto necesario con SKU' },
        { status: 400 },
      )
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
        evidenciaUrls, diasTranscurridos, codigoFalla,
      } = body

      diagnosticoData = {
        diagnostico_tecnico: diagnostico.trim(),
        complejidad,
        codigo_complejidad: codigoComplejidad,
        tarifa_mano_obra: tarifaManoObra,
        bono_incentivo: bonoIncentivo,
        total_servicio: totalServicio,
        productos_necesarios: necesarios,
        productos_recomendados: recomendados,
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

      // GARANTÍA con esperar_repuesto: pasa por admin (debe fijar tiempo_entrega)
      // antes de notificar al cliente. Otros pasos: directo a verificación.
      const necesitaPricingAdmin = siguientePaso === 'esperar_repuesto'
      nuevoEstado = necesitaPricingAdmin ? 'pendiente_pricing' : 'verificacion_pendiente'
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

      // Insertar repuestos pendientes (sin costo ni tiempo — admin los fija)
      if (siguientePaso === 'esperar_repuesto' && necesarios.length > 0) {
        const { error: repErr } = await supabase.from('repuestos_pendientes').insert(
          necesarios.map(p => ({
            solicitud_id: sol.id,
            sku: p.sku,
            descripcion: p.descripcion,
            costo: 0,
            tiempo_estimado: null, // admin lo fija
          })),
        )
        if (repErr) console.error('[diagnostico] Error insertando repuestos:', repErr)
      }

      // Solo enviar verificación si NO necesita pricing admin
      if (!necesitaPricingAdmin) {
        const waResult = await enviarVerificacionPasoCliente(sol.id)
        if (!waResult.ok) console.error('Error enviando verificación:', waResult.error)
      }

      return NextResponse.json({
        success: true,
        flow: 'garantia',
        estado: nuevoEstado,
        verificacion_paso_token: verificacionToken,
        pendiente_pricing: necesitaPricingAdmin,
      })
    } else {
      // ── NON-WARRANTY (PARTICULAR) FLOW ──
      // El técnico ya no fija precios. Guardamos cotización en estado
      // pendiente_pricing con productos_necesarios/recomendados; admin de
      // Baird fija mano_obra, precio_unitario por producto y tiempo_entrega
      // antes de enviar la cotización al cliente.
      const { evidenciaUrls } = body

      const cotizacionToken = crypto.randomUUID()

      const cotizacionData = {
        diagnostico_tecnico: diagnostico.trim(),
        productos_necesarios: necesarios,
        productos_recomendados: recomendados,
        pendiente_precio: true,
        mano_obra: 0,
        repuestos: 0,
        total: 0,
        evidencias_diagnostico: evidenciaUrls || [],
        cotizado_at: new Date().toISOString(),
        token: cotizacionToken,
      }
      diagnosticoData = {
        diagnostico_tecnico: diagnostico.trim(),
        complejidad,
        productos_necesarios: necesarios,
        productos_recomendados: recomendados,
        evidencias_diagnostico: evidenciaUrls,
        diagnosticado_at: new Date().toISOString(),
      }

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          cotizacion: cotizacionData,
          estado: 'pendiente_pricing',
          siguiente_paso: siguientePaso,
          siguiente_paso_detalle: siguientePasoDetalle,
          siguiente_paso_at: new Date().toISOString(),
        })
        .eq('id', sol.id)
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Insertar repuestos pendientes (sin costo — admin lo fija al cotizar)
      if (necesarios.length > 0) {
        const { error: repErr } = await supabase.from('repuestos_pendientes').insert(
          necesarios.map(p => ({
            solicitud_id: sol.id,
            sku: p.sku,
            descripcion: p.descripcion,
            costo: 0,
            tiempo_estimado: null,
          })),
        )
        if (repErr) console.error('[diagnostico] Error insertando repuestos (particular):', repErr)
      }

      // NO se envía cotización al cliente todavía. Espera admin pricing.
      return NextResponse.json({
        success: true,
        flow: 'particular',
        cotizacionToken,
        pendiente_pricing: true,
      })
    }
  } catch (error) {
    console.error('Error en /api/diagnostico:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
