// 🔒 MÓDULO DE PAGOS (congelado 2026-10-11). Contrato e invariantes en
// docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin
// necesidad estricta; corre src/__tests__/services/pagos-contrato.test.ts y
// etiqueta el commit con [pagos]. Guard: scripts/check-pagos-frontera.mjs.
import { createHash } from 'crypto'

/**
 * Wompi (Bancolombia) — recaudo online de Baird Service. SOLO SERVIDOR.
 *
 * Integración por Web Checkout (redirect): el backend arma la URL de
 * https://checkout.wompi.co/p/ con el monto EXACTO leído de la BD y la firma
 * de integridad SHA-256, de modo que el cliente no puede alterar el valor.
 * La confirmación del pago llega por DOS vías (ambas idempotentes, ver
 * pagos.service.ts):
 *   1. redirect-url de vuelta a /pago/... → se consulta la transacción por API
 *   2. webhook POST /api/wompi/webhook (evento transaction.updated, checksum)
 *
 * Kill-switch: sin WOMPI_PUBLIC_KEY + WOMPI_INTEGRITY_SECRET todo es no-op
 * (mismo patrón que Dapta/Shopify) — los flujos que lo usan hacen fallback al
 * comportamiento anterior. Sandbox: llaves pub_test_/prv_test_ apuntan solas
 * a sandbox.wompi.co (se detecta por el prefijo de la llave pública).
 *
 * Env vars (Vercel → Sensitive, NUNCA NEXT_PUBLIC salvo la pública):
 *   WOMPI_PUBLIC_KEY        pub_prod_… / pub_test_…  (visible al navegador vía URL, no es secreta)
 *   WOMPI_INTEGRITY_SECRET  prod_integrity_… / test_integrity_…
 *   WOMPI_EVENTS_SECRET     prod_events_… / test_events_…  (verificación del webhook)
 *   WOMPI_PRIVATE_KEY       prv_prod_… (conciliación por referencia, Bearer en consultas y
 *                           devoluciones/anulaciones desde el admin — sin ella son no-op)
 */

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://lineablanca.bairdservice.com'

const CHECKOUT_URL = 'https://checkout.wompi.co/p/'

/** true si las env vars mínimas para cobrar están configuradas. */
export function wompiHabilitado(): boolean {
  return Boolean(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET)
}

/** Base del API REST según el ambiente de la llave pública. */
function wompiApiBase(): string {
  return process.env.WOMPI_PUBLIC_KEY?.startsWith('pub_test_')
    ? 'https://sandbox.wompi.co/v1'
    : 'https://production.wompi.co/v1'
}

// ─────────────────────────────────────────
// Referencias de pago
// ─────────────────────────────────────────
// Formato canónico: "{tipo}-{solicitudId}" — la referencia viaja con la
// transacción de Wompi y es la ÚNICA fuente para conciliar contra la
// solicitud. tipo: 'anticipo' (reserva) | 'abono' (50% del saldo para
// compra de repuestos, 2026-08-25) | 'saldo' (resto al finalizar).

export type TipoPago = 'anticipo' | 'abono' | 'saldo'

export function referenciaPago(tipo: TipoPago, solicitudId: string): string {
  return `${tipo}-${solicitudId}`
}

const REFERENCIA_RE = /^(anticipo|abono|saldo)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Parsea una referencia nuestra; null si es ajena (p.ej. pedidos de la tienda). */
export function parseReferenciaPago(referencia: unknown): { tipo: TipoPago; solicitudId: string } | null {
  if (typeof referencia !== 'string') return null
  const m = REFERENCIA_RE.exec(referencia.trim())
  if (!m) return null
  return { tipo: m[1].toLowerCase() as TipoPago, solicitudId: m[2].toLowerCase() }
}

/** URL pública de nuestra página de pago del anticipo (la que va en WhatsApp). */
export function urlPaginaPagoAnticipo(clienteToken: string): string {
  return `${APP_URL}/pago/anticipo/${clienteToken}`
}

// ─────────────────────────────────────────
// Web Checkout firmado
// ─────────────────────────────────────────

/**
 * Construye la URL del Web Checkout de Wompi con firma de integridad.
 *
 * La firma es SHA-256 de `<reference><amountInCents><currency><integritySecret>`
 * (docs.wompi.co § Widget & Checkout Web). El monto SIEMPRE debe venir del
 * servidor (BD) — jamás de input del cliente.
 *
 * @param montoCOP monto en pesos (se convierte a centavos ×100)
 * @returns URL lista para redirigir, o null si Wompi no está configurado o el monto es inválido.
 */
