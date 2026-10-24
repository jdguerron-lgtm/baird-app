import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { confirmarVisita, liberarTecnico } from '@/lib/services/confirmacion-visita.service'

/**
 * POST /api/tecnico/confirmar-visita
 *
 * Botones "✅ Confirmo" / "❌ No alcanzo" de la card del portal del técnico
 * (docs/PROTOCOLO-VISITA.md § "Fase 0").
 *
 *   accion = 'confirmar'   → visita_confirmada_at/por='tecnico' + evento
 *                            `visita_confirmada`. Idempotente.
 *   accion = 'no_alcanzo'  → liberarTecnico(): el servicio vuelve a
 *                            `notificada`, evento `tecnico_liberado` y
 *                            reoferta URGENTE a los demás técnicos. Solo
 *                            desde `asignada`.
 *
 * Autenticación por `portal_token` (mismo patrón que /api/tecnico/llamada-intento);
 * solo sobre servicios asignados a ese técnico.
 *
 * Body: { portalToken: string, solicitudId: string, accion: 'confirmar' | 'no_alcanzo', motivo?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const portalToken = typeof body?.portalToken === 'string' ? body.portalToken.trim() : ''
    const accion = body?.accion === 'confirmar' || body?.accion === 'no_alcanzo' ? body.accion : null
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''

    if (!solicitudId || !portalToken || !accion) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    if (accion === 'confirmar') {
      const r = await confirmarVisita(solicitudId, { por: 'tecnico', actor: tecnico.nombre_completo, tecnicoId: tecnico.id })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
      return NextResponse.json({ success: true, accion, yaEstaba: r.yaEstaba === true })
    }

    const r = await liberarTecnico(solicitudId, {
      motivo: 'no_alcanzo',
      actor: tecnico.nombre_completo,
      tecnicoId: tecnico.id,
      detalle: motivo || undefined,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
    return NextResponse.json({
      success: true,
      accion,
      reoferta: r.reoferta ? { notificados: r.reoferta.notificados, matched: r.reoferta.matched } : null,
    })
  } catch (err) {
    console.error('Error en /api/tecnico/confirmar-visita:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
