import { NextRequest, NextResponse } from 'next/server'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { reasignarTecnicoManual } from '@/lib/services/reasignar-tecnico.service'

/**
 * POST /api/admin/cambiar-tecnico
 *
 * "🔁 Cambiar técnico" de la ficha admin (2026-10-26): asigna directamente al
 * técnico que elige el admin, reemplazando al actual (o asignando si no había).
 * Ver `reasignarTecnicoManual`.
 *
 * Solo admin (obtenerEmailAdmin rechaza al rol lectura).
 * Body: { solicitudId, tecnicoId, motivo?, notificar?: boolean (default true), forzarCupo?: boolean }
 * 409 con `codigo: 'cupo_lleno'` → la UI pregunta y reintenta con forzarCupo.
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const tecnicoId = typeof body?.tecnicoId === 'string' ? body.tecnicoId.trim() : ''
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''
    if (!solicitudId || !tecnicoId) {
      return NextResponse.json({ error: 'solicitudId y tecnicoId son requeridos' }, { status: 400 })
    }

    const r = await reasignarTecnicoManual(solicitudId, tecnicoId, {
      actor: adminEmail,
      motivo: motivo || undefined,
      notificar: body?.notificar !== false,
      forzarCupo: body?.forzarCupo === true,
      cuentaIncumplimiento: body?.cuentaIncumplimiento === true,
    })
    if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo ?? null }, { status: 409 })
    return NextResponse.json({ success: true, ...r })
  } catch (err) {
    console.error('Error en /api/admin/cambiar-tecnico:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
