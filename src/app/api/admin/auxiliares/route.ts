import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin, obtenerRolRequest } from '@/lib/auth/admin'
import { listarAuxiliaresTecnico } from '@/lib/services/equipo.service'
import { AUXILIAR_SELECT, type AuxiliarRow } from '@/lib/utils/equipo'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'

/**
 * /api/admin/auxiliares  (2026-10-13) — verificación manual de los
 * auxiliares del técnico. Solo admin (Bearer de Supabase Auth + allowlist,
 * ver src/lib/auth/admin.ts). `tecnico_auxiliares` está cerrada al browser,
 * por eso el panel lee y escribe por acá.
 *
 * GET   ?tecnicoId=uuid → { disponible, auxiliares[] } (documento completo: el
 *       admin compara contra la cédula, igual que con el técnico)
 * PATCH { auxiliarId, estado_verificacion: 'verificado'|'rechazado'|'pendiente', nota? }
 *       o { auxiliarId, activo: false }  (baja forzada por Baird)
 *
 * Rechazar o dar de baja también lo saca de `auxiliares_ids` de los servicios
 * activos del técnico, para que el cliente deje de verlo en el portal.
 * Verificar a uno con `acompana_por_defecto` lo suma a esos mismos servicios.
 */

export async function GET(req: NextRequest) {
  // Lectura: admin o logística (solo lista). PATCH sigue siendo solo admin.
  const quien = await obtenerRolRequest(req)
  if (!quien) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = z.string().uuid().safeParse(req.nextUrl.searchParams.get('tecnicoId'))
  if (!parsed.success) return NextResponse.json({ error: 'tecnicoId inválido' }, { status: 400 })
  const { rows, disponible } = await listarAuxiliaresTecnico(parsed.data)
  return NextResponse.json({ disponible, auxiliares: rows })
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await obtenerEmailAdmin(req)
    if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const raw = await req.json().catch(() => null)
    const parsed = z
      .object({
        auxiliarId: z.string().uuid(),
        estado_verificacion: z.enum(['pendiente', 'verificado', 'rechazado']).optional(),
        nota: z.string().trim().max(300).optional(),
        activo: z.boolean().optional(),
      })
      .safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    const { auxiliarId, estado_verificacion, nota, activo } = parsed.data
    if (!estado_verificacion && activo === undefined) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data: previo, error: prevErr } = await supabase
      .from('tecnico_auxiliares')
      .select(AUXILIAR_SELECT)
      .eq('id', auxiliarId)
      .maybeSingle()
    if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 })
    if (!previo) return NextResponse.json({ error: 'Auxiliar no encontrado' }, { status: 404 })
    const prev = previo as unknown as AuxiliarRow

    const ahora = new Date().toISOString()
    const update: Record<string, unknown> = { updated_at: ahora }
    if (estado_verificacion) {
      update.estado_verificacion = estado_verificacion
      update.fecha_verificacion = estado_verificacion === 'verificado' ? ahora : null
      update.verificado_por = estado_verificacion === 'pendiente' ? null : admin
    }
    if (nota !== undefined) update.nota_verificacion = nota || null
    if (activo !== undefined) {
      update.activo = activo
      if (!activo) update.acompana_por_defecto = false
    }

    const { data, error } = await supabase
      .from('tecnico_auxiliares')
      .update(update)
      .eq('id', auxiliarId)
      .select(AUXILIAR_SELECT)
      .single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
    const nuevo = data as unknown as AuxiliarRow

    const eraVisible = prev.activo === true && prev.estado_verificacion === 'verificado'
    const esVisible = nuevo.activo === true && nuevo.estado_verificacion === 'verificado'

    // Pasó a ser visible y "me acompaña por defecto" → se suma a los servicios
    // activos del técnico que aún no lo tienen (2026-10-15, caso Néstor Castro +
    // Lynn Mari Bonilla: la verificación llegó DESPUÉS de aceptar el servicio y
    // fijarEquipoPorDefecto ya había corrido sin ella). El técnico puede
    // quitarlo por servicio desde "¿Quién va?"; el portal del cliente lo refleja.
    if (!eraVisible && esVisible && nuevo.acompana_por_defecto === true) {
      try {
        const { data: sols } = await supabase
          .from('solicitudes_servicio')
          .select('id, auxiliares_ids')
          .eq('tecnico_asignado_id', prev.tecnico_id)
          .not('estado', 'in', `(${[...ESTADOS_TERMINALES].join(',')})`)
        for (const s of sols ?? []) {
          const ids = (s.auxiliares_ids as string[] | null) ?? []
          if (ids.includes(auxiliarId)) continue
          await supabase.from('solicitudes_servicio').update({ auxiliares_ids: [...ids, auxiliarId] }).eq('id', s.id)
        }
      } catch (err) {
        console.warn('[admin/auxiliares] no se pudo sumar al auxiliar a servicios activos:', err instanceof Error ? err.message : err)
      }
    }

    // Dejó de ser visible → fuera de los servicios activos del técnico.
    if (eraVisible && !esVisible) {
      try {
        const { data: sols } = await supabase
          .from('solicitudes_servicio')
          .select('id, auxiliares_ids')
          .eq('tecnico_asignado_id', prev.tecnico_id)
          .not('estado', 'in', `(${[...ESTADOS_TERMINALES].join(',')})`)
          .contains('auxiliares_ids', [auxiliarId])
        for (const s of sols ?? []) {
          const ids = (s.auxiliares_ids as string[] | null ?? []).filter(x => x !== auxiliarId)
          await supabase.from('solicitudes_servicio').update({ auxiliares_ids: ids }).eq('id', s.id)
        }
      } catch (err) {
        console.warn('[admin/auxiliares] no se pudo sacar al auxiliar de servicios activos:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ success: true, auxiliar: nuevo })
  } catch (err) {
    console.error('[admin/auxiliares PATCH]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
