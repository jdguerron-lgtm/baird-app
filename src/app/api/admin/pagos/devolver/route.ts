// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { NextRequest, NextResponse } from 'next/server'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { devolverPagoWompi } from '@/lib/services/pagos.service'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/pagos/devolver — "↩️ Devolver" de la ficha admin (2026-10-21).
 * Devuelve al cliente UN pago APPROVED del ledger (p.ej. el anticipo de un
 * servicio cancelado).
 *
 * Body: { solicitudId, pagoId, modo: 'wompi' | 'manual', nota? }
 *
 *  - `wompi`:  el dinero regresa al medio de pago original por el API de
 *    Wompi (reembolso V2; anulación si es tarjeta y el reembolso no está
 *    disponible). Requiere WOMPI_PRIVATE_KEY; sin ella responde 409 con la
 *    instrucción de hacerlo desde el panel y registrar la devolución manual.
 *  - `manual`: solo deja constancia de una devolución hecha por fuera
 *    (panel de Wompi, transferencia).
 *
 * El monto SIEMPRE sale de la fila de `pagos` (nunca del body) y la
 * devolución es total. Idempotente (un pago ya VOIDED no se repite). Solo
 * admins con permiso de escritura; el actor queda en el historial.
 */
export async function POST(req: NextRequest) {
  const actor = await obtenerEmailAdmin(req)
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { solicitudId?: unknown; pagoId?: unknown; modo?: unknown; nota?: unknown } | null
  const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim().toLowerCase() : ''
  const pagoId = typeof body?.pagoId === 'string' ? body.pagoId.trim().toLowerCase() : ''
  const modo = body?.modo === 'manual' ? 'manual' : body?.modo === 'wompi' ? 'wompi' : null
  const nota = typeof body?.nota === 'string' ? body.nota.trim().slice(0, 500) : undefined

  if (!UUID_RE.test(solicitudId)) return NextResponse.json({ error: 'solicitudId inválido' }, { status: 400 })
  if (!UUID_RE.test(pagoId)) return NextResponse.json({ error: 'pagoId inválido' }, { status: 400 })
  if (!modo) return NextResponse.json({ error: "modo debe ser 'wompi' o 'manual'" }, { status: 400 })
  if (modo === 'manual' && !nota) {
    return NextResponse.json({ error: 'Para registrar una devolución manual indica cómo se devolvió (nota)' }, { status: 400 })
  }

  try {
    const r = await devolverPagoWompi({ pagoId, solicitudId, modo, actor, nota })
    if (!r.ok) {
      const sinLlave = /WOMPI_PRIVATE_KEY/.test(r.error ?? '')
      return NextResponse.json(
        { error: r.error ?? 'No se pudo devolver', tipo: r.tipo, monto: r.monto, sinLlave },
        { status: sinLlave ? 409 : 422 },
      )
    }
    return NextResponse.json({
      ok: true,
      via: r.via ?? null,
      yaDevuelto: Boolean(r.yaDevuelto),
      tipo: r.tipo,
      monto: r.monto,
      referenciaWompi: r.referenciaWompi ?? null,
    })
  } catch (err) {
    console.error('[admin/pagos/devolver] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
