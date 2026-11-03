import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { enviarPagoSaldoCliente, enviarAbonoRepuestosCliente } from '@/lib/services/whatsapp.service'
import { cargarSolicitudPago, calcularMontoSaldo, calcularMontoAbonoRepuestos } from '@/lib/services/pagos.service'
import { etapaPagoCliente, type SolicitudParaEtapaPago } from '@/lib/constants/pago-cliente'

export const maxDuration = 30

/** Estados en los que el servicio ya se hizo: el faltante es el saldo final. */
const ESTADOS_CIERRE = new Set(['confirmacion_pendiente', 'completada'])

/**
 * POST /api/admin/cobrar-faltante  (2026-11-03)
 *
 * Reenvía al cliente PARTICULAR, por WhatsApp, el link de pago Wompi de lo
 * que le falta por pagar. No cambia montos, estado ni pago al técnico: solo
 * reusa los mismos envíos del flujo normal.
 *
 *   Body: { id: string }
 *
 *   - Abono de repuestos pendiente → `enviarAbonoRepuestosCliente` (50%).
 *   - Si no → saldo (`calcularMontoSaldo`: total − descuento − pagos online)
 *     con `enviarPagoSaldoCliente` (momento 'cierre' si el servicio ya se
 *     completó, 'aprobacion' si solo hay cotización aprobada).
 *   - Evento `nota_admin` con `payload.origen = 'cobro_faltante_whatsapp'`.
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
      .select('id, estado, es_garantia, tipo_solicitud, tipo_equipo, tecnico_asignado_id, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online, descuento_codigo, descuento_tipo, descuento_valor')
      .eq('id', id)
      .single()
    if (readErr || !sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (sol.es_garantia) {
      return NextResponse.json({ error: 'En garantía paga la marca: no hay cobro al cliente.' }, { status: 409 })
    }
    if (sol.saldo_pagado_at) {
      return NextResponse.json({ error: 'El cliente ya pagó el saldo completo.' }, { status: 409 })
    }

    const resumen = etapaPagoCliente(sol as unknown as SolicitudParaEtapaPago)
    if (resumen?.etapa === 'pagado') {
      return NextResponse.json({ error: 'No hay faltante: lo pagado cubre el total.' }, { status: 409 })
    }

    const solPago = await cargarSolicitudPago(id)
    if (!solPago) return NextResponse.json({ error: 'No se pudo cargar la solicitud' }, { status: 500 })

    let tipo: 'abono' | 'saldo'
    let monto = 0
    let envio: { ok: boolean; error?: string }

    if (resumen?.etapa === 'abono_pendiente') {
      tipo = 'abono'
      monto = await calcularMontoAbonoRepuestos(solPago)
      if (monto <= 0) return NextResponse.json({ error: 'Sin abono por cobrar.' }, { status: 409 })
      envio = await enviarAbonoRepuestosCliente(id, monto)
    } else {
      const cotAprobada = Boolean((sol.cotizacion as { aprobado_at?: unknown } | null)?.aprobado_at)
      const cierre = ESTADOS_CIERRE.has(sol.estado)
      if (!cierre && !cotAprobada) {
        return NextResponse.json(
          { error: 'Aún no hay un valor por cobrar: falta que el cliente apruebe la cotización o que el técnico complete el servicio.' },
          { status: 409 },
        )
      }
      tipo = 'saldo'
      monto = await calcularMontoSaldo(solPago)
      if (monto <= 0) {
        return NextResponse.json({ error: 'No hay faltante: lo pagado en línea cubre el total.' }, { status: 409 })
      }
      envio = await enviarPagoSaldoCliente(id, monto, { momento: cierre ? 'cierre' : 'aprobacion' })
    }

    if (!envio.ok) {
      return NextResponse.json({ error: envio.error || 'No se pudo enviar el WhatsApp.', tipo, monto }, { status: 502 })
    }

    // Historial (best-effort)
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'nota_admin',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: adminEmail,
        motivo: `Cobro del faltante enviado por WhatsApp (${tipo === 'abono' ? 'abono repuestos' : 'saldo'}: $${monto.toLocaleString('es-CO')})`,
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
