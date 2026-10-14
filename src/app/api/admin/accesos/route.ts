import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { generarYEnviarLinkClave, listarCuentasPanel } from '@/lib/services/acceso-panel.service'

/**
 * /api/admin/accesos — SOLO ADMIN (el rol lectura no puede ni listar).
 *
 * GET  → cuentas de la allowlist (admin + lectura) cruzadas con Supabase Auth.
 * POST { email } → genera el link de un solo uso para fijar la contraseña, lo
 *   envía por correo y DEVUELVE el link al admin para que pueda compartirlo
 *   por WhatsApp si el correo no llega. Queda en el log del server quién lo pidió.
 */
export async function GET(req: NextRequest) {
  const admin = await obtenerEmailAdmin(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json({ cuentas: await listarCuentasPanel() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error listando cuentas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await obtenerEmailAdmin(req)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const raw = await req.json().catch(() => null)
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  try {
    const r = await generarYEnviarLinkClave(parsed.data.email)
    if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo generar el acceso' }, { status: 400 })
    console.log(
      `[accesos] ${admin} generó link de clave para ${parsed.data.email} (correo: ${r.enviadoPorCorreo ? r.via : 'no enviado'})`,
    )
    return NextResponse.json({ ok: true, link: r.link, enviadoPorCorreo: r.enviadoPorCorreo, via: r.via, error: r.error })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error generando acceso' }, { status: 500 })
  }
}
