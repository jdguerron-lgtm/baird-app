/**
 * Cobros al cliente PARTICULAR fuera del camino feliz (2026-11-05).
 *
 * Vive FUERA de la frontera del módulo de pagos (pagos.service / wompi.ts):
 * no escribe en `pagos` ni toca `*_pagado_at`; solo decide CUÁNDO mandar un
 * link de cobro que ya existe y deja rastro en `solicitud_eventos`.
 *
 *   1. `cobrarDiagnosticoSinReparacion` — el servicio terminó sin reparación
 *      tras la visita (cliente no quiso, equipo no reparable, cotización
 *      rechazada) o el cliente canceló después del diagnóstico: se cobra la
 *      tarifa de diagnóstico completa ($84.000 + recargo finde) menos lo ya
 *      pagado, con `saldo_final_cliente_v1` (decisión 2026-11-05, T&C § 9).
 *   2. `marcarDevolucionPendiente` — el cliente canceló ANTES de la visita con
 *      anticipo (o abono) pagado: la devolución es MANUAL desde la ficha
 *      admin; acá solo queda el evento + alerta al equipo.
 *   3. `avisarTecnicoPagoPendiente` — al aprobar la cotización el técnico
 *      sabe que el cliente aún no paga, sin bloquearle el flujo.
 *   4. `enviarRecordatoriosCobro` — cron diario: reenvía el link a las 24 h
 *      sin pago y avisa al equipo a las 48 h (máximo 2 recordatorios).
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  cargarSolicitudPago,
  calcularMontoSaldo,
  calcularMontoAbonoRepuestos,
  calcularMontoAnticipo,
} from '@/lib/services/pagos.service'
import {
  enviarPagoSaldoCliente,
  enviarAbonoRepuestosCliente,
  enviarCobroAnticipoCliente,
  enviarMensajeTexto,
} from '@/lib/services/whatsapp.service'
import {
  cobroDiagnosticoAplica,
  faltanteCobroCliente,
  ESTADOS_SIN_REPARACION,
  type SolicitudParaEtapaPago,
} from '@/lib/constants/pago-cliente'
import { formatCOP } from '@/lib/utils/format'

const alertPhone = () => process.env.WHATSAPP_ALERT_PHONE ?? '573153019192'
const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://lineablanca.bairdservice.com')

/** Texto libre al equipo Baird. Best-effort (ventana 24h). */
async function alertarEquipo(texto: string): Promise<boolean> {
  try {
    await enviarMensajeTexto(alertPhone(), texto)
    return true
  } catch (err) {
    console.warn('[cobros] alerta al equipo no se entregó:', err instanceof Error ? err.message : err)
    return false
  }
}

async function registrarEvento(
  solicitudId: string,
  tipo: 'pago_registrado' | 'mensaje_cliente' | 'nota_admin',
  motivo: string,
  payload: Record<string, unknown>,
  actor = 'sistema',
): Promise<void> {
  try {
    const { data: sol } = await supabase.from('solicitudes_servicio').select('estado').eq('id', solicitudId).single()
    const { error } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: solicitudId,
      tipo,
      estado_previo: sol?.estado ?? null,
      estado_nuevo: sol?.estado ?? null,
      actor,
      motivo,
      payload,
    })
    if (error) console.error(`[cobros] evento ${tipo} falló:`, error.message)
  } catch (err) {
    console.error(`[cobros] evento ${tipo} threw:`, err)
  }
}

// ─────────────────────────────────────────────────────────────────
// 1. Diagnóstico sin reparación
// ─────────────────────────────────────────────────────────────────

export interface ResultadoCobroDiagnostico {
  /** true si aplicaba y el link salió (o no había nada que cobrar). */
  ok: boolean
  /** false cuando la regla no aplica (garantía, precio fijo, sin diagnóstico, estado vivo). */
  aplica: boolean
  /** Saldo (COP) que se le cobró al cliente; 0 = ya estaba cubierto. */
  saldo: number
  error?: string
}

