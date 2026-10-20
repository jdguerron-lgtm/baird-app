import { NextRequest, NextResponse } from 'next/server'
import { validarCodigoDescuento } from '@/lib/services/descuentos.service'
import { describirDescuento } from '@/lib/constants/descuentos'

/**
 * GET /api/descuentos/validar?codigo=BIENVENIDO10
 *
 * Validación en vivo del código que el cliente escribe en /solicitar
 * (2026-10-19). Público (el formulario corre sin sesión). Solo devuelve lo
 * que el cliente debe ver: tipo, valor y descripción. El guard real está en
 * POST /api/solicitar, que vuelve a validar antes de persistir el snapshot.
 *
 * Respuesta: { valido: true, tipo, valor, etiqueta, descripcion }
 *          | { valido: false, motivo }
 */
export async function GET(req: NextRequest) {
  try {
    const codigo = (req.nextUrl.searchParams.get('codigo') ?? '').trim().slice(0, 40)
    const r = await validarCodigoDescuento(codigo)
    if (!r.ok) {
      return NextResponse.json({ valido: false, motivo: r.motivo }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      {
        valido: true,
        tipo: r.descuento.tipo,
        valor: r.descuento.valor,
        etiqueta: describirDescuento(r.descuento),
        descripcion: r.descuento.descripcion,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Error en /api/descuentos/validar:', error)
    return NextResponse.json(
      { valido: false, motivo: 'No pudimos validar el código en este momento. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
