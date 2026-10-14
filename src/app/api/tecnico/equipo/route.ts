import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { PRIVACIDAD_VERSION } from '@/lib/constants/legal'
import { listarAuxiliaresTecnico } from '@/lib/services/equipo.service'
import {
  AUXILIAR_SELECT,
  MAX_AUXILIARES_POR_TECNICO,
  cambioRequiereReverificacion,
  validarAuxiliar,
  type AuxiliarRow,
} from '@/lib/utils/equipo'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'

/**
 * /api/tecnico/equipo — equipo de trabajo (auxiliares) del técnico. 2026-10-13.
 *
 * Autenticación por `portal_token` (mismo patrón que /api/tecnico/perfil y
 * /api/tecnico/agenda). Todo con service_role: `tecnico_auxiliares` nace
 * cerrada al anon (RLS sin policies).
 *
 * GET    ?portalToken → { disponible, max, auxiliares[], equipoPorServicio: {solicitudId: ids[]} }
 *        `equipoPorServicio` trae los `auxiliares_ids` de los servicios NO
 *        terminales del técnico (para la card "¿Quién va?" del portal).
 * POST   { portalToken, auxiliar: {...} } → crea (estado 'pendiente'). { auxiliar }
 * PATCH  { portalToken, id, auxiliar?: {...}, acompana_por_defecto?: bool }
 *        Cambiar nombre/documento/foto vuelve el estado a 'pendiente'
 *        (Baird debe re-verificar); solo cambiar "por defecto" no lo toca.
 * DELETE { portalToken, id } → baja lógica (activo=false) y lo saca de los
 *        servicios activos. Nunca borra la fila.
 *
 * La foto la sube el browser al bucket público `tecnicos-fotos` (carpeta
 * {tecnicoId}/auxiliares/, misma policy que /registro) y acá solo se valida
 * que la URL apunte a ese bucket.
 */

const tokenSchema = z.string().uuid()

const auxiliarSchema = z.object({
  nombre_completo: z.string().max(120),
  tipo_documento: z.string().max(20),
  numero_documento: z.string().max(40),
  foto_perfil_url: z.string().max(500),
  whatsapp: z.string().max(30).nullable().optional(),
  acompana_por_defecto: z.boolean().optional(),
  autoriza_datos: z.boolean().optional(),
})

function bucketPrefix(): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  return base ? `${base}/storage/v1/object/public/tecnicos-fotos/` : null
}

async function tecnicoPorToken(portalToken: string) {
  const { data, error } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, numero_documento')
    .eq('portal_token', portalToken)
    .single()
  if (error || !data) return null
  return data
}

const ESTADOS_TERMINALES_IN = `(${[...ESTADOS_TERMINALES].join(',')})`

