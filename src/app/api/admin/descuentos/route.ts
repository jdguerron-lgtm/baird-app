import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { obtenerEmailAdmin, verificarLectura } from '@/lib/auth/admin'
import {
  actualizarCodigoDescuento,
  crearCodigoDescuento,
  listarCodigosDescuento,
} from '@/lib/services/descuentos.service'

/**
 * /api/admin/descuentos (2026-10-19) — códigos de descuento.
 *
 * GET            → listado con usos y estado derivado (admin + rol lectura).
 * POST  {datos}  → crea un código (solo admin).
 * PATCH {id,…}   → edita tipo/valor/descripción/vigencia/tope/activo (solo
 *                  admin). El texto del código no se cambia: crear otro.
 *
 * Reglas en src/lib/constants/descuentos.ts. Las solicitudes guardan un
 * snapshot, así que editar un código NO afecta reservas ya hechas.
 */

const fechaOpcional = z.union([z.literal(''), z.null(), z.string().datetime({ offset: true })])
  .optional()
  .transform((v) => (v ? v : null))

const baseSchema = z.object({
  tipo: z.enum(['porcentaje', 'valor']),
  valor: z.number().positive('El valor debe ser mayor a 0'),
  descripcion: z.string().trim().max(200).optional().nullable(),
  activo: z.boolean().optional(),
  vigente_desde: fechaOpcional,
  vigente_hasta: fechaOpcional,
  max_usos: z.number().int().positive().optional().nullable(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'porcentaje' && (d.valor > 100 || d.valor < 1)) {
    ctx.addIssue({ code: 'custom', path: ['valor'], message: 'El porcentaje debe estar entre 1 y 100' })
  }
  if (d.tipo === 'valor' && (d.valor < 1000 || !Number.isInteger(d.valor))) {
    ctx.addIssue({ code: 'custom', path: ['valor'], message: 'El valor en COP debe ser entero y de al menos $1.000' })
  }
  if (d.vigente_desde && d.vigente_hasta && new Date(d.vigente_hasta) < new Date(d.vigente_desde)) {
    ctx.addIssue({ code: 'custom', path: ['vigente_hasta'], message: 'La fecha de fin debe ser posterior al inicio' })
  }
})

const crearSchema = z.object({ codigo: z.string().trim().min(3).max(30) }).and(baseSchema)
const patchSchema = z.object({ id: z.uuid() }).and(baseSchema.partial())

export async function GET(req: NextRequest) {
  if (!(await verificarLectura(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json({ codigos: await listarCodigosDescuento() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error listando códigos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await obtenerEmailAdmin(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const raw = await req.json().catch(() => null)
  const parsed = crearSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  try {
    const r = await crearCodigoDescuento(parsed.data, admin)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    console.log(`[descuentos] ${admin} creó el código ${r.codigo.codigo} (${r.codigo.tipo} ${r.codigo.valor})`)
    return NextResponse.json({ ok: true, codigo: r.codigo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error creando código' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await obtenerEmailAdmin(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { id, ...cambios } = parsed.data
  try {
    const r = await actualizarCodigoDescuento(id, cambios)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    console.log(`[descuentos] ${admin} editó el código ${r.codigo.codigo}:`, Object.keys(cambios).join(', '))
    return NextResponse.json({ ok: true, codigo: r.codigo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error editando código' }, { status: 500 })
  }
}
