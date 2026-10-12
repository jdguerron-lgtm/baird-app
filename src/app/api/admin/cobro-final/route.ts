import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  enviarEncuestaConfirmacionCliente,
  enviarPagoSaldoCliente,
} from '@/lib/services/whatsapp.service'
import { cargarSolicitudPago, calcularMontoSaldo } from '@/lib/services/pagos.service'
import { totalClienteParaCobro } from '@/lib/constants/pago-cliente'
import type { CotizacionReparacion } from '@/types/solicitud'

export const maxDuration = 30

/** Estados en los que el servicio YA se hizo y tiene sentido fijar el cobro final. */
const ESTADOS_COBRO_FINAL = new Set(['confirmacion_pendiente', 'completada'])

/**
 * POST /api/admin/cobro-final  (2026-10-12)
 *
 * El admin fija A MANO el valor final que paga el CLIENTE por un servicio
 * PARTICULAR ya realizado y se lo manda por Wompi "con encuesta y todo":
 *
 *   Body: { id: string, valor: number, motivo?: string, enviarEncuesta?: boolean }
 *
 *   1. `cotizacion.total = valor` (única fuente del total al cliente que ya
 *      honran `totalClienteParaCobro`, `calcularMontoSaldo`, la página
 *      /pago/saldo y la etiqueta de etapa de pago — sin tocar el módulo de
 *      pagos congelado). Si el servicio no tenía cotización (tarifa fija:
 *      Mantenimiento / Cambio de filtro) se crea una mínima marcada
 *      `cobro_final_admin: true`. Guarda valor_anterior / motivo para auditoría.
 *      El estado NO cambia y `pago_tecnico` NO se toca.
 *   2. Si el cliente aún no respondió la encuesta (`confirmacion_pendiente`)
 *      y `enviarEncuesta !== false`, reenvía `confirmar_servicio_v4`.
 *   3. Si queda saldo (valor − pagos online acreditados) manda el link de pago
 *      `saldo_final_cliente_v1` (→ /pago/saldo/{cliente_token}) — mismo camino
 *      que al completar el servicio.
 *   4. Evento `cambio_estado_admin` en el historial.
 *
 * Distinto de /api/admin/actualizar-valor, que reabre la aprobación de una
 * cotización ANTES de la reparación. Acá el servicio ya se hizo: solo se cobra.
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const valor = Math.round(Number(body.valor))
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : null
    const enviarEncuesta = body.enviarEncuesta !== false

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    if (!Number.isFinite(valor) || valor < 1000) {
      return NextResponse.json({ error: 'valor inválido (mínimo $1.000)' }, { status: 400 })
    }
    if (valor > 50_000_000) {
      return NextResponse.json({ error: 'valor demasiado alto (máx $50.000.000)' }, { status: 400 })
    }

    const { data: sol, error: readErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, tipo_solicitud, tipo_equipo, cotizacion, recargo_weekend_aplicado, monto_pagado_online, saldo_pagado_at, cliente_token')
      .eq('id', id)
      .single()
    if (readErr || !sol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }
    if (sol.es_garantia) {
      return NextResponse.json(
        { error: 'El cobro final solo aplica a servicios particulares (en garantía paga la marca).' },
        { status: 409 },
      )
    }
    if (!ESTADOS_COBRO_FINAL.has(sol.estado)) {
      return NextResponse.json(
        { error: `El cobro final se fija cuando el técnico ya completó el servicio (estado actual: "${sol.estado}").` },
        { status: 409 },
      )
    }
    if (sol.saldo_pagado_at) {
      return NextResponse.json(
        { error: 'El cliente ya pagó el saldo final en línea; no se puede cambiar el cobro.' },
        { status: 409 },
      )
    }

    const valorAnterior = totalClienteParaCobro({ ...sol, es_garantia: false })
    const now = new Date().toISOString()
    const cotPrev = (sol.cotizacion ?? null) as CotizacionReparacion | null

    // Cotización con el nuevo total. mano_obra/repuestos → 0 para que la
    // página /cotizacion muestre un único "Total del servicio".
    const cotizacionData: CotizacionReparacion = cotPrev
      ? {
          ...cotPrev,
          mano_obra: 0,
          repuestos: 0,
          total: valor,
          valor_anterior: valorAnterior,
          valor_actualizado_at: now,
          ...(motivo ? { valor_actualizado_motivo: motivo } : {}),
          cobro_final_admin: true,
        }
      : {
          diagnostico_tecnico: `Cobro final fijado por Baird${motivo ? `: ${motivo}` : ''}`,
          mano_obra: 0,
          repuestos: 0,
          total: valor,
          valor_anterior: valorAnterior,
          valor_actualizado_at: now,
          ...(motivo ? { valor_actualizado_motivo: motivo } : {}),
          cobro_final_admin: true,
          cotizado_at: now,
          aprobado_at: now,
          token: crypto.randomUUID(),
        }

    const { data: updated, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ cotizacion: cotizacionData })
      .eq('id', id)
      .eq('estado', sol.estado)
      .is('saldo_pagado_at', null)
      .select('id')
      .maybeSingle()
    if (updErr) {
      console.error('[cobro-final] update falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'El estado o el pago cambió mientras tanto. Recargá la página e intentá de nuevo.' },
        { status: 409 },
      )
    }

    // Audit (best-effort)
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'cambio_estado_admin',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado,
        actor: 'admin',
        motivo: `Cobro final fijado: $${valorAnterior.toLocaleString('es-CO')} → $${valor.toLocaleString('es-CO')}${motivo ? ` (${motivo})` : ''}`,
        payload: { valor_anterior: valorAnterior, valor_nuevo: valor, cobro_final: true },
      })
      if (auditErr) console.error('[cobro-final] audit falló:', auditErr)
    } catch (err) {
      console.error('[cobro-final] audit threw:', err)
    }

    // Encuesta (solo si el cliente aún no confirmó)
    let encuesta: { enviada: boolean; error?: string } = { enviada: false }
    if (enviarEncuesta && sol.estado === 'confirmacion_pendiente') {
      const r = await enviarEncuestaConfirmacionCliente(id)
      encuesta = { enviada: r.ok, ...(r.ok ? {} : { error: r.error }) }
      if (!r.ok) console.error('[cobro-final] encuesta no enviada:', r.error)
    }

    // Link de pago del saldo (valor − pagos online acreditados)
    let saldo = 0
    let linkPago: { enviado: boolean; error?: string } = { enviado: false }
    try {
      const solPago = await cargarSolicitudPago(id)
      if (solPago) {
        saldo = await calcularMontoSaldo(solPago)
        if (saldo > 0) {
          const r = await enviarPagoSaldoCliente(id, saldo, { momento: 'cierre' })
          linkPago = { enviado: r.ok, ...(r.ok ? {} : { error: r.error }) }
          if (!r.ok) console.error('[cobro-final] link de saldo no enviado:', r.error)
        } else {
          linkPago = { enviado: false, error: 'Sin saldo por cobrar: lo pagado en línea cubre el valor fijado.' }
        }
      }
    } catch (err) {
      console.error('[cobro-final] link de saldo threw:', err)
      linkPago = { enviado: false, error: err instanceof Error ? err.message : 'Error calculando el saldo' }
    }

    return NextResponse.json({
      success: true,
      valor_anterior: valorAnterior,
      valor_nuevo: valor,
      saldo,
      encuesta,
      link_pago: linkPago,
    })
  } catch (err) {
    console.error('Error en /api/admin/cobro-final:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
