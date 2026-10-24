// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { NextRequest, NextResponse } from 'next/server'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import {
  registrarPagoExterno,
  METODOS_PAGO_EXTERNO,
  MAX_PAGO_EXTERNO,
  type MetodoPagoExterno,
} from '@/lib/services/pagos.service'
import { esUrlEvidenciaAdminValida } from '@/lib/utils/evidencia-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EVIDENCIAS = 5

/**
 * POST /api/admin/pagos/externo — "Registrar pago fuera de Wompi" (2026-10-22).
 * Para pagos de emergencia (transferencia, consignación, efectivo…) que se
 * recibieron por fuera de la plataforma y hay que dejar cerrados en el ledger.
 *
 * Body: { solicitudId, tipo: 'anticipo'|'abono'|'saldo', monto, metodo,
 *         referenciaExterna, fechaPago (ISO), nota, evidencias: [{url,mime?,nombre?}] }
 *
 * La EVIDENCIA es obligatoria (≥1 archivo ya subido por el navegador al bucket
 * `evidencias-servicio` bajo `{solicitud_id}/admin_*`, validado igual que
 * /api/admin/evidencias), junto con la referencia del pago y una nota. Solo
 * admins con permiso de escritura; el actor queda en el historial.
 */
export async function POST(req: NextRequest) {
  const actor = await obtenerEmailAdmin(req)
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const solicitudId = typeof b?.solicitudId === 'string' ? b.solicitudId.trim().toLowerCase() : ''
  const tipo = b?.tipo === 'anticipo' || b?.tipo === 'abono' || b?.tipo === 'saldo' ? b.tipo : null
  const monto = typeof b?.monto === 'number' ? Math.round(b.monto) : NaN
  const metodo = METODOS_PAGO_EXTERNO.includes(b?.metodo as MetodoPagoExterno) ? (b?.metodo as MetodoPagoExterno) : null
  const referenciaExterna = typeof b?.referenciaExterna === 'string' ? b.referenciaExterna.trim().slice(0, 120) : ''
  const nota = typeof b?.nota === 'string' ? b.nota.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  const fecha = typeof b?.fechaPago === 'string' ? new Date(b.fechaPago) : null

  if (!UUID_RE.test(solicitudId)) return NextResponse.json({ error: 'solicitudId inválido' }, { status: 400 })
  if (!tipo) return NextResponse.json({ error: 'tipo debe ser anticipo, abono o saldo' }, { status: 400 })
  if (!Number.isFinite(monto) || monto <= 0 || monto > MAX_PAGO_EXTERNO) {
    return NextResponse.json({ error: `El monto debe estar entre 1 y ${MAX_PAGO_EXTERNO.toLocaleString('es-CO')}` }, { status: 400 })
  }
  if (!metodo) return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
  if (!referenciaExterna) return NextResponse.json({ error: 'Indica la referencia del pago (n.º de transferencia, recibo…)' }, { status: 400 })
  if (!nota) return NextResponse.json({ error: 'Explica por qué se pagó por fuera de Wompi (nota)' }, { status: 400 })
  if (!fecha || Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 24 * 3600_000) {
    return NextResponse.json({ error: 'Fecha del pago inválida' }, { status: 400 })
  }

  const evRaw = Array.isArray(b?.evidencias) ? b.evidencias : []
  if (evRaw.length === 0) return NextResponse.json({ error: 'La evidencia del pago es obligatoria' }, { status: 400 })
  if (evRaw.length > MAX_EVIDENCIAS) return NextResponse.json({ error: `Máximo ${MAX_EVIDENCIAS} archivos de evidencia` }, { status: 400 })
  const evidencias: Array<{ url: string; mime: string | null; nombre: string | null }> = []
  for (const e of evRaw) {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
    if (!esUrlEvidenciaAdminValida(o.url, solicitudId)) {
      return NextResponse.json({ error: 'Una evidencia no pertenece a la carpeta de esta solicitud' }, { status: 400 })
    }
    evidencias.push({
      url: o.url,
      mime: typeof o.mime === 'string' ? o.mime.slice(0, 100) : null,
      nombre: typeof o.nombre === 'string' ? o.nombre.slice(0, 200) : null,
    })
  }

  try {
    const r = await registrarPagoExterno({
      solicitudId, tipo, monto, metodo, referenciaExterna, nota, evidencias, actor,
      fechaPago: fecha.toISOString(),
    })
    if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo registrar' }, { status: 422 })
    return NextResponse.json({ ok: true, pagoId: r.pagoId, cerrado: r.cerrado, faltante: r.faltante })
  } catch (err) {
    console.error('[admin/pagos/externo] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
