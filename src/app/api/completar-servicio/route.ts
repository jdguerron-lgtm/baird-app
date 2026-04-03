import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { phoneToDigits } from '@/lib/utils/phone'
import { formatCOP } from '@/lib/utils/format'
import { WA_API_BASE } from '@/lib/services/whatsapp.service'

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

    // Extract model from novedades if present
    const modeloMatch = sol.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
    const modelo = modeloMatch ? modeloMatch[1] : null

    // Build checklist summary
    const checklist = evidencia.checklist as Record<string, boolean | string> | null
    const checklistItems: string[] = []
    if (checklist?.diagnostico_realizado) checklistItems.push('Diagnostico realizado')
    if (checklist?.prueba_encendido) checklistItems.push('Prueba de encendido')
    if (checklist?.prueba_ciclo_completo) checklistItems.push('Prueba ciclo completo')
    if (checklist?.pieza_reemplazada) checklistItems.push('Pieza reemplazada')
    if (checklist?.limpieza_area) checklistItems.push('Limpieza del area')
    if (checklist?.explicacion_cliente) checklistItems.push('Explicacion al cliente')

    // Send WhatsApp to customer asking for confirmation
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baird-app.vercel.app'
    const confirmUrl = `${appUrl}/confirmar/${evidencia.confirmacion_token}`

    const phoneId = process.env.WHATSAPP_PHONE_ID
    const waToken = process.env.WHATSAPP_API_TOKEN

    if (phoneId && waToken) {
      // Message 1: Structured service completion with CTA
      const bodyLines = [
        `✅ *Servicio completado*`,
        `━━━━━━━━━━━━━━━━━━━`,
        ``,
        `👨‍🔧 *Tecnico:* ${tecnico.nombre_completo}`,
        `📄 *Documento:* ${tecnico.numero_documento || 'Verificado'}`,
        ``,
        `🔧 *Equipo:* ${sol.tipo_equipo} ${sol.marca_equipo}`,
      ]

      if (modelo) {
        bodyLines.push(`📋 *Modelo:* ${modelo}`)
      }

      if (sol.es_garantia) {
        bodyLines.push(
          `🛡️ *Servicio en garantia*`,
          `✅ *No debes realizar ningun pago.* El costo es asumido por el fabricante.`,
        )
      } else {
        bodyLines.push(`💰 *Valor:* $${formatCOP(sol.pago_tecnico)} COP`)
      }

      bodyLines.push(
        ``,
        `━━━━━━━━━━━━━━━━━━━`,
        `✅ *Trabajos realizados:*`,
      )

      if (checklistItems.length > 0) {
        checklistItems.forEach(item => bodyLines.push(`  • ${item}`))
      } else {
        bodyLines.push(`  • Servicio completado`)
      }

      bodyLines.push(
        ``,
        `⭐ *Por favor califica el servicio* (1 a 10)`,
        `Tu opinion nos ayuda a mejorar.`,
      )

      const bodyText = bodyLines.join('\n')

      const interactive = {
        type: 'cta_url',
        body: { text: bodyText },
        header: { type: 'text', text: '🔔 Califica tu servicio — Baird Service' },
        footer: { text: '⭐ Tecnicos verificados en Colombia' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: '⭐ Calificar servicio',
            url: confirmUrl,
          },
        },
      }

      const waRes = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
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

      const waData = await waRes.json()

      if (!waRes.ok) {
        console.error('WhatsApp send error:', JSON.stringify(waData))
        return NextResponse.json({
          success: true,
          whatsapp_sent: false,
          whatsapp_error: waData.error?.message || 'Error enviando WhatsApp',
        })
      }

      return NextResponse.json({
        success: true,
        whatsapp_sent: true,
        message_id: waData.messages?.[0]?.id,
      })
    }

    return NextResponse.json({ success: true, whatsapp_sent: false, reason: 'WhatsApp not configured' })
  } catch (error) {
    console.error('Error en completar-servicio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
