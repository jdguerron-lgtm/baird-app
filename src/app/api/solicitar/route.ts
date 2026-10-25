import { after, NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'
import { confirmarHorarioSolicitud } from '@/lib/services/transiciones.service'
import { geocodificarYGuardar } from '@/lib/services/geocoding.service'
import { resolverTecnicoPreferido } from '@/lib/services/tecnicos-elegibles.service'
import { validarCodigoDescuento } from '@/lib/services/descuentos.service'
import { calcularPagoTecnico } from '@/types/solicitud'
import { pagoNetoTecnicoTarifaFija, PAGO_TECNICO_DIAGNOSTICO } from '@/lib/constants/tarifas/particular'
import { parsearOrigen } from '@/lib/validations/origen.schema'
import crypto from 'crypto'

/** Error de PostgREST por una columna que no está en el schema cache. */
function esColumnaFaltante(err: { code?: string; message?: string }, columna: string): boolean {
  return err.code === 'PGRST204' || (err.message ?? '').includes(`'${columna}' column`)
}

// El auto-agendamiento corre notificarTecnicos inline (varios segundos por
// técnico) — mismo margen que /api/confirmar-horario.
export const maxDuration = 60

/**
 * POST /api/solicitar
 *
 * Crea una solicitud y arranca el flujo:
 * 1. Inserta solicitud con estado='pendiente_horario' y horario_token único
 * 2. Auto-agenda la opción 1 del formulario (fallback opción 2) vía
 *    confirmarHorarioSolicitud — la solicitud pasa directo a 'notificada'
 *    sin esperar al cliente en /horario/{token}. El formulario ya exige
 *    aceptar TyC, y el picker emite el formato canónico parseable, así que
 *    la validación de cupo por franja aplica de verdad. Desde 2026-08-02
 *    aplica TAMBIÉN a garantía: el formulario ya recogió las 2 fechas y
 *    re-pedirlas por WhatsApp era redundante (confirmarHorarioSolicitud es
 *    agnóstica al flujo: recargo finde es no-op en garantía y
 *    notificarTecnicos usa la plantilla de garantía). El flujo customer-first
 *    vía /horario/{token} sigue vivo para carga masiva (Excel MABE sin
 *    fechas) y como fallback.
 * 3. Fallback (ambas opciones sin cupo o inválidas): envía la plantilla
 *    cliente_seleccion_horario_v2 con CTA a /horario/{token} y la solicitud
 *    queda en 'pendiente_horario' como antes.
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

    // edificio_conjunto / apto_casa NO son columnas en BD: se anexan a
    // `direccion` (solo particular) para que lleguen a técnicos, admin y
    // supervisores por los caminos existentes sin migración ni cambios de
    // plantilla. Se excluyen del insert para no romperlo.
    const { edificio_conjunto, apto_casa, tecnico_preferido_id, codigo_descuento, ...datosSolicitud } = formData

    // Código de descuento (2026-10-19, solo particular). Se valida de nuevo
    // server-side y se guarda un SNAPSHOT (código/tipo/valor) en la solicitud:
    // el monto se calcula al cobrar el saldo final (descuentoClienteParaCobro).
    // Un código inválido RECHAZA la solicitud (400) para que el cliente sepa
    // que no obtuvo el descuento, en vez de ignorarlo en silencio. En garantía
    // el cliente no paga: el código se ignora.
    let descuentoSnapshot: {
      codigo_descuento_id: string
      descuento_codigo: string
      descuento_tipo: 'porcentaje' | 'valor'
      descuento_valor: number
    } | null = null
    if (!formData.es_garantia && codigo_descuento) {
      const r = await validarCodigoDescuento(codigo_descuento)
      if (!r.ok) {
        return NextResponse.json({ error: `Código de descuento: ${r.motivo}` }, { status: 400 })
      }
      descuentoSnapshot = {
        codigo_descuento_id: r.descuento.id,
        descuento_codigo: r.descuento.codigo,
        descuento_tipo: r.descuento.tipo,
        descuento_valor: r.descuento.valor,
      }
    }
    const direccionCompleta = [
      formData.direccion.trim(),
      ...(formData.es_garantia ? [] : [edificio_conjunto?.trim(), apto_casa?.trim()]),
    ].filter(Boolean).join(', ')

    // Técnico de preferencia (2026-10-15, opcional): solo se persiste si el id
    // es de un técnico elegible para esta ciudad + tipo de equipo (verificado,
    // visible_para_cliente, con cobertura). Id manipulado u oculto → null =
    // oferta abierta como siempre. notificarTecnicos manda la PRIMERA oferta
    // solo a él; los reenvíos del admin llegan a todos. En garantía se ignora
    // (2026-10-22): el formulario no muestra el selector y la marca manda la
    // orden, así que un id que llegue igual (form viejo cacheado, request a
    // mano) no debe desviar la oferta.
    const tecnicoPreferidoId = await resolverTecnicoPreferido({
      tecnicoId: formData.es_garantia ? null : tecnico_preferido_id,
      ciudad: formData.ciudad_pueblo,
      tipoEquipo: formData.tipo_equipo,
    })

    const dataToInsert = {
      ...datosSolicitud,
      // Solo se incluye la columna cuando hay preferencia: así el deploy no
      // depende del orden con la migración 20261015 (sin columna y sin
      // preferencia el insert es idéntico al de siempre).
      ...(tecnicoPreferidoId ? { tecnico_preferido_id: tecnicoPreferidoId } : {}),
      // Snapshot del descuento solo cuando hay código válido (mismo criterio:
      // sin código el insert es idéntico al de siempre).
      ...(descuentoSnapshot ?? {}),
      pago_tecnico: pagoTecnicoCalculado,
      ciudad_pueblo: formData.ciudad_pueblo.trim(),
      zona_servicio: formData.zona_servicio.trim(),
      direccion: direccionCompleta,
      cliente_nombre: formData.cliente_nombre.trim(),
      // Cédula opcional para facturación (2026-08-25): vacío → null =
      // consumidor final. Columna cliente_cedula (migración 20260825).
      cliente_cedula: formData.cliente_cedula?.trim() || null,
      numero_serie_factura: formData.es_garantia ? formData.numero_serie_factura : null,
      estado: 'pendiente_horario' as const,
      horario_token: horarioToken,
      cliente_token: clienteToken,
    }

    // Origen del lead (2026-10-24): gclid/utm/referrer/landing que el
    // navegador guardó al llegar al sitio, con el canal ya clasificado. Viaja
    // como `origen` fuera del formulario (el schema del form lo descarta).
    // Inválido o ausente → no se guarda; nunca rechaza la solicitud.
    const origen = parsearOrigen((body as { origen?: unknown } | null)?.origen)

    const insertar = (fila: Record<string, unknown>) =>
      supabase.from('solicitudes_servicio').insert([fila]).select().single()

    let { data: solicitud, error: insertErr } = await insertar(
      origen ? { ...dataToInsert, origen } : dataToInsert,
    )
    // Si la columna `origen` aún no existe (deploy antes de la migración
    // 20261024_solicitudes_origen.sql), PostgREST responde PGRST204: se
    // reintenta sin ella para no perder el lead.
    if (origen && insertErr && esColumnaFaltante(insertErr, 'origen')) {
      console.warn('[solicitar] columna origen no existe todavía; se guarda sin origen')
      ;({ data: solicitud, error: insertErr } = await insertar(dataToInsert))
    }

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

    // Auto-agendar la opción 1 (fallback opción 2) — particular Y garantía
    // (2026-08-02: el formulario ya recogió las fechas; re-pedirlas por
    // WhatsApp era redundante). La transición reutiliza
    // confirmarHorarioSolicitud (misma dueña que /api/confirmar-horario):
    // valida cupo por franja + mínimo mañana, pasa a 'notificada', envía la
    // confirmación WhatsApp al cliente y notifica técnicos.
    let agendado = false
    let horarioAgendado: string | null = null
    let notificados = 0
    let waEnviado = false

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

    // Fallback (ninguna opción con cupo o válida): plantilla de selección
    // de horario con CTA a /horario/{token} — flujo customer-first previo.
    // Carga masiva (Excel MABE, sin fechas) no pasa por acá: usa su propio
    // route que envía esta misma plantilla directamente.
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
      descuento: descuentoSnapshot
        ? { codigo: descuentoSnapshot.descuento_codigo, tipo: descuentoSnapshot.descuento_tipo, valor: descuentoSnapshot.descuento_valor }
        : null,
    })
  } catch (error) {
    console.error('Error en /api/solicitar:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
