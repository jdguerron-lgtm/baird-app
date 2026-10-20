/**
 * resumen-movimientos.service.ts — Resumen diario de movimientos a supervisores.
 *
 * Arma, por supervisor, el informe en TEXTO de todos los cambios de estado
 * del día de los servicios que ese supervisor puede ver (mismo alcance que su
 * portal: `solicitudEnAlcance` de src/lib/auth/supervisor.ts — ámbito + marca;
 * el campo `estados` del supervisor NO filtra acá porque es solo para los
 * avisos instantáneos, igual que en el portal).
 *
 * Ventana: desde las 5:00 pm Colombia del día anterior hasta las 5:00 pm de
 * hoy (`HORA_CORTE_BOGOTA`). Colombia no tiene horario de verano, así que el
 * corte es siempre 22:00 UTC. El cron corre a esa hora
 * (vercel.json → GET /api/cron/resumen-movimientos).
 *
 * Fuente: `solicitud_eventos` (append-only). Un "movimiento" es cualquier
 * evento con `estado_previo` ≠ `estado_nuevo` de los tipos que registran una
 * transición (`TIPOS_EVENTO_MOVIMIENTO`): `cambio_estado` lo inserta
 * notificarCambioEstado; los call-sites que registran su propio evento
 * (cancelación, reagendamiento confirmado, cambio manual del admin, no-show,
 * repuesto entregado por el supervisor) usan los otros tipos.
 *
 * Este archivo es PURO (sin I/O) para poder testearlo. La carga de datos y el
 * envío viven en src/app/api/cron/resumen-movimientos/route.ts.
 */

import { ESTADO_LABELS } from '@/lib/constants/estados'
import { solicitudEnAlcance, type SupervisorPortal } from '@/lib/auth/supervisor'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

/** Hora de corte del resumen, en hora Colombia (0–23). 17 = 5:00 pm. */
export const HORA_CORTE_BOGOTA = 17

/** Estados del ciclo de repuesto: si un servicio queda en uno de estos, el resumen anexa el repuesto que espera. */
export const ESTADOS_REPUESTO: ReadonlySet<string> = new Set([
  'esperando_repuesto',
  'repuesto_en_camino',
  'repuesto_recibido',
])

/**
 * Tipos de `solicitud_eventos` que representan una transición de estado.
 * `nota_admin`, `llamada_*`, `recordatorio_*`, `mensaje_cliente`, etc. NO
 * cambian el estado y quedan fuera.
 */
export const TIPOS_EVENTO_MOVIMIENTO = [
  'cambio_estado',
  'cambio_estado_admin',
  'cancelacion',
  'cancelacion_revertida',
  'reagendamiento_confirmado',
  'no_show_cliente',
] as const

/** Largo máximo de un mensaje de texto de WhatsApp (Meta: 4096). Se deja margen. */
export const MAX_CHARS_MENSAJE = 3900

/**
 * Tope del parámetro "detalle en una línea" de la plantilla de fallback
 * (`supervisor_resumen_diario_v1`). Meta limita el cuerpo renderizado a 1024
 * caracteres; el resto del body ocupa ~250.
 */
export const MAX_CHARS_LINEA_COMPACTA = 650

// ─────────────────────────────────────────────────────────────────
// Tipos de entrada (subconjuntos de las tablas)
// ─────────────────────────────────────────────────────────────────

export interface VentanaResumen {
  /** Inicio exclusivo (corte anterior). */
  desde: Date
  /** Fin inclusivo (corte de hoy). */
  hasta: Date
  /** Día calendario CO que se reporta (el del corte `hasta`), YYYY-MM-DD. */
  fechaYMD: string
}

export interface EventoMovimiento {
  solicitud_id: string
  tipo: string
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  ocurrido_at: string
}

export interface SolicitudResumen {
  id: string
  cliente_nombre: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  ciudad_pueblo: string | null
  es_garantia: boolean | null
  numero_serie_factura: string | null
  estado: string | null
  tecnico_asignado_id: string | null
}

export interface RepuestoResumen {
  solicitud_id: string
  sku: string | null
  descripcion: string | null
  cantidad: number | null
  estado: string | null
}

export interface SupervisorResumen extends SupervisorPortal {
  portal_token?: string | null
}

export interface ResumenSupervisor {
  supervisorId: string
  nombre: string
  /** Cantidad de transiciones reportadas. */
  movimientos: number
  /** Cantidad de servicios distintos con movimientos. */
  servicios: number
  /** true si no hubo movimientos en el alcance del supervisor. */
  vacio: boolean
  /** Texto completo (puede superar MAX_CHARS_MENSAJE → ver partirTexto). */
  texto: string
  /** Versión en UNA línea para el parámetro de la plantilla de fallback. */
  lineaCompacta: string
  /** Encabezado corto "N movimientos en M servicios" / "sin movimientos". */
  conteo: string
}