// ── GET ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const parsed = tokenSchema.safeParse(req.nextUrl.searchParams.get('portalToken'))
    if (!parsed.success) return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    const tecnico = await tecnicoPorToken(parsed.data)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { rows, disponible } = await listarAuxiliaresTecnico(tecnico.id)

    // Equipo por servicio activo (best-effort: sin la columna devuelve {}).
    const equipoPorServicio: Record<string, string[]> = {}
    if (disponible) {
      const { data: sols } = await supabase
        .from('solicitudes_servicio')
        .select('id, auxiliares_ids')
        .eq('tecnico_asignado_id', tecnico.id)
        .not('estado', 'in', ESTADOS_TERMINALES_IN)
      for (const s of sols ?? []) {
        equipoPorServicio[s.id as string] = Array.isArray(s.auxiliares_ids) ? (s.auxiliares_ids as string[]) : []
      }
    }

    return NextResponse.json({
      disponible,
      max: MAX_AUXILIARES_POR_TECNICO,
      auxiliares: rows.map(publico),
      equipoPorServicio,
    })
  } catch (err) {
    console.error('[tecnico/equipo GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── POST (crear) ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = z.object({ portalToken: tokenSchema, auxiliar: auxiliarSchema }).safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const tecnico = await tecnicoPorToken(parsed.data.portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const v = validarAuxiliar(parsed.data.auxiliar, {
      documentoTecnico: tecnico.numero_documento,
      bucketUrlPrefix: bucketPrefix(),
    })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const { rows, disponible } = await listarAuxiliaresTecnico(tecnico.id)
    if (!disponible) {
      return NextResponse.json({ error: 'El registro de auxiliares aún no está habilitado. Avisa al equipo Baird.' }, { status: 503 })
    }
    const activos = rows.filter(a => a.activo)
    if (activos.length >= MAX_AUXILIARES_POR_TECNICO) {
      return NextResponse.json({ error: `Puedes tener máximo ${MAX_AUXILIARES_POR_TECNICO} auxiliares activos. Da de baja uno para agregar otro.` }, { status: 409 })
    }
    if (activos.some(a => (a.numero_documento ?? '') === v.auxiliar.numero_documento)) {
      return NextResponse.json({ error: 'Ya tienes un auxiliar registrado con ese documento.' }, { status: 409 })
    }

    const ahora = new Date().toISOString()
    const { data, error } = await supabase
      .from('tecnico_auxiliares')
      .insert({
        tecnico_id: tecnico.id,
        nombre_completo: v.auxiliar.nombre_completo,
        tipo_documento: v.auxiliar.tipo_documento,
        numero_documento: v.auxiliar.numero_documento,
        foto_perfil_url: v.auxiliar.foto_perfil_url,
        whatsapp: v.auxiliar.whatsapp,
        acompana_por_defecto: v.auxiliar.acompana_por_defecto,
        estado_verificacion: 'pendiente',
        activo: true,
        autorizacion_datos_at: ahora,
        autorizacion_version: PRIVACIDAD_VERSION,
        updated_at: ahora,
      })
      .select(AUXILIAR_SELECT)
      .single()
    if (error || !data) {
      console.error('[tecnico/equipo POST] insert falló:', error?.message)
      return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
    }
    return NextResponse.json({ success: true, auxiliar: publico(data as unknown as AuxiliarRow) })
  } catch (err) {
    console.error('[tecnico/equipo POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── PATCH (editar) ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = z
      .object({
        portalToken: tokenSchema,
        id: z.string().uuid(),
        auxiliar: auxiliarSchema.optional(),
        acompana_por_defecto: z.boolean().optional(),
      })
      .safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const { portalToken, id } = parsed.data
    const tecnico = await tecnicoPorToken(portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: previo, error: prevErr } = await supabase
      .from('tecnico_auxiliares')
      .select(AUXILIAR_SELECT)
      .eq('id', id)
      .eq('tecnico_id', tecnico.id)
      .maybeSingle()
    if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 })
    if (!previo) return NextResponse.json({ error: 'Auxiliar no encontrado' }, { status: 404 })
    const prev = previo as unknown as AuxiliarRow
    if (!prev.activo) return NextResponse.json({ error: 'Este auxiliar está dado de baja.' }, { status: 409 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let reverificar = false

    if (parsed.data.auxiliar) {
      const v = validarAuxiliar(
        // Edición: la autorización ya quedó registrada al crear.
        { ...parsed.data.auxiliar, autoriza_datos: true },
        { documentoTecnico: tecnico.numero_documento, bucketUrlPrefix: bucketPrefix() },
      )
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      reverificar = cambioRequiereReverificacion(prev, v.auxiliar)
      Object.assign(update, {
        nombre_completo: v.auxiliar.nombre_completo,
        tipo_documento: v.auxiliar.tipo_documento,
        numero_documento: v.auxiliar.numero_documento,
        foto_perfil_url: v.auxiliar.foto_perfil_url,
        whatsapp: v.auxiliar.whatsapp,
        acompana_por_defecto: v.auxiliar.acompana_por_defecto,
      })
      if (reverificar) {
        Object.assign(update, { estado_verificacion: 'pendiente', fecha_verificacion: null, verificado_por: null })
      }
    }
    if (parsed.data.acompana_por_defecto !== undefined) {
      update.acompana_por_defecto = parsed.data.acompana_por_defecto
    }

    const { data, error } = await supabase
      .from('tecnico_auxiliares')
      .update(update)
      .eq('id', id)
      .eq('tecnico_id', tecnico.id)
      .select(AUXILIAR_SELECT)
      .single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })

    // Si dejó de estar verificado, no puede seguir en servicios activos.
    if (reverificar) await quitarDeServiciosActivos(tecnico.id, id)

    return NextResponse.json({ success: true, auxiliar: publico(data as unknown as AuxiliarRow), reverificar })
  } catch (err) {
    console.error('[tecnico/equipo PATCH]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── DELETE (baja lógica) ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = z.object({ portalToken: tokenSchema, id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const tecnico = await tecnicoPorToken(parsed.data.portalToken)
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { error } = await supabase
      .from('tecnico_auxiliares')
      .update({ activo: false, acompana_por_defecto: false, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.id)
      .eq('tecnico_id', tecnico.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await quitarDeServiciosActivos(tecnico.id, parsed.data.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[tecnico/equipo DELETE]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

/** Saca al auxiliar de `auxiliares_ids` de los servicios NO terminales del técnico. Best-effort. */
async function quitarDeServiciosActivos(tecnicoId: string, auxiliarId: string): Promise<void> {
  try {
    const { data: sols } = await supabase
      .from('solicitudes_servicio')
      .select('id, auxiliares_ids')
      .eq('tecnico_asignado_id', tecnicoId)
      .not('estado', 'in', ESTADOS_TERMINALES_IN)
      .contains('auxiliares_ids', [auxiliarId])
    for (const s of sols ?? []) {
      const ids = (s.auxiliares_ids as string[] | null ?? []).filter(x => x !== auxiliarId)
      await supabase.from('solicitudes_servicio').update({ auxiliares_ids: ids }).eq('id', s.id)
    }
  } catch (err) {
    console.warn('[tecnico/equipo] quitarDeServiciosActivos falló:', err instanceof Error ? err.message : err)
  }
}

/** Lo que ve el técnico de su propio auxiliar (documento completo: él lo registró). */
function publico(a: AuxiliarRow) {
  return {
    id: a.id,
    nombre_completo: a.nombre_completo,
    tipo_documento: a.tipo_documento,
    numero_documento: a.numero_documento,
    foto_perfil_url: a.foto_perfil_url,
    whatsapp: a.whatsapp ?? null,
    estado_verificacion: a.estado_verificacion,
    nota_verificacion: a.nota_verificacion ?? null,
    acompana_por_defecto: a.acompana_por_defecto === true,
    activo: a.activo === true,
    created_at: a.created_at ?? null,
  }
}
