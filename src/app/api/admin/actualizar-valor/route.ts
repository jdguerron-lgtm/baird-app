import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import {
  enviarValorActualizadoCliente,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'
import type { CotizacionReparacion } from '@/types/solicitud'

export const maxDuration = 30

/**
 * POST /api/admin/actualizar-valor
 *
 * Admin ajusta el valor a pagar por el CLIENTE de un servicio PARTICULAR,
 * reabre la aprobación y le avisa al cliente por WhatsApp.
 *
 * Body: { id: string, nuevoValor: number, motivo?: string }
 *
 * Efecto:
 *  - cotizacion.total = nuevoValor. mano_obra/repuestos → 0 para que el cliente
 *    vea un total único y limpio (igual que el flujo particular nuevo). Guarda
 *    valor_anterior + valor_actualizado_at/motivo para auditoría.
 *  - estado → cotizacion_enviada (reabre /cotizacion/{token} para re-aprobar).
 *  - pago_tecnico NO se toca: lo que recibe el técnico se fijó en el diagnóstico;
 *    este ajuste es sobre el precio al cliente (margen Baird), no sobre el técnico.
 *  - audit en solicitud_eventos (tipo cambio_estado_admin) + supervisores.
 *  - envía plantilla valor_actualizado_cliente_v1.
 *
 * Solo aplica a particular (es_garantia=false) con cotización existente y en un
 * estado no terminal. En garantía el precio lo cubre la marca: no hay valor al
 * cliente que ajustar.
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
    const nuevoValor = Math.round(Number(body.nuevoValor))
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : null

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    if (!Number.isFinite(nuevoValor) || nuevoValor < 1000) {
      return NextResponse.json({ error: 'nuevoValor inválido (mínimo $1.000)' }, { status: 400 })
    }
    if (nuevoValor > 50_000_000) {
      return NextResponse.json({ error: 'nuevoValor demasiado alto (máx $50.000.000)' }, { status: 400 })
    }

    // 1. Leer solicitud + cotización
    const { data: sol, error: readErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cotizacion')
      .eq('id', id)
      .single()
    if (readErr || !sol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }
    if (sol.es_garantia) {
      return NextResponse.json(
        { error: 'El ajuste de valor solo aplica para servicios particulares (en garantía paga la marca).' },
        { status: 409 },
      )
    }
    if (ESTADOS_TERMINALES.has(sol.estado)) {
      return NextResponse.json(
        { error: `El servicio está en un estado terminal ("${sol.estado}"); no se puede ajustar el valor.` },
        { status: 409 },
      )
    }

    const cotPrev = (sol.cotizacion ?? null) as CotizacionReparacion | null
    if (!cotPrev?.token) {
      return NextResponse.json(
        { error: 'La solicitud no tiene una cotización con token de aprobación. Fija primero el precio.' },
        { status: 409 },
      )
    }

    const valorAnterior = typeof cotPrev.total === 'number' ? cotPrev.total : 0
    const now = new Date().toISOString()

    // 2. Cotización con el nuevo total. Limpiamos el desglose (mano_obra/repuestos)
    //    para que la página /cotizacion/{token} muestre un único "Total del
    //    servicio" en vez de un desglose que ya no cuadra con el override.
    const cotizacionData: CotizacionReparacion = {
      ...cotPrev,
      mano_obra: 0,
      repuestos: 0,
      total: nuevoValor,
      valor_anterior: valorAnterior,
      valor_actualizado_at: now,
      ...(motivo ? { valor_actualizado_motivo: motivo } : {}),
    }

    // 3. Persistir + reabrir aprobación. Guard de concurrencia con .eq(estado)
    //    para no pisar un cambio simultáneo (otro admin o el flujo automático).
    const estadoPrevio = sol.estado
    const { data: updated, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ cotizacion: cotizacionData, estado: 'cotizacion_enviada' })
      .eq('id', id)
      .eq('estado', estadoPrevio)
      .select('id')
      .maybeSingle()
    if (updErr) {
      console.error('[actualizar-valor] update falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'El estado cambió mientras tanto. Recargá la página e intentá de nuevo.' },
        { status: 409 },
      )
    }

    // 4. Audit log (best-effort — si falla no revierte la operación)
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'cambio_estado_admin',
        estado_previo: estadoPrevio,
        estado_nuevo: 'cotizacion_enviada',
        actor: 'admin',
        motivo: motivo ?? `Valor al cliente actualizado: ${valorAnterior} → ${nuevoValor}`,
        payload: { valor_anterior: valorAnterior, valor_nuevo: nuevoValor },
      })
      if (auditErr) console.error('[actualizar-valor] audit falló:', auditErr)
    } catch (err) {
      console.error('[actualizar-valor] audit threw:', err)
    }

    // 5. Notificar supervisores configurados (solo si hubo transición real).
    // registrarEvento:false — arriba se insertó el evento dedicado 'cambio_estado_admin'.
    if (estadoPrevio !== 'cotizacion_enviada') {
      await notificarCambioEstado(id, estadoPrevio, 'cotizacion_enviada', { registrarEvento: false })
    }

    // 6. Avisar al cliente del nuevo valor (lo lleva a re-aprobar).
    const waResult = await enviarValorActualizadoCliente(id)
    if (!waResult.ok) console.error('[actualizar-valor] Error enviando WhatsApp:', waResult.error)

    return NextResponse.json({
      success: true,
      valor_anterior: valorAnterior,
      valor_nuevo: nuevoValor,
      estado_previo: estadoPrevio,
      estado_nuevo: 'cotizacion_enviada',
      whatsapp_enviado: waResult.ok,
      ...(waResult.ok ? {} : { whatsapp_error: waResult.error }),
    })
  } catch (err) {
    console.error('Error en /api/admin/actualizar-valor:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
