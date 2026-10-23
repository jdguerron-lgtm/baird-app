/**
 * confirmacion-visita.service.ts — confirmación de visita por el técnico,
 * liberación con reoferta urgente, recordatorio diario de agenda y alerta al
 * equipo (docs/PROTOCOLO-VISITA.md § "Fase 0", 2026-10-22).
 *
 * Alcance acordado el 2026-10-22: NO hay liberación automática. El sistema
 * recuerda y alerta; sueltan al técnico solo él mismo ("No alcanzo" en su
 * portal) o el admin ("Liberar técnico y reofertar" en la ficha). En ambos
 * casos el servicio vuelve a `notificada` y la oferta sale como URGENTE a los
 * demás técnicos de la ciudad (`notificarTecnicos` con `excluirTecnicoId` +
 * `urgente`).
 *
 * Todo con service_role. Migración: 20261022_confirmacion_visita.sql.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ESTADOS_TERMINALES } from '@/lib/constants/estados'
import { fechaColombiaYMD, fechaColombiaMasDias, formatearFechaLargaCO } from '@/lib/utils/fecha-visita'
import { addDaysYMD, medianocheColombiaIso } from '@/lib/utils/agenda-slots'
import {
  armarAgendaTecnico,
  armarAlertaAdmin,
  ESTADOS_LIBERABLES,
  franjaDeVisita,
  nombreCorto,
  type BloqueoAgenda,
  type ServicioAgenda,
  type VisitaAlerta,
} from '@/lib/utils/confirmacion-visita'
import {
  enviarMensajeTexto,
  enviarPlantilla,
  isPhoneAllowed,
  notificarCambioEstado,
  notificarTecnicos,
  sanitizarParametroPlantilla,
  type NotifyResult,
} from '@/lib/services/whatsapp.service'

const ESTADOS_TERMINALES_IN = `(${[...ESTADOS_TERMINALES].join(',')})`
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://lineablanca.bairdservice.com'
const alertPhone = () => process.env.WHATSAPP_ALERT_PHONE ?? '573153019192'

/** Plantilla de fallback del recordatorio de agenda (fuera de la ventana 24h). */
export const PLANTILLA_AGENDA_TECNICO = 'agenda_manana_tecnico_v1'

// ─────────────────────────────────────────────────────────────
// Confirmar
// ─────────────────────────────────────────────────────────────

export interface ConfirmarOpts {
  por: 'tecnico' | 'admin'
  /** Quién queda en el evento: nombre del técnico o email del admin. */
  actor: string
  /** Si viene, la solicitud debe estar asignada a ESTE técnico. */
  tecnicoId?: string
}

export async function confirmarVisita(
  solicitudId: string,
  opts: ConfirmarOpts,
): Promise<{ ok: boolean; error?: string; yaEstaba?: boolean }> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, fecha_visita_at, visita_confirmada_at')
    .eq('id', solicitudId)
    .single()
  if (error || !sol) return { ok: false, error: 'Servicio no encontrado' }

  if (ESTADOS_TERMINALES.has(sol.estado ?? '')) return { ok: false, error: 'El servicio ya está cerrado' }
  if (!sol.tecnico_asignado_id) return { ok: false, error: 'El servicio no tiene técnico asignado' }
  if (opts.tecnicoId && sol.tecnico_asignado_id !== opts.tecnicoId) {
    return { ok: false, error: 'Este servicio no está asignado a ti' }
  }
  if (!sol.fecha_visita_at) return { ok: false, error: 'El servicio no tiene fecha de visita' }
  if (fechaColombiaYMD(new Date(sol.fecha_visita_at)) < fechaColombiaYMD()) {
    return { ok: false, error: 'La fecha de la visita ya pasó' }
  }
  if (sol.visita_confirmada_at) return { ok: true, yaEstaba: true }

  const ahora = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({ visita_confirmada_at: ahora, visita_confirmada_por: opts.por })
    .eq('id', sol.id)
    .eq('tecnico_asignado_id', sol.tecnico_asignado_id)
  if (updErr) return { ok: false, error: updErr.message }

  const { error: evErr } = await supabase.from('solicitud_eventos').insert({
    solicitud_id: sol.id,
    tipo: 'visita_confirmada',
    estado_previo: sol.estado,
    estado_nuevo: sol.estado,
    actor: opts.por === 'tecnico' ? 'tecnico' : opts.actor,
    motivo: opts.por === 'tecnico'
      ? `${opts.actor} confirmó desde su portal que va a la visita`
      : `Visita confirmada por el equipo Baird (${opts.actor}) — el técnico confirmó por llamada`,
    payload: { por: opts.por, actor: opts.actor, fecha_visita_at: sol.fecha_visita_at },
  })
  if (evErr) console.error('[confirmarVisita] evento falló:', evErr.message)

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────
// Liberar + reofertar
// ─────────────────────────────────────────────────────────────

