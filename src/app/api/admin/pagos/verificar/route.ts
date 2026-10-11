// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin } from '@/lib/auth/admin'
import { consultarTransaccion, parseReferenciaPago } from '@/lib/wompi'
import { conciliarSolicitudWompi, registrarPagoWompi, actualizarResumenPago } from '@/lib/services/pagos.service'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/pagos/verificar — "🔄 Verificar pagos en Wompi" del admin
 * (2026-10-11). Registra AHORA los pagos de una solicitud sin esperar el cron.
 *
 * Body: { solicitudId: string, transaccionId?: string }
 *
 *  - Con `transaccionId` (el "#1510245-…" que muestra el panel de Wompi):
 *    consulta ESA transacción en el API de Wompi (no requiere llave privada)
 *    y la registra si su referencia es de ESTA solicitud. El monto, estado y
 *    referencia salen de Wompi — nunca del body.
 *  - Sin `transaccionId`: busca por referencia anticipo/abono/saldo
 *    (requiere WOMPI_PRIVATE_KEY; sin ella responde `habilitada: false`).
 *
 * Todo pasa por `registrarPagoWompi` (idempotente: volver a verificar no
 * duplica pagos ni WhatsApp). Solo admins (allowlist).
 */
export async function POST(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as { solicitudId?: unknown; transaccionId?: unknown } | null
  const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
  if (!UUID_RE.test(solicitudId)) {
    return NextResponse.json({ error: 'solicitudId inválido' }, { status: 400 })
  }

  const transaccionId = typeof body?.transaccionId === 'string'
    ? body.transaccionId.trim().replace(/^#/, '')
    : ''

  try {
    if (transaccionId) {
      const tx = await consultarTransaccion(transaccionId)
      if (!tx) {
        return NextResponse.json({ error: 'Wompi no encontró esa transacción (revisa el número)' }, { status: 404 })
      }
      const ref = parseReferenciaPago(tx.reference)
      if (!ref || ref.solicitudId !== solicitudId.toLowerCase()) {
        return NextResponse.json(
          { error: `La transacción es de otra referencia (${tx.reference}) — no corresponde a este servicio` },
          { status: 400 },
        )
      }
      const r = await registrarPagoWompi(tx, 'admin')
      if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo registrar' }, { status: 500 })
      return NextResponse.json({
        ok: true,
        modo: 'transaccion',
        estadoWompi: tx.status,
        tipo: ref.tipo,
        monto: Math.round((tx.amount_in_cents ?? 0) / 100),
        registrado: !r.duplicado && tx.status === 'APPROVED',
        yaEstaba: Boolean(r.duplicado),
      })
    }

    const resultado = await conciliarSolicitudWompi(solicitudId)
    // Recalcula el resumen aunque no haya nada nuevo (repara drift histórico).
    await actualizarResumenPago(solicitudId)
    return NextResponse.json({ ok: true, modo: 'referencia', ...resultado })
  } catch (err) {
    console.error('[admin/pagos/verificar] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