export function construirCheckoutUrl(params: {
  referencia: string
  montoCOP: number
  redirectUrl: string
  nombreCliente?: string
}): string | null {
  const publicKey = process.env.WOMPI_PUBLIC_KEY
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET
  if (!publicKey || !integritySecret) return null

  const monto = Math.round(params.montoCOP)
  if (!Number.isFinite(monto) || monto <= 0) return null

  const amountInCents = monto * 100
  const currency = 'COP'
  const firma = createHash('sha256')
    .update(`${params.referencia}${amountInCents}${currency}${integritySecret}`)
    .digest('hex')

  const qs = new URLSearchParams({
    'public-key': publicKey,
    currency,
    'amount-in-cents': String(amountInCents),
    reference: params.referencia,
    'signature:integrity': firma,
    'redirect-url': params.redirectUrl,
  })
  if (params.nombreCliente?.trim()) {
    qs.set('customer-data:full-name', params.nombreCliente.trim().slice(0, 60))
  }
  return `${CHECKOUT_URL}?${qs.toString()}`
}

// ─────────────────────────────────────────
// Transacciones (consulta) y eventos (webhook)
// ─────────────────────────────────────────

/** Shape mínimo de una transacción Wompi que usamos para conciliar. */
export interface TransaccionWompi {
  id: string
  reference: string
  status: 'APPROVED' | 'PENDING' | 'DECLINED' | 'VOIDED' | 'ERROR' | string
  amount_in_cents: number
  currency: string
  payment_method_type?: string
  finalized_at?: string | null
  created_at?: string
}

/** Llave privada (server-only). undefined si no está configurada. */
function wompiPrivateKey(): string | undefined {
  const k = process.env.WOMPI_PRIVATE_KEY?.trim()
  return k ? k : undefined
}

/** true si hay llave privada → se pueden consultar transacciones por referencia. */
export function wompiConciliacionHabilitada(): boolean {
  return Boolean(wompiPrivateKey())
}

/**
 * Headers para el API REST. Si hay WOMPI_PRIVATE_KEY se manda como Bearer:
 * Wompi anunció que las consultas sin autenticación (o con llave pública)
 * dejarán de responder (docs § Transacciones). Sin llave se sigue consultando
 * sin header, como hasta ahora.
 */
