import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  listarTransaccionesPorReferencia,
  wompiConciliacionHabilitada,
  consultarTransaccion,
} from '@/lib/wompi'

/**
 * Conciliación por referencia (2026-10-11): la URL de eventos de Wompi la
 * ocupa Shopify, así que el cron pregunta por referencia con la llave privada.
 */

const ENV_KEYS = ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY'] as const
const envBackup: Record<string, string | undefined> = {}
const REF = 'anticipo-6c7efe75-6309-432e-8809-61d2a5013e3e'

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => ({
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
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k]
    else process.env[k] = envBackup[k]
  }
  vi.unstubAllGlobals()
})

describe('wompiConciliacionHabilitada', () => {
  it('false sin llave privada (kill-switch del cron)', () => {
    delete process.env.WOMPI_PRIVATE_KEY
    expect(wompiConciliacionHabilitada()).toBe(false)
  })

  it('true con llave privada', () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
    expect(wompiConciliacionHabilitada()).toBe(true)
  })
})

describe('listarTransaccionesPorReferencia', () => {
  it('sin llave privada no llama al API y devuelve []', async () => {
    delete process.env.WOMPI_PRIVATE_KEY
    const fetchMock = mockFetch({ data: [{ id: 'x', reference: REF, status: 'APPROVED' }] })
    expect(await listarTransaccionesPorReferencia(REF)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('referencia ajena (no es {tipo}-{uuid}) no consulta', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
    const fetchMock = mockFetch({ data: [] })
    expect(await listarTransaccionesPorReferencia('rst7305icwclarukFEva9CKCN')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('manda Bearer con la llave privada y filtra por referencia exacta', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_secreta'
    const fetchMock = mockFetch({
      data: [
        { id: '1510245-1-1', reference: REF, status: 'APPROVED', amount_in_cents: 4200000, currency: 'COP' },
        { id: '1510245-2-2', reference: `${REF}-otra`, status: 'APPROVED', amount_in_cents: 1, currency: 'COP' },
        { id: 7, reference: REF, status: 'APPROVED' },
      ],
    })
    const txs = await listarTransaccionesPorReferencia(REF)
    expect(txs.map(t => t.id)).toEqual(['1510245-1-1'])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://production.wompi.co/v1/transactions?reference=${REF}`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer prv_prod_secreta')
  })

  it('usa sandbox cuando la llave pública es de pruebas', async () => {
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_x'
    const fetchMock = mockFetch({ data: [] })
    await listarTransaccionesPorReferencia(REF)
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url.startsWith('https://sandbox.wompi.co/v1/transactions?')).toBe(true)
  })

  it('HTTP no-2xx o body sin array → [] sin lanzar', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
    mockFetch({ error: 'unauthorized' }, 401)
    expect(await listarTransaccionesPorReferencia(REF)).toEqual([])
    mockFetch({ data: { id: 'no-es-array' } })
    expect(await listarTransaccionesPorReferencia(REF)).toEqual([])
  })

  it('fetch que lanza → [] sin propagar', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red caída') }))
    expect(await listarTransaccionesPorReferencia(REF)).toEqual([])
  })
})

describe('consultarTransaccion con llave privada', () => {
  it('agrega Bearer si hay WOMPI_PRIVATE_KEY (comportamiento previo intacto sin ella)', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_x'
    const fetchMock = mockFetch({ data: { id: '1510245-9-9', reference: REF, status: 'APPROVED' } })
    const tx = await consultarTransaccion('1510245-9-9')
    expect(tx?.id).toBe('1510245-9-9')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer prv_prod_x')

    delete process.env.WOMPI_PRIVATE_KEY
    const fetchSinKey = mockFetch({ data: { id: '1510245-9-9', reference: REF, status: 'APPROVED' } })
    await consultarTransaccion('1510245-9-9')
    const [, init2] = fetchSinKey.mock.calls[0] as unknown as [string, RequestInit]
    expect(init2.headers).toEqual({})
  })
})
