import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin, verificarLectura } from '@/lib/auth/admin'
import { obtenerConfigPenalizacion } from '@/lib/services/penalizacion.service'
import { LIMITES_PENALIZACION } from '@/lib/utils/penalizacion-oferta'

/**
 * Penalización por incumplimiento de agenda (2026-10-26), bloque en
 * /admin/reparto. Columnas `penalizacion_*` de `config_reparto`
 * (migración 20261026_restricciones_penalizacion_tecnicos.sql).
 *
 * GET (admin o lectura) → { config, migracionPendiente, limites }
 * PATCH (solo admin) { activa?, minutos?, dias?, maxMinutos? }
 */
export async function GET(req: NextRequest) {
  if (!(await verificarLectura(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { error } = await supabase.from('config_reparto').select('penalizacion_activa').eq('id', 1).limit(1)
  const config = await obtenerConfigPenalizacion()
  return NextResponse.json({ config, migracionPendiente: !!error, limites: LIMITES_PENALIZACION })
}

function enteroEnRango(valor: unknown, min: number, max: number): number | null {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export async function PATCH(req: NextRequest) {
  const email = await obtenerEmailAdmin(req)
  if (!email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const cambios: Record<string, unknown> = {}

  if (body.activa !== undefined) {
    if (typeof body.activa !== 'boolean') return NextResponse.json({ error: 'activa debe ser true o false' }, { status: 400 })
    cambios.penalizacion_activa = body.activa
  }
  const campos: Array<[string, string, { min: number; max: number }, string]> = [
    ['minutos', 'penalizacion_minutos', LIMITES_PENALIZACION.minutos, 'Los minutos por incumplimiento'],
    ['dias', 'penalizacion_dias', LIMITES_PENALIZACION.dias, 'Los días hacia atrás'],
    ['maxMinutos', 'penalizacion_max_minutos', LIMITES_PENALIZACION.maxMinutos, 'El tope de minutos'],
  ]
  for (const [clave, columna, { min, max }, etiqueta] of campos) {
    if (body[clave] === undefined) continue
    const n = enteroEnRango(body[clave], min, max)
    if (n === null) return NextResponse.json({ error: `${etiqueta} van de ${min} a ${max}` }, { status: 400 })
    cambios[columna] = n
  }
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })

  const { error } = await supabase
    .from('config_reparto')
    .update({ ...cambios, updated_at: new Date().toISOString(), updated_by: email })
    .eq('id', 1)
  if (error) {
    const sinMigracion = /penalizacion_/.test(error.message)
    return NextResponse.json(
      { error: sinMigracion ? 'Falta aplicar la migración 20261026_restricciones_penalizacion_tecnicos.sql.' : error.message },
      { status: sinMigracion ? 503 : 500 },
    )
  }
  return NextResponse.json({ success: true, config: await obtenerConfigPenalizacion() })
}
