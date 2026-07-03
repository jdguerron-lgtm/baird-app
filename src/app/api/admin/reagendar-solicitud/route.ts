import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { procesarReagendamientoAdmin } from '@/lib/services/whatsapp.service'
import { materializarFechaVisita, franjasLlenasParaFecha } from '@/lib/services/agenda.service'
import { formatearFechaLargaCO, fechaColombiaMasDias } from '@/lib/utils/fecha-visita'
import { FRANJAS_HORARIO } from '@/lib/constants/franjas'

export const maxDuration = 30

const FRANJAS_VALIDAS = new Set<string>(FRANJAS_HORARIO.map(f => f.value))

/**
 * POST /api/admin/reagendar-solicitud
 *
 * Cambia la FECHA del servicio desde el panel admin con calendario (fecha +
 * franja). A diferencia de /api/admin/editar-solicitud (texto libre, sin aviso):
 *   1. Materializa `fecha_visita_at` → el servicio aparece en la vista Calendario.
 *   2. Notifica por WhatsApp a cliente, técnico asignado y supervisores.
 *
 * El admin puede FORZAR fechas cercanas o franjas llenas: el mínimo "a partir de
 * mañana" y el cupo se devuelven como `avisos` (no bloquean). Reprogramar un
 * servicio en estado terminal sí se bloquea (lo valida el service).
 *
 * Body: { id: string, fecha: 'YYYY-MM-DD', franja: '8am-12pm', motivo?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : ''
    const franja = typeof body.franja === 'string' ? body.franja.trim() : ''
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : null

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'fecha inválida (formato YYYY-MM-DD)' }, { status: 400 })
    }
    if (!FRANJAS_VALIDAS.has(franja)) {
      return NextResponse.json({ error: 'franja inválida' }, { status: 400 })
    }

    const fechaVisitaAt = materializarFechaVisita(fecha, franja)
    if (!fechaVisitaAt) {
      return NextResponse.json({ error: 'No se pudo calcular la fecha de visita' }, { status: 400 })
    }

    const horario = `${formatearFechaLargaCO(fecha)} · ${franja}`

    // Avisos NO bloqueantes (el admin puede forzar): fecha cercana / franja llena.
    const avisos: string[] = []
    if (fecha < fechaColombiaMasDias(1)) {
      avisos.push('La fecha es hoy o anterior — normalmente se agenda a partir de mañana.')
    }
    try {
      const llenas = await franjasLlenasParaFecha(fecha)
      if (llenas.includes(franja)) {
        avisos.push(`La franja ${franja} ya tenía el cupo lleno para ese día.`)
      }
    } catch {
      /* fail-open: el conteo de cupo es best-effort, no debe bloquear */
    }

    const result = await procesarReagendamientoAdmin(id, horario, fechaVisitaAt)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    // Auditoría append-only (best-effort). Se registra como nota_admin para que
    // aparezca en "Notas del administrador": el estado no cambia, así que no
    // entra al historial de estados. Incluye el diff de horario y a quién se notificó.
    try {
      await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'nota_admin',
        estado_previo: result.estado ?? null,
        estado_nuevo: result.estado ?? null,
        actor: adminEmail,
        motivo: motivo ?? `Fecha de servicio reprogramada a "${horario}"`,
        payload: {
          origen: 'reagendamiento_admin',
          campos_modificados: {
            horario_confirmado: { previo: result.horarioPrevio ?? null, nuevo: horario },
          },
          fecha_visita_at: fechaVisitaAt,
          notificados: {
            cliente: result.clienteNotificado,
            tecnico: result.tecnicoNotificado,
            supervisores: result.supervisores,
          },
        },
      })
    } catch (logErr) {
      console.error('[reagendar-solicitud] auditoría falló (no crítico):', logErr)
    }

    return NextResponse.json({
      ok: true,
      horario,
      fecha_visita_at: fechaVisitaAt,
      tenia_tecnico: result.teniaTecnico,
      cliente_notificado: result.clienteNotificado,
      tecnico_notificado: result.tecnicoNotificado,
      supervisores: result.supervisores,
      avisos,
    })
  } catch (err) {
    console.error('Error en /api/admin/reagendar-solicitud:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
