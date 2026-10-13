import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import {
  crearLiquidacion,
  listarLiquidaciones,
  obtenerCuentasPorPagar,
} from '@/lib/services/liquidacion-tecnicos.service'

/**
 * /api/admin/liquidaciones-tecnicos — cuentas por pagar a técnicos.
 *
 *   GET   → { cuentas: CuentaPorPagarTecnico[], liquidaciones: LiquidacionTecnico[] }
 *   POST  → crea una liquidación PENDIENTE
 *           body { tecnico_id, solicitud_ids: string[], nota? }
 *
 * Solo admin (el rol lectura no ve pagos a técnicos). Lógica en
 * src/lib/services/liquidacion-tecnicos.service.ts.
 */

export const maxDuration = 60

const crearSchema = z.object({
  tecnico_id: z.string().uuid(),
  solicitud_ids: z.array(z.string().uuid()).min(1).max(500),
  nota: z.string().max(500).optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    if (!(await obtenerEmailAdmin(req))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const [cuentas, liquidaciones] = await Promise.all([obtenerCuentasPorPagar(), listarLiquidaciones()])
    return NextResponse.json({ cuentas, liquidaciones })
  } catch (err) {
    console.error('[admin/liquidaciones-tecnicos] GET:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await obtenerEmailAdmin(req)
    if (!actor) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const parsed = crearSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos: tecnico_id y solicitud_ids (uuid) son requeridos' }, { status: 400 })
    }
    const r = await crearLiquidacion({
      tecnicoId: parsed.data.tecnico_id,
      solicitudIds: parsed.data.solicitud_ids,
      nota: parsed.data.nota,
      actor,
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    console.error('[admin/liquidaciones-tecnicos] POST:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 400 })
  }
}
