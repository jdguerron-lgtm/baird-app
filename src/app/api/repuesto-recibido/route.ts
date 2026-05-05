import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarRepuestoRecibidoCliente } from '@/lib/services/whatsapp.service'

/**
 * POST /api/repuesto-recibido
 *
 * Admin marca un repuesto como recibido. Reactiva la solicitud:
 *   - Marca el registro de repuestos_pendientes como 'recibido'
 *   - Si todos los repuestos de la solicitud están recibidos:
 *     - Cambia estado de la solicitud a 'en_proceso' (lista para reparación)
 *     - Notifica al cliente vía plantilla repuesto_recibido_cliente_v1
 *
 * Body: { repuestoId: string }
 */
export async function POST(req: NextRequest) {
  try {
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
      await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'en_proceso' })
        .eq('id', repuesto.solicitud_id)
        .eq('estado', 'esperando_repuesto')

      // Notificar al cliente
      await enviarRepuestoRecibidoCliente(repuesto.solicitud_id).catch(err => {
        console.error('Error notificando cliente:', err)
      })
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
