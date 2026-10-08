import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESPECIALIDADES } from '@/lib/constants/especialidades'
import {
  CERTIFICACION_POR_ID,
  aplicarDeclaracionTecnico,
  parseCertificaciones,
  type CertificacionId,
  type CertificacionesTecnico,
} from '@/lib/constants/certificaciones'

/**
 * POST /api/tecnico/perfil
 *
 * Autoservicio del técnico desde su portal (/tecnico/{token}/perfil): actualiza
 * especialidades, si atiende gasodomésticos, ARL y DECLARA qué certificaciones
 * tiene. Server-side con service_role porque el anon key no puede borrar filas
 * de `especialidades_tecnico` (solo INSERT/SELECT) y porque la verificación de
 * una certificación es exclusiva del admin: aquí solo se siembra "declarada" /
 * "sin_revisar" y NUNCA se pisa una decisión del admin (ver
 * aplicarDeclaracionTecnico). Ver docs/CERTIFICACIONES.md.
 *
 * Autenticación por portal_token (mismo patrón que /api/tecnico/llamada-intento).
 *
 * Body: {
 *   portalToken: string (uuid),
 *   especialidades: Especialidad[] (≥1),
 *   cubre_gasodomesticos: boolean,
 *   tiene_arl?: boolean | null,
 *   declaraciones?: { [certificacionId]: boolean },   // true = "la tengo"
 *   numeros?: { [certificacionId]: string },          // nº de certificado/matrícula
 * }
 */

const schema = z.object({
  portalToken: z.string().uuid(),
  especialidades: z.array(z.enum(ESPECIALIDADES)).min(1, 'Selecciona al menos una especialidad'),
  cubre_gasodomesticos: z.boolean(),
  tiene_arl: z.boolean().nullable().optional(),
  declaraciones: z.record(z.string(), z.boolean()).optional(),
  numeros: z.record(z.string(), z.string().trim().max(60)).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }
    const body = parsed.data
    const especialidades = Array.from(new Set(body.especialidades))

    // 1. Técnico por portal_token
    const { data: tecnico, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, especialidad_principal, certificaciones, estado_verificacion')
      .eq('portal_token', body.portalToken)
      .single()
    if (tecErr || !tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // 2. Certificaciones: solo las declarables del catálogo, sin pisar al admin.
    const declaraciones: Partial<Record<CertificacionId, boolean>> = {}
    for (const [id, tiene] of Object.entries(body.declaraciones ?? {})) {
      const def = CERTIFICACION_POR_ID[id as CertificacionId]
      if (def?.declarable) declaraciones[id as CertificacionId] = tiene
    }
    const actuales = parseCertificaciones(tecnico.certificaciones)
    const certificaciones: CertificacionesTecnico = aplicarDeclaracionTecnico(actuales, declaraciones, 'portal')

    // Número de certificado: solo sobre entradas que el técnico controla
    // (declarada / sin_revisar). Si el admin ya decidió, se ignora.
    for (const [id, numero] of Object.entries(body.numeros ?? {})) {
      const cid = id as CertificacionId
      if (!CERTIFICACION_POR_ID[cid]?.declarable) continue
      const entry = certificaciones[cid]
      if (!entry || (entry.estado !== 'declarada' && entry.estado !== 'sin_revisar')) continue
      certificaciones[cid] = { ...entry, numero: numero || undefined }
    }

    // 3. Especialidad principal: se conserva si sigue marcada; si no, la primera.
    const principal = especialidades.includes(tecnico.especialidad_principal as (typeof ESPECIALIDADES)[number])
      ? tecnico.especialidad_principal
      : especialidades[0]

    const ahora = new Date().toISOString()
    const update: Record<string, unknown> = {
      cubre_gasodomesticos: body.cubre_gasodomesticos,
      certificaciones,
      especialidad_principal: principal,
      perfil_actualizado_at: ahora,
    }
    if (body.tiene_arl !== undefined) update.tiene_arl = body.tiene_arl

    const { error: updErr } = await supabase.from('tecnicos').update(update).eq('id', tecnico.id)
    if (updErr) {
      console.error('[tecnico/perfil] update tecnicos falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // 4. Especialidades: insertar las nuevas y borrar las quitadas (sin pasar
    //    por una ventana con cero filas, que dejaría al técnico fuera del
    //    matching si el segundo paso falla).
    const { data: filas } = await supabase
      .from('especialidades_tecnico')
      .select('especialidad')
      .eq('tecnico_id', tecnico.id)
    const actualesEsp = new Set((filas ?? []).map(f => f.especialidad as string))
    const toAdd = especialidades.filter(e => !actualesEsp.has(e))
    const toRemove = [...actualesEsp].filter(e => !(especialidades as string[]).includes(e))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('especialidades_tecnico')
        .insert(toAdd.map(e => ({ tecnico_id: tecnico.id, especialidad: e })))
      if (error) {
        console.error('[tecnico/perfil] insert especialidades falló:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('especialidades_tecnico')
        .delete()
        .eq('tecnico_id', tecnico.id)
        .in('especialidad', toRemove)
      if (error) {
        console.error('[tecnico/perfil] delete especialidades falló:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      perfil: {
        especialidades,
        especialidad_principal: principal,
        cubre_gasodomesticos: body.cubre_gasodomesticos,
        tiene_arl: body.tiene_arl ?? null,
        certificaciones,
        perfil_actualizado_at: ahora,
      },
    })
  } catch (err) {
    console.error('Error en /api/tecnico/perfil:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
