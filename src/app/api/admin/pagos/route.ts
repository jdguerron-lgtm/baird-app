import { NextRequest, NextResponse } from 'next/server'
import { verificarLectura } from '@/lib/auth/admin'
import { listarPagosSolicitud } from '@/lib/services/pagos.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/admin/pagos?solicitudId=… — ledger de pagos online de UNA
 * solicitud para la ficha admin (2026-10-21). La tabla `pagos` está cerrada
 * al anon (RLS), así que el navegador no puede leerla directo. Solo lectura:
 * admin y rol LECTURA. Incluye la devolución (si la fila está VOIDED).
 */
export async function GET(req: NextRequest) {
  if (!(await verificarLectura(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const solicitudId = (req.nextUrl.searchParams.get('solicitudId') ?? '').trim().toLowerCase()
  if (!UUID_RE.test(solicitudId)) {
    return NextResponse.json({ error: 'solicitudId inválido' }, { status: 400 })
  }
  try {
    const pagos = await listarPagosSolicitud(solicitudId)
    return NextResponse.json({ pagos })
  } catch (err) {
    console.error('[admin/pagos] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
