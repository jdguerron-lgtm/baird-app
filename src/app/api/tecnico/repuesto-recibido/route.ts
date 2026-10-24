import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { marcarRepuestoRecibidoPorTecnico } from '@/lib/services/repuesto-recibido.service'

/**
 * POST /api/tecnico/repuesto-recibido  (JSON: { portalToken, solicitudId })
 *
 * Botón "📦 Llegó el repuesto" de la card del portal del técnico
 * (2026-10-23). Transición esperando_repuesto | repuesto_en_camino →
 * repuesto_recibido con los mismos efectos que el supervisor
 * (/api/supervisor/repuesto-entregado): repuestos → recibido, aviso al
 * cliente para agendar la visita de finalización, evento con actor
 * 'tecnico' y aviso a supervisores. Ver repuesto-recibido.service.ts.
 *
 * Auth: `portal_token` + `tecnico_asignado_id` (mismo patrón que
 * /api/tecnico/confirmar-visita).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const portalToken = typeof body?.portalToken === 'string' ? body.portalToken.trim() : ''
    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const r = await marcarRepuestoRecibidoPorTecnico(solicitudId, {
      tecnicoId: tecnico.id,
      tecnicoNombre: tecnico.nombre_completo,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

    return NextResponse.json({
      success: true,
      estado: 'repuesto_recibido',
      estado_previo: r.estadoPrevio,
      cliente_notificado: r.clienteNotificado,
    })
  } catch (err) {
    console.error('Error en /api/tecnico/repuesto-recibido:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
