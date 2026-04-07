import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enviarPlantilla } from '@/lib/services/whatsapp.service'

export async function POST(req: NextRequest) {
  try {
    const { solicitudId, portalToken } = await req.json()

    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parametros' }, { status: 400 })
    }

    // Verify portal token belongs to the assigned technician
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, numero_documento, foto_perfil_url, telefono')
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
      await enviarPlantilla(sol.cliente_telefono, 'confirmar_servicio_v3', 'es', [
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
