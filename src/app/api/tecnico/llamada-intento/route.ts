import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * POST /api/tecnico/llamada-intento
 *
 * Registra que el técnico tocó el botón "📞 Llamar" en la card de un servicio
 * de su portal — la llamada en sí la hace el teléfono con el link tel:, acá
 * solo queda la INTENCIÓN en el audit log para que el equipo vea que el
 * técnico intentó contactar al cliente:
 *   tipo    = 'llamada_tecnico'
 *   actor   = 'tecnico'
 *   payload = { origen: 'portal_tecnico', tecnico_nombre }
 *
 * Best-effort desde el frontend (fire-and-forget antes de abrir tel:) — si
 * falla no bloquea la llamada. Requiere migración
 * 20260807_llamadas_y_recordatorios.sql.
 *
 * Body: { solicitudId: string, portalToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const portalToken = typeof body?.portalToken === 'string' ? body.portalToken.trim() : ''

    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // Autenticación por portal_token (mismo patrón que /api/diagnostico)
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // Solo sobre servicios asignados a este técnico
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()
    if (!sol) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    const { error: insErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: solicitudId,
      tipo: 'llamada_tecnico',
      estado_previo: sol.estado,
      estado_nuevo: sol.estado,
      actor: 'tecnico',
      motivo: `${tecnico.nombre_completo} tocó "Llamar" para contactar al cliente desde su portal`,
      payload: { origen: 'portal_tecnico', tecnico_nombre: tecnico.nombre_completo },
    })
    if (insErr) {
      console.error('[tecnico/llamada-intento] insert falló:', insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error en /api/tecnico/llamada-intento:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
