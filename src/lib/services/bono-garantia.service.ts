/**
 * bono-garantia.service.ts — lado servidor de los bonos MABE (2026-10-24).
 *
 * Resuelve en UNA consulta, para un lote de solicitudes, el momento en que
 * cada una salió del ciclo de repuesto sin que nadie marcara "recibido"
 * (`fin_pausa_repuesto_at` de `bono-garantia.ts`): el cliente agendó la
 * visita final con el repuesto en camino (evento `reagendamiento_confirmado`
 * → en_proceso) o el técnico completó directo desde la espera (`cambio_estado`
 * → confirmacion_pendiente). Se toma el PRIMER evento por solicitud.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_PAUSA_REPUESTO } from '@/lib/utils/bono-garantia'

export async function mapaFinPausaRepuesto(solicitudIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (solicitudIds.length === 0) return mapa
  const { data, error } = await supabase
    .from('solicitud_eventos')
    .select('solicitud_id, ocurrido_at, estado_previo, estado_nuevo')
    .in('solicitud_id', solicitudIds)
    .in('estado_previo', [...ESTADOS_PAUSA_REPUESTO])
    .in('estado_nuevo', ['en_proceso', 'confirmacion_pendiente'])
    .order('ocurrido_at', { ascending: true })
  if (error) {
    console.error('[bono-garantia] mapaFinPausaRepuesto falló:', error.message)
    return mapa
  }
  for (const ev of data ?? []) {
    if (!mapa.has(ev.solicitud_id) && ev.ocurrido_at) mapa.set(ev.solicitud_id, ev.ocurrido_at)
  }
  return mapa
}
