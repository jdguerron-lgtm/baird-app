import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notificarRegistroTecnico } from '@/lib/services/whatsapp.service'
import { registroEsReciente } from '@/lib/utils/registro-reciente'

/**
 * POST /api/notificar-registro — bienvenida por WhatsApp al técnico recién
 * registrado. Público: lo llama `/registro` sin sesión.
 *
 * Candado (2026-11-25, auditoría de seguridad): antes aceptaba cualquier
 * `tecnicoId` las veces que fuera → WhatsApp (costo) a demanda. Ahora:
 *   1. `tecnicoId` debe ser un UUID.
 *   2. El técnico debe haberse creado en los últimos minutos
 *      (`registroEsReciente`) — fuera de esa ventana la bienvenida no aplica.
 *   3. Una sola bienvenida por técnico por instancia (best-effort, en memoria).
 *   4. Límite por IP en `middleware.ts`.
 * Los rechazos responden 200 genérico: `/registro` llama fire-and-forget y no
 * debe revelar si un id existe.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const yaNotificados = new Set<string>()
const MAX_NOTIFICADOS = 2000

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const tecnicoId = (body as { tecnicoId?: unknown } | null)?.tecnicoId

    if (!tecnicoId || typeof tecnicoId !== 'string' || !UUID_RE.test(tecnicoId)) {
      return NextResponse.json(
        { error: 'Se requiere tecnicoId (string)' },
        { status: 400 }
      )
    }

    if (yaNotificados.has(tecnicoId)) {
      return NextResponse.json({ success: true })
    }

    const { data: tecnico } = await supabaseAdmin
      .from('tecnicos')
      .select('created_at')
      .eq('id', tecnicoId)
      .maybeSingle()

    if (!tecnico || !registroEsReciente(tecnico.created_at as string | null)) {
      console.warn('[POST /api/notificar-registro] omitido: técnico inexistente o registro no reciente')
      return NextResponse.json({ success: true })
    }

    if (yaNotificados.size >= MAX_NOTIFICADOS) yaNotificados.clear()
    yaNotificados.add(tecnicoId)

    const result = await notificarRegistroTecnico(tecnicoId)

    if (!result.ok) {
      // Permitir el reintento si el envío falló.
      yaNotificados.delete(tecnicoId)
      return NextResponse.json(
        { error: result.error },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/notificar-registro]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
