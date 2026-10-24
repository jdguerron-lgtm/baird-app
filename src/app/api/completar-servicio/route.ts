import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarPlantillaCliente, notificarCambioEstado } from '@/lib/services/whatsapp.service'
import { ESTADOS_REPUESTO_COMPLETABLES } from '@/lib/constants/estados'
import { cerrarRepuestosPendientes } from '@/lib/services/repuesto-recibido.service'

/**
 * Estados desde los que el técnico puede completar: en_proceso (normal),
 * asignada (tarifa fija sin diagnóstico) y el ciclo de repuesto (2026-10-23:
 * esperar un repuesto ya no bloquea el cierre). Cualquier otro valor que
 * mande el cliente se ignora y se asume en_proceso para el historial.
 */
const ESTADOS_PREVIOS_VALIDOS = new Set(['en_proceso', 'asignada', ...ESTADOS_REPUESTO_COMPLETABLES])

export async function POST(req: NextRequest) {
  try {
    const { solicitudId, portalToken, estadoPrevio: estadoPrevioBody } = await req.json()
    const estadoPrevio =
      typeof estadoPrevioBody === 'string' && ESTADOS_PREVIOS_VALIDOS.has(estadoPrevioBody)
        ? estadoPrevioBody
        : 'en_proceso'

    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parametros' }, { status: 400 })
    }

    // Verify portal token belongs to the assigned technician
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, whatsapp')
      .eq('portal_token', portalToken)
      .single()

    if (!tecnico) {
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 })
    }

    // Verify this technician is assigned to this solicitud
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, novedades_equipo, pago_tecnico, es_garantia')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()

    if (!sol) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    // El técnico ya marcó la solicitud como 'confirmacion_pendiente' (update
    // client-side en la página de completar). Notificar a supervisores configurados.
    await notificarCambioEstado(sol.id, estadoPrevio, 'confirmacion_pendiente')

    // Completado desde el ciclo de repuesto (2026-10-23): el repuesto llegó
    // por otra vía o el técnico resolvió sin él. Cerrar las filas pendientes
    // para que no sigan apareciendo en /admin/repuestos ni en el chip
    // "Pendientes por repuesto", y dejar constancia en el historial.
    if (ESTADOS_REPUESTO_COMPLETABLES.has(estadoPrevio)) {
      const cerrados = await cerrarRepuestosPendientes(sol.id)
      const { error: evErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: sol.id,
        tipo: 'nota_admin',
        actor: 'tecnico',
        motivo: `Técnico ${tecnico.nombre_completo} completó el servicio mientras estaba en "${estadoPrevio}"${cerrados > 0 ? ` (${cerrados} repuesto(s) pendiente(s) marcados como recibidos)` : ''}`,
        payload: { origen: 'completar_desde_repuesto', estado_previo: estadoPrevio, repuestos_cerrados: cerrados },
      })
      if (evErr) console.error('[completar-servicio] evento completar_desde_repuesto falló:', evErr.message)
    }

    // Get the confirmation token and photos from evidencias
    const { data: evidencia } = await supabase
      .from('evidencias_servicio')
      .select('confirmacion_token, fotos, checklist')
      .eq('solicitud_id', solicitudId)
      .eq('tecnico_id', tecnico.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!evidencia) {
      return NextResponse.json({ error: 'Evidencia no encontrada' }, { status: 404 })
    }

    // Send WhatsApp template to customer asking for confirmation
    const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`

    try {
      const result = await enviarPlantillaCliente(solicitudId, sol.cliente_telefono, 'confirmar_servicio_v4', 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sol.cliente_nombre },
            { type: 'text', text: tecnico.nombre_completo },
            { type: 'text', text: equipo },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: evidencia.confirmacion_token }],
        },
      ])

      if (result.filtered) {
        console.warn('[completar-servicio] WhatsApp filtrado por BAIRD_TEST_PHONE_WHITELIST')
        return NextResponse.json({
          success: true,
          whatsapp_sent: false,
          whatsapp_filtered: true,
          whatsapp_error: 'Envío filtrado por BAIRD_TEST_PHONE_WHITELIST (test mode). Revisar env vars de Vercel.',
        })
      }

      return NextResponse.json({ success: true, whatsapp_sent: true })
    } catch (waErr) {
      console.error('WhatsApp send error:', waErr)
      return NextResponse.json({
        success: true,
        whatsapp_sent: false,
        whatsapp_error: waErr instanceof Error ? waErr.message : 'Error enviando WhatsApp',
      })
    }
  } catch (error) {
    console.error('Error en completar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
