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
 *   WOMPI_PRIVATE_KEY       prv_prod_… (opcional hoy — reservada para API transaccional futura)
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

/**
 * Consulta una transacción por id contra el API de Wompi (endpoint público —
 * el id es no adivinable). Se usa en el redirect de vuelta del checkout para
 * confirmar el pago sin esperar el webhook. null si falla o no existe.
 */
export async function consultarTransaccion(transactionId: string): Promise<TransaccionWompi | null> {
  const id = transactionId.trim()
  // Ids de Wompi: "{n}-{timestamp}-{n}" y variantes — solo caracteres seguros.
  if (!id || id.length > 100 || !/^[\w-]+$/.test(id)) return null
  try {
    const res = await fetch(`${wompiApiBase()}/transactions/${encodeURIComponent(id)}`, {
      cache: 'no-store',
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
