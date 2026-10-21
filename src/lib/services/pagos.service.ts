// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  parseReferenciaPago,
  referenciaPago,
  listarTransaccionesPorReferencia,
  wompiConciliacionHabilitada,
  crearReembolsoWompi,
  anularTransaccionWompi,
  type TipoPago,
  type TransaccionWompi,
} from '@/lib/wompi'
import { montoAnticipo, saldoPendiente, montoAbonoRepuestos, cotizacionTieneRepuestos } from '@/lib/constants/pagos'
import { totalClienteParaCobro, descuentoClienteParaCobro } from '@/lib/constants/pago-cliente'
import { precioClienteServicio } from '@/types/solicitud'
import { formatCOP } from '@/lib/utils/format'
import {
  enviarAnticipoConfirmadoCliente,
  enviarAnticipoConfirmadoTecnico,
  enviarSaldoConfirmadoCliente,
  enviarSaldoConfirmadoTecnico,
  enviarAbonoConfirmadoTecnico,
  enviarAbonoConfirmadoCliente,
  enviarDevolucionConfirmadaCliente,
  enviarMensajeTexto,
} from '@/lib/services/whatsapp.service'

/**
 * Conciliación de pagos (pasarela Wompi).
 *
 * Única dueña de la escritura en la tabla `pagos` y de marcar
 * `solicitudes_servicio.anticipo_pagado_at`. La invocan DOS caminos que
 * pueden ocurrir a la vez o en cualquier orden:
 *
 *   1. `POST /api/wompi/webhook` — evento `transaction.updated` verificado
 *      por checksum. Es la fuente de verdad (Wompi reintenta 3 veces/24h).
 *   2. El redirect de vuelta del checkout (`/pago/anticipo/{token}?id=…`),
 *      que consulta la transacción por API para no dejar al cliente
 *      esperando el webhook.
 *
 * Por eso TODO acá es idempotente: el índice único sobre `transaccion_id`
 * corta el doble registro, y el UPDATE de `anticipo_pagado_at` lleva guard
 * `IS NULL` para que los WhatsApp de confirmación salgan UNA sola vez.
 *
 * Ver migración `supabase/migrations/20260818_wompi_pagos.sql`.
 */

export interface ResultadoRegistro {
  ok: boolean
  /** true si la transacción ya estaba registrada (reintento del webhook). */
  duplicado?: boolean
  /** true si este llamado fue el que marcó el anticipo como pagado. */
  confirmado?: boolean
  solicitudId?: string
  error?: string
}

/** Campos de la solicitud necesarios para calcular el anticipo. */
type SolicitudPago = {
  id: string
  estado: string
  es_garantia: boolean
  tipo_equipo: string
  tipo_solicitud: string
  cotizacion: unknown
  recargo_weekend_aplicado: number | null
  anticipo_pagado_at: string | null
  saldo_pagado_at: string | null
  horario_confirmado: string | null
  cliente_nombre: string
  // Snapshot del código de descuento (2026-10-19): entra SOLO en el saldo
  // final (calcularMontoSaldo). Nullable — sin código nada cambia.
  descuento_codigo?: string | null
  descuento_tipo?: string | null
  descuento_valor?: number | string | null
}

// ⚠️ descuento_* requieren la migración 20261019_codigos_descuento aplicada
// ANTES de desplegar (PostgREST rechaza columnas desconocidas en el select).
const CAMPOS_SOLICITUD_PAGO =
  'id, estado, es_garantia, tipo_equipo, tipo_solicitud, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, saldo_pagado_at, horario_confirmado, cliente_nombre, descuento_codigo, descuento_tipo, descuento_valor'

/**
 * Monto (COP) del anticipo que corresponde a una solicitud particular.
 *
 * Es el 50% de lo que el cliente paga por el servicio — el mismo número que
 * ya anuncia la plantilla `tecnico_asignado_particular_v1`, calculado con
 * `precioClienteServicio` (catálogo o total cotizado + recargo finde/festivo).
 *
 * Devuelve 0 en garantía (la marca paga) o si no hay precio calculable.
 */
export function calcularMontoAnticipo(sol: {
  es_garantia: boolean
  tipo_equipo: string
  tipo_solicitud: string
  cotizacion?: unknown
  recargo_weekend_aplicado?: number | null
}): number {
  if (sol.es_garantia) return 0
  const precioCliente = precioClienteServicio(
    sol.tipo_equipo,
    sol.tipo_solicitud,
    sol.es_garantia,
    sol.cotizacion as { total?: number | null } | null,
    sol.recargo_weekend_aplicado ?? null,
  )
  return montoAnticipo(precioCliente)
}

/** Suma de pagos APPROVED ya acreditados contra el total (anticipos + abonos). */
async function montoAcreditado(solicitudId: string): Promise<number> {
  const { data: acreditados } = await supabase
    .from('pagos')
    .select('monto')
    .eq('solicitud_id', solicitudId)
    .in('tipo', ['anticipo', 'abono'])
    .eq('estado', 'APPROVED')
  return (acreditados ?? []).reduce((acc, p) => acc + (p.monto ?? 0), 0)
}

