import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarVerificacionPasoCliente, enviarCotizacionCliente } from '@/lib/services/whatsapp.service'
import crypto from 'crypto'
import type { ProductoNecesario, ProductoRecomendado, SiguientePasoDiagnostico } from '@/types/solicitud'
import { calcularTarifaParticular } from '@/lib/constants/tarifas/particular'

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
    console.log('[diagnostico] POST', {
      solicitudId: body.solicitudId,
      es_garantia_hint: body.codigoComplejidad ? 'warranty' : 'particular',
      siguientePaso: body.siguientePaso,
      productos_necesarios_count: Array.isArray(body.productosNecesarios) ? body.productosNecesarios.length : 0,
      productos_recomendados_count: Array.isArray(body.productosRecomendados) ? body.productosRecomendados.length : 0,
      evidencia_urls_count: Array.isArray(body.evidenciaUrls) ? body.evidenciaUrls.length : 0,
      tiene_oath: !!body.oathFirma,
    })
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

    // Estos vars quedan disponibles para flujos que envían texto libre desde
    // este endpoint si se reactiva en el futuro. Hoy ambos flujos delegan el
    // envío a las funciones del service (enviarCotizacionCliente / enviarVerificacionPasoCliente)
    // que leen la solicitud nuevamente.
    void `${sol.tipo_equipo} ${sol.marca_equipo}`
    void sol.cliente_nombre
    void tecnico.nombre_completo

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
      // IMPORTANTE: completado_at: null explícito.
      // El schema original (20260327) define la columna con DEFAULT NOW(),
      // así que omitirlo hace que Postgres la setee al insertar — y entonces
      // el portal del técnico marcaría el servicio como "ya completado"
      // antes de que el técnico haga la completación real. La migración
      // 20260508_fix_completado_at_default.sql elimina el default; este
      // explícito es defensa adicional por si la migración no se aplicó.
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
          completado_at: null,
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
      if (updateErr) {
        console.error('[diagnostico] UPDATE solicitudes_servicio falló:', updateErr)
        const hint = updateErr.message?.includes('estado_check')
          ? ' (sugerencia: aplicar migración 20260507_admin_pricing_gate.sql en Supabase)'
          : ''
        return NextResponse.json({ error: updateErr.message + hint }, { status: 500 })
      }

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
      // Cambio 2026-05-10 (ver docs/TARIFAS.md § "Particular"):
      // El técnico ingresa su `costoTecnico` (mano de obra + repuestos).
      // El sistema calcula automáticamente el total al cliente con IVA + margen
      // Baird (× 1.19 × 1.10) y dispara la cotización al cliente directamente.
      // Ya NO pasa por admin pricing gate.
      //
      // Excepción: si el siguiente paso es no_reparable o negativa_cliente,
      // no hay cotización (servicio cierra terminal).
      const { evidenciaUrls, costoTecnico } = body
      const costoTecnicoNum = Number.isFinite(costoTecnico) && costoTecnico > 0 ? Math.round(costoTecnico) : 0

      const cotizacionToken = crypto.randomUUID()
      const cierraSinCotizacion = siguientePaso === 'no_reparable' || siguientePaso === 'negativa_cliente'

      // Validar costoTecnico solo cuando la rama lo requiere (genera cotización)
      if (!cierraSinCotizacion && costoTecnicoNum <= 0) {
        return NextResponse.json(
          { error: 'Falta costoTecnico para generar la cotización al cliente' },
          { status: 400 },
        )
      }

      // Calcular tarifa con la fórmula reseller (× 1.19 IVA × 1.10 margen Baird)
      const tarifa = costoTecnicoNum > 0 ? calcularTarifaParticular({ costoTecnico: costoTecnicoNum }) : null

      // Construir cotizacion JSONB. Mantenemos la forma legacy (mano_obra, repuestos,
      // total) para compat con la página /cotizacion/{token}, pero sin desglose:
      // mano_obra = 0, repuestos = 0, total = totalCliente. El front del cliente
      // muestra solo "Total: $X (incluye IVA)".
      const cotizacionData: Record<string, unknown> = {
        diagnostico_tecnico: diagnostico.trim(),
        productos_necesarios: necesarios,
        productos_recomendados: recomendados,
        pendiente_precio: false,
        // Detalle interno (no visible al cliente)
        costo_tecnico: costoTecnicoNum,
        subtotal_con_iva: tarifa?.subtotalConIva ?? 0,
        margen_baird: tarifa?.margenBaird ?? 0,
        // Compat con la página de cotización (cliente ve solo total)
        mano_obra: 0,
        repuestos: 0,
        total: tarifa?.totalCliente ?? 0,
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
        costo_tecnico: costoTecnicoNum,
      }

      // Si cierra sin cotización: estado terminal según el paso elegido.
      // Si genera cotización: estado=cotizacion_enviada (saltamos admin gate).
      const nuevoEstado = cierraSinCotizacion
        ? (siguientePaso === 'no_reparable' ? 'finalizado_sin_reparacion' : 'cancelada_cliente')
        : 'cotizacion_enviada'

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          cotizacion: cierraSinCotizacion ? null : cotizacionData,
          estado: nuevoEstado,
          pago_tecnico: costoTecnicoNum, // lo que el técnico recibe íntegro
          siguiente_paso: siguientePaso,
          siguiente_paso_detalle: siguientePasoDetalle,
          siguiente_paso_at: new Date().toISOString(),
        })
        .eq('id', sol.id)
      if (updateErr) {
        console.error('[diagnostico] UPDATE solicitudes_servicio falló:', updateErr)
        const hint = updateErr.message?.includes('estado_check')
          ? ' (sugerencia: aplicar migración 20260507_admin_pricing_gate.sql en Supabase)'
          : ''
        return NextResponse.json({ error: updateErr.message + hint }, { status: 500 })
      }

      // Insertar repuestos pendientes solo si esperar_repuesto (en particular el
      // costo ya está incluido en costoTecnico — los registros aquí son para
      // tracking de inventario/admin, no de pricing).
      if (siguientePaso === 'esperar_repuesto' && necesarios.length > 0) {
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

      // Si genera cotización, dispara el WhatsApp al cliente inmediatamente.
      if (!cierraSinCotizacion) {
        const waResult = await enviarCotizacionCliente(sol.id)
        if (!waResult.ok) console.error('Error enviando cotización al cliente:', waResult.error)
      }

      return NextResponse.json({
        success: true,
        flow: 'particular',
        estado: nuevoEstado,
        cotizacionToken: cierraSinCotizacion ? null : cotizacionToken,
        totalCliente: tarifa?.totalCliente ?? 0,
        pendiente_pricing: false,
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
