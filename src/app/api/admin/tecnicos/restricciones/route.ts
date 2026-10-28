import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin, verificarLectura } from '@/lib/auth/admin'
import {
  incumplimientosRecientes,
  obtenerBloqueos,
  obtenerConfigPenalizacion,
} from '@/lib/services/penalizacion.service'
import { minutosPenalizacion } from '@/lib/utils/penalizacion-oferta'

/**
 * Restricciones y penalización de un técnico (2026-10-26), bloque
 * "🚫 Restricciones y penalización" de /admin/tecnicos/[id].
 *
 * GET ?tecnicoId=… (admin + rol lectura) →
 *   { disponible, bloqueos: { garantia, particular, nota }, penalizacion:
 *     { activa, minutosPorIncumplimiento, dias, maxMinutos, incumplimientos, minutos, detalle[] } }
 *   `disponible=false` = migración 20261026 sin aplicar (no se puede guardar).
 *
 * POST (solo admin) { tecnicoId, garantia: boolean, particular: boolean, nota?: string }
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await verificarLectura(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const tecnicoId = (req.nextUrl.searchParams.get('tecnicoId') ?? '').trim()
    if (!tecnicoId) return NextResponse.json({ error: 'tecnicoId requerido' }, { status: 400 })

    const { error: colErr } = await supabase.from('tecnicos').select('bloqueado_garantia').eq('id', tecnicoId).limit(1)
    const disponible = !colErr

    const [bloqueos, cfg] = await Promise.all([obtenerBloqueos([tecnicoId]), obtenerConfigPenalizacion()])
    const inc = await incumplimientosRecientes([tecnicoId], cfg.dias)
    const detalle = inc.get(tecnicoId) ?? []
    const b = bloqueos.get(tecnicoId) ?? { garantia: false, particular: false, nota: null }

    return NextResponse.json({
      disponible,
      bloqueos: b,
      penalizacion: {
        ...cfg,
        incumplimientos: detalle.length,
        // Lo que esperaría si la penalización estuviera activa (para mostrarlo igual).
        minutos: minutosPenalizacion(detalle.length, { ...cfg, activa: true }),
        detalle,
      },
    })
  } catch (err) {
    console.error('[admin/tecnicos/restricciones GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const body = await req.json().catch(() => null)
    const tecnicoId = typeof body?.tecnicoId === 'string' ? body.tecnicoId.trim() : ''
    if (!tecnicoId || typeof body?.garantia !== 'boolean' || typeof body?.particular !== 'boolean') {
      return NextResponse.json({ error: 'tecnicoId, garantia y particular son requeridos' }, { status: 400 })
    }
    const nota = typeof body?.nota === 'string' ? body.nota.trim().slice(0, 300) : ''

    const { data, error } = await supabase
      .from('tecnicos')
      .update({
        bloqueado_garantia: body.garantia,
        bloqueado_particular: body.particular,
        bloqueo_nota: body.garantia || body.particular ? (nota || null) : null,
      })
      .eq('id', tecnicoId)
      .select('id, bloqueado_garantia, bloqueado_particular, bloqueo_nota')
    if (error) {
      const sinMigracion = /bloqueado_/.test(error.message)
      return NextResponse.json(
        { error: sinMigracion ? 'Falta aplicar la migración 20261026_restricciones_penalizacion_tecnicos.sql en la BD.' : error.message },
        { status: sinMigracion ? 503 : 500 },
      )
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Técnico no encontrado' }, { status: 404 })
    console.log(`[admin/tecnicos/restricciones] ${adminEmail} → ${tecnicoId}: garantia=${body.garantia} particular=${body.particular}`)
    const fila = data[0]
    return NextResponse.json({
      success: true,
      bloqueos: { garantia: fila.bloqueado_garantia, particular: fila.bloqueado_particular, nota: fila.bloqueo_nota },
    })
  } catch (err) {
    console.error('[admin/tecnicos/restricciones POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
