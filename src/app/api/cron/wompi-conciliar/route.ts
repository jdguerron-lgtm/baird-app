// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { conciliarPagosWompi } from '@/lib/services/pagos.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/wompi-conciliar
 *
 * Vercel Cron (cada 15 min, ver vercel.json). Conciliación de cobros contra
 * Wompi para los pagos que ni el webhook ni el redirect registraron.
 *
 * Por qué existe (2026-10-11): la "URL de Eventos" del comercio en Wompi la
 * ocupa la integración de Shopify (Conexa) y Wompi solo permite una URL, así
 * que `/api/wompi/webhook` nunca recibe eventos. Hasta hoy los pagos se
 * registraban solo porque el cliente volvía al redirect; un pago PSE sin
 * regreso quedó sin registrar. Este cron pregunta a Wompi por referencia
 * (`listarTransaccionesPorReferencia`, llave privada) y pasa las APPROVED por
 * `registrarPagoWompi` — misma validación de monto, idempotencia y WhatsApp
 * una sola vez que el webhook.
 *
 * Seguridad: `cronAutorizado` (Bearer CRON_SECRET; lo manda Vercel Cron y el
 * job pg_cron `wompi-conciliar-5min` de Supabase, que lo lee de Vault). Sin
 * WOMPI_PRIVATE_KEY responde `habilitada: false` y no hace nada
 * (kill-switch). Nunca escribe en Wompi: solo lee.
 *
 * Query opcional: `?dias=N` (1–180, default 45) ventana de solicitudes.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const diasParam = Number(new URL(req.url).searchParams.get('dias'))
  const diasAtras = Number.isFinite(diasParam) && diasParam > 0 ? Math.floor(diasParam) : undefined

  try {
    const resultado = await conciliarPagosWompi({ diasAtras })
    if (!resultado.habilitada) {
      console.warn('[cron/wompi-conciliar] WOMPI_PRIVATE_KEY no configurada — conciliación omitida')
    } else if (resultado.registrados > 0 || resultado.errores.length > 0) {
      console.log('[cron/wompi-conciliar]', JSON.stringify(resultado))
    }
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[cron/wompi-conciliar] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
