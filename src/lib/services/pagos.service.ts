import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  parseReferenciaPago,
  type TipoPago,
  type TransaccionWompi,
} from '@/lib/wompi'
import { montoAnticipo } from '@/lib/constants/pagos'
import { precioClienteServicio } from '@/types/solicitud'
import {
  enviarAnticipoConfirmadoCliente,
  enviarAnticipoConfirmadoTecnico,
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
  horario_confirmado: string | null
  cliente_nombre: string
}

const CAMPOS_SOLICITUD_PAGO =
  'id, estado, es_garantia, tipo_equipo, tipo_solicitud, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, horario_confirmado, cliente_nombre'

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

/**
 * Registra una transacción de Wompi y, si fue aprobada y corresponde al
 * anticipo, confirma la reserva (marca `anticipo_pagado_at` + avisa por
 * WhatsApp a cliente y técnico).
 *
 * Idempotente: llamarla N veces con la misma transacción registra una vez y
 * notifica una vez.
 *
 * @param origen de dónde vino la confirmación — queda en el payload de auditoría.
 */
export async function registrarPagoWompi(
  tx: TransaccionWompi,
  origen: 'webhook' | 'redirect',
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

  // 2. Defensa en profundidad: el monto pagado debe cubrir lo esperado.
  //    La firma de integridad ya impide alterar el monto en el checkout, pero
  //    si por cualquier vía entra un pago corto NO confirmamos la reserva —
  //    queda registrado y visible para que admin lo resuelva a mano.
  const esperado = tipo === 'anticipo' ? calcularMontoAnticipo(sol) : 0
  if (esperado > 0 && montoCOP < esperado) {
    console.error(
      `[pagos] monto insuficiente en ${tx.id}: pagó ${montoCOP}, esperado ${esperado} (solicitud ${solicitudId})`,
    )
    await registrarEventoPago(sol, {
      motivo: `Pago recibido por $${montoCOP} COP pero el anticipo esperado era $${esperado} COP — revisar manualmente`,
      payload: { transaccion_id: tx.id, monto: montoCOP, esperado, tipo, origen, requiere_intervencion_admin: true },
    })
    return { ok: true, confirmado: false, solicitudId, error: 'Monto insuficiente' }
  }

  if (tipo !== 'anticipo') {
    // 'saldo' queda registrado; hoy no dispara transición (el saldo se cobra
    // al completar el servicio y lo concilia admin).
    await registrarEventoPago(sol, {
      motivo: `Pago de saldo recibido por $${montoCOP} COP`,
      payload: { transaccion_id: tx.id, monto: montoCOP, tipo, origen },
    })
    return { ok: true, confirmado: true, solicitudId }
  }

  // 3. Marcar el anticipo — guard IS NULL: si otro camino (webhook vs
  //    redirect) ya lo marcó, este UPDATE no toca filas y NO re-notificamos.
  const { data: marcada } = await supabase
    .from('solicitudes_servicio')
    .update({ anticipo_pagado_at: tx.finalized_at ?? new Date().toISOString() })
    .eq('id', solicitudId)
    .is('anticipo_pagado_at', null)
    .select('id')
    .maybeSingle()

  if (!marcada) {
    return { ok: true, duplicado: true, confirmado: false, solicitudId }
  }

  await registrarEventoPago(sol, {
    motivo: `Anticipo pagado por $${montoCOP} COP (${tx.payment_method_type ?? 'Wompi'}) — reserva confirmada`,
    payload: { transaccion_id: tx.id, monto: montoCOP, tipo, origen, metodo: tx.payment_method_type ?? null },
  })

  // 4. Confirmar por WhatsApp a cliente y técnico. Best-effort: un fallo de
  //    Meta no revierte el pago ya registrado.
  try {
    const cli = await enviarAnticipoConfirmadoCliente(solicitudId, montoCOP)
    if (!cli.ok) console.error('[pagos] enviarAnticipoConfirmadoCliente falló:', cli.error)
  } catch (err) {
    console.error('[pagos] enviarAnticipoConfirmadoCliente error:', err)
  }

  try {
    const tec = await enviarAnticipoConfirmadoTecnico(solicitudId)
    if (!tec.ok) console.error('[pagos] enviarAnticipoConfirmadoTecnico falló:', tec.error)
  } catch (err) {
    console.error('[pagos] enviarAnticipoConfirmadoTecnico error:', err)
  }

  return { ok: true, confirmado: true, solicitudId }
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

/** Tipos exportados para los callers (route handlers / páginas). */
export type { TipoPago }
