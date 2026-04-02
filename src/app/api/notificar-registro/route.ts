import { NextResponse } from 'next/server'
import { notificarRegistroTecnico } from '@/lib/services/whatsapp.service'

export async function POST(request: Request) {
  try {
    const { tecnicoId } = await request.json()

    if (!tecnicoId || typeof tecnicoId !== 'string') {
      return NextResponse.json(
        { error: 'Se requiere tecnicoId (string)' },
        { status: 400 }
      )
    }

    const result = await notificarRegistroTecnico(tecnicoId)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/notificar-registro]', err)
    return NextResponse.json(
      { error: 'Error interno', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
