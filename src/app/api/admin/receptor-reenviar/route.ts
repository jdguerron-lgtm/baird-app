import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { enviarBienvenidaReceptor } from '@/lib/services/whatsapp.service'

/**
 * POST /api/admin/receptor-reenviar  (2026-10-13)
 *
 * Reenvía al receptor registrado la plantilla `receptor_bienvenida_v1` con el
 * link de aceptación (/receptor/{token}). Útil cuando el envío original falló
 * (whitelist de test, Meta 132018, plantilla PENDING) o el receptor borró el
 * mensaje sin aceptar.
 *
 * Body: { solicitudId: string }
 * Si el receptor ya aceptó, no reenvía (no tiene sentido) y lo dice.
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, receptor_nombre, receptor_telefono, receptor_acepto_at')
      .eq('id', solicitudId)
      .maybeSingle()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (!sol.receptor_telefono) return NextResponse.json({ error: 'La solicitud no tiene receptor registrado' }, { status: 400 })
    if (sol.receptor_acepto_at) {
      return NextResponse.json({ error: `${sol.receptor_nombre} ya aceptó seguir el servicio; no hace falta reenviar.` }, { status: 400 })
    }

    const r = await enviarBienvenidaReceptor(sol.id)
    if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo enviar' }, { status: 502 })
    return NextResponse.json({ success: true, mensaje: `Link de aceptación reenviado a ${sol.receptor_nombre} (+${sol.receptor_telefono})` })
  } catch (error) {
    console.error('Error en /api/admin/receptor-reenviar:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error interno' }, { status: 500 })
  }
}
