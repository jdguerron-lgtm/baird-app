import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarVerificacionPasoCliente, enviarCotizacionCliente, notificarCambioEstado } from '@/lib/services/whatsapp.service'
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

    // Solo aceptamos URLs de imagen del bucket público evidencias-servicio.
    // Evita inyectar URLs arbitrarias en el JSONB (next/image ya está
    // restringido por dominio, pero esto cubre vistas admin / exportaciones).
    const esUrlEvidenciaValida = (v: unknown): v is string =>
      typeof v === 'string' &&
      v.startsWith('https://') &&
      v.includes('/storage/v1/object/public/evidencias-servicio/')

    // Sanitizar listas de productos
    const necesarios: ProductoNecesario[] = Array.isArray(productosNecesarios)
      ? productosNecesarios
          .map((p: ProductoNecesario) => ({
            sku: typeof p.sku === 'string' ? p.sku.trim().toUpperCase() : '',
            descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
            cantidad: Math.max(1, Number(p.cantidad) || 1),
            ...(esUrlEvidenciaValida(p.imagen_url) ? { imagen_url: p.imagen_url } : {}),
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
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, estado, es_garantia, horario_confirmado_at')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()
    if (!sol) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    // Tracking TA: snapshot del momento del diagnóstico + cumplimiento del SLA
    // 24h desde horario_confirmado_at. Persistimos en columnas dedicadas (no
    // solo en triaje_resultado JSONB) para poder indexar y filtrar admin.
    // Si horario_confirmado_at es null (caso raro: solicitud sin paso por
    // /api/confirmar-horario), cumple_ta queda null — no asumimos true ni
    // false porque no hay base para calcular.
    const diagnosticadoAt = new Date()
    let cumpleTA: boolean | null = null
    if (sol.horario_confirmado_at) {
      const confirmedMs = new Date(sol.horario_confirmado_at).getTime()
      const horasTranscurridas = (diagnosticadoAt.getTime() - confirmedMs) / 3600000
      cumpleTA = horasTranscurridas <= 24
    }

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
          siguiente_paso_at: diagnosticadoAt.toISOString(),
          verificacion_paso_token: verificacionToken,
          // Tracking TA — columnas dedicadas, mig 20260513_tracking_ta
          diagnosticado_at: diagnosticadoAt.toISOString(),
          cumple_ta: cumpleTA,
        })
        .eq('id', sol.id)
      if (updateErr) {
        console.error('[diagnostico] UPDATE solicitudes_servicio falló:', updateErr)
        const hint = updateErr.message?.includes('estado_check')
          ? ' (sugerencia: aplicar migración 20260507_admin_pricing_gate.sql en Supabase)'
          : ''
        return NextResponse.json({ error: updateErr.message + hint }, { status: 500 })
      }

      await notificarCambioEstado(sol.id, sol.estado, nuevoEstado)

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
      let waOk = true
      let waError: string | null = null
      if (!necesitaPricingAdmin) {
        const waResult = await enviarVerificacionPasoCliente(sol.id)
        waOk = waResult.ok
        if (!waResult.ok) {
          waError = waResult.error ?? 'Error desconocido'
          console.error('[diagnostico] enviarVerificacionPasoCliente falló:', waError)
        }
      }

      return NextResponse.json({
        success: true,
        flow: 'garantia',
        estado: nuevoEstado,
        verificacion_paso_token: verificacionToken,
        pendiente_pricing: necesitaPricingAdmin,
        whatsapp_sent: !necesitaPricingAdmin && waOk,
        whatsapp_error: waError,
      })
    } else {
      // ── NON-WARRANTY (PARTICULAR) FLOW ──
      // Branching por siguiente_paso (2026-05-12):
      //
      //   reparar          → cotizacion_enviada (envío directo al cliente).
      //                      El técnico ya tiene visibilidad total del costo;
      //                      solo es mano de obra + repuestos disponibles.
      //
      //   esperar_repuesto → pendiente_pricing (admin gate). El técnico
      //                      ingresa SU costo (mano de obra), pero el precio
      //                      final de los repuestos requeridos lo fija el
      //                      equipo Baird desde /admin/cotizaciones-pendientes.
      //                      Solo cuando admin completa, la cotización se
      //                      envía al cliente.
      //
      //   no_reparable     → finalizado_sin_reparacion (terminal).
      //   negativa_cliente → cancelada_cliente (terminal).
      //
      // Ver docs/TARIFAS.md § "Particular" para detalle de la fórmula
      // (costoTecnico × 1.19 IVA × 1.10 margen Baird).
      const { evidenciaUrls, costoTecnico, codigoFalla } = body
      const costoTecnicoNum = Number.isFinite(costoTecnico) && costoTecnico > 0 ? Math.round(costoTecnico) : 0

      const cotizacionToken = crypto.randomUUID()
      const cierraSinCotizacion = siguientePaso === 'no_reparable' || siguientePaso === 'negativa_cliente'
      const necesitaPricingAdmin = siguientePaso === 'esperar_repuesto'

      // Validar costoTecnico solo cuando la rama lo requiere (genera cotización)
      if (!cierraSinCotizacion && costoTecnicoNum <= 0) {
        return NextResponse.json(
          { error: 'Falta costoTecnico para generar la cotización al cliente' },
          { status: 400 },
        )
      }

      // En reparar: ya podemos calcular el total al cliente. En esperar_repuesto:
      // el cálculo final se hace tras admin pricing (precio_unitario por SKU
      // + tiempo_entrega), ahí se invoca calcularTarifaParticular con la suma.
      const tarifa = !necesitaPricingAdmin && costoTecnicoNum > 0
        ? calcularTarifaParticular({ costoTecnico: costoTecnicoNum })
        : null

      // Construir cotizacion JSONB. Mantenemos la forma legacy (mano_obra, repuestos,
      // total) para compat con la página /cotizacion/{token}.
      const cotizacionData: Record<string, unknown> = {
        diagnostico_tecnico: diagnostico.trim(),
        productos_necesarios: necesarios,
        productos_recomendados: recomendados,
        pendiente_precio: necesitaPricingAdmin,
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

      // codigoFalla habilitado en particular desde 2026-05-13. Persiste igual
      // que en garantía pero NO se usa en cálculos — solo análisis posterior
      // (estadísticas por familia, sistema, componente más frecuente).
      if (codigoFalla) {
        diagnosticoData.codigo_falla = codigoFalla.codigo
        diagnosticoData.descripcion_falla = codigoFalla.descripcion
        diagnosticoData.familia_falla = codigoFalla.familia
        diagnosticoData.sistema_falla = codigoFalla.sistema
        diagnosticoData.componente_falla = codigoFalla.componente
        diagnosticoData.complejidad_falla = codigoFalla.complejidad
        // También en cotización para que sea visible desde /cotizacion/{token}
        // y desde el admin sin tener que abrir el triaje_resultado.
        cotizacionData.codigo_falla = codigoFalla.codigo
        cotizacionData.descripcion_falla = codigoFalla.descripcion
        cotizacionData.familia_falla = codigoFalla.familia
      }

      // Si cierra sin cotización: estado terminal según el paso elegido.
      // Si requiere admin pricing (esperar_repuesto): pendiente_pricing.
      // Else (reparar): cotizacion_enviada — envío directo al cliente.
      const nuevoEstado = cierraSinCotizacion
        ? (siguientePaso === 'no_reparable' ? 'finalizado_sin_reparacion' : 'cancelada_cliente')
        : necesitaPricingAdmin
          ? 'pendiente_pricing'
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
          siguiente_paso_at: diagnosticadoAt.toISOString(),
          // Tracking TA — para particular cumple_ta también se persiste para
          // tener métrica de tiempo de respuesta del técnico (independiente
          // de bonos, que solo aplican a garantía).
          diagnosticado_at: diagnosticadoAt.toISOString(),
          cumple_ta: cumpleTA,
        })
        .eq('id', sol.id)
      if (updateErr) {
        console.error('[diagnostico] UPDATE solicitudes_servicio falló:', updateErr)
        const hint = updateErr.message?.includes('estado_check')
          ? ' (sugerencia: aplicar migración 20260507_admin_pricing_gate.sql en Supabase)'
          : ''
        return NextResponse.json({ error: updateErr.message + hint }, { status: 500 })
      }

      await notificarCambioEstado(sol.id, sol.estado, nuevoEstado)

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

      // Solo enviar la cotización al cliente si genera cotización completa
      // (rama "reparar"). En "esperar_repuesto" esperamos que admin complete
      // los precios de los repuestos antes — la plantilla la disparará
      // /api/cotizacion-precios cuando admin termine.
      let waOk = true
      let waError: string | null = null
      if (!cierraSinCotizacion && !necesitaPricingAdmin) {
        const waResult = await enviarCotizacionCliente(sol.id)
        waOk = waResult.ok
        if (!waResult.ok) {
          waError = waResult.error ?? 'Error desconocido'
          console.error('[diagnostico] enviarCotizacionCliente falló:', waError)
        }
      }

      return NextResponse.json({
        success: true,
        flow: 'particular',
        estado: nuevoEstado,
        cotizacionToken: cierraSinCotizacion ? null : cotizacionToken,
        totalCliente: tarifa?.totalCliente ?? 0,
        pendiente_pricing: necesitaPricingAdmin,
        // whatsapp_sent: solo true si efectivamente se envió (no en
        // pendiente_pricing, donde esperamos admin).
        whatsapp_sent: !cierraSinCotizacion && !necesitaPricingAdmin && waOk,
        whatsapp_error: waError,
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
