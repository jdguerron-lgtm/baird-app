/**
 * Cliente mínimo de la API de Siigo (https://api.siigo.com/v1) — 2026-10-22.
 *
 * Solo lo necesario para precargar una COTIZACIÓN con los datos del cliente:
 * autenticar, buscar/crear el tercero y crear la cotización. Kill-switch: sin
 * `SIIGO_USERNAME` + `SIIGO_ACCESS_KEY` todo queda apagado (`siigoConfigurado()`).
 * Doc: docs/FACTURACION.md § 12.
 */

import { SIIGO } from '@/lib/utils/facturacion'

const BASE = 'https://api.siigo.com'

function partnerId(): string {
  return (process.env.SIIGO_PARTNER_ID ?? '').replace(/[^A-Za-z0-9]/g, '') || 'BairdApp'
}

export function siigoConfigurado(): boolean {
  return Boolean(process.env.SIIGO_USERNAME && process.env.SIIGO_ACCESS_KEY)
}

let tokenCache: { token: string; expiraMs: number } | null = null

async function token(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraMs) return tokenCache.token
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': partnerId() },
    body: JSON.stringify({ username: process.env.SIIGO_USERNAME, access_key: process.env.SIIGO_ACCESS_KEY }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new SiigoError(`Siigo auth falló (${res.status})`, res.status)
  tokenCache = { token: data.access_token, expiraMs: Date.now() + 20 * 3600 * 1000 }
  return data.access_token
}

export class SiigoError extends Error {
  constructor(message: string, public status: number, public detalle?: unknown) {
    super(message)
  }
}

async function siigo<T>(path: string, init: { method?: string; body?: unknown } = {}, reintento = true): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', 'Partner-Id': partnerId() },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 401 && reintento) {
    tokenCache = null
    return siigo<T>(path, init, false)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { Errors?: Array<{ Message?: string }> }).Errors?.map((e) => e.Message).filter(Boolean).join('; ')
    throw new SiigoError(`Siigo ${res.status}: ${msg || 'error'}`, res.status, data)
  }
  return data as T
}

/** Vendedor de la cotización: env `SIIGO_SELLER_ID` o Henry Mosquera (808). */
export function vendedorCotizacionId(): number {
  const env = Number(process.env.SIIGO_SELLER_ID)
  return Number.isFinite(env) && env > 0 ? env : SIIGO.SELLER_COTIZACION
}

/** Id del tipo de comprobante "Cotización": env `SIIGO_COTIZACION_DOC_ID` o el primero activo de tipo C. */
export async function documentoCotizacionId(): Promise<number> {
  const env = Number(process.env.SIIGO_COTIZACION_DOC_ID)
  if (Number.isFinite(env) && env > 0) return env
  const docs = await siigo<Array<{ id: number; active?: boolean }>>('/document-types?type=C')
  const doc = docs.find((d) => d.active !== false) ?? docs[0]
  if (!doc) throw new SiigoError('Siigo no tiene un tipo de comprobante de cotización (type=C)', 404)
  return doc.id
}

/** true si el tercero ya existe en Siigo. */
export async function existeCliente(identificacion: string): Promise<boolean> {
  const r = await siigo<{ results?: unknown[] }>(`/customers?identification=${encodeURIComponent(identificacion)}`)
  return (r.results?.length ?? 0) > 0
}

export async function crearCliente(payload: unknown): Promise<void> {
  await siigo('/customers', { method: 'POST', body: payload })
}

export interface CotizacionCreada { id: string; name: string }

export async function crearCotizacion(payload: unknown): Promise<CotizacionCreada> {
  const r = await siigo<{ id: string; name?: string; number?: number }>('/quotations', { method: 'POST', body: payload })
  return { id: r.id, name: r.name ?? String(r.number ?? r.id) }
}
