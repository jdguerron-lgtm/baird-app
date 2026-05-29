import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  enviarCotizacionCliente,
  enviarVerificacionPasoCliente,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'
import type { CotizacionReparacion, ProductoNecesario } from '@/types/solicitud'
import { calcularTarifaParticular } from '@/lib/constants/tarifas/particular'

export const maxDuration = 30

/**
 * POST /api/cotizacion-precios
 *
 * Admin de Baird fija precio (mano_obra + precio_unitario por producto) y
 * tiempo de entrega para una solicitud en estado 'pendiente_pricing'.
 *
 * Tras esto se transiciona la solicitud:
 *  - Particular  → cotizacion_enviada + envío de cotizacion_cliente_v2
 *  - Garantía    → verificacion_pendiente + envío de verificar_siguiente_paso_v2
 *
 * Body: {
 *   solicitudId: string,
 *   manoObra?: number,                      // requerido en particular
 *   tiempoEntrega: string,                  // requerido siempre
 *   productosPrecios: Array<{ sku: string, precio_unitario: number }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const solicitudId = typeof body.solicitudId === 'string' ? body.solicitudId : ''
    const tiempoEntrega = typeof body.tiempoEntrega === 'string' ? body.tiempoEntrega.trim() : ''
    const manoObraRaw = Number(body.manoObra)
    const productosPreciosArr = Array.isArray(body.productosPrecios) ? body.productosPrecios : []

    if (!solicitudId) {
      return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })
    }
    if (!tiempoEntrega) {
      return NextResponse.json({ error: 'tiempoEntrega requerido' }, { status: 400 })
    }

    const preciosPorSku = new Map<string, number>()
    for (const item of productosPreciosArr) {
      if (!item || typeof item !== 'object') continue
      const sku = typeof item.sku === 'string' ? item.sku.trim().toUpperCase() : ''
      const precio = Number(item.precio_unitario)
      if (sku && Number.isFinite(precio) && precio >= 0) {
        preciosPorSku.set(sku, precio)
      }
    }

    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cotizacion, siguiente_paso')
      .eq('id', solicitudId)
      .single()

    if (solErr || !sol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }
    if (sol.estado !== 'pendiente_pricing') {
      return NextResponse.json(
        { error: `La solicitud está en estado "${sol.estado}", no se puede fijar precios.` },
        { status: 409 },
      )
    }

    // ─── PARTICULAR ───
    if (!sol.es_garantia) {
      const manoObra = Number.isFinite(manoObraRaw) && manoObraRaw >= 0 ? Math.round(manoObraRaw) : 0
      if (manoObra <= 0) {
        return NextResponse.json({ error: 'manoObra requerida (> 0) para servicio particular' }, { status: 400 })
      }

      const cotPrev = (sol.cotizacion ?? {}) as Partial<CotizacionReparacion>
      const necesariosPrev: ProductoNecesario[] = cotPrev.productos_necesarios ?? []

      const necesariosConPrecio: ProductoNecesario[] = necesariosPrev.map(p => {
        const precio = preciosPorSku.get(p.sku.toUpperCase()) ?? 0
        const subtotal = Math.round(precio * Math.max(1, p.cantidad || 1))
        return { ...p, precio_unitario: precio, subtotal }
      })
      const repuestosTotal = necesariosConPrecio.reduce((acc, p) => acc + (p.subtotal ?? 0), 0)

      // FÓRMULA NUEVA 2026-05-12: el total al cliente incluye IVA + margen Baird.
      //   costoTecnico = manoObra (admin) + sum(subtotales repuestos)
      //   totalCliente = costoTecnico × 1.19 (IVA) × 1.10 (margen Baird)
      // Antes este endpoint hacía `total = manoObra + repuestosTotal` (sin IVA
      // ni margen) — lo que descuadraba con el flujo particular sin gate
      // (rama reparar) donde sí se aplica la fórmula completa.
      const costoTecnico = manoObra + repuestosTotal
      const tarifa = calcularTarifaParticular({ costoTecnico })

      const cotizacionData: CotizacionReparacion = {
        ...(cotPrev as CotizacionReparacion),
        productos_necesarios: necesariosConPrecio,
        productos_recomendados: cotPrev.productos_recomendados ?? [],
        diagnostico_tecnico: cotPrev.diagnostico_tecnico ?? '',
        token: cotPrev.token ?? crypto.randomUUID(),
        cotizado_at: cotPrev.cotizado_at ?? new Date().toISOString(),
        // Compat con la página /cotizacion/{token}: total = totalCliente.
        // mano_obra/repuestos quedan en 0 para que se renderice solo el total
        // (igual que el flujo sin admin gate, ver fix de 2026-05-12).
        mano_obra: 0,
        repuestos: 0,
        total: tarifa.totalCliente,
        // Datos auditables internos (no se muestran al cliente)
        costo_tecnico: costoTecnico,
        mano_obra_admin: manoObra,
        repuestos_total_admin: repuestosTotal,
        subtotal_con_iva: tarifa.subtotalConIva,
        margen_baird: tarifa.margenBaird,
        tiempo_entrega: tiempoEntrega,
        pendiente_precio: false,
        pricing_set_at: new Date().toISOString(),
      } as CotizacionReparacion

      const { error: updErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          cotizacion: cotizacionData,
          estado: 'cotizacion_enviada',
          pago_tecnico: costoTecnico, // lo que recibe el técnico (sin IVA ni margen)
        })
        .eq('id', sol.id)
        .eq('estado', 'pendiente_pricing')
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

      await notificarCambioEstado(sol.id, 'pendiente_pricing', 'cotizacion_enviada')

      // Sincronizar costos en repuestos_pendientes (best-effort)
      for (const p of necesariosConPrecio) {
        await supabase
          .from('repuestos_pendientes')
          .update({ costo: p.precio_unitario ?? 0, tiempo_estimado: tiempoEntrega })
          .eq('solicitud_id', sol.id)
          .eq('sku', p.sku)
          .eq('estado', 'pendiente')
      }

      const waResult = await enviarCotizacionCliente(sol.id)
      if (!waResult.ok) console.error('[cotizacion-precios] Error enviando cotización:', waResult.error)

      return NextResponse.json({
        success: true,
        flow: 'particular',
        costo_tecnico: costoTecnico,
        repuestos_total: repuestosTotal,
        total_cliente: tarifa.totalCliente,
        whatsapp_enviado: waResult.ok,
      })
    }

    // ─── GARANTÍA ───
    // En garantía solo necesitamos fijar tiempo_entrega (precio lo cubre la marca).
    // Actualizamos repuestos_pendientes y mandamos verificación al cliente.
    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ estado: 'verificacion_pendiente' })
      .eq('id', sol.id)
      .eq('estado', 'pendiente_pricing')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await notificarCambioEstado(sol.id, 'pendiente_pricing', 'verificacion_pendiente')

    await supabase
      .from('repuestos_pendientes')
      .update({ tiempo_estimado: tiempoEntrega })
      .eq('solicitud_id', sol.id)
      .eq('estado', 'pendiente')

    const waResult = await enviarVerificacionPasoCliente(sol.id)
    if (!waResult.ok) console.error('[cotizacion-precios] Error enviando verificación:', waResult.error)

    return NextResponse.json({
      success: true,
      flow: 'garantia',
      whatsapp_enviado: waResult.ok,
    })
  } catch (err) {
    console.error('Error en /api/cotizacion-precios:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
