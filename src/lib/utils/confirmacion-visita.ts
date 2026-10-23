/**
 * confirmacion-visita.ts — helpers PUROS de la confirmación de visita por el
 * técnico (docs/PROTOCOLO-VISITA.md § "Fase 0", 2026-10-22).
 *
 * Los usan el server (confirmacion-visita.service, whatsapp.service) y el
 * browser (card del portal del técnico), así que NO importa nada server-only.
 *
 * Qué resuelven:
 *   - proximidadVisita(): si una visita es hoy / mañana / futura / pasada (día CO).
 *   - aceptacionCuentaComoConfirmacion(): aceptar un servicio cuya visita es
 *     en ≤ 36 h equivale a confirmarla (no se le vuelve a pedir).
 *   - armarAgendaTecnico(): texto del recordatorio diario de agenda (servicios
 *     Baird + compromisos propios del calendario) y su versión en una línea
 *     para la plantilla de fallback.
 *   - armarAlertaAdmin(): texto de la alerta al equipo con las visitas de
 *     mañana sin confirmar / sin técnico.
 */
import { FRANJAS_HORARIO, type FranjaHorario } from '@/lib/constants/franjas'
import { slotDesdeFechaVisita } from '@/lib/utils/agenda-slots'
import { fechaColombiaYMD, formatearFechaLargaCO } from '@/lib/utils/fecha-visita'

/** Aceptar con la visita a ≤ estas horas cuenta como confirmación. */
export const CONFIRMACION_POR_ACEPTACION_HORAS = 36

/** Hora Colombia (0-23) a la que sale el recordatorio diario de agenda a los técnicos. */
export const HORA_AGENDA_TECNICOS_CO = 17
/** Hora Colombia a partir de la cual el cron "auto" manda la alerta al admin en vez de la agenda. */
export const HORA_ALERTA_ADMIN_CO = 19

/**
 * Único estado desde el que se suelta al técnico (No alcanzo / admin). En
 * `repuesto_recibido` el técnico tiene la pieza en la mano y en `en_proceso`
 * ya hubo diagnóstico: ahí el admin reasigna a mano con las herramientas de
 * siempre (cambiar estado / editar).
 */
export const ESTADOS_LIBERABLES: ReadonlySet<string> = new Set(['asignada'])

/** Tope del parámetro "lista en una línea" de la plantilla de fallback. */
export const MAX_CHARS_LINEA_AGENDA = 650

export type ProximidadVisita = 'hoy' | 'manana' | 'futura' | 'pasada'

/** Día CO de la visita comparado con hoy. null si no hay fecha válida. */
export function proximidadVisita(
  fechaVisitaAt: string | null | undefined,
  ahora: Date = new Date(),
): ProximidadVisita | null {
  const slot = slotDesdeFechaVisita(fechaVisitaAt)
  if (!slot) return null
  const hoy = fechaColombiaYMD(ahora)
  if (slot.fecha < hoy) return 'pasada'
  if (slot.fecha === hoy) return 'hoy'
  const manana = fechaColombiaYMD(new Date(ahora.getTime() + 24 * 3600 * 1000))
  if (slot.fecha === manana) return 'manana'
  return 'futura'
}

/**
 * true si la visita está en el futuro y a ≤ `horas` del instante de la
 * aceptación: aceptar hoy para mañana ES confirmar. Más lejos, el recordatorio
 * del día anterior le pide confirmación como a cualquiera.
 */
export function aceptacionCuentaComoConfirmacion(
  fechaVisitaAt: string | null | undefined,
  ahora: Date = new Date(),
  horas: number = CONFIRMACION_POR_ACEPTACION_HORAS,
): boolean {
  if (!fechaVisitaAt) return false
  const t = new Date(fechaVisitaAt).getTime()
  if (Number.isNaN(t)) return false
  const delta = t - ahora.getTime()
  // La visita de HOY ya empezó (fecha_visita_at = inicio de la franja) → delta
  // negativo pero el día CO aún no pasó: también cuenta.
  if (delta < 0) return proximidadVisita(fechaVisitaAt, ahora) === 'hoy'
  return delta <= horas * 3600 * 1000
}

/** "8am-12pm" (valor de la franja) a partir de un fecha_visita_at. '' si no hay. */
export function franjaDeVisita(fechaVisitaAt: string | null | undefined): FranjaHorario | '' {
  return slotDesdeFechaVisita(fechaVisitaAt)?.franja ?? ''
}

