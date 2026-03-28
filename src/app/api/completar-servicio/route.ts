import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { phoneToDigits } from '@/lib/utils/phone'
import { formatCOP } from '@/lib/utils/format'

const WA_API_BASE = 'https://graph.facebook.com/v21.0'

export async function POST(req: NextRequest) {
  try {
    const { solicitudId, portalToken } = await req.json()

    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // Verify portal token belongs to the assigned technician
    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()

    if (!tecnico) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // Verify this technician is assigned to this solicitud
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, pago_tecnico')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()

    if (!sol) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    // Get the confirmation token from evidencias
    const { data: evidencia } = await supabase
      .from('evidencias_servicio')
      .select('confirmacion_token')
      .eq('solicitud_id', solicitudId)
      .eq('tecnico_id', tecnico.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!evidencia) {
      return NextResponse.json({ error: 'Evidencia no encontrada' }, { status: 404 })
    }

    // Send WhatsApp to customer asking for confirmation
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird-app.vercel.app'
    const confirmUrl = `${appUrl}/confirmar/${evidencia.confirmacion_token}`

    const phoneId = process.env.WHATSAPP_PHONE_ID
    const waToken = process.env.WHATSAPP_API_TOKEN

    if (phoneId && waToken) {
      const bodyText = [
        `*Servicio completado - Baird Service*`,
        ``,
        `Tu tecnico *${tecnico.nombre_completo}* ha registrado la finalizacion del servicio:`,
        ``,
        `*Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
        `*Valor:* $${formatCOP(sol.pago_tecnico)} COP`,
        ``,
        `Por favor confirma si quedaste satisfecho con el servicio.`,
      ].join('\n')

      const interactive = {
        type: 'cta_url',
        body: { text: bodyText },
        header: { type: 'text', text: 'Confirma tu servicio' },
        footer: { text: 'Baird Service - Tecnicos verificados' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'Confirmar servicio',
            url: confirmUrl,
          },
        },
      }

      await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneToDigits(sol.cliente_telefono),
          type: 'interactive',
          interactive,
        }),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en completar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
