import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import {
  wompiHabilitado,
  referenciaPago,
  parseReferenciaPago,
  construirCheckoutUrl,
  verificarChecksumEvento,
  type EventoWompi,
} from '@/lib/wompi'
import {
  montoAnticipo,
  saldoPendiente,
  precioRepuestoTecnico,
  DESCUENTO_REPUESTO_TECNICO,
  ANTICIPO_PORCENTAJE,
  ABONO_REPUESTOS_PORCENTAJE,
  montoAbonoRepuestos,
  cotizacionTieneRepuestos,
} from '@/lib/constants/pagos'

const ENV_KEYS = ['WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'] as const
const envBackup: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k]
    else process.env[k] = envBackup[k]
  }
})

describe('wompiHabilitado', () => {
  it('false sin env vars (kill-switch)', () => {
    delete process.env.WOMPI_PUBLIC_KEY
    delete process.env.WOMPI_INTEGRITY_SECRET
    expect(wompiHabilitado()).toBe(false)
  })

  it('true con llave pública + secreto de integridad', () => {
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'
    process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_x'
    expect(wompiHabilitado()).toBe(true)
  })
})

describe('referencias de pago', () => {
  const uuid = '0bafe18a-1234-4abc-9def-112233445566'

  it('roundtrip anticipo', () => {
    const ref = referenciaPago('anticipo', uuid)
    expect(ref).toBe(`anticipo-${uuid}`)
    expect(parseReferenciaPago(ref)).toEqual({ tipo: 'anticipo', solicitudId: uuid })
  })

  it('roundtrip saldo', () => {
    expect(parseReferenciaPago(referenciaPago('saldo', uuid))).toEqual({ tipo: 'saldo', solicitudId: uuid })
  })

  it('roundtrip abono (repuestos, 2026-08-25)', () => {
    expect(parseReferenciaPago(referenciaPago('abono', uuid))).toEqual({ tipo: 'abono', solicitudId: uuid })
  })

  it('rechaza referencias ajenas (pedidos de la tienda, basura)', () => {
    expect(parseReferenciaPago('pedido-shopify-1234')).toBeNull()
    expect(parseReferenciaPago('anticipo-no-es-uuid')).toBeNull()
    expect(parseReferenciaPago('')).toBeNull()
    expect(parseReferenciaPago(null)).toBeNull()
    expect(parseReferenciaPago(42)).toBeNull()
  })
})

describe('construirCheckoutUrl', () => {
  it('null sin configuración (kill-switch)', () => {
    delete process.env.WOMPI_PUBLIC_KEY
    delete process.env.WOMPI_INTEGRITY_SECRET
    expect(construirCheckoutUrl({ referencia: 'x', montoCOP: 1000, redirectUrl: 'https://a.co' })).toBeNull()
  })

  it('null con monto inválido', () => {
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'
    process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_x'
    expect(construirCheckoutUrl({ referencia: 'x', montoCOP: 0, redirectUrl: 'https://a.co' })).toBeNull()
    expect(construirCheckoutUrl({ referencia: 'x', montoCOP: -5, redirectUrl: 'https://a.co' })).toBeNull()
    expect(construirCheckoutUrl({ referencia: 'x', montoCOP: NaN, redirectUrl: 'https://a.co' })).toBeNull()
  })

  it('firma de integridad igual al vector oficial de la documentación de Wompi', () => {
    // docs.wompi.co § Widget & Checkout Web:
    //   "sk8-438k4-xmxm392-sn2m" + "2490000" + "COP" + secreto
    //   → 37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5
    process.env.WOMPI_PUBLIC_KEY = 'pub_prod_Kw4aC0rZVgLZQn209NbEKPuXLzBD28Zx'
    process.env.WOMPI_INTEGRITY_SECRET = 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6'

    const url = construirCheckoutUrl({
      referencia: 'sk8-438k4-xmxm392-sn2m',
      montoCOP: 24900, // 2.490.000 centavos
      redirectUrl: 'https://lineablanca.bairdservice.com/pago/anticipo/abc',
    })
    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.origin + parsed.pathname).toBe('https://checkout.wompi.co/p/')
    expect(parsed.searchParams.get('amount-in-cents')).toBe('2490000')
    expect(parsed.searchParams.get('currency')).toBe('COP')
    expect(parsed.searchParams.get('reference')).toBe('sk8-438k4-xmxm392-sn2m')
    expect(parsed.searchParams.get('signature:integrity')).toBe(
      '37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5',
    )
    expect(parsed.searchParams.get('redirect-url')).toBe('https://lineablanca.bairdservice.com/pago/anticipo/abc')
  })
})