// ─────────────────────────────────────────────────────────────────
// Ventana
// ─────────────────────────────────────────────────────────────────

/**
 * Ventana [desde, hasta] del resumen.
 *
 * - `corte: 'ultimo'` (default): `hasta` = el corte (17:00 CO) más reciente que
 *   sea ≤ `ahora`. Si el cron de Vercel se dispara con retraso (Hobby puede
 *   demorar hasta ~1 h), igual reporta la ventana correcta.
 * - `corte: 'ahora'`: `hasta` = `ahora` (para correr a mano y ver lo que va del
 *   día); `desde` sigue siendo el corte anterior a `ahora`.
 */
export function ventanaResumen(ahora: Date = new Date(), corte: 'ultimo' | 'ahora' = 'ultimo'): VentanaResumen {
  const [y, m, d] = fechaColombiaYMD(ahora).split('-').map(Number)
  // 17:00 Bogotá = 22:00 UTC del mismo día calendario CO (UTC-5 fijo).
  let corteHoy = Date.UTC(y, m - 1, d, HORA_CORTE_BOGOTA + 5, 0, 0)
  if (corteHoy > ahora.getTime()) corteHoy -= 24 * 3600_000
  const corteAnterior = corteHoy - 24 * 3600_000

  if (corte === 'ahora') {
    return {
      desde: new Date(corteHoy),
      hasta: new Date(ahora.getTime()),
      fechaYMD: fechaColombiaYMD(ahora),
    }
  }
  return {
    desde: new Date(corteAnterior),
    hasta: new Date(corteHoy),
    fechaYMD: fechaColombiaYMD(new Date(corteHoy)),
  }
}

// ─────────────────────────────────────────────────────────────────
// Formato
// ─────────────────────────────────────────────────────────────────

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "martes 20 de octubre de 2026" para un YYYY-MM-DD (determinístico, sin locale). */
export function fechaLargaResumen(fechaYMD: string): string {
  const [y, m, d] = fechaYMD.split('-').map(Number)
  const dia = DIAS_ES[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]
  return `${dia} ${d} de ${MESES_ES[m - 1]} de ${y}`
}

/** "20 de octubre" (parámetro corto de la plantilla). */
export function fechaCortaResumen(fechaYMD: string): string {
  const [, m, d] = fechaYMD.split('-').map(Number)
  return `${d} de ${MESES_ES[m - 1]}`
}

