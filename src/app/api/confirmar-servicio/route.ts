import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { confirmacionToken, confirmado, comentario } = await req.json()

    if (!confirmacionToken || typeof confirmado !== 'boolean') {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // Find evidence by confirmation token
    const { data: evidencia } = await supabase
      .from('evidencias_servicio')
      .select('id, solicitud_id, confirmado')
      .eq('confirmacion_token', confirmacionToken)
      .single()

    if (!evidencia) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
    }

    if (evidencia.confirmado !== null) {
      return NextResponse.json({ error: 'Ya fue confirmado anteriormente' }, { status: 400 })
    }

    // Update evidence
    await supabase
      .from('evidencias_servicio')
      .update({
        confirmado,
        confirmado_at: new Date().toISOString(),
        cliente_comentario: comentario || null,
      })
      .eq('id', evidencia.id)

    // Update solicitud estado
    await supabase
      .from('solicitudes_servicio')
      .update({ estado: confirmado ? 'completada' : 'en_disputa' })
      .eq('id', evidencia.solicitud_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en confirmar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
