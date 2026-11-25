import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { enviarMensajeTexto, notificarCambioEstado } from '@/lib/services/whatsapp.service'
import {
  ESTADOS_CANCELABLES_DUPLICADO,
  motivoCancelacionDuplicado,
} from '@/lib/utils/clientes-duplicados'

export const maxDuration = 30

/**
 * POST /api/admin/cancelar-duplicado — 2026-10-28.
 *
 * Body: { id, originalId, detalle? }
 *   id         → la orden que sobra (se cancela)
 *   originalId → la orden que se conserva (mismo teléfono)
 *
 * Cancela EN SILENCIO para el cliente (no recibe nada: la orden buena sigue su
 * curso y un "cancelamos tu solicitud" lo confundiría). Si la orden duplicada
 * tenía técnico, se le avisa por texto (best-effort, ventana 24h) para que no
 * se presente. Invalida las ofertas pendientes y limpia el reparto escalonado.
 *
 * Bloqueos: misma orden, teléfonos distintos, estado fuera de
 * ESTADOS_CANCELABLES_DUPLICADO o cualquier pago registrado (online o guard
 * `*_pagado_at`): eso se resuelve con devolución, no aquí.
 *
 * Evento `cancelacion` con `payload.origen = 'duplicado'` y `duplicado_de`.
 */

const bodySchema = z.object({
  id: z.string().uuid(),
  originalId: z.string().uuid(),
  detalle: z.string().max(300).optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const { id, originalId, detalle } = parsed.data
    if (id === originalId) {
      return NextResponse.json({ error: 'La orden a cancelar y la que se conserva son la misma' }, { status: 400 })
    }

    const campos =
      'id, estado, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, horario_confirmado, tecnico_asignado_id, es_garantia, numero_serie_factura, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at'
    const [{ data: sol }, { data: original }] = await Promise.all([
      supabase.from('solicitudes_servicio').select(campos).eq('id', id).maybeSingle(),
      supabase.from('solicitudes_servicio').select('id, estado, cliente_telefono').eq('id', originalId).maybeSingle(),
    ])
    if (!sol) return NextResponse.json({ error: 'Orden a cancelar no encontrada' }, { status: 404 })
    if (!original) return NextResponse.json({ error: 'Orden original no encontrada' }, { status: 404 })
    if (!sol.cliente_telefono || sol.cliente_telefono !== original.cliente_telefono) {
      return NextResponse.json({ error: 'Las dos órdenes no son del mismo teléfono' }, { status: 400 })
    }
    if (original.estado === 'cancelada') {
      return NextResponse.json({ error: 'La orden que quieres conservar está cancelada' }, { status: 400 })
    }
    if (!ESTADOS_CANCELABLES_DUPLICADO.has(sol.estado)) {
      return NextResponse.json(
        { error: `No se puede cancelar como duplicado desde el estado "${sol.estado}". Usa el cambio manual de estado si de verdad corresponde.` },
        { status: 400 },
      )
    }
    if (sol.anticipo_pagado_at || sol.abono_pagado_at || sol.saldo_pagado_at) {
      return NextResponse.json({ error: 'Esta orden tiene un pago registrado: resuélvelo con una devolución antes de cancelarla.' }, { status: 400 })
    }
    const { count: pagosAprobados } = await supabase
      .from('pagos')
      .select('id', { count: 'exact', head: true })
      .eq('solicitud_id', id)
      .eq('estado', 'APPROVED')
    if ((pagosAprobados ?? 0) > 0) {
      return NextResponse.json({ error: 'Esta orden tiene un pago online aprobado: resuélvelo con una devolución antes de cancelarla.' }, { status: 400 })
    }

    const motivo = motivoCancelacionDuplicado(originalId, detalle)
    const { data: filas, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        estado: 'cancelada',
        cancelado_at: new Date().toISOString(),
        cancelado_por: 'admin',
        motivo_cancelacion: motivo,
        cancelado_tarde: false,
        oferta_abierta_at: null,
        oferta_pendientes: null,
      })
      .eq('id', id)
      .eq('estado', sol.estado)
      .select('id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    if (!filas || filas.length === 0) {
      return NextResponse.json({ error: 'La orden cambió mientras tanto. Recarga e intenta de nuevo.' }, { status: 409 })
    }

    // Ofertas que siguen abiertas a técnicos (pre-aceptación) dejan de valer.
    const { error: notifErr } = await supabase
      .from('notificaciones_whatsapp')
      .update({ estado: 'invalidado' })
      .eq('solicitud_id', id)
      .eq('estado', 'enviado')
    if (notifErr) console.error('[cancelar-duplicado] invalidar ofertas falló:', notifErr.message)

    const { error: evErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: id,
      tipo: 'cancelacion',
      estado_previo: sol.estado,
      estado_nuevo: 'cancelada',
      actor: adminEmail,
      motivo,
      payload: {
        origen: 'duplicado',
        duplicado_de: originalId,
        detalle: detalle?.trim() || null,
        tenia_tecnico_asignado: !!sol.tecnico_asignado_id,
        es_garantia: sol.es_garantia,
        numero_serie_factura: sol.numero_serie_factura,
      },
    })
    if (evErr) console.error('[cancelar-duplicado] evento falló:', evErr.message)

    try {
      await notificarCambioEstado(id, sol.estado, 'cancelada', { registrarEvento: false })
    } catch (err) {
      console.error('[cancelar-duplicado] notificarCambioEstado falló:', err)
    }

    let tecnicoAvisado = false
    if (sol.tecnico_asignado_id) {
      const { data: tec } = await supabase
        .from('tecnicos')
        .select('whatsapp, nombre_completo')
        .eq('id', sol.tecnico_asignado_id)
        .maybeSingle()
      if (tec?.whatsapp) {
        const equipo = [sol.tipo_equipo, sol.marca_equipo].filter(Boolean).join(' ')
        try {
          await enviarMensajeTexto(
            tec.whatsapp,
            `Hola ${(tec.nombre_completo ?? '').split(' ')[0]}, Baird canceló el servicio de ${sol.cliente_nombre} (${equipo}${sol.horario_confirmado ? `, ${sol.horario_confirmado}` : ''}) porque estaba duplicado. No tienes que ir a esa visita. Si ya tienes otra orden de este mismo cliente, esa sigue igual. — Baird Service`,
          )
          tecnicoAvisado = true
        } catch (err) {
          console.warn('[cancelar-duplicado] aviso al técnico no enviado:', err instanceof Error ? err.message : String(err))
        }
      }
    }

    return NextResponse.json({ success: true, estado_previo: sol.estado, tecnicoAvisado })
  } catch (err) {
    console.error('[admin/cancelar-duplicado] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