/** "Mañana (8am - 12pm)" → etiqueta corta "8am - 12pm" para mensajes. */
export function etiquetaFranjaCorta(franja: string): string {
  const f = FRANJAS_HORARIO.find(x => x.value === franja)
  if (!f) return franja
  const m = f.label.match(/\((.+)\)/)
  return m ? m[1] : f.label
}

/** "Carlos Mauricio Bonilla Agudelo" → "Carlos B." */
export function nombreCorto(nombreCompleto: string | null | undefined): string {
  const partes = (nombreCompleto ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '—'
  if (partes.length === 1) return partes[0]
  // Convención CO: dos nombres + dos apellidos → el apellido suele ser el 3er token.
  const apellido = partes.length >= 3 ? partes[2] : partes[1]
  return `${partes[0]} ${apellido[0].toUpperCase()}.`
}

export interface ServicioAgenda {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  es_garantia: boolean
  direccion: string | null
  zona_servicio: string | null
  ciudad_pueblo: string | null
  fecha_visita_at: string
  visita_confirmada_at: string | null
}

export interface BloqueoAgenda {
  franja: string
  titulo: string
  bloquea_franja?: boolean
}

export interface AgendaTecnicoTexto {
  /** Mensaje completo (texto libre, varias líneas). */
  texto: string
  /** Param {{3}} de la plantilla: "2 servicios Baird y 1 compromiso propio". */
  resumen: string
  /** Param {{4}} de la plantilla: todo en una línea (≤ MAX_CHARS_LINEA_AGENDA). */
  linea: string
  totalServicios: number
  totalBloqueos: number
  /** Servicios Baird aún sin confirmar. */
  pendientes: number
}

function ordenFranja(franja: string): number {
  const i = FRANJAS_HORARIO.findIndex(f => f.value === franja)
  return i === -1 ? 99 : i
}

function equipoCorto(s: Pick<ServicioAgenda, 'tipo_equipo' | 'marca_equipo' | 'es_garantia'>): string {
  const base = [s.tipo_equipo, s.marca_equipo].filter(Boolean).join(' ')
  return s.es_garantia ? `${base} (garantía)` : base
}

function lugarCorto(s: Pick<ServicioAgenda, 'direccion' | 'zona_servicio' | 'ciudad_pueblo'>): string {
  return [s.direccion, s.zona_servicio].map(p => p?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ')
    || (s.ciudad_pueblo ?? '').trim()
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/**
 * Recordatorio diario de agenda para UN técnico. `fechaYMD` es el día que se
 * resume (normalmente mañana). Los servicios vienen con su fecha_visita_at
 * ya dentro de ese día; los bloqueos son los compromisos propios de ese día.
 */
export function armarAgendaTecnico(input: {
  nombre: string
  fechaYMD: string
  servicios: ServicioAgenda[]
  bloqueos: BloqueoAgenda[]
  portalUrl: string
  /** 'manana' (default) | 'hoy' — solo cambia la palabra del encabezado. */
  dia?: 'manana' | 'hoy'
}): AgendaTecnicoTexto {
  const servicios = [...input.servicios].sort(
    (a, b) => ordenFranja(franjaDeVisita(a.fecha_visita_at)) - ordenFranja(franjaDeVisita(b.fecha_visita_at)),
  )
  const bloqueos = [...input.bloqueos].sort((a, b) => ordenFranja(a.franja) - ordenFranja(b.franja))
  const pendientes = servicios.filter(s => !s.visita_confirmada_at).length
  const nombre = input.nombre.trim().split(/\s+/)[0] || 'técnico'
  const palabraDia = input.dia === 'hoy' ? 'hoy' : 'mañana'
  const fechaLarga = formatearFechaLargaCO(input.fechaYMD)

  const lineas: string[] = [`Hola ${nombre} 👋 Tu agenda Baird de ${palabraDia}, ${fechaLarga}:`, '']

  lineas.push(`🔧 Servicios Baird (${servicios.length})`)
  for (const s of servicios) {
    const marca = s.visita_confirmada_at ? '✅ confirmada' : '⏳ sin confirmar'
    lineas.push(`• ${etiquetaFranjaCorta(franjaDeVisita(s.fecha_visita_at))} · ${s.cliente_nombre} · ${equipoCorto(s)} · ${lugarCorto(s)} — ${marca}`)
  }

  if (bloqueos.length > 0) {
    lineas.push('', `📌 Tus compromisos (${bloqueos.length})`)
    for (const b of bloqueos) {
      lineas.push(`• ${etiquetaFranjaCorta(b.franja)} · ${b.titulo}${b.bloquea_franja ? ' (franja cerrada)' : ''}`)
    }
  }

  lineas.push('')
  if (pendientes > 0) {
    lineas.push(
      `Entra al portal y confirma cada visita. Si no alcanzas a alguna, márcala como "No alcanzo" para reasignarla a tiempo:`,
      input.portalUrl,
    )
  } else {
    lineas.push(`Todas tus visitas de ${palabraDia} ya están confirmadas. ¡Gracias! Tu portal: ${input.portalUrl}`)
  }

  const resumen = [
    plural(servicios.length, 'servicio Baird', 'servicios Baird'),
    bloqueos.length > 0 ? plural(bloqueos.length, 'compromiso propio', 'compromisos propios') : '',
  ].filter(Boolean).join(' y ')

  const partes: string[] = servicios.map(s => {
    const zona = (s.zona_servicio ?? s.ciudad_pueblo ?? '').replace(/\s+/g, ' ').trim()
    const check = s.visita_confirmada_at ? ' ✓' : ''
    return `${etiquetaFranjaCorta(franjaDeVisita(s.fecha_visita_at))} ${s.cliente_nombre} (${equipoCorto(s)}${zona ? `, ${zona}` : ''})${check}`
  })
  for (const b of bloqueos) partes.push(`Propio ${etiquetaFranjaCorta(b.franja)}: ${b.titulo}`)
  let linea = partes.join(' · ').replace(/\s+/g, ' ').trim()
  if (linea.length > MAX_CHARS_LINEA_AGENDA) linea = `${linea.slice(0, MAX_CHARS_LINEA_AGENDA - 1).trimEnd()}…`

  return {
    texto: lineas.join('\n'),
    resumen,
    linea,
    totalServicios: servicios.length,
    totalBloqueos: bloqueos.length,
    pendientes,
  }
}

export interface VisitaAlerta {
  id: string
  cliente_nombre: string
  equipo: string
  franja: string
  ciudad: string
  /** Nombre corto del técnico (sin técnico → null). */
  tecnico: string | null
}

/**
 * Alerta al equipo Baird con las visitas de `fechaYMD` (mañana) que piden
 * acción: con técnico pero sin confirmar, y sin técnico. Devuelve '' si no
 * hay nada que hacer (el que llama no manda nada).
 */
export function armarAlertaAdmin(input: {
  fechaYMD: string
  sinConfirmar: VisitaAlerta[]
  sinTecnico: VisitaAlerta[]
  confirmadas: number
  appUrl: string
}): string {
  if (input.sinConfirmar.length === 0 && input.sinTecnico.length === 0) return ''
  const fecha = formatearFechaLargaCO(input.fechaYMD)
  const link = (id: string) => `${input.appUrl.replace(/\/$/, '')}/admin/solicitudes/${id}`
  const orden = (a: VisitaAlerta, b: VisitaAlerta) => ordenFranja(a.franja) - ordenFranja(b.franja)

  const lineas: string[] = [`⏰ Visitas de mañana (${fecha}) — control de confirmación`, '']

  if (input.sinConfirmar.length > 0) {
    lineas.push(`⏳ Con técnico, SIN confirmar (${input.sinConfirmar.length}):`)
    for (const v of [...input.sinConfirmar].sort(orden)) {
      lineas.push(`• ${etiquetaFranjaCorta(v.franja)} · ${v.cliente_nombre} · ${v.equipo} · ${v.tecnico ?? '—'}`, `  ${link(v.id)}`)
    }
    lineas.push('')
  }

  lineas.push(`✅ Confirmadas: ${input.confirmadas}`)

  if (input.sinTecnico.length > 0) {
    lineas.push('', `🚫 Sin técnico (${input.sinTecnico.length}):`)
    for (const v of [...input.sinTecnico].sort(orden)) {
      lineas.push(`• ${etiquetaFranjaCorta(v.franja)} · ${v.cliente_nombre} · ${v.equipo} · ${v.ciudad}`, `  ${link(v.id)}`)
    }
  }

  lineas.push(
    '',
    'Llama al técnico que no confirmó. Si no va a ir: ficha del servicio → "Liberar técnico y reofertar" (la oferta sale como URGENTE a los demás).',
  )
  return lineas.join('\n')
}
