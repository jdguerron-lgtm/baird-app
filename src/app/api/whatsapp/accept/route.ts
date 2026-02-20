import { NextRequest, NextResponse } from 'next/server'
import { procesarAceptacion } from '@/lib/services/whatsapp.service'

/**
 * POST /api/whatsapp/accept
 *
 * Procesa la aceptación de un servicio cuando el técnico hace clic en
 * el botón "Aceptar" en la página /aceptar/[token].
 *
 * Lógica anti race-condition: usa UPDATE atómico con WHERE tecnico_id IS NULL.
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
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token requerido' },
        { status: 400 }
      )
    }

    const resultado = await procesarAceptacion(token)

    return NextResponse.json(resultado)
  } catch (error: unknown) {
    console.error('[/api/whatsapp/accept] Error:', error)
    const mensaje = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json(
      { error: mensaje },
      { status: 500 }
    )
  }
}
