import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  enviarRepuestoLlegadoTecnico,
  enviarRepuestoRecibidoCliente,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'

/**
 * POST /api/repuesto-recibido
 *
 * Admin marca un repuesto como recibido. Reactiva la solicitud:
 *   - Marca el registro de repuestos_pendientes como 'recibido'
 *   - Si todos los repuestos de la solicitud están recibidos:
 *     - Cambia estado de la solicitud a 'repuesto_recibido' (NO en_proceso).
 *       Entre el diagnóstico y la llegada del repuesto pueden pasar semanas,
 *       así que la fecha original quedó obsoleta: el cliente debe elegir una
 *       nueva fecha (tentativa) antes de avanzar a en_proceso.
 *     - Genera reprogramacion_token y notifica al cliente vía plantilla
 *       repuesto_recibido_cliente_v2 (botón → /reprogramar-repuesto/{token}).
 *     - Notifica al técnico que el repuesto ya fue entregado (plantilla
 *       repuesto_llegado_tecnico_v1, informativa). La fecha tentativa le llega
 *       después, cuando el cliente la elige en /api/reprogramar-repuesto
 *       (pasa a en_proceso y avisa vía repuesto_recibido_tecnico_v1).
 *     - Notifica a supervisores vía notificarCambioEstado: en garantía con la
 *       plantilla de repuesto (No. garantía + SKU + dirección); en particular
 *       con la genérica de cambio de estado.
 *
 * Body: { repuestoId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { repuestoId } = await req.json()

    if (!repuestoId) {
      return NextResponse.json({ error: 'Falta repuestoId' }, { status: 400 })
    }

    const { data: repuesto } = await supabase
      .from('repuestos_pendientes')
      .select('id, solicitud_id, estado')
      .eq('id', repuestoId)
      .single()

    if (!repuesto) {
      return NextResponse.json({ error: 'Repuesto no encontrado' }, { status: 404 })
    }
    if (repuesto.estado === 'recibido') {
      return NextResponse.json({ error: 'Ya marcado como recibido' }, { status: 400 })
    }

    // Marcar este repuesto como recibido
    await supabase
      .from('repuestos_pendientes')
      .update({ estado: 'recibido', recibido_at: new Date().toISOString() })
      .eq('id', repuestoId)

    // Verificar si quedan repuestos pendientes para esta solicitud
    const { data: pendientes } = await supabase
      .from('repuestos_pendientes')
      .select('id')
      .eq('solicitud_id', repuesto.solicitud_id)
      .eq('estado', 'pendiente')

    const todosRecibidos = !pendientes || pendientes.length === 0

    if (todosRecibidos) {
      // Atomic transition: solo cambia si seguía en esperando_repuesto.
      // Evita carrera si admin marca dos repuestos casi al mismo tiempo o
      // si cliente cancela mientras admin recibe.
      //
      // Pasa a 'repuesto_recibido' (no en_proceso): genera el token de
      // reprogramación y marca repuesto_recibido_at. El cliente elige nueva
      // fecha en /reprogramar-repuesto/{token}; recién ahí pasa a en_proceso.
      const reprogToken = crypto.randomUUID()
      const { data: updated } = await supabase
        .from('solicitudes_servicio')
        .update({
          estado: 'repuesto_recibido',
          reprogramacion_token: reprogToken,
          repuesto_recibido_at: new Date().toISOString(),
        })
        .eq('id', repuesto.solicitud_id)
        .eq('estado', 'esperando_repuesto')
        .select('id')
        .single()

      // Solo notificar si la transición la ganó esta llamada (updated != null).
      // Si otra llamada concurrente ya movió la fila, no re-notificamos.
      if (updated) {
        // Notificar al cliente (plantilla con botón → reprogramar fecha).
        // Funciona aunque la ventana 24h esté cerrada.
        await enviarRepuestoRecibidoCliente(repuesto.solicitud_id).catch(err => {
          console.error('[repuesto-recibido] Error notificando cliente:', err)
        })
        // Notificar al técnico que el repuesto ya fue entregado al cliente
        // (informativo — la fecha tentativa le llega cuando el cliente la elija).
        const tecResult = await enviarRepuestoLlegadoTecnico(repuesto.solicitud_id)
        if (!tecResult.ok) console.error('[repuesto-recibido] Error notificando técnico:', tecResult.error)
        await notificarCambioEstado(repuesto.solicitud_id, 'esperando_repuesto', 'repuesto_recibido')
      }
    }

    return NextResponse.json({ success: true, todos_recibidos: todosRecibidos })
  } catch (error) {
    console.error('Error en /api/repuesto-recibido:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
