import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { crearReembolsoWompi, anularTransaccionWompi } from '@/lib/wompi'

/**
 * Devoluciones por API (2026-10-21): reembolso V2 (`POST /v1/refunds`) y
 * anulación de tarjeta (`POST /v1/transactions/{id}/void`). Ambas SOLO con
 * la llave privada; sin ella no se llama a Wompi.
 */

const ENV_KEYS = ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY'] as const
const envBackup: Record<string, string | undefined> = {}
const TX = '1510245-1791684095-17537'

function mockFetch(body: unknown, status = 201) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k]
  process.env.WOMPI_PUBLIC_KEY = 'pub_prod_x'
  process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k]
    else process.env[k] = envBackup[k]
  }
  vi.unstubAllGlobals()
})

describe('crearReembolsoWompi', () => {
  it('sin llave privada no llama al API y explica por qué', async () => {
    delete process.env.WOMPI_PRIVATE_KEY
    const fetchMock = mockFetch({ data: { status: 'APPROVED' } })
    const r = await crearReembolsoWompi({ transactionId: TX, amountInCents: 4200000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('WOMPI_PRIVATE_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza id o monto inválidos sin llamar al API', async () => {
    const fetchMock = mockFetch({})
    expect((await crearReembolsoWompi({ transactionId: '../x', amountInCents: 100 })).ok).toBe(false)
    expect((await crearReembolsoWompi({ transactionId: TX, amountInCents: 0 })).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POST /v1/refunds con Bearer privada y el contrato V2; devuelve data', async () => {
    const fetchMock = mockFetch({
      data: { id: 1523, status: 'APPROVED', v2_refund_id: 'v2_refund_abc', amount_in_cents: 4200000, transaction_id: TX },
    })
    const r = await crearReembolsoWompi({
      transactionId: TX,
      amountInCents: 4200000,
      motivo: 'Servicio cancelado',
      referencia: 'devolucion-anticipo-6c7efe75-6309-432e-8809-61d2a5013e3e',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toMatchObject({ status: 'APPROVED', v2_refund_id: 'v2_refund_abc' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://production.wompi.co/v1/refunds')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer prv_prod_x')
    expect(JSON.parse(String(init.body))).toEqual({
      transaction_id: TX,
      amount_in_cents: 4200000,
      reason: 'Servicio cancelado',
      reference: 'devolucion-anticipo-6c7efe75-6309-432e-8809-61d2a5013e3e',
    })
  })

  it('llave de prueba → sandbox', async () => {
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'
    const fetchMock = mockFetch({ data: { status: 'APPROVED', amount_in_cents: 1, transaction_id: TX } })
    await crearReembolsoWompi({ transactionId: TX, amountInCents: 1 })
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://sandbox.wompi.co/v1/refunds')
  })

  it('un reembolso DECLINED se devuelve tal cual (el caller decide)', async () => {
    mockFetch({ data: { status: 'DECLINED', status_message: 'Tiempo límite sin encontrar fondos excedido', amount_in_cents: 1, transaction_id: TX } })
    const r = await crearReembolsoWompi({ transactionId: TX, amountInCents: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.status).toBe('DECLINED')
  })

  it('error HTTP → ok:false con el mensaje de Wompi y el status', async () => {
    mockFetch({ error: { type: 'INPUT_VALIDATION_ERROR', messages: { amount_in_cents: ['Excede el monto de la transacción'] } } }, 422)
    const r = await crearReembolsoWompi({ transactionId: TX, amountInCents: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.httpStatus).toBe(422)
      expect(r.error).toContain('INPUT_VALIDATION_ERROR')
      expect(r.error).toContain('Excede el monto')
    }
  })

  it('fallo de red → ok:false, nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const r = await crearReembolsoWompi({ transactionId: TX, amountInCents: 1 })
    expect(r).toMatchObject({ ok: false, error: 'ECONNRESET' })
  })
})

describe('anularTransaccionWompi', () => {
  it('sin llave privada no llama al API', async () => {
    delete process.env.WOMPI_PRIVATE_KEY
    const fetchMock = mockFetch({})
    expect((await anularTransaccionWompi(TX)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POST /v1/transactions/{id}/void con Bearer privada; acepta la transacción anidada', async () => {
    const fetchMock = mockFetch({ data: { status: 'VOIDED', transaction: { id: TX, reference: 'anticipo-x', status: 'VOIDED', amount_in_cents: 1, currency: 'COP' } } })
    const r = await anularTransaccionWompi(TX)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toMatchObject({ id: TX, status: 'VOIDED' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://production.wompi.co/v1/transactions/${TX}/void`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer prv_prod_x')
  })

  it('201 sin cuerpo → ok con status VOIDED (Wompi aceptó la anulación)', async () => {
    mockFetch(null)
    const r = await anularTransaccionWompi(TX)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.status).toBe('VOIDED')
  })

  it('422 (jornada cerrada / no es tarjeta) → ok:false con status', async () => {
    mockFetch({ error: { type: 'INPUT_VALIDATION_ERROR', reason: 'La transacción no puede ser anulada' } }, 422)
    const r = await anularTransaccionWompi(TX)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.httpStatus).toBe(422)
      expect(r.error).toContain('no puede ser anulada')
    }
  })
})
