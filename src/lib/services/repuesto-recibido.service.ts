/**
 * repuesto-recibido.service.ts — el TÉCNICO cierra el ciclo del repuesto
 * desde su portal (2026-10-23).
 *
 * Hasta ahora solo el admin (/api/repuesto-recibido) y el supervisor
 * (/api/supervisor/repuesto-entregado) podían marcar que el repuesto llegó.
 * En la práctica el técnico es quien se entera primero (lo recoge en bodega
 * o el cliente le avisa), así que la card del portal tiene el botón
 * "📦 Llegó el repuesto" junto a "📞 Llamar" mientras el servicio está en
 * `esperando_repuesto` o `repuesto_en_camino`.
 *
 * Efectos — los mismos del supervisor, menos el aviso al propio técnico:
 *   - `repuestos_pendientes` de la solicitud: pendiente → recibido.
 *   - Transición atómica → `repuesto_recibido` (guard `.in` evita la carrera
 *     con el admin/supervisor marcando al mismo tiempo o el cliente agendando).
 *   - Reusa `reprogramacion_token` si existe (el botón "Agendar visita" que
 *     el cliente ya recibió con la guía sigue vivo).
 *   - Cliente: `repuesto_recibido_cliente_v2` (botón → /reprogramar-repuesto).
 *   - Historial: evento `cambio_estado` con actor 'tecnico' (registrarEvento:
 *     false en notificarCambioEstado, que lo atribuiría al admin).
 *   - Supervisores: notificarCambioEstado (plantilla de repuesto en garantía).
 *
 * Además, `cerrarRepuestosPendientes` deja consistente la tabla cuando el
 * técnico completa el servicio directamente desde un estado de repuesto
 * (esperar un repuesto ya NO bloquea "Completar servicio"): sin esto el
 * repuesto quedaría "pendiente" en /admin/repuestos con el servicio cerrado.
 *
 * Todo con service_role. Sin migración.
 */
import crypto from 'crypto'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_REPUESTO_MARCABLE_TECNICO } from '@/lib/constants/estados'
import {
  enviarRepuestoRecibidoCliente,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'

export type ResultadoRepuestoRecibido =
  | { ok: true; estadoPrevio: string; clienteNotificado: boolean }
  | { ok: false; error: string; status: 400 | 403 | 404 | 409 }

export async function marcarRepuestoRecibidoPorTecnico(
  solicitudId: string,
  opts: { tecnicoId: string; tecnicoNombre: string },
): Promise<ResultadoRepuestoRecibido> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, reprogramacion_token')
    .eq('id', solicitudId)
    .maybeSingle()
  if (!sol) return { ok: false, error: 'Servicio no encontrado', status: 404 }
  if (sol.tecnico_asignado_id !== opts.tecnicoId) {
    return { ok: false, error: 'Este servicio no está asignado a ti', status: 403 }
  }

  const estadoPrevio = (sol.estado ?? '') as string
  if (!ESTADOS_REPUESTO_MARCABLE_TECNICO.has(estadoPrevio)) {
    return {
      ok: false,
      error: 'El servicio ya no está esperando repuesto (alguien lo marcó antes o el cliente ya agendó)',
      status: 400,
    }
  }

  // 1. Repuestos de la solicitud → recibido (best-effort: si no hay filas la
  //    transición igual procede).
  await cerrarRepuestosPendientes(solicitudId)

  // 2. Transición atómica → repuesto_recibido.
  const reprogToken = (sol.reprogramacion_token as string | null) ?? crypto.randomUUID()
  const { data: updated } = await supabase
    .from('solicitudes_servicio')
    .update({
      estado: 'repuesto_recibido',
      reprogramacion_token: reprogToken,
      repuesto_recibido_at: new Date().toISOString(),
    })
    .eq('id', solicitudId)
    .in('estado', [...ESTADOS_REPUESTO_MARCABLE_TECNICO])
    .select('id')
    .maybeSingle()
  if (!updated) {
    return { ok: false, error: 'El servicio cambió de estado hace un momento. Recarga la página.', status: 409 }
  }

  // 3. Cliente elige la fecha de la visita de finalización (best-effort).
  const cli = await enviarRepuestoRecibidoCliente(solicitudId).catch((err: unknown) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }))
  if (!cli.ok) console.error('[repuesto-recibido/tecnico] aviso cliente falló:', cli.error)

  // 4. Historial con el actor real + supervisores.
  const { error: evErr } = await supabase.from('solicitud_eventos').insert({
    solicitud_id: solicitudId,
    tipo: 'cambio_estado',
    estado_previo: estadoPrevio,
    estado_nuevo: 'repuesto_recibido',
    actor: 'tecnico',
    motivo: `Técnico ${opts.tecnicoNombre} marcó que el repuesto llegó`,
    payload: { origen: 'portal_tecnico' },
  })
  if (evErr) console.error('[repuesto-recibido/tecnico] evento falló:', evErr.message)
  await notificarCambioEstado(solicitudId, estadoPrevio, 'repuesto_recibido', { registrarEvento: false })

  return { ok: true, estadoPrevio, clienteNotificado: cli.ok }
}

/**
 * Marca como `recibido` todos los repuestos aún `pendiente` de la solicitud.
 * Devuelve cuántas filas tocó (0 si no había). Nunca lanza.
 */
export async function cerrarRepuestosPendientes(solicitudId: string): Promise<number> {
  const { data, error } = await supabase
    .from('repuestos_pendientes')
    .update({ estado: 'recibido', recibido_at: new Date().toISOString() })
    .eq('solicitud_id', solicitudId)
    .eq('estado', 'pendiente')
    .select('id')
  if (error) {
    console.error('[repuesto-recibido] cerrarRepuestosPendientes falló:', error.message)
    return 0
  }
  return data?.length ?? 0
}