export interface LiberarOpts {
  motivo: 'no_alcanzo' | 'admin'
  /** Nombre del técnico o email del admin. */
  actor: string
  /** Texto libre opcional (por qué no alcanza / nota del admin). */
  detalle?: string
  /** Si viene, la solicitud debe estar asignada a ESTE técnico. */
  tecnicoId?: string
  /** Default true: reofertar como URGENTE a los demás técnicos. */
  reofertar?: boolean
}

export interface LiberarResult {
  ok: boolean
  error?: string
  tecnicoNombre?: string
  reoferta?: NotifyResult
}

/**
 * Suelta al técnico asignado: `tecnico_asignado_id = NULL`, estado
 * `notificada`, contador +1, evento `tecnico_liberado`, aviso al técnico
 * (solo si lo soltó el admin) y reoferta URGENTE a los demás técnicos.
 *
 * UPDATE atómico condicionado al técnico y estado leídos: si alguien
 * reasignó o cambió el estado entre el read y el write, no toca nada.
 */
export async function liberarTecnico(solicitudId: string, opts: LiberarOpts): Promise<LiberarResult> {
  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, tecnico_asignado_id, fecha_visita_at, horario_confirmado, tecnico_liberado_count, cliente_nombre, tipo_equipo, marca_equipo')
    .eq('id', solicitudId)
    .single()
  if (error || !sol) return { ok: false, error: 'Servicio no encontrado' }

  if (!sol.tecnico_asignado_id) return { ok: false, error: 'El servicio no tiene técnico asignado' }
  if (opts.tecnicoId && sol.tecnico_asignado_id !== opts.tecnicoId) {
    return { ok: false, error: 'Este servicio no está asignado a ti' }
  }
  if (!ESTADOS_LIBERABLES.has(sol.estado ?? '')) {
    return {
      ok: false,
      error: `Solo se puede liberar un servicio en estado "asignada" (este está en "${sol.estado}"). Si ya hubo diagnóstico o hay repuesto entregado, reasigna desde el admin.`,
    }
  }

  const tecnicoId = sol.tecnico_asignado_id
  const { data: tec } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp')
    .eq('id', tecnicoId)
    .single()
  const tecnicoNombre = tec?.nombre_completo ?? 'Técnico'

  const { data: filas, error: updErr } = await supabase
    .from('solicitudes_servicio')
    .update({
      tecnico_asignado_id: null,
      estado: 'notificada',
      tecnico_liberado_count: (sol.tecnico_liberado_count ?? 0) + 1,
    })
    .eq('id', sol.id)
    .eq('tecnico_asignado_id', tecnicoId)
    .eq('estado', sol.estado)
    .select('id')
  if (updErr) return { ok: false, error: updErr.message }
  if (!filas || filas.length === 0) {
    return { ok: false, error: 'El servicio cambió mientras tanto (otro técnico o el admin lo movieron). Recarga.' }
  }

  const { error: evErr } = await supabase.from('solicitud_eventos').insert({
    solicitud_id: sol.id,
    tipo: 'tecnico_liberado',
    estado_previo: sol.estado,
    estado_nuevo: 'notificada',
    actor: opts.motivo === 'no_alcanzo' ? 'tecnico' : opts.actor,
    motivo: opts.motivo === 'no_alcanzo'
      ? `${tecnicoNombre} avisó desde su portal que no alcanza a esta visita${opts.detalle ? `: ${opts.detalle}` : ''}`
      : `El equipo Baird (${opts.actor}) liberó al técnico ${tecnicoNombre}${opts.detalle ? `: ${opts.detalle}` : ''}`,
    payload: {
      tecnico_id: tecnicoId,
      tecnico_nombre: tecnicoNombre,
      motivo: opts.motivo,
      detalle: opts.detalle ?? null,
      fecha_visita_at: sol.fecha_visita_at,
      horario_confirmado: sol.horario_confirmado,
    },
  })
  if (evErr) console.error('[liberarTecnico] evento falló:', evErr.message)

  // Historial de estados + supervisores (los que filtran ese estado).
  try {
    await notificarCambioEstado(sol.id, sol.estado, 'notificada')
  } catch (err) {
    console.error('[liberarTecnico] notificarCambioEstado falló:', err)
  }

  // Aviso al técnico solo cuando lo soltó el admin (si fue él, la respuesta
  // de la página ya se lo dice). Texto libre best-effort: si no tiene la
  // ventana 24h abierta, el admin lo llama igual.
  if (opts.motivo === 'admin' && tec?.whatsapp) {
    const equipo = [sol.tipo_equipo, sol.marca_equipo].filter(Boolean).join(' ')
    try {
      await enviarMensajeTexto(
        tec.whatsapp,
        `Hola ${tecnicoNombre.split(' ')[0]}, Baird liberó el servicio de ${sol.cliente_nombre} (${equipo}${sol.horario_confirmado ? `, ${sol.horario_confirmado}` : ''}) y lo ofreció a otros técnicos. Si fue un error, escríbenos por este chat.`,
      )
    } catch (err) {
      console.warn('[liberarTecnico] aviso al técnico no enviado:', err instanceof Error ? err.message : String(err))
    }
  }

  let reoferta: NotifyResult | undefined
  if (opts.reofertar !== false) {
    try {
      reoferta = await notificarTecnicos(sol.id, { excluirTecnicoId: tecnicoId, urgente: true })
    } catch (err) {
      reoferta = { notificados: 0, matched: 0, errors: [err instanceof Error ? err.message : String(err)] }
    }
    // Resultado de la reoferta al evento (append-only → segundo evento no; se
    // deja en el log del server y en la respuesta).
    if (reoferta.errors.length) console.warn('[liberarTecnico] reoferta con errores:', reoferta.errors)
  }

  return { ok: true, tecnicoNombre, reoferta }
}

