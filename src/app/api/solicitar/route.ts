import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'
import { calcularPagoTecnico } from '@/types/solicitud'
import crypto from 'crypto'

/**
 * POST /api/solicitar
 *
 * Crea una solicitud y arranca el flujo customer-first:
 * 1. Inserta solicitud con estado='pendiente_horario' y horario_token único
 * 2. Envía plantilla cliente_seleccion_horario_v1 con CTA a /horario/{token}
 * 3. NO notifica técnicos todavía — eso ocurre tras /api/confirmar-horario
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const parsed = solicitudFormSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { error: firstError?.message || 'Datos inválidos' },
        { status: 400 }
      )
    }

    const formData = parsed.data
    const horarioToken = crypto.randomUUID()

    // Recalcular pago_tecnico server-side para evitar manipulación del cliente.
    // El frontend lo envía pero la fuente de verdad es la tabla TARIFAS_MANTENIMIENTO.
    const pagoTecnicoCalculado = calcularPagoTecnico(
      formData.tipo_equipo,
      formData.tipo_solicitud,
      formData.es_garantia,
    )

    const dataToInsert = {
      ...formData,
      pago_tecnico: pagoTecnicoCalculado,
      ciudad_pueblo: formData.ciudad_pueblo.trim(),
      zona_servicio: formData.zona_servicio.trim(),
      direccion: formData.direccion.trim(),
      cliente_nombre: formData.cliente_nombre.trim(),
      numero_serie_factura: formData.es_garantia ? formData.numero_serie_factura : null,
      estado: 'pendiente_horario' as const,
      horario_token: horarioToken,
    }

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

    // Enviar plantilla al cliente para que elija horario
    let waEnviado = false
    try {
      const result = await enviarSeleccionHorarioCliente(solicitud.id)
      waEnviado = result.ok
      if (!result.ok) {
        console.error('Error enviando selección de horario:', result.error)
      }
    } catch (waErr) {
      console.error('Error enviando WhatsApp inicial:', waErr)
    }

    return NextResponse.json({
      success: true,
      id: solicitud.id,
      horario_token: horarioToken,
      whatsapp_enviado: waEnviado,
    })
  } catch (error) {
    console.error('Error en /api/solicitar:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
