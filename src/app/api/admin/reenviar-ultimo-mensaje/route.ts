import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  enviarSeleccionHorarioCliente,
  enviarVerificacionPasoCliente,
  enviarCotizacionCliente,
  enviarEsperandoRepuestoCliente,
  enviarRepuestoRecibidoCliente,
  enviarFinalizadoSinReparacion,
  notificarTecnicos,
  enviarPlantilla,
} from '@/lib/services/whatsapp.service'
import { formatCOP } from '@/lib/utils/format'
import { phoneToDigits } from '@/lib/utils/phone'
import { precioClienteServicio } from '@/types/solicitud'

export const maxDuration = 30

/**
 * POST /api/admin/reenviar-ultimo-mensaje
 *
 * Detecta el estado actual de la solicitud y reenvía la plantilla WhatsApp
 * que corresponde a ese punto del flujo. Útil cuando algo no llegó por
 * BAIRD_TEST_PHONE_WHITELIST (silenciado), por ventana 24h cerrada de
 * texto libre, o por error transitorio de Meta.
 *
 * Body: { solicitudId: string }
 *
 * Mapeo estado → plantilla (último mensaje "natural" del flujo):
 *   pendiente_horario, sin_agendar  → cliente_seleccion_horario_v2 (cliente)
 *   notificada                       → re-notificarTecnicos (técnicos)
 *   asignada                         → tecnico_asignado_cliente_v6 (cliente)
 *   diagnostico_pendiente            → tecnico_asignado_particular_v1 (cliente)
 *   verificacion_pendiente           → verificar_siguiente_paso_v2 (cliente)
 *   pendiente_pricing                → Solo señal admin (no envío)
 *   cotizacion_enviada               → cotizacion_cliente_v2 (cliente)
 *   esperando_repuesto               → esperando_repuesto_cliente_v1 (cliente)
 *   repuesto_recibido                → repuesto_recibido_cliente_v2 (cliente — elige nueva fecha)
 *   en_proceso                       → sin plantilla específica (cliente ya eligió fecha / aprobó)
 *   en_verificacion                  → confirmar_servicio_v4 (cliente)
 *   finalizado_sin_reparacion        → finalizado_sin_reparacion_v1 (cliente)
 *   terminales restantes             → 409 (sin sentido reenviar)
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId : ''
    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })

    const { data: sol, error } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cliente_telefono, cliente_nombre, tipo_equipo, tipo_solicitud, marca_equipo, tecnico_asignado_id, horario_confirmado, pago_tecnico, cotizacion, tyc_aceptados_at, siguiente_paso, siguiente_paso_detalle')
      .eq('id', solicitudId)
      .single()

    if (error || !sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    // Tabla de despacho según estado actual
    switch (sol.estado) {
      // ── Pre-aceptación: cliente todavía debe elegir horario ──
      case 'pendiente_horario':
      case 'sin_agendar': {
        const r = await enviarSeleccionHorarioCliente(solicitudId)
        return NextResponse.json({
          accion: 'cliente_seleccion_horario_v2',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok
            ? 'Plantilla de selección de horario re-enviada al cliente'
            : `No se pudo re-enviar: ${r.error ?? 'desconocido'}`,
        })
      }

      // ── Cliente ya confirmó, re-disparar oferta a técnicos ──
      case 'notificada': {
        const r = await notificarTecnicos(solicitudId)
        return NextResponse.json({
          accion: 'notificar_tecnicos',
          destinatario: 'tecnicos',
          ok: r.notificados > 0,
          notificados: r.notificados,
          matched: r.matched,
          errors: r.errors,
          mensaje: r.notificados > 0
            ? `${r.notificados} técnico(s) re-notificado(s)`
            : (r.errors[0] ?? 'No se encontraron técnicos disponibles'),
        })
      }

      // ── Tras aceptación: recordatorio al cliente del técnico asignado ──
      case 'asignada':
      case 'diagnostico_pendiente': {
        if (!sol.tecnico_asignado_id) {
          return NextResponse.json({ error: 'Estado dice asignada pero sin técnico' }, { status: 500 })
        }
        const { data: tec } = await supabase
          .from('tecnicos')
          .select('nombre_completo, whatsapp')
          .eq('id', sol.tecnico_asignado_id)
          .single()
        const tecnicoDigits = phoneToDigits(tec?.whatsapp ?? '')
        const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`
        const horario = sol.horario_confirmado || 'Por coordinar'

        try {
          if (sol.es_garantia) {
            const r = await enviarPlantilla(sol.cliente_telefono, 'tecnico_asignado_cliente_v6', 'es', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: sol.cliente_nombre },
                  { type: 'text', text: tec?.nombre_completo ?? 'Técnico asignado' },
                  { type: 'text', text: equipo },
                  { type: 'text', text: horario },
                  { type: 'text', text: `+${tecnicoDigits}` },
                ],
              },
            ])
            return NextResponse.json({
              accion: 'tecnico_asignado_cliente_v6',
              destinatario: 'cliente',
              ok: r.sent,
              filtered: r.filtered ?? false,
              mensaje: r.sent ? 'Plantilla re-enviada' : 'Filtrado por test mode',
            })
          } else {
            // Cliente: mostramos lo que él paga (catálogo / total cotizado),
            // NO el neto del técnico (pago_tecnico).
            const precioCliente = precioClienteServicio(
              sol.tipo_equipo,
              sol.tipo_solicitud,
              sol.es_garantia,
              sol.cotizacion as { total?: number | null } | null,
            )
            const tarifa = formatCOP(precioCliente)
            const anticipo = formatCOP(Math.round(precioCliente * 0.5))
            const r = await enviarPlantilla(sol.cliente_telefono, 'tecnico_asignado_particular_v1', 'es', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: sol.cliente_nombre },
                  { type: 'text', text: tec?.nombre_completo ?? 'Técnico asignado' },
                  { type: 'text', text: equipo },
                  { type: 'text', text: horario },
                  { type: 'text', text: `+${tecnicoDigits}` },
                  { type: 'text', text: tarifa },
                  { type: 'text', text: anticipo },
                ],
              },
            ])
            return NextResponse.json({
              accion: 'tecnico_asignado_particular_v1',
              destinatario: 'cliente',
              ok: r.sent,
              filtered: r.filtered ?? false,
              mensaje: r.sent ? 'Plantilla re-enviada' : 'Filtrado por test mode',
            })
          }
        } catch (err) {
          return NextResponse.json({
            accion: 'tecnico_asignado_*',
            destinatario: 'cliente',
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      case 'pendiente_pricing':
        return NextResponse.json({
          ok: false,
          accion: 'pendiente_admin',
          destinatario: 'admin',
          mensaje: 'La solicitud espera que admin fije precio/tiempo en /admin/cotizaciones-pendientes. No hay mensaje al cliente todavía.',
        })

      case 'verificacion_pendiente': {
        const r = await enviarVerificacionPasoCliente(solicitudId)
        return NextResponse.json({
          accion: 'verificar_siguiente_paso_v2',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok ? 'Plantilla re-enviada' : `Falló: ${r.error}`,
        })
      }

      case 'cotizacion_enviada': {
        const r = await enviarCotizacionCliente(solicitudId)
        return NextResponse.json({
          accion: 'cotizacion_cliente_v2',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok ? 'Cotización re-enviada' : `Falló: ${r.error}`,
        })
      }

      case 'esperando_repuesto': {
        // Buscar el último repuesto pendiente para re-enviar el aviso
        const { data: rep } = await supabase
          .from('repuestos_pendientes')
          .select('sku, descripcion, tiempo_estimado')
          .eq('solicitud_id', solicitudId)
          .eq('estado', 'pendiente')
          .order('solicitado_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!rep) {
          return NextResponse.json({
            ok: false,
            accion: 'esperando_repuesto_cliente_v1',
            error: 'No hay repuestos pendientes para esta solicitud',
          })
        }
        const r = await enviarEsperandoRepuestoCliente(
          solicitudId,
          rep.sku,
          rep.descripcion,
          rep.tiempo_estimado ?? 'Por confirmar',
        )
        return NextResponse.json({
          accion: 'esperando_repuesto_cliente_v1',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok ? 'Plantilla re-enviada' : `Falló: ${r.error}`,
        })
      }

      // ── Repuesto llegó: el cliente debe elegir una nueva fecha tentativa ──
      case 'repuesto_recibido': {
        const r = await enviarRepuestoRecibidoCliente(solicitudId)
        return NextResponse.json({
          accion: 'repuesto_recibido_cliente_v2',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok
            ? 'Plantilla re-enviada — el cliente puede elegir una nueva fecha tentativa'
            : `Falló: ${r.error}`,
        })
      }

      case 'en_proceso':
        // El cliente ya eligió fecha (reprogramó tras el repuesto) o aprobó la
        // reparación directa. La última señal fue al técnico (texto libre) o la
        // aprobación de cotización — no hay plantilla de cliente para reenviar.
        return NextResponse.json({
          ok: false,
          accion: 'sin_plantilla',
          destinatario: 'cliente',
          mensaje: 'El servicio está en proceso; el cliente ya fue notificado y no hay plantilla específica para reenviar.',
        })

      case 'en_verificacion': {
        // Reenviar la confirmación final al cliente desde su confirmacion_token
        const { data: ev } = await supabase
          .from('evidencias_servicio')
          .select('confirmacion_token')
          .eq('solicitud_id', solicitudId)
          .order('completado_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!ev?.confirmacion_token) {
          return NextResponse.json({
            ok: false,
            accion: 'confirmar_servicio_v4',
            error: 'No hay confirmacion_token (¿evidencia incompleta?)',
          })
        }
        const { data: tec } = await supabase
          .from('tecnicos')
          .select('nombre_completo')
          .eq('id', sol.tecnico_asignado_id)
          .single()
        try {
          const r = await enviarPlantilla(sol.cliente_telefono, 'confirmar_servicio_v4', 'es', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: sol.cliente_nombre },
                { type: 'text', text: tec?.nombre_completo ?? 'Técnico' },
                { type: 'text', text: `${sol.tipo_equipo} ${sol.marca_equipo}` },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: ev.confirmacion_token }],
            },
          ])
          return NextResponse.json({
            accion: 'confirmar_servicio_v4',
            destinatario: 'cliente',
            ok: r.sent,
            filtered: r.filtered ?? false,
            mensaje: r.sent ? 'Plantilla re-enviada' : 'Filtrado por test mode',
          })
        } catch (err) {
          return NextResponse.json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      case 'finalizado_sin_reparacion': {
        const motivo = sol.siguiente_paso_detalle ?? 'Equipo no reparable'
        const r = await enviarFinalizadoSinReparacion(solicitudId, motivo)
        return NextResponse.json({
          accion: 'finalizado_sin_reparacion_v1',
          destinatario: 'cliente',
          ok: r.ok,
          error: r.error,
          mensaje: r.ok ? 'Plantilla re-enviada' : `Falló: ${r.error}`,
        })
      }

      // Terminales — no aplica
      case 'completada':
      case 'cancelada':
      case 'cancelada_cliente':
      case 'cotizacion_rechazada':
      case 'en_disputa':
        return NextResponse.json({
          ok: false,
          accion: 'terminal',
          mensaje: `La solicitud está en estado terminal "${sol.estado}" — no hay mensaje natural para reenviar.`,
        }, { status: 409 })

      default:
        return NextResponse.json({
          ok: false,
          accion: 'desconocido',
          error: `Estado "${sol.estado}" sin handler. Agregar al switch.`,
        }, { status: 500 })
    }
  } catch (err) {
    console.error('[/api/admin/reenviar-ultimo-mensaje] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
