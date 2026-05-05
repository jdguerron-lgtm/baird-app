import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/gps-ping
 *
 * Registra un ping GPS del técnico durante la visita.
 * Body: { solicitudId, fase: 'llegada'|'diagnostico'|'completado'|'post_visita', lat, lng }
 */
export async function POST(req: NextRequest) {
  try {
    const { solicitudId, fase, lat, lng } = await req.json()

    if (!solicitudId || !fase || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const validFases = ['llegada', 'diagnostico', 'completado', 'post_visita']
    if (!validFases.includes(fase)) {
      return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
    }

    // Obtener técnico asignado
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('tecnico_asignado_id')
      .eq('id', solicitudId)
      .single()

    if (!sol?.tecnico_asignado_id) {
      return NextResponse.json({ error: 'Solicitud sin técnico asignado' }, { status: 400 })
    }

    // Insertar ping
    const { error: insertErr } = await supabase
      .from('gps_pings')
      .insert({
        solicitud_id: solicitudId,
        tecnico_id: sol.tecnico_asignado_id,
        lat,
        lng,
        fase,
      })

    if (insertErr) {
      console.error('Error insertando GPS ping:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Reflejar coords en evidencias_servicio para acceso rápido
    const updateField = `gps_${fase}_lat` as const
    const updateFieldLng = `gps_${fase}_lng` as const
    const updateFieldAt = fase === 'post_visita' ? 'gps_post_visita_at' : null

    const updatePayload: Record<string, unknown> = {
      [updateField]: lat,
      [updateFieldLng]: lng,
    }
    if (updateFieldAt) updatePayload[updateFieldAt] = new Date().toISOString()

    await supabase
      .from('evidencias_servicio')
      .update(updatePayload)
      .eq('solicitud_id', solicitudId)
      .eq('tecnico_id', sol.tecnico_asignado_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en /api/gps-ping:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