/** Hora "HH:mm" en Colombia de un ISO. */
export function horaBogota(iso: string): string {
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '--:--'
  return f.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Hora del movimiento para el informe. La ventana cruza la medianoche
 * (5 pm de ayer → 5 pm de hoy), así que un evento que no cae en el día
 * reportado se marca "ayer 18:01" para que no se lea como de hoy.
 */
export function horaMovimiento(iso: string, fechaYMD: string): string {
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '--:--'
  const hora = horaBogota(iso)
  return fechaColombiaYMD(f) === fechaYMD ? hora : `ayer ${hora}`
}

const ACTOR_LABEL: Record<string, string> = {
  cliente: 'cliente',
  tecnico: 'técnico',
  admin: 'Baird',
  sistema: 'sistema',
  supervisor: 'supervisor',
}

export function etiquetaEstado(estado: string | null | undefined): string {
  if (!estado) return '—'
  return ESTADO_LABELS[estado] ?? estado
}

/** "Nevera Mabe · Garantía 9415091231" / "Lavadora LG". */
export function describirEquipo(sol: SolicitudResumen): string {
  const base = `${sol.tipo_equipo ?? ''} ${sol.marca_equipo ?? ''}`.trim() || 'Equipo'
  const num = sol.numero_serie_factura?.replace(/\s+/g, ' ').trim()
  return sol.es_garantia && num ? `${base} · Garantía ${num}` : base
}

/** "123ABC · Compresor 1/4 HP ×2" por repuesto; "Sin repuesto especificado" si no hay. */
export function describirRepuestos(repuestos: RepuestoResumen[]): string {
  const lineas = repuestos
    .filter(r => r.estado !== 'cancelado')
    .map(r => {
      const sku = r.sku?.trim()
      const desc = r.descripcion?.trim()
      const partes = [sku, desc].filter(Boolean)
      const cant = r.cantidad && r.cantidad > 1 ? ` ×${r.cantidad}` : ''
      return partes.length > 0 ? `${partes.join(' · ')}${cant}` : ''
    })
    .filter(Boolean)
  return lineas.length > 0 ? lineas.join('; ') : 'Sin repuesto especificado'
}

interface BloqueServicio {
  solicitud: SolicitudResumen
  eventos: EventoMovimiento[]
  primeroAt: number
  enRepuesto: boolean
}

/** Agrupa los eventos por servicio, en orden cronológico, descartando los que no cambian el estado. */
function agruparPorServicio(
  eventos: EventoMovimiento[],
  solicitudes: Map<string, SolicitudResumen>,
): BloqueServicio[] {
  const bloques = new Map<string, BloqueServicio>()
  const ordenados = [...eventos]
    .filter(e => e.estado_nuevo && e.estado_previo !== e.estado_nuevo)
    .filter(e => (TIPOS_EVENTO_MOVIMIENTO as readonly string[]).includes(e.tipo))
    .sort((a, b) => Date.parse(a.ocurrido_at) - Date.parse(b.ocurrido_at))

  for (const e of ordenados) {
    const sol = solicitudes.get(e.solicitud_id)
    if (!sol) continue
    let b = bloques.get(e.solicitud_id)
    if (!b) {
      b = { solicitud: sol, eventos: [], primeroAt: Date.parse(e.ocurrido_at), enRepuesto: false }
      bloques.set(e.solicitud_id, b)
    }
    b.eventos.push(e)
    if (e.estado_nuevo && ESTADOS_REPUESTO.has(e.estado_nuevo)) b.enRepuesto = true
  }
  for (const b of bloques.values()) {
    if (b.solicitud.estado && ESTADOS_REPUESTO.has(b.solicitud.estado)) b.enRepuesto = true
  }
  return [...bloques.values()].sort((a, b) => a.primeroAt - b.primeroAt)
}

/**
 * Arma el resumen de UN supervisor. Recibe TODOS los eventos de la ventana y
 * todas las solicitudes involucradas; acá se filtra por alcance.
 */
export function armarResumenSupervisor(input: {
  supervisor: SupervisorResumen
  ventana: VentanaResumen
  eventos: EventoMovimiento[]
  solicitudes: SolicitudResumen[]
  repuestos: RepuestoResumen[]
  /** id técnico → nombre (para "aceptó Néstor Castro"). */
  tecnicos?: Map<string, string>
  /** Base URL para el link al portal (si el supervisor tiene portal_token). */
  appUrl?: string | null
}): ResumenSupervisor {
  const { supervisor, ventana } = input
  const primerNombre = supervisor.nombre.trim().split(/\s+/)[0] || supervisor.nombre

  const visibles = new Map<string, SolicitudResumen>()
  for (const s of input.solicitudes) {
    if (solicitudEnAlcance(supervisor, s)) visibles.set(s.id, s)
  }
  const bloques = agruparPorServicio(input.eventos, visibles)
  const movimientos = bloques.reduce((n, b) => n + b.eventos.length, 0)
  const servicios = bloques.length

  const repuestosPorSol = new Map<string, RepuestoResumen[]>()
  for (const r of input.repuestos) {
    const lista = repuestosPorSol.get(r.solicitud_id) ?? []
    lista.push(r)
    repuestosPorSol.set(r.solicitud_id, lista)
  }

  const encabezado = [
    '📋 *Resumen diario Baird Service*',
    `${capitalizar(fechaLargaResumen(ventana.fechaYMD))} · corte ${etiquetaHoraCorte()}`,
  ]

  const conteo = movimientos === 0
    ? 'sin movimientos'
    : `${movimientos} movimiento${movimientos === 1 ? '' : 's'} en ${servicios} servicio${servicios === 1 ? '' : 's'}`

  if (movimientos === 0) {
    const texto = [
      ...encabezado,
      `Hola ${primerNombre}: sin movimientos hoy en tus servicios.`,
    ].join('\n')
    return {
      supervisorId: supervisor.id,
      nombre: supervisor.nombre,
      movimientos: 0,
      servicios: 0,
      vacio: true,
      texto,
      lineaCompacta: 'Sin movimientos hoy.',
      conteo,
    }
  }

  const cuerpo: string[] = []
  const compactos: string[] = []
  for (const b of bloques) {
    const sol = b.solicitud
    const cabecera = [
      `*${(sol.cliente_nombre ?? 'Cliente').trim()}*`,
      describirEquipo(sol),
      sol.ciudad_pueblo?.trim() || null,
    ].filter(Boolean).join(' · ')
    const lineas = [cabecera]
    for (const e of b.eventos) {
      const actor = e.actor ? ACTOR_LABEL[e.actor] ?? e.actor : null
      let detalle = actor ? ` (${actor})` : ''
      if (e.estado_nuevo === 'asignada' && sol.tecnico_asignado_id && input.tecnicos?.get(sol.tecnico_asignado_id)) {
        detalle = ` (${input.tecnicos.get(sol.tecnico_asignado_id)})`
      }
      lineas.push(`  ${horaMovimiento(e.ocurrido_at, ventana.fechaYMD)}  ${etiquetaEstado(e.estado_previo)} → ${etiquetaEstado(e.estado_nuevo)}${detalle}`)
    }
    if (b.enRepuesto) {
      lineas.push(`  🔩 Repuesto: ${describirRepuestos(repuestosPorSol.get(sol.id) ?? [])}`)
    }
    cuerpo.push(lineas.join('\n'))

    // Línea compacta: "Cliente (equipo): A → B → C, repuesto X"
    const cadena = [etiquetaEstado(b.eventos[0].estado_previo), ...b.eventos.map(e => etiquetaEstado(e.estado_nuevo))].join(' → ')
    const rep = b.enRepuesto ? `, repuesto ${describirRepuestos(repuestosPorSol.get(sol.id) ?? [])}` : ''
    compactos.push(`${(sol.cliente_nombre ?? 'Cliente').trim()} (${describirEquipo(sol)}): ${cadena}${rep}`)
  }

  const pie: string[] = []
  if (supervisor.portal_token && input.appUrl) {
    pie.push(`Panel: ${input.appUrl.replace(/\/$/, '')}/supervisor/${supervisor.portal_token}`)
  }

  const texto = [
    encabezado.join('\n') + `\nHola ${primerNombre}: ${conteo}.`,
    ...cuerpo,
    ...pie,
  ].join('\n\n')

  return {
    supervisorId: supervisor.id,
    nombre: supervisor.nombre,
    movimientos,
    servicios,
    vacio: false,
    texto,
    lineaCompacta: compactarLinea(compactos, MAX_CHARS_LINEA_COMPACTA),
    conteo,
  }
}

/** "5:00 pm" para HORA_CORTE_BOGOTA=17 (formato 12 h). */
export function etiquetaHoraCorte(hora: number = HORA_CORTE_BOGOTA): string {
  const h12 = hora % 12 === 0 ? 12 : hora % 12
  return `${h12}:00 ${hora < 12 ? 'am' : 'pm'}`
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Une los servicios con " • " en una sola línea (los parámetros de plantilla
 * de Meta no aceptan saltos de línea) sin pasarse de `max`; si sobran,
 * cierra con "… y N servicios más".
 */
export function compactarLinea(partes: string[], max: number): string {
  const limpias = partes.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (limpias.length === 0) return 'Sin movimientos hoy.'
  const incluidas: string[] = []
  let largo = 0
  for (let i = 0; i < limpias.length; i++) {
    const p = limpias[i]
    const restantes = limpias.length - i - 1
    const sufijo = restantes > 0 ? ` • … y ${restantes} servicio${restantes === 1 ? '' : 's'} más` : ''
    const nuevoLargo = largo + (incluidas.length > 0 ? 3 : 0) + p.length
    if (incluidas.length > 0 && nuevoLargo + sufijo.length > max) {
      const quedan = limpias.length - incluidas.length
      return `${incluidas.join(' • ')} • … y ${quedan} servicio${quedan === 1 ? '' : 's'} más`
    }
    incluidas.push(p)
    largo = nuevoLargo
  }
  const linea = incluidas.join(' • ')
  return linea.length > max ? `${linea.slice(0, max - 1)}…` : linea
}

/**
 * Parte un texto largo en varios mensajes de ≤ `max` caracteres cortando por
 * bloques (párrafos separados por línea en blanco). Un bloque que por sí solo
 * supere `max` se corta por líneas. Devuelve [texto] si cabe entero.
 */
export function partirTexto(texto: string, max: number = MAX_CHARS_MENSAJE): string[] {
  if (texto.length <= max) return [texto]
  const bloques = texto.split('\n\n')
  const partes: string[] = []
  let actual = ''
  const push = (b: string) => {
    if (!actual) actual = b
    else if (actual.length + 2 + b.length <= max) actual += '\n\n' + b
    else { partes.push(actual); actual = b }
  }
  for (const bloque of bloques) {
    if (bloque.length <= max) { push(bloque); continue }
    // Bloque gigante: cortar por líneas.
    let trozo = ''
    for (const linea of bloque.split('\n')) {
      if (trozo && trozo.length + 1 + linea.length > max) { push(trozo); trozo = '' }
      trozo = trozo ? trozo + '\n' + linea : linea
    }
    if (trozo) push(trozo)
  }
  if (actual) partes.push(actual)
  return partes.map((p, i) => (partes.length > 1 ? `${p}\n\n(${i + 1}/${partes.length})` : p))
}