function headersApi(): HeadersInit {
  const key = wompiPrivateKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

/**
 * Consulta una transacción por id contra el API de Wompi (el id es no
 * adivinable). Se usa en el redirect de vuelta del checkout para confirmar el
 * pago sin esperar el webhook. null si falla o no existe.
 */
export async function consultarTransaccion(transactionId: string): Promise<TransaccionWompi | null> {
  const id = transactionId.trim()
  // Ids de Wompi: "{n}-{timestamp}-{n}" y variantes — solo caracteres seguros.
  if (!id || id.length > 100 || !/^[\w-]+$/.test(id)) return null
  try {
    const res = await fetch(`${wompiApiBase()}/transactions/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: headersApi(),
    })
    if (!res.ok) {
      console.error(`[wompi] consultarTransaccion(${id}) HTTP ${res.status}`)
      return null
    }
    const body = await res.json()
    const tx = body?.data
    if (!tx?.id || typeof tx.reference !== 'string') return null
    return tx as TransaccionWompi
  } catch (err) {
    console.error(`[wompi] consultarTransaccion(${id}) error:`, err)
    return null
  }
}

/**
 * Lista las transacciones de Wompi con una referencia dada
 * (`GET /v1/transactions?reference=…`, requiere la llave PRIVADA como Bearer).
 *
 * Es la base de la conciliación por cron (2026-10-11): la URL de eventos del
 * comercio en Wompi la ocupa la integración de Shopify (Conexa) y Wompi solo
 * admite UNA, así que el webhook de la app nunca recibe nada. Si el cliente
 * paga (típico PSE) y no vuelve al redirect, nadie registra el pago — el cron
 * pregunta por referencia y cierra el hueco.
 *
 * Devuelve [] si no hay llave privada, si la referencia no es nuestra o si el
 * API falla (el caller loguea; nunca lanza). Solo devuelve transacciones cuya
 * `reference` coincide EXACTAMENTE con la pedida (defensa contra matching
 * parcial del API).
 */
export async function listarTransaccionesPorReferencia(referencia: string): Promise<TransaccionWompi[]> {
  const key = wompiPrivateKey()
  if (!key) return []
  const ref = referencia.trim()
  if (!parseReferenciaPago(ref)) return []
  try {
    const res = await fetch(
      `${wompiApiBase()}/transactions?${new URLSearchParams({ reference: ref }).toString()}`,
      { cache: 'no-store', headers: { Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) {
      console.error(`[wompi] listarTransaccionesPorReferencia(${ref}) HTTP ${res.status}`)
      return []
    }
    const body = await res.json()
    const data: unknown = body?.data
    if (!Array.isArray(data)) return []
    return data.filter(
      (tx): tx is TransaccionWompi =>
        Boolean(tx) &&
        typeof (tx as TransaccionWompi).id === 'string' &&
        (tx as TransaccionWompi).reference === ref,
    )
  } catch (err) {
    console.error(`[wompi] listarTransaccionesPorReferencia(${ref}) error:`, err)
    return []
  }
}

// ─────────────────────────────────────────
// Devoluciones (2026-10-21)
// ─────────────────────────────────────────
// Dos mecanismos en el API de Wompi (docs.wompi.co § Transacciones y
// § Reembolsos V2), ambos SOLO con la llave PRIVADA como Bearer:
//
//   1. Reembolso V2 — POST /v1/refunds { transaction_id, amount_in_cents,
//      reason, reference }. Total o parcial, sobre cualquier transacción
//      APPROVED (tarjeta, PSE, Nequi, Bancolombia…). Es un objeto aparte: la
//      transacción original sigue APPROVED en Wompi; el reembolso trae su
//      propio estado (APPROVED | DECLINED | ERROR | CANCELLED).
//   2. Anulación — POST /v1/transactions/{id}/void. SOLO tarjeta y "solo
//      disponible para ciertos estados" (misma jornada, antes del cierre
//      del adquirente). Deja la transacción en VOIDED.
//
// La app intenta primero el reembolso; si Wompi responde que el endpoint no
// está disponible para el comercio (403/404/405) y el pago fue con tarjeta,
// cae a la anulación. Sin WOMPI_PRIVATE_KEY ambas son no-op con error claro.

/** Shape mínimo del reembolso V2 que devuelve Wompi. */
export interface ReembolsoWompi {
  id: string | number
  status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'CANCELLED' | string
  status_message?: string | null
  v2_refund_id?: string
  amount_in_cents: number
  transaction_id: string
  reference?: string
  created_at?: string
}

export type ResultadoApiWompi<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; httpStatus?: number }

/** Extrae un mensaje legible del body de error de Wompi (varias formas). */
function mensajeErrorWompi(body: unknown, fallback: string): string {
  const err = (body as { error?: { reason?: string; type?: string; messages?: unknown } } | null)?.error
  if (!err) return fallback
  const partes: string[] = []
  if (typeof err.reason === 'string') partes.push(err.reason)
  else if (typeof err.type === 'string') partes.push(err.type)
  if (err.messages && typeof err.messages === 'object') {
    for (const [campo, msgs] of Object.entries(err.messages as Record<string, unknown>)) {
      const lista = Array.isArray(msgs) ? msgs.join(', ') : String(msgs)
      partes.push(`${campo}: ${lista}`)
    }
  }
  return partes.length ? partes.join(' — ') : fallback
}

/**
 * Crea un reembolso (total o parcial) de una transacción APPROVED
 * (`POST /v1/refunds`, Reembolsos V2). Requiere WOMPI_PRIVATE_KEY.
 *
 * Devuelve el objeto del reembolso aunque su `status` no sea APPROVED: el
 * caller decide (DECLINED/ERROR = no se devolvió el dinero). Nunca lanza.
 *
 * @param amountInCents monto a devolver en CENTAVOS (Wompi), > 0.
 */
export async function crearReembolsoWompi(params: {
  transactionId: string
  amountInCents: number
  motivo?: string
  referencia?: string
}): Promise<ResultadoApiWompi<ReembolsoWompi>> {
  const key = wompiPrivateKey()
  if (!key) return { ok: false, error: 'Falta WOMPI_PRIVATE_KEY: la devolución por API no está habilitada' }
  const id = params.transactionId.trim()
  if (!id || id.length > 100 || !/^[\w-]+$/.test(id)) return { ok: false, error: 'Id de transacción inválido' }
  const cents = Math.round(params.amountInCents)
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: 'Monto a devolver inválido' }

  const body: Record<string, unknown> = { transaction_id: id, amount_in_cents: cents }
  if (params.motivo?.trim()) body.reason = params.motivo.trim().slice(0, 255)
  if (params.referencia?.trim()) body.reference = params.referencia.trim().slice(0, 255)

  try {
    const res = await fetch(`${wompiApiBase()}/refunds`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = mensajeErrorWompi(json, `Wompi respondió HTTP ${res.status} al reembolsar`)
      console.error(`[wompi] crearReembolsoWompi(${id}) HTTP ${res.status}: ${msg}`)
      return { ok: false, error: msg, httpStatus: res.status }
    }
    const data = (json as { data?: ReembolsoWompi } | null)?.data
    if (!data || typeof data.status !== 'string') {
      return { ok: false, error: 'Respuesta de Wompi sin datos del reembolso', httpStatus: res.status }
    }
    return { ok: true, data }
  } catch (err) {
    console.error(`[wompi] crearReembolsoWompi(${id}) error:`, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red con Wompi' }
  }
}

/**
 * Anula una transacción de TARJETA (`POST /v1/transactions/{id}/void`).
 * Solo funciona mientras el adquirente no haya cerrado la jornada; después
 * Wompi responde 422 y hay que usar el reembolso. Requiere WOMPI_PRIVATE_KEY.
 *
 * Devuelve la transacción tal como queda (status VOIDED si se anuló). La
 * respuesta anida la transacción en `data.transaction` (y en algunas
 * versiones directamente en `data`); se aceptan ambas formas. Nunca lanza.
 */
export async function anularTransaccionWompi(transactionId: string): Promise<ResultadoApiWompi<TransaccionWompi>> {
  const key = wompiPrivateKey()
  if (!key) return { ok: false, error: 'Falta WOMPI_PRIVATE_KEY: la anulación por API no está habilitada' }
  const id = transactionId.trim()
  if (!id || id.length > 100 || !/^[\w-]+$/.test(id)) return { ok: false, error: 'Id de transacción inválido' }
  try {
    const res = await fetch(`${wompiApiBase()}/transactions/${encodeURIComponent(id)}/void`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = mensajeErrorWompi(json, `Wompi respondió HTTP ${res.status} al anular`)
      console.error(`[wompi] anularTransaccionWompi(${id}) HTTP ${res.status}: ${msg}`)
      return { ok: false, error: msg, httpStatus: res.status }
    }
    const data = (json as { data?: { transaction?: TransaccionWompi; status?: string } & Partial<TransaccionWompi> } | null)?.data
    const tx = data?.transaction ?? (data?.id ? (data as TransaccionWompi) : null)
    if (!tx) {
      // 201 sin cuerpo: Wompi aceptó la anulación; el caller puede reconsultar.
      return { ok: true, data: { id, reference: '', status: typeof data?.status === 'string' ? data.status : 'VOIDED', amount_in_cents: 0, currency: 'COP' } }
    }
    return { ok: true, data: tx }
  } catch (err) {
    console.error(`[wompi] anularTransaccionWompi(${id}) error:`, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red con Wompi' }
  }
}

/** Shape del evento que Wompi manda al webhook (docs.wompi.co § Eventos). */
export interface EventoWompi {
  event: string
  data: { transaction?: TransaccionWompi } & Record<string, unknown>
  environment: string
  signature: { properties: string[]; checksum: string }
  timestamp: number
}

/** Lee una propiedad anidada tipo "transaction.id" del data del evento. */
function propiedadEvento(data: Record<string, unknown>, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, data)
}

/**
 * Verifica la autenticidad de un evento de Wompi.
 *
 * checksum = SHA-256( concat(valores de signature.properties en orden)
 *                     + timestamp + WOMPI_EVENTS_SECRET )
 *
 * Sin WOMPI_EVENTS_SECRET configurado devuelve false (nunca aceptar eventos
 * sin poder verificarlos).
 */
export function verificarChecksumEvento(evento: EventoWompi): boolean {
  const secreto = process.env.WOMPI_EVENTS_SECRET
  if (!secreto) return false
  if (!evento?.signature?.checksum || !Array.isArray(evento.signature.properties)) return false

  const concatenado = evento.signature.properties
    .map(p => {
      const v = propiedadEvento(evento.data ?? {}, p)
      return v === undefined || v === null ? '' : String(v)
    })
    .join('')

  const esperado = createHash('sha256')
    .update(`${concatenado}${evento.timestamp}${secreto}`)
    .digest('hex')

  return esperado.toLowerCase() === evento.signature.checksum.toLowerCase()
}
