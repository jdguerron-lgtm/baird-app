import { NextRequest, NextResponse } from 'next/server'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { liberarTecnico } from '@/lib/services/confirmacion-visita.service'

/**
 * POST /api/admin/liberar-tecnico
 *
 * Botón "🔓 Liberar técnico y reofertar" de la ficha admin. Suelta al técnico
 * asignado (solo desde `asignada`): el servicio vuelve a `notificada`, queda
 * evento `tecnico_liberado`, el técnico recibe un aviso (texto libre,
 * best-effort) y la oferta sale como URGENTE a los demás técnicos de la
 * ciudad. Es el "quitar técnico" limpio que el guard de 2026-09-08 en
 * notificarTecnicos pedía.
 *
 * Solo admin (obtenerEmailAdmin rechaza al rol lectura).
 * Body: { solicitudId: string, motivo?: string, reofertar?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''
    const reofertar = body?.reofertar !== false
    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })

    const r = await liberarTecnico(solicitudId, {
      motivo: 'admin',
      actor: adminEmail,
      detalle: motivo || undefined,
      reofertar,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
    return NextResponse.json({
      success: true,
      tecnicoNombre: r.tecnicoNombre,
      reoferta: r.reoferta ?? null,
    })
  } catch (err) {
    console.error('Error en /api/admin/liberar-tecnico:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
