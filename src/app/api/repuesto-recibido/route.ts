import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  enviarRepuestoRecibidoCliente,
  enviarMensajeTexto,
} from '@/lib/services/whatsapp.service'

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
      const { data: updated } = await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'en_proceso' })
        .eq('id', repuesto.solicitud_id)
        .eq('estado', 'esperando_repuesto')
        .select('id, cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id')
        .single()

      // Notificar al cliente (plantilla — funciona aunque ventana 24h cerrada)
      await enviarRepuestoRecibidoCliente(repuesto.solicitud_id).catch(err => {
        console.error('[repuesto-recibido] Error notificando cliente:', err)
      })

      // Notificar al técnico asignado (texto libre — el técnico suele tener
      // ventana 24h abierta porque interactuó al aceptar y al diagnosticar).
      // Esto es la señal para que el técnico vuelva al portal y complete el
      // servicio: el estado ya es en_proceso, así que el botón "Completar
      // servicio" estará visible al abrir /tecnico/{portal_token}.
      if (updated?.tecnico_asignado_id) {
        const { data: tec } = await supabase
          .from('tecnicos')
          .select('nombre_completo, whatsapp, portal_token')
          .eq('id', updated.tecnico_asignado_id)
          .single()

        if (tec?.whatsapp) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird-app.vercel.app'
          const nombreTec = tec.nombre_completo.split(' ')[0]
          const equipo = `${updated.tipo_equipo} ${updated.marca_equipo}`
          const portalUrl = tec.portal_token
            ? `${appUrl}/tecnico/${tec.portal_token}`
            : ''
          const linkLine = portalUrl ? `\n\nAbre tu portal: ${portalUrl}` : ''

          await enviarMensajeTexto(
            tec.whatsapp,
            `📦 Hola ${nombreTec}, los repuestos ya llegaron para el servicio de ${equipo} (${updated.cliente_nombre}). El servicio está en *en_proceso*: ya puedes coordinar la visita y completar la reparación.${linkLine}\n\n— Baird Service`,
          ).catch(err => console.error('[repuesto-recibido] Error notificando técnico:', err))
        }
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
