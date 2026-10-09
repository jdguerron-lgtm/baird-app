import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { enviarServicioAsignadoTecnico } from '@/lib/services/whatsapp.service'

export const maxDuration = 60

/**
 * POST /api/admin/tecnicos/reenviar-portal
 *
 * Reenvía a cada técnico con servicios ACTIVOS la plantilla
 * `servicio_asignado_tecnico_v4` de su servicio activo más reciente — es la
 * plantilla del flujo que trae el botón "Abrir portal" (/tecnico/{token}),
 * así el técnico recupera el acceso a su portal y ve el estado de todos sus
 * servicios. Un solo mensaje por técnico.
 *
 * Caso que lo motivó (2026-10-09): Meta rechazó el mensaje de asignación a
 * un técnico nuevo (error 132018, dirección con 5 espacios seguidos) y el
 * técnico quedó sin enlace al portal → no podía avanzar con el diagnóstico.
 *
 * Body: { tecnicoId?: string }  → solo ese técnico; sin body → todos los que
 * tengan al menos un servicio activo.
 */
const ESTADOS_INACTIVOS = [
  'completada', 'cancelada', 'en_disputa', 'reparacion_rechazada',
  'finalizado_sin_reparacion', 'sin_agendar', 'cotizacion_rechazada',
]

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const tecnicoId = typeof body?.tecnicoId === 'string' ? body.tecnicoId : null

    let query = supabase
      .from('solicitudes_servicio')
      .select('id, tecnico_asignado_id, created_at, estado')
      .not('tecnico_asignado_id', 'is', null)
      .not('estado', 'in', `(${ESTADOS_INACTIVOS.join(',')})`)
      .order('created_at', { ascending: false })
    if (tecnicoId) query = query.eq('tecnico_asignado_id', tecnicoId)

    const { data: activas, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Servicio activo más reciente por técnico (el listado viene desc por fecha)
    const porTecnico = new Map<string, { solicitudId: string; activos: number }>()
    for (const s of activas ?? []) {
      const tid = s.tecnico_asignado_id as string
      const actual = porTecnico.get(tid)
      if (actual) actual.activos++
      else porTecnico.set(tid, { solicitudId: s.id, activos: 1 })
    }

    if (porTecnico.size === 0) {
      return NextResponse.json({
        enviados: 0,
        detalles: [],
        mensaje: tecnicoId ? 'El técnico no tiene servicios activos' : 'Ningún técnico tiene servicios activos',
      })
    }

    const ids = [...porTecnico.keys()]
    const { data: tecnicos } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, whatsapp')
      .in('id', ids)
    const nombrePor = new Map((tecnicos ?? []).map(t => [t.id, t]))

    const detalles: { tecnicoId: string; tecnico: string; whatsapp: string; activos: number; ok: boolean; error?: string }[] = []
    for (const [tid, info] of porTecnico) {
      const t = nombrePor.get(tid)
      const r = await enviarServicioAsignadoTecnico(info.solicitudId)
      detalles.push({
        tecnicoId: tid,
        tecnico: t?.nombre_completo ?? tid,
        whatsapp: t?.whatsapp ?? '',
        activos: info.activos,
        ok: r.ok,
        error: r.error,
      })
    }

    const enviados = detalles.filter(d => d.ok).length
    return NextResponse.json({
      enviados,
      fallidos: detalles.length - enviados,
      detalles,
      mensaje: `Portal reenviado a ${enviados} de ${detalles.length} técnico(s) con servicios activos`,
    })
  } catch (error) {
    console.error('[reenviar-portal] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
