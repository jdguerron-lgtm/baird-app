import { NextRequest, NextResponse } from 'next/server'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { confirmarVisita } from '@/lib/services/confirmacion-visita.service'

/**
 * POST /api/admin/confirmar-visita
 *
 * Botón "✅ Confirmada por llamada" de la ficha admin: el equipo habló con el
 * técnico y confirmó que va a la visita. Marca visita_confirmada_at/por='admin'
 * y deja evento `visita_confirmada` con el email del admin.
 *
 * Solo admin (obtenerEmailAdmin rechaza al rol lectura).
 * Body: { solicitudId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })

    const r = await confirmarVisita(solicitudId, { por: 'admin', actor: adminEmail })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
    return NextResponse.json({ success: true, yaEstaba: r.yaEstaba === true })
  } catch (err) {
    console.error('Error en /api/admin/confirmar-visita:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
