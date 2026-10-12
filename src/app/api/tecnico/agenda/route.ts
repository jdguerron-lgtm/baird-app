import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { FRANJAS_HORARIO, MAX_SERVICIOS_TECNICO_POR_FRANJA } from '@/lib/constants/franjas'
import {
  addDaysYMD,
  esYMDValido,
  medianocheColombiaIso,
  slotDesdeFechaVisita,
} from '@/lib/utils/agenda-slots'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

/**
 * /api/tecnico/agenda — agenda del técnico (servicios Baird + compromisos
 * externos) para /tecnico/{token}/agenda.
 *
 * Autenticación por `portal_token` (mismo patrón que /api/tecnico/perfil).
 * Todo con service_role: `agenda_tecnico_bloqueos` nace cerrada al anon.
 *
 * GET  ?portalToken&desde=YYYY-MM-DD&hasta=YYYY-MM-DD  (máx 62 días)
 *      → { cupo, servicios[], bloqueos[], sinFecha[] }
 *        servicios/bloqueos traen `fecha` (día CO) + `franja` ya resueltos
 *        para que el browser no haga aritmética de zona horaria.
 * POST { portalToken, fecha, franja, titulo, nota?, bloquea_franja? }
 *      → crea un bloqueo externo. { bloqueo }
 * DELETE { portalToken, id } → borra un bloqueo propio. { success }
 */

const ESTADOS_TERMINALES_IN = `(${[...ESTADOS_TERMINALES].join(',')})`
const MAX_DIAS_RANGO = 62

const FRANJA_VALUES = FRANJAS_HORARIO.map(f => f.value) as [string, ...string[]]
const ymdSchema = z.string().refine(esYMDValido, 'Fecha inválida (YYYY-MM-DD)')

async function tecnicoPorToken(portalToken: string) {
  const { data, error } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo')
    .eq('portal_token', portalToken)
    .single()
  if (error || !data) return null
  return data
}

// ── GET ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const parsed = z
      .object({
        portalToken: z.string().uuid(),
        desde: ymdSchema,
        hasta: ymdSchema,
      })
      .safeParse({
        portalToken: sp.get('portalToken'),
        desde: sp.get('desde'),
        hasta: sp.get('hasta'),
      })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' }, { status: 400 })
    }
    const { portalToken, desde, hasta } = parsed.data
    if (hasta < desde || addDaysYMD(desde, MAX_DIAS_RANGO) < hasta) {
      return NextResponse.json({ error: `Rango inválido (máx ${MAX_DIAS_RANGO} días)` }, { status: 400 })
    }

    const tecnico = await tecnicoPorToken(portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // Servicios asignados NO terminales. Sin cotización ni montos del cliente
    // (el técnico no ve el precio al cliente — margen Baird).
    const { data: sols, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, tipo_equipo, marca_equipo, tipo_solicitud, direccion, zona_servicio, ciudad_pueblo, estado, es_garantia, fecha_visita_at, horario_confirmado')
      .eq('tecnico_asignado_id', tecnico.id)
      .not('estado', 'in', ESTADOS_TERMINALES_IN)
    if (solErr) {
      console.error('[tecnico/agenda] solicitudes:', solErr.message)
      return NextResponse.json({ error: solErr.message }, { status: 500 })
    }

    // Comparar por instante (no por string: Supabase devuelve "+00:00", no "Z").
    const desdeMs = new Date(medianocheColombiaIso(desde)).getTime()
    const hastaMs = new Date(medianocheColombiaIso(addDaysYMD(hasta, 1))).getTime()
    const servicios: unknown[] = []
    const sinFecha: unknown[] = []
    for (const s of sols ?? []) {
      const base = {
        id: s.id,
        cliente_nombre: s.cliente_nombre,
        tipo_equipo: s.tipo_equipo,
        marca_equipo: s.marca_equipo,
        tipo_solicitud: s.tipo_solicitud ?? null,
        direccion: s.direccion,
        zona_servicio: s.zona_servicio,
        ciudad_pueblo: s.ciudad_pueblo,
        estado: s.estado,
        es_garantia: s.es_garantia ?? false,
        horario_confirmado: s.horario_confirmado ?? null,
      }
      const slot = slotDesdeFechaVisita(s.fecha_visita_at)
      if (!slot) {
        sinFecha.push(base)
        continue
      }
      const ms = new Date(s.fecha_visita_at as string).getTime()
      if (ms < desdeMs || ms >= hastaMs) continue
      servicios.push({ ...base, fecha: slot.fecha, franja: slot.franja })
    }

    const { data: bloqueos, error: blqErr } = await supabase
      .from('agenda_tecnico_bloqueos')
      .select('id, fecha, franja, titulo, nota, bloquea_franja, created_at')
      .eq('tecnico_id', tecnico.id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })
    // Fail-soft: si la tabla no existe aún (migración sin aplicar) o la
    // lectura falla, el calendario sigue mostrando los servicios Baird y la
    // UI avisa que los compromisos externos no están disponibles.
    if (blqErr) console.error('[tecnico/agenda] bloqueos:', blqErr.message)

    return NextResponse.json({
      tecnico: { id: tecnico.id, nombre_completo: tecnico.nombre_completo },
      cupo: MAX_SERVICIOS_TECNICO_POR_FRANJA,
      hoy: fechaColombiaYMD(),
      servicios,
      sinFecha,
      bloqueos: blqErr ? [] : (bloqueos ?? []),
      bloqueosDisponibles: !blqErr,
    })
  } catch (err) {
    console.error('Error en GET /api/tecnico/agenda:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────
const crearSchema = z.object({
  portalToken: z.string().uuid(),
  fecha: ymdSchema,
  franja: z.enum(FRANJA_VALUES),
  titulo: z.string().trim().min(1, 'Escribe un título').max(80, 'Título muy largo (máx 80)'),
  nota: z.string().trim().max(300, 'Nota muy larga (máx 300)').optional(),
  bloquea_franja: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = crearSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const body = parsed.data
    const tecnico = await tecnicoPorToken(body.portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data, error } = await supabase
      .from('agenda_tecnico_bloqueos')
      .insert({
        tecnico_id: tecnico.id,
        fecha: body.fecha,
        franja: body.franja,
        titulo: body.titulo,
        nota: body.nota || null,
        bloquea_franja: body.bloquea_franja ?? false,
      })
      .select('id, fecha, franja, titulo, nota, bloquea_franja, created_at')
      .single()
    if (error || !data) {
      console.error('[tecnico/agenda] insert bloqueo:', error?.message)
      return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
    }
    return NextResponse.json({ success: true, bloqueo: data })
  } catch (err) {
    console.error('Error en POST /api/tecnico/agenda:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────
const borrarSchema = z.object({
  portalToken: z.string().uuid(),
  id: z.string().uuid(),
})

export async function DELETE(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = borrarSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const tecnico = await tecnicoPorToken(parsed.data.portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // Scope por tecnico_id: un token solo borra sus propios bloqueos.
    const { error } = await supabase
      .from('agenda_tecnico_bloqueos')
      .delete()
      .eq('id', parsed.data.id)
      .eq('tecnico_id', tecnico.id)
    if (error) {
      console.error('[tecnico/agenda] delete bloqueo:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error en DELETE /api/tecnico/agenda:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}
