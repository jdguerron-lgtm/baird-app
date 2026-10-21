import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarLectura } from '@/lib/auth/admin'
import { fechaColombiaYMD, fechaColombiaMasDias } from '@/lib/utils/fecha-visita'
import {
  calcularReporteCumplimiento,
  type EvidenciaIncumplidos,
  type PingIncumplidos,
  type ReagendamientoIncumplidos,
  type SolicitudIncumplidos,
} from '@/lib/services/incumplidos.service'

/**
 * GET /api/admin/incumplidos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Cumplimiento de la fecha de reserva: qué visitas agendadas (`fecha_visita_at`)
 * NO se atendieron el día reservado — vencidas sin atender, vencidas sin técnico,
 * atendidas tarde — más el resumen global y por técnico. Rango por día de
 * reserva (hora Colombia); default últimos 30 días. Las reservas de hoy o
 * futuras nunca se evalúan. Solo lectura: admin y rol logística.
 * Clasificación pura en `src/lib/services/incumplidos.service.ts`.
 *
 * `items` viene priorizado (2026-10-21): reagendamientos desc → días desde la
 * solicitud desc → gravedad. Los reagendamientos se cuentan como el máximo
 * entre `reagendamientos_count` y los eventos `reagendamiento` + `nota_admin`
 * con `payload.origen = 'reagendamiento_admin'`.
 */

const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Lotes para `.in(...)`: evita URLs gigantes en PostgREST. */
const LOTE_IN = 300

async function enLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    out.push(...(await fn(ids.slice(i, i + LOTE_IN))))
  }
  return out
}

/** Inicio del día CO (YYYY-MM-DD) en ISO UTC: 00:00 Bogotá = 05:00Z. */
function inicioDiaCoIso(ymd: string): string {
  return `${ymd}T05:00:00.000Z`
}

export async function GET(req: NextRequest) {
  try {
    if (!(await verificarLectura(req))) {
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

    const ahora = new Date()
    const hoy = fechaColombiaYMD(ahora)
    const ayer = fechaColombiaMasDias(-1, ahora)
    const desde = parsed.data.desde ?? fechaColombiaMasDias(-30, ahora)
    // Hoy no se evalúa (la franja puede no haber terminado): tope en ayer.
    const hasta = (parsed.data.hasta ?? ayer) < ayer ? (parsed.data.hasta ?? ayer) : ayer
    if (desde > hasta) {
      return NextResponse.json({ error: '"desde" no puede ser posterior a "hasta"' }, { status: 400 })
    }

    const { data: solRaw, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cliente_nombre, cliente_telefono, ciudad_pueblo, tipo_equipo, marca_equipo, tipo_solicitud, numero_serie_factura, horario_confirmado, fecha_visita_at, diagnosticado_at, siguiente_paso_at, tecnico_asignado_id, reagendamientos_count, created_at')
      .not('fecha_visita_at', 'is', null)
      .gte('fecha_visita_at', inicioDiaCoIso(desde))
      .lt('fecha_visita_at', inicioDiaCoIso(hoy))
      .order('fecha_visita_at', { ascending: false })
      .limit(5000)
    if (solErr) {
      return NextResponse.json({ error: `Error cargando solicitudes: ${solErr.message}` }, { status: 500 })
    }
    const solicitudes = (solRaw ?? []) as unknown as SolicitudIncumplidos[]
    const ids = solicitudes.map((s) => s.id)

    let evidencias: EvidenciaIncumplidos[] = []
    let pings: PingIncumplidos[] = []
    let reagendamientos: ReagendamientoIncumplidos[] = []
    const tecnicos: Record<string, string> = {}
    if (ids.length > 0) {
      const tecnicoIds = [...new Set(solicitudes.map((s) => s.tecnico_asignado_id).filter((v): v is string => !!v))]
      const [evRes, pingRes, reagRes, tecRes] = await Promise.all([
        enLotes(ids, async (lote) => {
          const { data } = await supabase
            .from('evidencias_servicio')
            .select('solicitud_id, completado_at')
            .in('solicitud_id', lote)
          return (data ?? []) as EvidenciaIncumplidos[]
        }),
        enLotes(ids, async (lote) => {
          const { data } = await supabase
            .from('gps_pings')
            .select('solicitud_id, capturado_at')
            .in('solicitud_id', lote)
          return (data ?? []) as PingIncumplidos[]
        }),
        enLotes(ids, async (lote) => {
          // Reagendamientos del cliente y "reagendar vencido" (tipo dedicado) +
          // reprogramaciones del admin (nota_admin con origen=reagendamiento_admin).
          const { data } = await supabase
            .from('solicitud_eventos')
            .select('solicitud_id')
            .in('solicitud_id', lote)
            .or('tipo.eq.reagendamiento,and(tipo.eq.nota_admin,payload->>origen.eq.reagendamiento_admin)')
          return (data ?? []) as ReagendamientoIncumplidos[]
        }),
        enLotes(tecnicoIds, async (lote) => {
          const { data } = await supabase
            .from('tecnicos')
            .select('id, nombre_completo')
            .in('id', lote)
          return (data ?? []) as { id: string; nombre_completo: string | null }[]
        }),
      ])
      evidencias = evRes
      pings = pingRes
      reagendamientos = reagRes
      for (const t of tecRes) tecnicos[t.id] = t.nombre_completo ?? 'Técnico sin nombre'
    }

    const reporte = calcularReporteCumplimiento({ solicitudes, evidencias, pings, reagendamientos, tecnicos, desde, hasta, ahora })
    return NextResponse.json(reporte)
  } catch (err) {
    console.error('[admin/incumplidos] error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