/**
 * Saldo pendiente (COP) tras la cotización: total cotizado − código de
 * descuento (2026-10-19, solo acá: es el ÚLTIMO pago) − pagos APPROVED ya
 * acreditados en `pagos` (anticipos de reserva + abonos de repuestos).
 * 0 si no hay cotización con total. Nunca negativo: si el descuento supera
 * lo que faltaba, el saldo queda en 0 y no hay devolución.
 *
 * OJO: solo cuenta pagos ONLINE (tabla pagos); un pago recibido por fuera
 * (transferencia manual) no se acredita solo — admin ajusta el valor
 * con /api/admin/actualizar-valor si hace falta.
 */
export async function calcularMontoSaldo(sol: SolicitudPago): Promise<number> {
  if (sol.es_garantia) return 0
  // Total de la cotización; en Mantenimiento / Cambio de filtro (sin
  // cotización) el precio de catálogo + recargo (2026-10-11 — antes el 50%
  // restante de un precio fijo nunca tenía link de pago).
  const total = totalClienteParaCobro(sol)
  if (!Number.isFinite(total) || total <= 0) return 0
  const abonado = await montoAcreditado(sol.id)
  return saldoPendiente(total - descuentoClienteParaCobro(sol), abonado)
}

/**
 * Saldo BRUTO (sin código de descuento): base del abono de repuestos. El
 * descuento se aplica únicamente en el saldo final, así que el abono (50%)
 * se calcula como si no existiera.
 */
async function calcularMontoSaldoBruto(sol: SolicitudPago): Promise<number> {
  if (sol.es_garantia) return 0
  const total = totalClienteParaCobro(sol)
  if (!Number.isFinite(total) || total <= 0) return 0
  return saldoPendiente(total, await montoAcreditado(sol.id))
}

/**
 * Abono para compra de REPUESTOS (2026-08-25): si la cotización aprobada
 * incluye repuestos, se le pide al cliente el 50% del saldo pendiente antes
 * de que el técnico compre los repuestos. Devuelve 0 si no aplica (sin
 * repuestos, garantía, sin saldo o abono ya pagado).
 */
export async function calcularMontoAbonoRepuestos(sol: SolicitudPago): Promise<number> {
  if (sol.es_garantia) return 0
  if (!cotizacionTieneRepuestos(sol.cotizacion)) return 0
  if (await abonoRepuestosPagado(sol.id)) return 0
  const saldo = await calcularMontoSaldoBruto(sol)
  return montoAbonoRepuestos(saldo)
}

/** true si ya hay un abono de repuestos APPROVED registrado para la solicitud. */
export async function abonoRepuestosPagado(solicitudId: string): Promise<boolean> {
  const { data } = await supabase
    .from('pagos')
    .select('id')
    .eq('solicitud_id', solicitudId)
    .eq('tipo', 'abono')
    .eq('estado', 'APPROVED')
    .limit(1)
  return Boolean(data && data.length > 0)
}

/** Carga la solicitud con lo mínimo para operar sobre su pago. */
export async function cargarSolicitudPago(solicitudId: string): Promise<SolicitudPago | null> {
  const { data } = await supabase
    .from('solicitudes_servicio')
    .select(CAMPOS_SOLICITUD_PAGO)
    .eq('id', solicitudId)
    .single()
  return (data as SolicitudPago | null) ?? null
}

/** Busca la solicitud por el token permanente del cliente (link de pago). */
export async function cargarSolicitudPagoPorClienteToken(
  clienteToken: string,
): Promise<SolicitudPago | null> {
  const { data } = await supabase
    .from('solicitudes_servicio')
    .select(CAMPOS_SOLICITUD_PAGO)
    .eq('cliente_token', clienteToken)
    .single()
  return (data as SolicitudPago | null) ?? null
}

export type OrigenRegistroPago = 'webhook' | 'redirect' | 'conciliacion' | 'admin'

/**
 * Registra una transacción de Wompi y, si fue aprobada, marca el momento de
 * pago (anticipo / abono / saldo), actualiza el resumen de la solicitud y
 * avisa por WhatsApp a cliente, técnico y equipo Baird.
 *
 * Idempotente: llamarla N veces con la misma transacción registra una vez y
 * notifica una vez.
 *
 * @param origen de dónde vino la confirmación — queda en el payload de auditoría.
 */