// ─────────────────────────────────────────────────────────────
// Recordatorio diario de agenda a los técnicos
// ─────────────────────────────────────────────────────────────

export type CanalAgenda = 'texto' | 'plantilla' | 'filtrado' | 'error' | 'dry' | 'omitido'

export interface ResultadoAgendaTecnico {
  tecnicoId: string
  nombre: string
  canal: CanalAgenda
  servicios: number
  bloqueos: number
  pendientes: number
  error?: string
  /** Solo en dry-run: el texto que se habría enviado. */
  texto?: string
}

interface SolicitudAgendaRow {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  es_garantia: boolean | null
  direccion: string | null
  zona_servicio: string | null
  ciudad_pueblo: string | null
  estado: string | null
  fecha_visita_at: string | null
  tecnico_asignado_id: string | null
  visita_confirmada_at: string | null
}

/** Solicitudes vivas con visita en el día CO `fechaYMD` (con o sin técnico). */
async function solicitudesDelDia(fechaYMD: string): Promise<SolicitudAgendaRow[]> {
  const desde = medianocheColombiaIso(fechaYMD)
  const hasta = medianocheColombiaIso(addDaysYMD(fechaYMD, 1))
  const { data, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, cliente_nombre, tipo_equipo, marca_equipo, es_garantia, direccion, zona_servicio, ciudad_pueblo, estado, fecha_visita_at, tecnico_asignado_id, visita_confirmada_at')
    .gte('fecha_visita_at', desde)
    .lt('fecha_visita_at', hasta)
    .not('estado', 'in', ESTADOS_TERMINALES_IN)
  if (error) throw new Error(`solicitudes_servicio: ${error.message}`)
  return (data ?? []) as SolicitudAgendaRow[]
}

/**
 * Manda a cada técnico con visitas Baird el día `fechaYMD` (default: mañana
 * CO) su agenda: servicios Baird (con ✅/⏳) + compromisos propios de
 * `agenda_tecnico_bloqueos`. Texto libre primero; si Meta rechaza (ventana
 * 24h cerrada, error 131047) cae a la plantilla `agenda_manana_tecnico_v1`.
 * Idempotente por día CO vía `tecnicos.agenda_aviso_at` (salvo `force`).
 */
export async function enviarAgendaTecnicos(opts: {
  fechaYMD?: string
  dry?: boolean
  force?: boolean
} = {}): Promise<{ fecha: string; tecnicos: ResultadoAgendaTecnico[] }> {
  const fecha = opts.fechaYMD ?? fechaColombiaMasDias(1)
  const hoy = fechaColombiaYMD()
  const dia: 'hoy' | 'manana' = fecha === hoy ? 'hoy' : 'manana'

  const sols = (await solicitudesDelDia(fecha)).filter(s => s.tecnico_asignado_id)
  const porTecnico = new Map<string, SolicitudAgendaRow[]>()
  for (const s of sols) {
    const lista = porTecnico.get(s.tecnico_asignado_id as string) ?? []
    lista.push(s)
    porTecnico.set(s.tecnico_asignado_id as string, lista)
  }
  if (porTecnico.size === 0) return { fecha, tecnicos: [] }

  const ids = [...porTecnico.keys()]
  const { data: tecs, error: tecErr } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, whatsapp, portal_token, agenda_aviso_at')
    .in('id', ids)
  if (tecErr) throw new Error(`tecnicos: ${tecErr.message}`)

  const { data: blqs, error: blqErr } = await supabase
    .from('agenda_tecnico_bloqueos')
    .select('tecnico_id, franja, titulo, bloquea_franja')
    .in('tecnico_id', ids)
    .eq('fecha', fecha)
  if (blqErr) console.warn('[enviarAgendaTecnicos] bloqueos no disponibles:', blqErr.message)
  const bloqueosPorTecnico = new Map<string, BloqueoAgenda[]>()
  for (const b of blqs ?? []) {
    const lista = bloqueosPorTecnico.get(b.tecnico_id) ?? []
    lista.push({ franja: b.franja, titulo: b.titulo, bloquea_franja: b.bloquea_franja })
    bloqueosPorTecnico.set(b.tecnico_id, lista)
  }

  const resultados: ResultadoAgendaTecnico[] = []
  for (const tec of tecs ?? []) {
    const servicios: ServicioAgenda[] = (porTecnico.get(tec.id) ?? []).map(s => ({
      id: s.id,
      cliente_nombre: s.cliente_nombre,
      tipo_equipo: s.tipo_equipo,
      marca_equipo: s.marca_equipo,
      es_garantia: s.es_garantia === true,
      direccion: s.direccion,
      zona_servicio: s.zona_servicio,
      ciudad_pueblo: s.ciudad_pueblo,
      fecha_visita_at: s.fecha_visita_at as string,
      visita_confirmada_at: s.visita_confirmada_at,
    }))
    const bloqueos = bloqueosPorTecnico.get(tec.id) ?? []
    const portalUrl = `${appUrl()}/tecnico/${tec.portal_token ?? ''}`
    const agenda = armarAgendaTecnico({ nombre: tec.nombre_completo, fechaYMD: fecha, servicios, bloqueos, portalUrl, dia })

    const base = {
      tecnicoId: tec.id,
      nombre: tec.nombre_completo,
      servicios: agenda.totalServicios,
      bloqueos: agenda.totalBloqueos,
      pendientes: agenda.pendientes,
    }

    if (opts.dry) {
      resultados.push({ ...base, canal: 'dry', texto: agenda.texto })
      continue
    }
    if (!opts.force && tec.agenda_aviso_at && fechaColombiaYMD(new Date(tec.agenda_aviso_at)) === hoy) {
      resultados.push({ ...base, canal: 'omitido', error: 'Ya se envió hoy' })
      continue
    }
    if (!tec.whatsapp) {
      resultados.push({ ...base, canal: 'error', error: 'Técnico sin WhatsApp' })
      continue
    }
    if (!isPhoneAllowed(tec.whatsapp)) {
      resultados.push({ ...base, canal: 'filtrado' })
      continue
    }

    let canal: CanalAgenda = 'error'
    let errorMsg: string | undefined
    try {
      await enviarMensajeTexto(tec.whatsapp, agenda.texto)
      canal = 'texto'
    } catch (err) {
      const textoErr = err instanceof Error ? err.message : String(err)
      try {
        const r = await enviarPlantilla(tec.whatsapp, PLANTILLA_AGENDA_TECNICO, 'es', [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: sanitizarParametroPlantilla(tec.nombre_completo.split(' ')[0]) },
              { type: 'text', text: sanitizarParametroPlantilla(formatearFechaLargaCO(fecha)) },
              { type: 'text', text: sanitizarParametroPlantilla(agenda.resumen) },
              { type: 'text', text: sanitizarParametroPlantilla(agenda.linea) },
            ],
          },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: tec.portal_token ?? '' }] },
        ])
        if (r.sent) canal = 'plantilla'
        else { canal = r.filtered ? 'filtrado' : 'error'; errorMsg = `texto: ${textoErr}` }
      } catch (err2) {
        errorMsg = `texto: ${textoErr} · plantilla: ${err2 instanceof Error ? err2.message : String(err2)}`
      }
    }

    if (canal === 'texto' || canal === 'plantilla') {
      const { error: markErr } = await supabase
        .from('tecnicos')
        .update({ agenda_aviso_at: new Date().toISOString() })
        .eq('id', tec.id)
      if (markErr) console.warn('[enviarAgendaTecnicos] agenda_aviso_at no actualizado:', markErr.message)
    }
    resultados.push({ ...base, canal, error: errorMsg })
  }

  return { fecha, tecnicos: resultados }
}

