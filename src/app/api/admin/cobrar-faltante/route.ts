import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import {
  enviarPagoSaldoCliente,
  enviarAbonoRepuestosCliente,
  enviarCobroAnticipoCliente,
} from '@/lib/services/whatsapp.service'
import {
  cargarSolicitudPago,
  calcularMontoSaldo,
  calcularMontoAbonoRepuestos,
  calcularMontoAnticipo,
} from '@/lib/services/pagos.service'
import { faltanteCobroCliente, type SolicitudParaEtapaPago } from '@/lib/constants/pago-cliente'

export const maxDuration = 30

/**
 * Estados en los que el servicio ya se hizo: el saldo sale con el mensaje de
 * cierre (`saldo_final_cliente_v1`). Incluye los cierres sin reparación y la
 * cancelación tras la visita, donde se cobra el diagnóstico (2026-11-05).
 */
const ESTADOS_CIERRE = new Set([
  'confirmacion_pendiente', 'completada',
  'cotizacion_rechazada', 'reparacion_rechazada', 'finalizado_sin_reparacion', 'cancelada',
])

/**
 * POST /api/admin/cobrar-faltante  (2026-11-03)
 *
 * Reenvía al cliente PARTICULAR, por WhatsApp, el link de pago Wompi de lo
 * que le falta pagar HOY, en cualquier etapa (`faltanteCobroCliente`):
 *   - anticipo pendiente → /pago/anticipo (`enviarCobroAnticipoCliente`)
 *   - abono de repuestos → /pago/saldo en modo abono (`enviarAbonoRepuestosCliente`)
 *   - saldo (cualquier otro faltante) → /pago/saldo (`enviarPagoSaldoCliente`)
 * El monto se recalcula en el servidor con los pagos acreditados. No cambia
 * montos, estado ni pago al técnico. Evento `nota_admin`
 * (`payload.origen = 'cobro_faltante_whatsapp'`).
 *
 *   Body: { id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data: sol, error: readErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, tipo_solicitud, tipo_equipo, tecnico_asignado_id, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online, diagnosticado_at, descuento_codigo, descuento_tipo, descuento_valor')
      .eq('id', id)
      .single()
    if (readErr || !sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (sol.es_garantia) {
      return NextResponse.json({ error: 'En garantía paga la marca: no hay cobro al cliente.' }, { status: 409 })
    }

    const faltante = faltanteCobroCliente(sol as unknown as SolicitudParaEtapaPago)
    if (!faltante) {
      return NextResponse.json({ error: 'No hay nada por cobrar: está pagado o aún no hay un valor definido.' }, { status: 409 })
    }

    const solPago = await cargarSolicitudPago(id)
    if (!solPago) return NextResponse.json({ error: 'No se pudo cargar la solicitud' }, { status: 500 })

    const { tipo } = faltante
    let monto = 0
    let envio: { ok: boolean; error?: string }

    if (tipo === 'anticipo') {
      monto = calcularMontoAnticipo(solPago)
      if (monto <= 0) return NextResponse.json({ error: 'No se pudo calcular el anticipo.' }, { status: 409 })
      envio = await enviarCobroAnticipoCliente(id, monto)
    } else if (tipo === 'abono') {
      monto = await calcularMontoAbonoRepuestos(solPago)
      if (monto <= 0) return NextResponse.json({ error: 'Sin abono por cobrar.' }, { status: 409 })
      envio = await enviarAbonoRepuestosCliente(id, monto)
    } else {
      monto = await calcularMontoSaldo(solPago)
      if (monto <= 0) {
        return NextResponse.json({ error: 'No hay faltante: lo pagado en línea cubre el total.' }, { status: 409 })
      }
      envio = await enviarPagoSaldoCliente(id, monto, { momento: ESTADOS_CIERRE.has(sol.estado) ? 'cierre' : 'aprobacion' })
    }

    if (!envio.ok) {
      return NextResponse.json({ error: envio.error || 'No se pudo enviar el WhatsApp.', tipo, monto }, { status: 502 })
    }

    const TIPO_LABEL = { anticipo: 'anticipo', abono: 'abono repuestos', saldo: 'saldo' } as const
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'nota_admin',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: adminEmail,
        motivo: `Cobro del faltante enviado por WhatsApp (${TIPO_LABEL[tipo]}: $${monto.toLocaleString('es-CO')})`,
        payload: { origen: 'cobro_faltante_whatsapp', tipo, monto },
      })
      if (auditErr) console.error('[cobrar-faltante] audit falló:', auditErr)
    } catch (err) {
      console.error('[cobrar-faltante] audit threw:', err)
    }

    return NextResponse.json({ success: true, tipo, monto })
  } catch (err) {
    console.error('Error en /api/admin/cobrar-faltante:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}