export async function registrarPagoWompi(
  tx: TransaccionWompi,
  origen: OrigenRegistroPago,
): Promise<ResultadoRegistro> {
  const ref = parseReferenciaPago(tx.reference)
  if (!ref) {
    // Referencia ajena (p.ej. un pedido de la tienda que comparte cuenta
    // Wompi). No es un error: simplemente no es nuestro.
    console.warn(`[pagos] referencia no reconocida "${tx.reference}" (origen=${origen})`)
    return { ok: true, error: 'Referencia ajena a la app' }
  }

  const { tipo, solicitudId } = ref
  const montoCOP = Math.round((tx.amount_in_cents ?? 0) / 100)
  const aprobada = tx.status === 'APPROVED'

  const sol = await cargarSolicitudPago(solicitudId)
  if (!sol) {
    console.error(`[pagos] solicitud ${solicitudId} no existe (ref=${tx.reference})`)
    return { ok: false, error: 'Solicitud no encontrada' }
  }

  // 1. Registrar la transacción (append-only). El índice único sobre
  //    transaccion_id convierte el reintento en un no-op: código 23505.
  const { error: insertErr } = await supabase.from('pagos').insert({
    solicitud_id: solicitudId,
    tipo,
    estado: tx.status,
    monto: montoCOP,
    moneda: tx.currency ?? 'COP',
    pasarela: 'wompi',
    referencia: tx.reference,
    transaccion_id: tx.id,
    metodo: tx.payment_method_type ?? null,
    pagado_at: aprobada ? (tx.finalized_at ?? new Date().toISOString()) : null,
    raw: { ...tx, _origen: origen },
  })

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { ok: true, duplicado: true, solicitudId }
    }
    console.error('[pagos] insert en `pagos` falló:', insertErr)
    return { ok: false, error: insertErr.message, solicitudId }
  }

  if (!aprobada) {
    // Declinada / pendiente / error: queda registrada para soporte, pero no
    // confirma nada. El cliente puede reintentar con el mismo link.
    return { ok: true, confirmado: false, solicitudId }
  }

  // 1b. Resumen en la solicitud (monto_pagado_online / ultimo_pago_at) ANTES
  //     de cualquier WhatsApp: el admin y los portales ven el pago al
  //     instante aunque Meta tarde o falle (2026-10-11). Recalcula desde
  //     `pagos` — idempotente, nunca suma a ciegas.
  await actualizarResumenPago(solicitudId)

  // 2. Defensa en profundidad: el monto pagado debe cubrir lo esperado.
  //    La firma de integridad ya impide alterar el monto en el checkout, pero
  //    si por cualquier vía entra un pago corto NO confirmamos nada —
  //    queda registrado y visible para que admin lo resuelva a mano.
  //    Nota saldo: el esperado se recalcula AL MOMENTO de confirmar (el
  //    anticipo pudo acreditarse entre que se firmó el checkout y llegó el
  //    webhook); un pago que cubra el saldo vigente siempre pasa.
  //    Nota abono: el esperado no se puede recalcular acá — la fila del
  //    abono ya quedó insertada en el paso 1 y el saldo ya la descuenta.
  //    La firma de integridad del checkout ya fijó el monto server-side.
  const esperado = tipo === 'anticipo'
    ? calcularMontoAnticipo(sol)
    : tipo === 'saldo'
      ? await calcularMontoSaldo(sol)
      : 0
  if (esperado > 0 && montoCOP < esperado) {
    console.error(
      `[pagos] monto insuficiente en ${tx.id}: pagó ${montoCOP}, esperado ${esperado} (${tipo}, solicitud ${solicitudId})`,
    )
    await registrarEventoPago(sol, {
      motivo: `Pago recibido por $${montoCOP} COP pero el ${tipo} esperado era $${esperado} COP — revisar manualmente`,
      payload: { transaccion_id: tx.id, monto: montoCOP, esperado, tipo, origen, requiere_intervencion_admin: true },
    })
    return { ok: true, confirmado: false, solicitudId, error: 'Monto insuficiente' }
  }

  // 3. Marcar el momento de pago — guard IS NULL en la columna de su tipo:
  //    si otro camino (webhook / redirect / conciliación) ya lo marcó, este
  //    UPDATE no toca filas y NO re-notificamos. Desde 2026-10-11 el ABONO
  //    también tiene guard (`abono_pagado_at`) — antes cada transacción de
  //    abono re-avisaba al técnico.
  const columna = tipo === 'anticipo' ? 'anticipo_pagado_at' : tipo === 'abono' ? 'abono_pagado_at' : 'saldo_pagado_at'
  const { data: marcada } = await supabase
    .from('solicitudes_servicio')
    .update({ [columna]: tx.finalized_at ?? new Date().toISOString() })
    .eq('id', solicitudId)
    .is(columna, null)
    .select('id')
    .maybeSingle()

  const metodo = tx.payment_method_type ?? 'Wompi'
  const payloadBase = { transaccion_id: tx.id, monto: montoCOP, tipo, origen, metodo: tx.payment_method_type ?? null }

  if (!marcada) {
    // Transacción NUEVA (el insert pasó) pero el momento ya estaba pagado:
    // el cliente pagó DOS VECES el mismo cobro. Antes quedaba solo en `pagos`
    // sin rastro en el historial — ahora se avisa para gestionar la devolución.
    await registrarEventoPago(sol, {
      motivo: `⚠️ Se recibió un SEGUNDO pago de ${tipo} por $${formatCOP(montoCOP)} COP (${metodo}) — el ${tipo} ya estaba pagado. Revisar devolución al cliente`,
      payload: { ...payloadBase, requiere_intervencion_admin: true, pago_duplicado: true },
    })
    await alertarPagoEquipoBaird(sol,
      `⚠️ Pago DUPLICADO de ${tipo}: ${sol.cliente_nombre} pagó otra vez $${formatCOP(montoCOP)} (${metodo}). Revisar devolución — servicio ${solicitudId.slice(0, 8)}`)
    return { ok: true, duplicado: true, confirmado: false, solicitudId }
  }

  const MOTIVOS: Record<TipoPago, string> = {
    anticipo: `Anticipo pagado por $${formatCOP(montoCOP)} COP (${metodo}) — reserva confirmada`,
    abono: `Abono para repuestos pagado por $${formatCOP(montoCOP)} COP (${metodo}) — el técnico puede comprar los repuestos`,
    saldo: `Saldo pagado por $${formatCOP(montoCOP)} COP (${metodo}) — servicio totalmente pagado en línea`,
  }
  await registrarEventoPago(sol, { motivo: MOTIVOS[tipo], payload: payloadBase })

  // 4. Avisos por WhatsApp — cliente, técnico y equipo Baird. Best-effort: un
  //    fallo de Meta no revierte el pago, pero queda en el historial como
  //    evento con requiere_intervencion_admin para avisar a mano.
  const fallas: string[] = []
  const avisar = async (destino: string, envio: () => Promise<{ ok: boolean; error?: string }>) => {
    try {
      const r = await envio()
      if (!r.ok) {
        console.error(`[pagos] aviso de ${tipo} a ${destino} falló:`, r.error)
        fallas.push(`${destino}: ${r.error ?? 'sin detalle'}`)
      }
    } catch (err) {
      console.error(`[pagos] aviso de ${tipo} a ${destino} error:`, err)
      fallas.push(`${destino}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (tipo === 'anticipo') {
    await avisar('cliente', () => enviarAnticipoConfirmadoCliente(solicitudId, montoCOP))
    await avisar('técnico', () => enviarAnticipoConfirmadoTecnico(solicitudId))
  } else if (tipo === 'abono') {
    const saldoRestante = await calcularMontoSaldo(sol)
    await avisar('cliente', () => enviarAbonoConfirmadoCliente(solicitudId, montoCOP, saldoRestante))
    await avisar('técnico', () => enviarAbonoConfirmadoTecnico(solicitudId, montoCOP))
  } else {
    await avisar('cliente', () => enviarSaldoConfirmadoCliente(solicitudId, montoCOP))
    await avisar('técnico', () => enviarSaldoConfirmadoTecnico(solicitudId, montoCOP))
  }

  const ETIQUETA: Record<TipoPago, string> = { anticipo: 'ANTICIPO', abono: 'ABONO repuestos', saldo: 'SALDO final' }
  await alertarPagoEquipoBaird(sol,
    `💰 Pago recibido — ${ETIQUETA[tipo]} $${formatCOP(montoCOP)} (${metodo})\n` +
    `Cliente: ${sol.cliente_nombre} · ${sol.tipo_solicitud} ${sol.tipo_equipo}\n` +
    `Servicio ${solicitudId.slice(0, 8)} · origen ${origen}` +
    (fallas.length ? `\n⚠️ No se pudo avisar a: ${fallas.map(f => f.split(':')[0]).join(', ')}` : ''))

  if (fallas.length > 0) {
    // Excluye los envíos filtrados por la whitelist de pruebas (no son fallas reales).
    const reales = fallas.filter(f => !f.includes('BAIRD_TEST_PHONE_WHITELIST'))
    if (reales.length > 0) {
      await registrarEventoPago(sol, {
        motivo: `⚠️ El ${tipo} quedó registrado pero NO se pudo avisar por WhatsApp a: ${reales.map(f => f.split(':')[0]).join(', ')} — avisar manualmente`,
        payload: { ...payloadBase, requiere_intervencion_admin: true, fallas_aviso: reales },
      })
    }
  }

  return { ok: true, confirmado: true, solicitudId }
}

/**
 * Recalcula el resumen de recaudo de la solicitud desde el ledger `pagos`
 * (solo APPROVED): `monto_pagado_online` = suma, `ultimo_pago_at` = más
 * reciente. Idempotente; nunca lanza (el pago ya quedó en `pagos`).
 * Columnas de la migración 20261011_resumen_pago_solicitud.
 */
export async function actualizarResumenPago(solicitudId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('pagos')
      .select('monto, pagado_at')
      .eq('solicitud_id', solicitudId)
      .eq('estado', 'APPROVED')
    if (error) {
      console.error('[pagos] resumen: lectura de pagos falló:', error.message)
      return
    }
    const filas = data ?? []
    const total = filas.reduce((acc, p) => acc + (p.monto ?? 0), 0)
    const ultimo = filas
      .map(p => p.pagado_at as string | null)
      .filter((f): f is string => Boolean(f))
      .sort()
      .pop() ?? null
    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({ monto_pagado_online: total, ultimo_pago_at: ultimo })
      .eq('id', solicitudId)
    if (updErr) console.error('[pagos] resumen: update falló:', updErr.message)
  } catch (err) {
    console.error('[pagos] resumen threw:', err)
  }
}

/**
 * Aviso al equipo de Baird de cada pago recibido (WHATSAPP_ALERT_PHONE,
 * default 573153019192 — el mismo número que recibe las alertas de mensajes
 * entrantes). Texto libre: solo llega si ese número tiene la ventana de 24h
 * abierta con la línea. Best-effort, nunca lanza.
 */
async function alertarPagoEquipoBaird(_sol: SolicitudPago, texto: string): Promise<void> {
  const destino = process.env.WHATSAPP_ALERT_PHONE ?? '573153019192'
  if (!destino) return
  try {
    await enviarMensajeTexto(destino, texto)
  } catch (err) {
    console.warn('[pagos] alerta de pago al equipo no se entregó (¿ventana 24h cerrada?):', err instanceof Error ? err.message : err)
  }
}

/** Evento append-only en el historial consolidado. Nunca bloquea. */
async function registrarEventoPago(
  sol: SolicitudPago,
  datos: { motivo: string; payload: Record<string, unknown> },
): Promise<void> {
  try {
    const { error } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'pago_registrado',
      estado_previo: sol.estado,
      estado_nuevo: sol.estado,
      actor: 'sistema',
      motivo: datos.motivo,
      payload: { ...datos.payload, pasarela: 'wompi' },
    })
    if (error) console.error('[pagos] evento pago_registrado falló:', error.message)
  } catch (err) {
    console.error('[pagos] evento pago_registrado threw:', err)
  }
}

// ─────────────────────────────────────────
// Devoluciones desde el admin (2026-10-21)
// ─────────────────────────────────────────

export type ModoDevolucion = 'wompi' | 'manual'

export interface ResultadoDevolucion {
  ok: boolean
  error?: string
  /** Cómo se hizo efectiva la devolución (solo si ok). */
  via?: 'reembolso_wompi' | 'anulacion_wompi' | 'manual'
  /** true si el pago ya figuraba devuelto (idempotencia: no se repite nada). */
  yaDevuelto?: boolean
  tipo?: TipoPago
  monto?: number
  /** Id del reembolso/anulación en Wompi (para cruzar con el panel). */
  referenciaWompi?: string
}

/** Fila del ledger tal como la lee la devolución. */
type PagoLedger = {
  id: string
  solicitud_id: string
  tipo: TipoPago
  estado: string
  monto: number
  transaccion_id: string | null
  metodo: string | null
  raw: Record<string, unknown> | null
}

const ETIQUETA_TIPO: Record<TipoPago, string> = { anticipo: 'anticipo', abono: 'abono de repuestos', saldo: 'saldo' }

/**
 * Devuelve al cliente un pago APPROVED del ledger (caso típico: el servicio
 * se canceló después de pagar el anticipo).
 *
 *   - `modo: 'wompi'`  → el dinero regresa al medio de pago original por el
 *     API de Wompi: reembolso V2 (`POST /v1/refunds`, cualquier método) y, si
 *     ese endpoint no está disponible para el comercio y el pago fue con
 *     TARJETA, anulación (`/void`). Requiere WOMPI_PRIVATE_KEY.
 *   - `modo: 'manual'` → el admin ya devolvió por fuera (panel de Wompi,
 *     transferencia) y solo deja constancia.
 *
 * En ambos casos la MISMA fila de `pagos` pasa a `VOIDED` (una transacción =
 * una fila; el trigger `pagos_resumen_aiud` descuenta el monto del resumen),
 * con `raw._devolucion` {via, at, actor, nota, respuesta}. Si no queda otro
 * pago APPROVED del mismo tipo se limpia `{tipo}_pagado_at` — así el ledger y
 * los guards quedan coherentes (`auditar_pagos()`) y, si el cliente vuelve a
 * pagar, se le avisa de nuevo. Queda evento ↩️ en el historial y alerta al
 * equipo. Idempotente: un pago ya VOIDED responde `yaDevuelto` sin llamar a
 * Wompi. Un fallo de Wompi NO toca la BD (solo evento ⚠️ de intento).
 */
export async function devolverPagoWompi(params: {
  pagoId: string
  solicitudId: string
  modo: ModoDevolucion
  actor: string
  nota?: string
}): Promise<ResultadoDevolucion> {
  const { pagoId, solicitudId, modo, actor } = params
  const nota = params.nota?.trim().slice(0, 500) || undefined

  const { data: pagoRow, error: pagoErr } = await supabase
    .from('pagos')
    .select('id, solicitud_id, tipo, estado, monto, transaccion_id, metodo, raw')
    .eq('id', pagoId)
    .eq('solicitud_id', solicitudId)
    .maybeSingle()
  if (pagoErr) return { ok: false, error: `No se pudo leer el pago: ${pagoErr.message}` }
  const pago = (pagoRow as PagoLedger | null) ?? null
  if (!pago) return { ok: false, error: 'Ese pago no existe o no pertenece a este servicio' }

  const base = { tipo: pago.tipo, monto: pago.monto }
  if (pago.estado === 'VOIDED') return { ok: true, yaDevuelto: true, ...base }
  if (pago.estado !== 'APPROVED') {
    return { ok: false, error: `Solo se puede devolver un pago aprobado (este está ${pago.estado})`, ...base }
  }

  const sol = await cargarSolicitudPago(solicitudId)
  if (!sol) return { ok: false, error: 'Solicitud no encontrada', ...base }

  const metodo = pago.metodo ?? 'Wompi'
  const etiqueta = ETIQUETA_TIPO[pago.tipo] ?? pago.tipo
  let via: NonNullable<ResultadoDevolucion['via']>
  let referenciaWompi: string | undefined
  let respuesta: unknown = null

  if (modo === 'wompi') {
    if (!pago.transaccion_id) return { ok: false, error: 'El pago no tiene transacción de Wompi asociada', ...base }
    const motivoWompi = nota ?? `Devolución del ${etiqueta} — servicio ${solicitudId.slice(0, 8)}`
    const reembolso = await crearReembolsoWompi({
      transactionId: pago.transaccion_id,
      amountInCents: pago.monto * 100,
      motivo: motivoWompi,
      referencia: `devolucion-${pago.tipo}-${solicitudId}`,
    })

    if (reembolso.ok) {
      if (reembolso.data.status !== 'APPROVED') {
        const detalle = reembolso.data.status_message ? ` (${reembolso.data.status_message})` : ''
        await registrarEventoPago(sol, {
          motivo: `⚠️ Wompi NO aprobó la devolución del ${etiqueta} por $${formatCOP(pago.monto)} COP: ${reembolso.data.status}${detalle} — intentarlo desde el panel de Wompi`,
          payload: { transaccion_id: pago.transaccion_id, monto: pago.monto, tipo: pago.tipo, devolucion_fallida: true, actor, respuesta: reembolso.data },
        })
        return { ok: false, error: `Wompi respondió ${reembolso.data.status}${detalle}`, ...base }
      }
      via = 'reembolso_wompi'
      referenciaWompi = reembolso.data.v2_refund_id ?? String(reembolso.data.id)
      respuesta = reembolso.data
    } else {
      // Reembolsos V2 no disponible para el comercio → con tarjeta aún se
      // puede intentar la anulación clásica (misma jornada).
      const endpointNoDisponible = reembolso.httpStatus !== undefined && [403, 404, 405].includes(reembolso.httpStatus)
      const esTarjeta = (pago.metodo ?? '').toUpperCase() === 'CARD'
      const anulacion = endpointNoDisponible && esTarjeta ? await anularTransaccionWompi(pago.transaccion_id) : null
      if (anulacion?.ok && anulacion.data.status === 'VOIDED') {
        via = 'anulacion_wompi'
        referenciaWompi = anulacion.data.id
        respuesta = anulacion.data
      } else {
        const errorFinal = !anulacion
          ? reembolso.error
          : anulacion.ok
            ? `Wompi dejó la transacción en ${anulacion.data.status} (no se anuló)`
            : `${reembolso.error}; anulación: ${anulacion.error}`
        await registrarEventoPago(sol, {
          motivo: `⚠️ No se pudo devolver el ${etiqueta} por $${formatCOP(pago.monto)} COP desde el API de Wompi: ${errorFinal} — hacerlo desde el panel de Wompi y registrar la devolución manual`,
          payload: { transaccion_id: pago.transaccion_id, monto: pago.monto, tipo: pago.tipo, devolucion_fallida: true, actor, error: errorFinal },
        })
        return { ok: false, error: errorFinal, ...base }
      }
    }
  } else {
    via = 'manual'
  }

  // Misma fila → VOIDED. Guard estado=APPROVED: si otro admin la devolvió en
  // paralelo este UPDATE no toca filas y no se duplica el evento.
  const devolucion = { via, at: new Date().toISOString(), actor, nota: nota ?? null, referencia_wompi: referenciaWompi ?? null, respuesta }
  const { data: marcada, error: updErr } = await supabase
    .from('pagos')
    .update({ estado: 'VOIDED', raw: { ...(pago.raw ?? {}), _devolucion: devolucion } })
    .eq('id', pago.id)
    .eq('estado', 'APPROVED')
    .select('id')
    .maybeSingle()
  if (updErr) {
    console.error('[pagos] devolución: update de pagos falló:', updErr)
    return { ok: false, error: `La devolución se hizo (${via}) pero no se pudo marcar en la BD: ${updErr.message}`, via, referenciaWompi, ...base }
  }
  if (!marcada) return { ok: true, yaDevuelto: true, via, referenciaWompi, ...base }

  await actualizarResumenPago(solicitudId)

  // Limpia el guard del momento si ya no queda ningún pago aprobado de ese tipo.
  const { data: restantes } = await supabase
    .from('pagos')
    .select('id')
    .eq('solicitud_id', solicitudId)
    .eq('tipo', pago.tipo)
    .eq('estado', 'APPROVED')
    .limit(1)
  if (!restantes || restantes.length === 0) {
    const columna = pago.tipo === 'anticipo' ? 'anticipo_pagado_at' : pago.tipo === 'abono' ? 'abono_pagado_at' : 'saldo_pagado_at'
    const { error: guardErr } = await supabase
      .from('solicitudes_servicio')
      .update({ [columna]: null })
      .eq('id', solicitudId)
    if (guardErr) console.error(`[pagos] devolución: no se pudo limpiar ${columna}:`, guardErr.message)
  }

  const VIA_LABEL: Record<typeof via, string> = {
    reembolso_wompi: 'reembolso por API de Wompi',
    anulacion_wompi: 'anulación de la transacción en Wompi',
    manual: 'devolución manual (fuera de la app)',
  }
  await registrarEventoPago(sol, {
    motivo: `↩️ Devolución del ${etiqueta} por $${formatCOP(pago.monto)} COP (${metodo}) — ${VIA_LABEL[via]}${nota ? `. Nota: ${nota}` : ''}`,
    payload: {
      transaccion_id: pago.transaccion_id,
      monto: pago.monto,
      tipo: pago.tipo,
      devolucion: true,
      via,
      actor,
      nota: nota ?? null,
      referencia_wompi: referenciaWompi ?? null,
    },
  })
  // Aviso al cliente (plantilla devolucion_confirmada_cliente_v1). Best-effort:
  // un fallo de Meta no revierte la devolución; queda evento ⚠️ para avisar a mano.
  let avisoCliente: string | null = null
  try {
    const r = await enviarDevolucionConfirmadaCliente(solicitudId, {
      monto: pago.monto,
      tipo: pago.tipo,
      medio: via === 'manual' ? 'por el medio acordado contigo' : `al mismo medio con el que pagaste (${metodoLegible(pago.metodo)})`,
    })
    if (!r.ok) avisoCliente = r.error ?? 'sin detalle'
  } catch (err) {
    avisoCliente = err instanceof Error ? err.message : String(err)
  }
  if (avisoCliente && !avisoCliente.includes('BAIRD_TEST_PHONE_WHITELIST')) {
    console.error(`[pagos] aviso de devolución al cliente falló:`, avisoCliente)
    await registrarEventoPago(sol, {
      motivo: `⚠️ La devolución del ${etiqueta} quedó registrada pero NO se pudo avisar al cliente por WhatsApp — avisar manualmente`,
      payload: { transaccion_id: pago.transaccion_id, monto: pago.monto, tipo: pago.tipo, devolucion: true, requiere_intervencion_admin: true, fallas_aviso: [`cliente: ${avisoCliente}`] },
    })
  }

  await alertarPagoEquipoBaird(sol,
    `↩️ Devolución — ${etiqueta.toUpperCase()} $${formatCOP(pago.monto)} (${metodo})\n` +
    `Cliente: ${sol.cliente_nombre} · ${sol.tipo_solicitud} ${sol.tipo_equipo}\n` +
    `Servicio ${solicitudId.slice(0, 8)} · ${VIA_LABEL[via]} · por ${actor}` +
    (avisoCliente ? `\n⚠️ No se pudo avisar al cliente` : ''))

  return { ok: true, via, referenciaWompi, ...base }
}

/** Nombre legible del método de pago de Wompi para mensajes al cliente. */
function metodoLegible(metodo: string | null): string {
  const m = (metodo ?? '').toUpperCase()
  if (m === 'CARD') return 'tarjeta'
  if (m === 'PSE') return 'PSE'
  if (m === 'NEQUI') return 'Nequi'
  if (m === 'BANCOLOMBIA_TRANSFER' || m === 'BANCOLOMBIA_COLLECT') return 'Bancolombia'
  if (m === 'DAVIPLATA') return 'Daviplata'
  return metodo ?? 'Wompi'
}

/**
 * Pagos de una solicitud para la ficha admin (la tabla `pagos` está cerrada
 * al anon: solo se puede leer server-side). Incluye el detalle de la
 * devolución si la fila está VOIDED.
 */
export async function listarPagosSolicitud(solicitudId: string): Promise<Array<{
  id: string
  tipo: TipoPago
  estado: string
  monto: number
  metodo: string | null
  transaccion_id: string | null
  pagado_at: string | null
  created_at: string
  origen: string | null
  devolucion: { via: string; at: string; actor: string; nota: string | null; referencia_wompi: string | null } | null
}>> {
  const { data, error } = await supabase
    .from('pagos')
    .select('id, tipo, estado, monto, metodo, transaccion_id, pagado_at, created_at, raw')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[pagos] listarPagosSolicitud falló:', error.message)
    return []
  }
  return (data ?? []).map(p => {
    const raw = (p.raw ?? {}) as Record<string, unknown>
    const dev = raw._devolucion as Record<string, unknown> | undefined
    return {
      id: p.id as string,
      tipo: p.tipo as TipoPago,
      estado: p.estado as string,
      monto: p.monto as number,
      metodo: (p.metodo as string | null) ?? null,
      transaccion_id: (p.transaccion_id as string | null) ?? null,
      pagado_at: (p.pagado_at as string | null) ?? null,
      created_at: p.created_at as string,
      origen: typeof raw._origen === 'string' ? raw._origen : null,
      devolucion: dev
        ? {
            via: String(dev.via ?? ''),
            at: String(dev.at ?? ''),
            actor: String(dev.actor ?? ''),
            nota: typeof dev.nota === 'string' ? dev.nota : null,
            referencia_wompi: typeof dev.referencia_wompi === 'string' ? dev.referencia_wompi : null,
          }
        : null,
    }
  })
}

// ─────────────────────────────────────────
// Conciliación por cron (2026-10-11)
// ─────────────────────────────────────────

export interface ResultadoConciliacion {
  /** false si no hay WOMPI_PRIVATE_KEY (no-op, nada consultado). */
  habilitada: boolean
  /** Solicitudes revisadas (con al menos un cobro pendiente). */
  revisadas: number
  /** Consultas hechas al API de Wompi (una por referencia pendiente). */
  consultas: number
  /** Pagos APPROVED nuevos registrados en esta corrida. */
  registrados: number
  /** Pagos que ya estaban en `pagos` (idempotencia). */
  duplicados: number
  errores: string[]
}

/** Estados terminales: no tiene sentido buscar cobros para ellos. */
const ESTADOS_SIN_COBRO = new Set([
  'sin_agendar',
  'no_show_cliente',
  'cotizacion_rechazada',
  'finalizado_sin_reparacion',
  'reparacion_rechazada',
  'cancelada',
])

type SolicitudConciliable = SolicitudPago & {
  created_at: string
  tecnico_asignado_id: string | null
}

/**
 * Decide qué referencias de cobro siguen pendientes para una solicitud —
 * espejo de los momentos en que la app manda un link de pago:
 *   - anticipo: técnico asignado y `anticipo_pagado_at` vacío.
 *   - abono:    cotización aprobada con repuestos y sin abono APPROVED.
 *   - saldo:    cotización con total, `saldo_pagado_at` vacío y servicio
 *               cerrado (`completada`) — el link sale al completar.
 */
async function tiposPendientes(sol: SolicitudConciliable): Promise<TipoPago[]> {
  const tipos: TipoPago[] = []
  if (sol.tecnico_asignado_id && !sol.anticipo_pagado_at && calcularMontoAnticipo(sol) > 0) {
    tipos.push('anticipo')
  }
  const cot = sol.cotizacion as { total?: number; aprobado_at?: string } | null
  if (cot?.aprobado_at && cotizacionTieneRepuestos(cot) && !(await abonoRepuestosPagado(sol.id))) {
    tipos.push('abono')
  }
  // Saldo: el link sale al aprobar una cotización SIN repuestos o al completar
  // (incluye precio fijo — totalClienteParaCobro usa el catálogo ahí).
  const saldoEnCurso = sol.estado === 'completada' || (Boolean(cot?.aprobado_at) && !cotizacionTieneRepuestos(cot))
  if (saldoEnCurso && !sol.saldo_pagado_at && totalClienteParaCobro(sol) > 0) {
    tipos.push('saldo')
  }
  return tipos
}

/** Consulta en Wompi las referencias dadas de UNA solicitud y registra las APPROVED. */
async function conciliarReferencias(
  solicitudId: string,
  tipos: TipoPago[],
  resultado: ResultadoConciliacion,
  origen: OrigenRegistroPago,
): Promise<void> {
  for (const tipo of tipos) {
    resultado.consultas++
    const txs = await listarTransaccionesPorReferencia(referenciaPago(tipo, solicitudId))
    for (const tx of txs) {
      if (tx.status !== 'APPROVED') continue
      try {
        const r = await registrarPagoWompi(tx, origen)
        if (!r.ok) {
          resultado.errores.push(`${tx.id}: ${r.error ?? 'registro falló'}`)
        } else if (r.duplicado) {
          resultado.duplicados++
        } else {
          resultado.registrados++
          console.log(`[pagos] conciliación (${origen}) registró ${tipo} ${tx.id} de la solicitud ${solicitudId}`)
        }
      } catch (err) {
        resultado.errores.push(`${tx.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}

/**
 * Verificación bajo demanda de UNA solicitud (botón "Verificar pagos en
 * Wompi" del admin). Consulta las TRES referencias (anticipo, abono, saldo)
 * sin importar el estado — así también detecta pagos duplicados. Sin
 * WOMPI_PRIVATE_KEY devuelve `habilitada: false`.
 */
export async function conciliarSolicitudWompi(solicitudId: string): Promise<ResultadoConciliacion> {
  const resultado: ResultadoConciliacion = {
    habilitada: wompiConciliacionHabilitada(),
    revisadas: 0,
    consultas: 0,
    registrados: 0,
    duplicados: 0,
    errores: [],
  }
  if (!resultado.habilitada) return resultado
  resultado.revisadas = 1
  await conciliarReferencias(solicitudId, ['anticipo', 'abono', 'saldo'], resultado, 'admin')
  return resultado
}

/**
 * Conciliación contra Wompi para cobros que el webhook/redirect no alcanzaron
 * a registrar (ver `listarTransaccionesPorReferencia` para el porqué).
 *
 * Recorre las solicitudes PARTICULARES vivas de los últimos `diasAtras` días
 * con algún cobro pendiente, pregunta a Wompi por cada referencia y pasa las
 * transacciones APPROVED por `registrarPagoWompi(tx, 'conciliacion')` — la
 * misma función del webhook, con la misma validación de monto, idempotencia
 * por `transaccion_id` y WhatsApp de confirmación una sola vez.
 *
 * Solo lee de Wompi (nunca crea ni anula transacciones). Sin
 * WOMPI_PRIVATE_KEY devuelve `habilitada: false` sin tocar nada.
 */
export async function conciliarPagosWompi(opts: { diasAtras?: number } = {}): Promise<ResultadoConciliacion> {
  const resultado: ResultadoConciliacion = {
    habilitada: wompiConciliacionHabilitada(),
    revisadas: 0,
    consultas: 0,
    registrados: 0,
    duplicados: 0,
    errores: [],
  }
  if (!resultado.habilitada) return resultado

  const dias = Math.min(Math.max(opts.diasAtras ?? 45, 1), 180)
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString()

  const { data: candidatas, error } = await supabase
    .from('solicitudes_servicio')
    .select(`${CAMPOS_SOLICITUD_PAGO}, created_at, tecnico_asignado_id`)
    .eq('es_garantia', false)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    resultado.errores.push(`lectura solicitudes: ${error.message}`)
    return resultado
  }

  for (const sol of (candidatas ?? []) as SolicitudConciliable[]) {
    if (ESTADOS_SIN_COBRO.has(sol.estado)) continue
    let tipos: TipoPago[]
    try {
      tipos = await tiposPendientes(sol)
    } catch (err) {
      resultado.errores.push(`${sol.id}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    if (tipos.length === 0) continue
    resultado.revisadas++
    await conciliarReferencias(sol.id, tipos, resultado, 'conciliacion')
  }

  return resultado
}

/** Tipos exportados para los callers (route handlers / páginas). */
export type { TipoPago }
