import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import {
  anularLiquidacion,
  marcarLiquidacionPagada,
  obtenerItemsLiquidacion,
} from '@/lib/services/liquidacion-tecnicos.service'

/**
 * /api/admin/liquidaciones-tecnicos/[id]
 *
 *   GET    → { items: LiquidacionItem[] } (servicios de la liquidación)
 *   PATCH  → { accion: 'pagar', referencia?, pagada_at? } | { accion: 'anular' }
 *
 * Solo admin. Guards atómicos en el service: solo pendiente → pagada/anulada.
 */

const patchSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('pagar'),
    referencia: z.string().max(120).optional().nullable(),
    pagada_at: z.string().optional().nullable(),
  }),
  z.object({ accion: z.literal('anular') }),
])

const uuid = z.string().uuid()

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!(await obtenerEmailAdmin(req))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const { id } = await ctx.params
    if (!uuid.safeParse(id).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const items = await obtenerItemsLiquidacion(id)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[admin/liquidaciones-tecnicos/id] GET:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await obtenerEmailAdmin(req)
    if (!actor) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const { id } = await ctx.params
    if (!uuid.safeParse(id).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Acción inválida (pagar | anular)' }, { status: 400 })
    }
    if (parsed.data.accion === 'pagar') {
      await marcarLiquidacionPagada({ id, referencia: parsed.data.referencia, pagadaAt: parsed.data.pagada_at, actor })
    } else {
      await anularLiquidacion({ id, actor })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/liquidaciones-tecnicos/id] PATCH:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 400 })
  }
}
