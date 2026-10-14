import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generarYEnviarLinkClave } from '@/lib/services/acceso-panel.service'

/**
 * POST /api/auth/recuperar-clave  { email }  — PÚBLICO (lo llama /admin/login).
 *
 * Envía el correo para crear/restablecer la contraseña del panel. Respuesta
 * SIEMPRE genérica (200) para no revelar qué emails tienen cuenta. Solo actúa
 * si el email está en la allowlist (admin o lectura); el resto es no-op.
 * Throttle best-effort en memoria: 1 envío por email cada 60 s.
 */
const ultimoEnvio = new Map<string, number>()
const VENTANA_MS = 60_000

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })

  const { email } = parsed.data
  const ahora = Date.now()
  const previo = ultimoEnvio.get(email) ?? 0
  if (ahora - previo >= VENTANA_MS) {
    ultimoEnvio.set(email, ahora)
    try {
      const r = await generarYEnviarLinkClave(email)
      if (r.ok && !r.enviadoPorCorreo) {
        console.warn('[recuperar-clave] link generado pero correo no enviado:', r.via, r.error)
      }
    } catch (e) {
      console.error('[recuperar-clave]', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({
    ok: true,
    mensaje: 'Si el correo tiene acceso al panel, recibirá un link para crear su contraseña.',
  })
}
