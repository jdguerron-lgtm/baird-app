import { after, NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'
import { confirmarHorarioSolicitud } from '@/lib/services/transiciones.service'
import { geocodificarYGuardar } from '@/lib/services/geocoding.service'
import { calcularPagoTecnico } from '@/types/solicitud'
import { pagoNetoTecnicoTarifaFija, PAGO_TECNICO_DIAGNOSTICO } from '@/lib/constants/tarifas/particular'
import crypto from 'crypto'

// El auto-agendamiento corre notificarTecnicos inline (varios segundos por
// técnico) — mismo margen que /api/confirmar-horario.
export const maxDuration = 60

/**
 * POST /api/solicitar
 *
 * Crea una solicitud y arranca el flujo customer-first:
 * 1. Inserta solicitud con estado='pendiente_horario' y horario_token único
 * 2. PARTICULAR: auto-agenda la opción 1 del formulario (fallback opción 2)
 *    vía confirmarHorarioSolicitud — la solicitud pasa directo a 'notificada'
 *    sin esperar al cliente en /horario/{token}. El formulario ya exige
 *    aceptar TyC, y el picker emite el formato canónico parseable, así que
 *    la validación de cupo por franja aplica de verdad.
 * 3. Fallback (garantía, o ambas opciones sin cupo por carrera): envía la
 *    plantilla cliente_seleccion_horario_v2 con CTA a /horario/{token} y la
 *    solicitud queda en 'pendiente_horario' como antes.
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
    const clienteToken = crypto.randomUUID()

    // Recalcular pago_tecnico server-side para evitar manipulación del cliente.
    // El frontend lo envía pero la fuente de verdad es la tabla TARIFAS_MANTENIMIENTO.
    //
    // IMPORTANTE: `pago_tecnico` guarda el NETO que recibe el técnico, NO el
    // precio de catálogo al cliente. En servicios particulares (reseller) el
    // cliente paga catálogo y el técnico recibe catálogo ÷ 1.3447 × 0.8 (Baird
    // retiene utilidad 13% + IVA 19% + el ajuste −20% del 2026-07-09).
    // Excepción (2026-07-05): la visita de diagnóstico
    // (Diagnóstico/Reparación) paga el fijo PAGO_TECNICO_DIAGNOSTICO ($35.000)
    // aunque el cliente sigue pagando TARIFA_DIAGNOSTICO ($84.000); si luego
    // el cliente aprueba una cotización, /api/diagnostico sobreescribe con el
    // costo cotizado. El precio al cliente se deriva donde se necesite vía
    // precioClienteServicio()/calcularPagoTecnico(). Garantía → 0.
    const precioClienteCatalogo = calcularPagoTecnico(
      formData.tipo_equipo,
      formData.tipo_solicitud,
      formData.es_garantia,
    )
    const esVisitaDiagnostico =
      formData.tipo_solicitud === 'Diagnóstico' || formData.tipo_solicitud === 'Reparación'
    const pagoTecnicoCalculado = formData.es_garantia
      ? 0
      : esVisitaDiagnostico
        ? PAGO_TECNICO_DIAGNOSTICO
        : pagoNetoTecnicoTarifaFija(precioClienteCatalogo)

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
      cliente_token: clienteToken,
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

    // PARTICULAR: auto-agendar la opción 1 (fallback opción 2). La transición
    // reutiliza confirmarHorarioSolicitud (misma dueña que /api/confirmar-horario):
    // valida cupo por franja + mínimo mañana, pasa a 'notificada', envía la
    // confirmación WhatsApp al cliente y notifica técnicos.
    let agendado = false
    let horarioAgendado: string | null = null
    let notificados = 0
    let waEnviado = false

    if (!formData.es_garantia) {
      for (const opcion of [formData.horario_visita_1, formData.horario_visita_2]) {
        try {
          const r = await confirmarHorarioSolicitud(horarioToken, opcion)
          if (r.ok) {
            agendado = true
            horarioAgendado = opcion
            notificados = Number(r.body.notificados ?? 0)
            waEnviado = true
            break
          }
          console.warn(`[solicitar] auto-agendar "${opcion}" rechazado:`, r.body.error)
        } catch (err) {
          console.error('[solicitar] auto-agendar falló:', err)
        }
      }
    }

    // Fallback (garantía, o ninguna opción con cupo): plantilla de selección
    // de horario con CTA a /horario/{token} — flujo customer-first previo.
    if (!agendado) {
      try {
        const result = await enviarSeleccionHorarioCliente(solicitud.id)
        waEnviado = result.ok
        if (!result.ok) {
          console.error('Error enviando selección de horario:', result.error)
        }
      } catch (waErr) {
        console.error('Error enviando WhatsApp inicial:', waErr)
      }
    }

    // Geocoding fire-and-forget — after() corre tras enviar la respuesta al cliente.
    // No bloquea el response; si falla solo loguea (la solicitud queda sin coords y
    // el backfill o la próxima edición admin lo intentará de nuevo).
    after(async () => {
      try {
        await geocodificarYGuardar(solicitud.id)
      } catch (err) {
        console.error(`[solicitar] geocoding falló para solicitud ${solicitud.id}:`, err)
      }
    })

    return NextResponse.json({
      success: true,
      id: solicitud.id,
      horario_token: horarioToken,
      cliente_token: clienteToken,
      whatsapp_enviado: waEnviado,
      agendado,
      horario: horarioAgendado,
      notificados,
    })
  } catch (error) {
    console.error('Error en /api/solicitar:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
