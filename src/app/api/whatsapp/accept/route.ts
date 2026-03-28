import { NextRequest, NextResponse } from 'next/server'
import { procesarAceptacion } from '@/lib/services/whatsapp.service'

/**
 * POST /api/whatsapp/accept
 *
 * Procesa la aceptación de un servicio cuando el técnico hace clic en
 * el botón "Aceptar" en la página /aceptar/[token].
 *
 * Lógica anti race-condition: usa UPDATE atómico con WHERE tecnico_asignado_id IS NULL.
 * Solo el primer técnico en llamar este endpoint con un token válido gana.
 *
 * Body: { token: string }
 *
 * Respuestas:
 *   200 { ganado: true }  → Técnico asignado, confirmaciones enviadas
 *   200 { ganado: false } → Servicio ya tomado (llega tarde)
 *   400                   → Token faltante
 *   404                   → Token inválido
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, horarioSeleccionado } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token requerido' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(token)) {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 400 }
      )
    }

    // Validate horarioSeleccionado if provided
    const horario = horarioSeleccionado === 1 || horarioSeleccionado === 2
      ? horarioSeleccionado as 1 | 2
      : undefined

    const resultado = await procesarAceptacion(token, horario)

    return NextResponse.json(resultado)
  } catch (error: unknown) {
    console.error('[/api/whatsapp/accept] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