// ─────────────────────────────────────────────────────────────
// Alerta al equipo Baird
// ─────────────────────────────────────────────────────────────

export interface ResultadoAlertaAdmin {
  fecha: string
  canal: 'texto' | 'filtrado' | 'error' | 'dry' | 'omitido'
  sinConfirmar: number
  sinTecnico: number
  confirmadas: number
  error?: string
  texto?: string
}

/**
 * Texto libre a WHATSAPP_ALERT_PHONE con las visitas de `fechaYMD` (default:
 * mañana CO) que piden acción: con técnico sin confirmar y sin técnico. Si
 * no hay ninguna, no manda nada (`omitido`).
 */
export async function enviarAlertaAdminVisitas(opts: {
  fechaYMD?: string
  dry?: boolean
} = {}): Promise<ResultadoAlertaAdmin> {
  const fecha = opts.fechaYMD ?? fechaColombiaMasDias(1)
  const sols = await solicitudesDelDia(fecha)

  const tecIds = [...new Set(sols.map(s => s.tecnico_asignado_id).filter((x): x is string => !!x))]
  const nombres = new Map<string, string>()
  if (tecIds.length > 0) {
    const { data: tecs } = await supabase.from('tecnicos').select('id, nombre_completo').in('id', tecIds)
    for (const t of tecs ?? []) nombres.set(t.id, nombreCorto(t.nombre_completo))
  }

  const aVisita = (s: SolicitudAgendaRow): VisitaAlerta => ({
    id: s.id,
    cliente_nombre: s.cliente_nombre,
    equipo: [s.tipo_equipo, s.marca_equipo].filter(Boolean).join(' '),
    franja: franjaDeVisita(s.fecha_visita_at),
    ciudad: (s.ciudad_pueblo ?? '').trim() || '—',
    tecnico: s.tecnico_asignado_id ? (nombres.get(s.tecnico_asignado_id) ?? '—') : null,
  })

  const sinConfirmar = sols.filter(s => s.tecnico_asignado_id && !s.visita_confirmada_at).map(aVisita)
  const sinTecnico = sols.filter(s => !s.tecnico_asignado_id).map(aVisita)
  const confirmadas = sols.filter(s => s.tecnico_asignado_id && s.visita_confirmada_at).length

  const base = { fecha, sinConfirmar: sinConfirmar.length, sinTecnico: sinTecnico.length, confirmadas }
  const texto = armarAlertaAdmin({ fechaYMD: fecha, sinConfirmar, sinTecnico, confirmadas, appUrl: appUrl() })
  if (!texto) return { ...base, canal: 'omitido' }
  if (opts.dry) return { ...base, canal: 'dry', texto }

  const destino = alertPhone()
  if (!isPhoneAllowed(destino)) return { ...base, canal: 'filtrado', texto }
  try {
    await enviarMensajeTexto(destino, texto)
    return { ...base, canal: 'texto' }
  } catch (err) {
    return { ...base, canal: 'error', error: err instanceof Error ? err.message : String(err), texto }
  }
}