/**
 * Manda al cliente el link del saldo de la visita de diagnóstico. Idempotente
 * en la práctica: si el saldo ya es 0 no envía nada. Nunca lanza.
 *
 * `origen` queda en el evento para saber desde dónde se disparó
 * (diagnóstico del técnico, rechazo de la cotización, cancelación).
 */
export async function cobrarDiagnosticoSinReparacion(
  solicitudId: string,
  origen: 'diagnostico' | 'cotizacion_rechazada' | 'cancelacion' | 'admin',
): Promise<ResultadoCobroDiagnostico> {
  try {
    const sol = await cargarSolicitudPago(solicitudId)
    if (!sol) return { ok: false, aplica: false, saldo: 0, error: 'Solicitud no encontrada' }
    if (!cobroDiagnosticoAplica(sol)) return { ok: true, aplica: false, saldo: 0 }

    const saldo = await calcularMontoSaldo(sol)
    if (saldo <= 0) return { ok: true, aplica: true, saldo: 0 }

    const envio = await enviarPagoSaldoCliente(solicitudId, saldo, { momento: 'cierre' })
    await registrarEvento(
      solicitudId,
      'pago_registrado',
      envio.ok
        ? `Cobro de la visita de diagnóstico: se envió al cliente el link por $${formatCOP(saldo)} COP (servicio sin reparación — ${origen})`
        : `⚠️ No se pudo enviar el cobro de la visita de diagnóstico ($${formatCOP(saldo)} COP): ${envio.error ?? 'error desconocido'}`,
      { tipo: 'saldo', monto: saldo, cobro_diagnostico: true, origen, enviado: envio.ok, ...(envio.ok ? {} : { error: envio.error }) },
    )
    if (!envio.ok) return { ok: false, aplica: true, saldo, error: envio.error }
    return { ok: true, aplica: true, saldo }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cobros] cobrarDiagnosticoSinReparacion falló:', msg)
    return { ok: false, aplica: true, saldo: 0, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Devolución pendiente (manual)
// ─────────────────────────────────────────────────────────────────

/**
 * El cliente canceló con plata pagada que hay que devolver (anticipo sin
 * visita, o abono de repuestos si canceló después del diagnóstico). Deja el
 * evento `pago_registrado` con `devolucion_pendiente: true` y avisa al equipo
 * para que la haga desde la ficha ("Devolver por Wompi" / manual). Nunca lanza.
 */
export async function marcarDevolucionPendiente(
  solicitudId: string,
  datos: { tipo: 'anticipo' | 'abono'; monto: number; motivo: string },
): Promise<{ ok: boolean }> {
  try {
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('cliente_nombre, tipo_equipo, marca_equipo')
      .eq('id', solicitudId)
      .single()
    const nombre = sol?.cliente_nombre ?? 'cliente'
    const equipo = sol ? `${sol.tipo_equipo} ${sol.marca_equipo}` : ''
    const montoTxt = datos.monto > 0 ? `$${formatCOP(datos.monto)} COP` : 'monto por confirmar en el ledger'
    await registrarEvento(
      solicitudId,
      'pago_registrado',
      `↩️ Devolución pendiente del ${datos.tipo} (${montoTxt}): ${datos.motivo}. Hacerla desde el ledger de pagos de la ficha.`,
      { tipo: datos.tipo, monto: datos.monto, devolucion_pendiente: true, motivo: datos.motivo },
    )
    await alertarEquipo(
      `↩️ Devolución pendiente — ${nombre} (${equipo}) canceló y ya había pagado el ${datos.tipo} (${montoTxt}).\n` +
      `${datos.motivo}\n` +
      `Ficha: ${APP_URL()}/admin/solicitudes/${solicitudId}`,
    )
    return { ok: true }
  } catch (err) {
    console.error('[cobros] marcarDevolucionPendiente falló:', err)
    return { ok: false }
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. Aviso al técnico: aprobada pero pendiente de pago
// ─────────────────────────────────────────────────────────────────

/**
 * Texto libre al técnico tras `cotizacion_aprobada_tecnico_v3`: el cliente
 * aprobó pero el cobro (abono o saldo) sigue pendiente. No bloquea nada; el
 * aviso de "pago recibido" lo manda pagos.service al registrar el pago.
 * Best-effort (ventana 24h del técnico, que acaba de diagnosticar).
 */
export async function avisarTecnicoPagoPendiente(
  solicitudId: string,
  cobro: { tipo: 'abono' | 'saldo'; monto: number },
): Promise<{ ok: boolean }> {
  try {
    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('cliente_nombre, tipo_equipo, marca_equipo, tecnico_asignado_id')
      .eq('id', solicitudId)
      .single()
    if (!sol?.tecnico_asignado_id) return { ok: false }
    const { data: tec } = await supabase
      .from('tecnicos')
      .select('whatsapp, nombre_completo')
      .eq('id', sol.tecnico_asignado_id)
      .single()
    if (!tec?.whatsapp) return { ok: false }
    const nombreTec = tec.nombre_completo.split(' ')[0]
    const que = cobro.tipo === 'abono' ? 'el abono del 50 % para los repuestos' : 'el saldo del servicio'
    await enviarMensajeTexto(
      tec.whatsapp,
      `💳 ${nombreTec}, ${sol.cliente_nombre} aprobó la cotización de ${sol.tipo_equipo} ${sol.marca_equipo}, pero aún no ha pagado ${que} ($${formatCOP(cobro.monto)} COP). ` +
      `Puedes seguir con los siguientes pasos; te avisamos apenas registre el pago. En tu portal el servicio aparece "pendiente de pago". — Baird Service`,
    )
    return { ok: true }
  } catch (err) {
    console.warn('[cobros] aviso de pago pendiente al técnico no se entregó:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. Recordatorios de cobro (cron diario)
// ─────────────────────────────────────────────────────────────────

/** Plantillas (payload.plantilla de `mensaje_cliente`) que llevan un link de cobro. */
const PLANTILLAS_COBRO: Record<'anticipo' | 'abono' | 'saldo', string[]> = {
  anticipo: ['pago_anticipo_cliente_v2', 'pago_anticipo_cliente_v1', 'cobro_anticipo_cliente'],
  abono: ['abono_repuestos_cliente_v1', 'pago_saldo_cliente_v1 (abono repuestos)'],
  saldo: ['pago_saldo_cliente_v1', 'saldo_final_cliente_v1', 'pago_saldo_cliente_v1 (texto libre)', 'saldo_final_cliente_v1 (texto libre)'],
}

export const RECORDATORIO_COBRO_HORAS = 24
export const RECORDATORIO_COBRO_MAX = 2
/** Antigüedad máxima de la solicitud para entrar al barrido. */
const RECORDATORIO_DIAS_ATRAS = 60

/** Estados en los que puede haber un cobro pendiente con link ya enviado. */
const ESTADOS_CON_COBRO = [
  'asignada',
  'en_proceso', 'esperando_repuesto', 'repuesto_en_camino', 'repuesto_recibido',
  'confirmacion_pendiente', 'completada',
  ...ESTADOS_SIN_REPARACION, 'cancelada',
]

type EventoCobro = { solicitud_id: string; ocurrido_at: string; payload: Record<string, unknown> | null }

interface SolicitudRecordatorio extends SolicitudParaEtapaPago {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
}

export interface ResultadoRecordatorios {
  habilitado: boolean
  revisadas: number
  recordatorios: { solicitud_id: string; cliente: string; tipo: string; monto: number; n: number; ok: boolean; error?: string }[]
  alertas: number
  alertaEnviada: boolean
  errores: string[]
}

/**
 * Decide, a partir del historial, si toca mandar un recordatorio: hay un
 * link enviado hace ≥ `horas` y aún no se llegó al máximo. `n` es el número
 * del recordatorio que saldría (1 o 2). Pura — testeable.
 */
export function decidirRecordatorio(
  tipo: 'anticipo' | 'abono' | 'saldo',
  mensajes: EventoCobro[],
  ahora: Date,
  horas = RECORDATORIO_COBRO_HORAS,
  max = RECORDATORIO_COBRO_MAX,
): { enviar: boolean; n: number; horasDesdeUltimo: number | null; recordatoriosPrevios: number } {
  const plantillas = PLANTILLAS_COBRO[tipo]
  const envios = mensajes.filter(m => {
    const pl = String(m.payload?.plantilla ?? '')
    return plantillas.some(p => pl === p || pl.startsWith(p))
  })
  const recordatoriosPrevios = mensajes.filter(m => m.payload?.recordatorio_cobro === tipo).length
  if (envios.length === 0) return { enviar: false, n: recordatoriosPrevios + 1, horasDesdeUltimo: null, recordatoriosPrevios }
  const ultimo = envios.reduce((a, b) => (a.ocurrido_at > b.ocurrido_at ? a : b))
  const horasDesdeUltimo = (ahora.getTime() - new Date(ultimo.ocurrido_at).getTime()) / 3_600_000
  const n = recordatoriosPrevios + 1
  return { enviar: horasDesdeUltimo >= horas && recordatoriosPrevios < max, n, horasDesdeUltimo, recordatoriosPrevios }
}

/**
 * Barrido diario (cron): para cada solicitud particular con un cobro
 * pendiente cuyo último link salió hace ≥ 24 h, reenvía el link (máx. 2
 * veces) y, en el 2.º recordatorio (≈ 48 h sin pago), avisa al equipo.
 * `dry` = calcula sin enviar.
 */
export async function enviarRecordatoriosCobro(opts: { dry?: boolean; ahora?: Date } = {}): Promise<ResultadoRecordatorios> {
  const ahora = opts.ahora ?? new Date()
  const resultado: ResultadoRecordatorios = {
    habilitado: process.env.COBROS_RECORDATORIO_ENABLED !== 'false',
    revisadas: 0,
    recordatorios: [],
    alertas: 0,
    alertaEnviada: false,
    errores: [],
  }
  if (!resultado.habilitado) return resultado

  const desde = new Date(ahora.getTime() - RECORDATORIO_DIAS_ATRAS * 24 * 3_600_000).toISOString()
  const { data: sols, error } = await supabase
    .from('solicitudes_servicio')
    .select('id, estado, es_garantia, tipo_solicitud, tipo_equipo, marca_equipo, cliente_nombre, tecnico_asignado_id, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online, diagnosticado_at, descuento_codigo, descuento_tipo, descuento_valor')
    .eq('es_garantia', false)
    .in('estado', ESTADOS_CON_COBRO)
    .gte('created_at', desde)
    .limit(500)
  if (error) {
    resultado.errores.push(`lectura solicitudes: ${error.message}`)
    return resultado
  }

  const pendientes = ((sols ?? []) as SolicitudRecordatorio[])
    .map(sol => ({ sol, faltante: faltanteCobroCliente(sol) }))
    .filter((x): x is { sol: SolicitudRecordatorio; faltante: NonNullable<ReturnType<typeof faltanteCobroCliente>> } => Boolean(x.faltante))
  resultado.revisadas = pendientes.length
  if (pendientes.length === 0) return resultado

  const { data: eventos, error: evErr } = await supabase
    .from('solicitud_eventos')
    .select('solicitud_id, ocurrido_at, payload')
    .in('solicitud_id', pendientes.map(p => p.sol.id))
    .eq('tipo', 'mensaje_cliente')
  if (evErr) {
    resultado.errores.push(`lectura eventos: ${evErr.message}`)
    return resultado
  }
  const porSolicitud = new Map<string, EventoCobro[]>()
  for (const e of (eventos ?? []) as EventoCobro[]) {
    const lista = porSolicitud.get(e.solicitud_id) ?? []
    lista.push(e)
    porSolicitud.set(e.solicitud_id, lista)
  }

  const lineasAlerta: string[] = []
  for (const { sol, faltante } of pendientes) {
    const decision = decidirRecordatorio(faltante.tipo, porSolicitud.get(sol.id) ?? [], ahora)
    if (!decision.enviar) continue

    let monto = faltante.monto
    let envio: { ok: boolean; error?: string } = { ok: true }
    try {
      if (!opts.dry) {
        const solPago = await cargarSolicitudPago(sol.id)
        if (!solPago) throw new Error('No se pudo cargar la solicitud')
        if (faltante.tipo === 'anticipo') {
          monto = calcularMontoAnticipo(solPago)
          envio = monto > 0 ? await enviarCobroAnticipoCliente(sol.id, monto) : { ok: false, error: 'anticipo en 0' }
        } else if (faltante.tipo === 'abono') {
          monto = await calcularMontoAbonoRepuestos(solPago)
          envio = monto > 0 ? await enviarAbonoRepuestosCliente(sol.id, monto) : { ok: false, error: 'abono en 0' }
        } else {
          monto = await calcularMontoSaldo(solPago)
          const cierre = ['confirmacion_pendiente', 'completada', 'cancelada', ...ESTADOS_SIN_REPARACION].includes(sol.estado ?? '')
          envio = monto > 0
            ? await enviarPagoSaldoCliente(sol.id, monto, { momento: cierre ? 'cierre' : 'aprobacion' })
            : { ok: false, error: 'saldo en 0' }
        }
        if (envio.ok) {
          // Marca del recordatorio (cuenta para el máximo) — además del
          // mensaje_cliente que ya registró la función de envío.
          await registrarEvento(
            sol.id,
            'mensaje_cliente',
            `Recordatorio ${decision.n}/${RECORDATORIO_COBRO_MAX} de cobro (${faltante.tipo} $${formatCOP(monto)} COP) — ${Math.round(decision.horasDesdeUltimo ?? 0)} h sin pago`,
            { plantilla: `recordatorio_cobro_${faltante.tipo}`, canal: 'whatsapp', recordatorio_cobro: faltante.tipo, n: decision.n, monto },
          )
        }
      }
    } catch (err) {
      envio = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    resultado.recordatorios.push({
      solicitud_id: sol.id, cliente: sol.cliente_nombre, tipo: faltante.tipo, monto, n: decision.n, ok: envio.ok, error: envio.error,
    })
    if (!envio.ok) resultado.errores.push(`${sol.id}: ${envio.error}`)

    // 2.º recordatorio = ~48 h sin pagar → el equipo gestiona a mano.
    if (decision.n >= RECORDATORIO_COBRO_MAX) {
      resultado.alertas++
      lineasAlerta.push(
        `• ${sol.cliente_nombre} — ${sol.tipo_equipo} ${sol.marca_equipo}: ${faltante.tipo} $${formatCOP(monto)} COP sin pagar (${Math.round(decision.horasDesdeUltimo ?? 0)} h)` +
        `\n  ${APP_URL()}/admin/solicitudes/${sol.id}`,
      )
    }
  }

  if (lineasAlerta.length > 0 && !opts.dry) {
    resultado.alertaEnviada = await alertarEquipo(
      `💳 Cobros sin pagar tras 2 recordatorios (${lineasAlerta.length}):\n\n${lineasAlerta.join('\n')}\n\n` +
      `Gestionar a mano: llamar al cliente o "Cobrar faltante por WhatsApp" en la ficha.`,
    )
  }
  return resultado
}
