import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import {
  calcularResumenFinanciero,
  type EvidenciaFinanzas,
  type PagoFinanzas,
  type SolicitudFinanzas,
} from '@/lib/services/finanzas.service'

/**
 * GET /api/admin/finanzas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Resumen financiero del negocio (ventas, pago a técnicos, utilidad y mix
 * garantía vs particular) sobre servicios COMPLETADOS, por mes de cierre.
 * Cálculo en `src/lib/services/finanzas.service.ts` (mismo criterio que el
 * export de liquidaciones). Solo admin: el rol lectura (logística) NO ve
 * márgenes.
 */

const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: NextRequest) {
  try {
    if (!(await verificarAdmin(req))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const sp = req.nextUrl.searchParams
    const parsed = querySchema.safeParse({
      desde: sp.get('desde') ?? undefined,
      hasta: sp.get('hasta') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Fechas inválidas (YYYY-MM-DD)' }, { status: 400 })
    }
    const desde = parsed.data.desde ?? '0000-01-01'
    const hasta = parsed.data.hasta ?? '9999-12-31'
    if (desde > hasta) {
      return NextResponse.json({ error: '"desde" no puede ser posterior a "hasta"' }, { status: 400 })
    }

    // Completadas (tope defensivo, mismo patrón que liquidaciones/export).
    const { data: solicitudesRaw, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, created_at, es_garantia, tipo_equipo, tipo_solicitud, estado, pago_tecnico, triaje_resultado, cotizacion, recargo_weekend_aplicado, cumple_ta, diagnosticado_at, siguiente_paso, siguiente_paso_at, repuesto_recibido_at')
      .eq('estado', 'completada')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (solErr) {
      return NextResponse.json({ error: `Error cargando solicitudes: ${solErr.message}` }, { status: 500 })
    }
    const solicitudes = (solicitudesRaw ?? []) as unknown as SolicitudFinanzas[]
    const ids = solicitudes.map((s) => s.id)

    let evidencias: EvidenciaFinanzas[] = []
    let pagos: PagoFinanzas[] = []
    if (ids.length > 0) {
      const [evRes, pagosRes] = await Promise.all([
        supabase
          .from('evidencias_servicio')
          .select('solicitud_id, completado_at, confirmado, confirmado_at, cliente_comentario')
          .in('solicitud_id', ids),
        supabase
          .from('pagos')
          .select('solicitud_id, monto')
          .in('solicitud_id', ids)
          .eq('estado', 'APPROVED'),
      ])
      evidencias = (evRes.data ?? []) as EvidenciaFinanzas[]
      pagos = (pagosRes.data ?? []) as PagoFinanzas[]
    }

    const resumen = calcularResumenFinanciero({ solicitudes, evidencias, pagos, desde, hasta })
    return NextResponse.json(resumen)
  } catch (err) {
    console.error('[admin/finanzas] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
