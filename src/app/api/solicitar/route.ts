import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import { notificarTecnicos, enviarMensajeTexto } from '@/lib/services/whatsapp.service'
import { phoneToDigits } from '@/lib/utils/phone'

/**
 * POST /api/solicitar
 *
 * Crea una solicitud de servicio y dispara notificaciones:
 * 1. Inserta la solicitud en la BD
 * 2. Envía WhatsApp de confirmación al cliente
 * 3. Notifica a técnicos compatibles por WhatsApp
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate with Zod
    const parsed = solicitudFormSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { error: firstError?.message || 'Datos inválidos' },
        { status: 400 }
      )
    }

    const formData = parsed.data

    // Normalize text fields
    const dataToInsert = {
      ...formData,
      ciudad_pueblo: formData.ciudad_pueblo.trim(),
      zona_servicio: formData.zona_servicio.trim(),
      direccion: formData.direccion.trim(),
      cliente_nombre: formData.cliente_nombre.trim(),
      numero_serie_factura: formData.es_garantia ? formData.numero_serie_factura : null,
    }

    // 1. Insert solicitud
    const { data: solicitud, error: insertErr } = await supabase
      .from('solicitudes_servicio')
      .insert([dataToInsert])
      .select()
      .single()

    if (insertErr || !solicitud) {
      console.error('Error insertando solicitud:', insertErr)

      if (insertErr?.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una solicitud con estos datos' }, { status: 409 })
      }

      return NextResponse.json(
        { error: insertErr?.message || 'Error al crear la solicitud' },
        { status: 500 }
      )
    }

    // 2. Send WhatsApp confirmation to customer (non-blocking)
    const clienteNombre = dataToInsert.cliente_nombre.split(' ')[0]
    const equipo = `${formData.tipo_equipo} ${formData.marca_equipo}`

    try {
      const telefono = phoneToDigits(formData.cliente_telefono)
      if (telefono) {
        await enviarMensajeTexto(
          formData.cliente_telefono,
          `👋 Hola ${clienteNombre}, recibimos tu solicitud de servicio para tu ${equipo}.\n\n🔍 Estamos buscando técnicos verificados en tu zona. Te notificaremos cuando un técnico acepte tu servicio. ✅\n\n🔧 Baird Service`
        )
      }
    } catch (waErr) {
      console.error('Error enviando confirmación al cliente:', waErr)
    }

    // 3. Notify matching technicians (non-blocking)
    let notificados = 0
    let matched = 0

    try {
      const result = await notificarTecnicos(solicitud.id)
      notificados = result.notificados
      matched = result.matched
    } catch (notifyErr) {
      console.error('Error notificando técnicos:', notifyErr)
    }

    return NextResponse.json({
      success: true,
      id: solicitud.id,
      notificados,
      matched,
    })
  } catch (error) {
    console.error('Error en /api/solicitar:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
