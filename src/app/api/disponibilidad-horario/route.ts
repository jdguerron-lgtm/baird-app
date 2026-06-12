import { NextRequest, NextResponse } from 'next/server'
import { franjasLlenasParaFecha } from '@/lib/services/agenda.service'
import { fechaColombiaMasDias } from '@/lib/utils/fecha-visita'

/**
 * GET /api/disponibilidad-horario?fecha=YYYY-MM-DD
 *
 * Disponibilidad de franjas para un día: la UI de los selectores de horario
 * (HorarioSelector, ReprogramarSelector) desactiva las franjas llenas antes
 * de que el cliente intente confirmar. El guard REAL es server-side en
 * validarHorarioAgendable (agenda.service) — este endpoint es solo UX.
 *
 * Público (los selectores corren con token de cliente, sin sesión). No expone
 * PII: solo qué franjas están llenas y si el día es agendable.
 *
 * Respuesta: { fecha, agendable, franjas_llenas: string[] }
 *   - agendable=false cuando la fecha es hoy o pasada (mínimo: mañana).
 */
export async function GET(req: NextRequest) {
  try {
    const fecha = req.nextUrl.searchParams.get('fecha') ?? ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'Parámetro fecha inválido (YYYY-MM-DD)' }, { status: 400 })
    }

    // Mismo día o pasado → no agendable (mínimo: mañana, TZ Colombia).
    if (fecha < fechaColombiaMasDias(1)) {
      return NextResponse.json({ fecha, agendable: false, franjas_llenas: [] })
    }

    const franjasLlenas = await franjasLlenasParaFecha(fecha)
    return NextResponse.json({ fecha, agendable: true, franjas_llenas: franjasLlenas })
  } catch (error) {
    console.error('Error en /api/disponibilidad-horario:', error)
    // Fail-open: la UI no bloquea franjas si esto falla; el guard real está
    // en la confirmación.
    return NextResponse.json({ fecha: null, agendable: true, franjas_llenas: [] })
  }
}