describe('verificarChecksumEvento', () => {
  const SECRETO = 'test_events_secreto123'

  function eventoFirmado(overrides?: Partial<EventoWompi['data']>): EventoWompi {
    const data = {
      transaction: {
        id: '1234-1610641025-49201',
        status: 'APPROVED',
        amount_in_cents: 4490000,
        reference: 'anticipo-0bafe18a-1234-4abc-9def-112233445566',
        currency: 'COP',
      },
      ...overrides,
    } as EventoWompi['data']
    const timestamp = 1530291411
    const checksum = createHash('sha256')
      .update(`${data.transaction!.id}${data.transaction!.status}${data.transaction!.amount_in_cents}${timestamp}${SECRETO}`)
      .digest('hex')
    return {
      event: 'transaction.updated',
      data,
      environment: 'test',
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum,
      },
      timestamp,
    }
  }

  it('acepta un evento con checksum válido', () => {
    process.env.WOMPI_EVENTS_SECRET = SECRETO
    expect(verificarChecksumEvento(eventoFirmado())).toBe(true)
  })

  it('rechaza un evento manipulado (monto alterado tras firmar)', () => {
    process.env.WOMPI_EVENTS_SECRET = SECRETO
    const evento = eventoFirmado()
    evento.data.transaction!.amount_in_cents = 100
    expect(verificarChecksumEvento(evento)).toBe(false)
  })

  it('rechaza todo si WOMPI_EVENTS_SECRET no está configurado', () => {
    delete process.env.WOMPI_EVENTS_SECRET
    expect(verificarChecksumEvento(eventoFirmado())).toBe(false)
  })
})

describe('montos', () => {
  it('anticipo = 50% del precio al cliente', () => {
    expect(ANTICIPO_PORCENTAJE).toBe(0.5)
    expect(montoAnticipo(84000)).toBe(42000)
    expect(montoAnticipo(134470)).toBe(67235)
    expect(montoAnticipo(0)).toBe(0)
    expect(montoAnticipo(NaN)).toBe(0)
  })

  it('saldo pendiente = total − anticipos, nunca negativo', () => {
    expect(saldoPendiente(136_750, 68_375)).toBe(68_375)
    expect(saldoPendiente(2_000, 1_000)).toBe(1_000)
    expect(saldoPendiente(100_000, 0)).toBe(100_000)
    expect(saldoPendiente(100_000, 150_000)).toBe(0)   // sobrepago → 0, ajuste manual
    expect(saldoPendiente(0, 5_000)).toBe(0)
    expect(saldoPendiente(NaN, 1_000)).toBe(0)
  })

  it('abono de repuestos = 50% del saldo pendiente', () => {
    expect(ABONO_REPUESTOS_PORCENTAJE).toBe(0.5)
    expect(montoAbonoRepuestos(136_750)).toBe(68_375)
    expect(montoAbonoRepuestos(68_375)).toBe(34_188)   // Math.round
    expect(montoAbonoRepuestos(0)).toBe(0)
    expect(montoAbonoRepuestos(NaN)).toBe(0)
  })

  it('cotizacionTieneRepuestos detecta las tres formas del JSONB', () => {
    expect(cotizacionTieneRepuestos({ productos_necesarios: [{ sku: 'X' }] })).toBe(true)
    expect(cotizacionTieneRepuestos({ repuestos: 50_000 })).toBe(true)
    expect(cotizacionTieneRepuestos({ repuestos_total_admin: 80_000 })).toBe(true)
    expect(cotizacionTieneRepuestos({ productos_necesarios: [], repuestos: 0, repuestos_total_admin: 0 })).toBe(false)
    expect(cotizacionTieneRepuestos({})).toBe(false)
    expect(cotizacionTieneRepuestos(null)).toBe(false)
    expect(cotizacionTieneRepuestos(undefined)).toBe(false)
  })

  it('precio de repuesto para el técnico = público − 15%', () => {
    expect(DESCUENTO_REPUESTO_TECNICO).toBe(0.15)
    expect(precioRepuestoTecnico(100000)).toBe(85000)
    expect(precioRepuestoTecnico(37900)).toBe(32215)
    expect(precioRepuestoTecnico(null)).toBeNull()
    expect(precioRepuestoTecnico(0)).toBeNull()
  })
})
