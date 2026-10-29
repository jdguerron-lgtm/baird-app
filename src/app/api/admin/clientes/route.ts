import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarLectura } from '@/lib/auth/admin'
import {
  agruparPorCliente,
  posiblesDuplicadosDe,
  type SolicitudCliente,
} from '@/lib/utils/clientes-duplicados'

/**
 * GET /api/admin/clientes — vista de clientes por teléfono (2026-10-28).
 *
 *   ?dias=180          → lista: un resumen por teléfono con las órdenes creadas
 *                        en esa ventana (default 180, máx. 730).
 *   ?telefono=57300…   → detalle: TODAS las órdenes de ese teléfono (sin
 *                        ventana), con técnico, pagos aprobados y los posibles
 *                        duplicados de cada una. Lo usa también el aviso de la
 *                        ficha de solicitud.
 *
 * Solo lectura: admin y rol logística. Reglas en `clientes-duplicados.ts`.
 */

const CAMPOS_BASE =
  'id, cliente_telefono, cliente_nombre, tipo_equipo, marca_equipo, es_garantia, estado, numero_serie_factura, tecnico_asignado_id, created_at'
const CAMPOS_DETALLE = `${CAMPOS_BASE}, ciudad_pueblo, direccion, horario_confirmado, fecha_visita_at, cancelado_at, cancelado_por, motivo_cancelacion`

export async function GET(req: NextRequest) {
  try {
    if (!(await verificarLectura(req))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const sp = req.nextUrl.searchParams
    const telefono = (sp.get('telefono') ?? '').replace(/\D/g, '')

    if (telefono) {
      if (telefono.length < 7) return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
      const { data, error } = await supabase
        .from('solicitudes_servicio')
        .select(CAMPOS_DETALLE)
        .eq('cliente_telefono', telefono)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const sols = (data ?? []) as unknown as (SolicitudCliente & Record<string, unknown>)[]
      const ids = sols.map((s) => s.id)
      const tecIds = [...new Set(sols.map((s) => s.tecnico_asignado_id).filter((v): v is string => !!v))]

      const [tecRes, pagosRes] = await Promise.all([
        tecIds.length
          ? supabase.from('tecnicos').select('id, nombre_completo').in('id', tecIds)
          : Promise.resolve({ data: [] as { id: string; nombre_completo: string | null }[] }),
        ids.length
          ? supabase.from('pagos').select('solicitud_id, monto').in('solicitud_id', ids).eq('estado', 'APPROVED')
          : Promise.resolve({ data: [] as { solicitud_id: string; monto: number | null }[] }),
      ])
      const tecnicos = new Map((tecRes.data ?? []).map((t) => [t.id, t.nombre_completo ?? 'Técnico']))
      const pagado = new Map<string, number>()
      for (const p of pagosRes.data ?? []) pagado.set(p.solicitud_id, (pagado.get(p.solicitud_id) ?? 0) + (p.monto ?? 0))

      const resumen = agruparPorCliente(sols)[0] ?? null
      return NextResponse.json({
        cliente: resumen,
        solicitudes: sols.map((s) => ({
          ...s,
          tecnico_nombre: s.tecnico_asignado_id ? tecnicos.get(s.tecnico_asignado_id) ?? null : null,
          pagado_online: pagado.get(s.id) ?? 0,
          posibles_duplicados: posiblesDuplicadosDe(s, sols),
        })),
      })
    }

    const diasRaw = Number(sp.get('dias') ?? 180)
    const dias = Number.isFinite(diasRaw) ? Math.min(Math.max(Math.round(diasRaw), 7), 730) : 180
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const { data, error } = await supabase
      .from('solicitudes_servicio')
      .select(CAMPOS_BASE)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(10000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const clientes = agruparPorCliente((data ?? []) as SolicitudCliente[])
    return NextResponse.json({ dias, clientes })
  } catch (err) {
    console.error('[admin/clientes] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
