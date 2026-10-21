import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 🔒 TESTS DE CONTRATO DEL MÓDULO DE PAGOS (2026-10-11)
 *
 * Fijan los invariantes de `registrarPagoWompi` documentados en
 * docs/mejoras-futuras/pagos-aislamiento/README.md § 6. Si uno de estos
 * tests cambia de resultado, cambió el contrato del recaudo: hay que saberlo
 * ANTES de desplegar. Corren contra un Supabase en memoria (tablas `pagos`,
 * `solicitudes_servicio`, `solicitud_eventos`) y WhatsApp mockeado.
 */

type Row = Record<string, unknown>

const { db, mockFrom, wa } = vi.hoisted(() => {
  const db: Record<string, Row[]> = { pagos: [], solicitudes_servicio: [], solicitud_eventos: [] }

  function from(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let lim: number | null = null
    const filters: ((r: Row) => boolean)[] = []
    const run = () => {
      const rows = db[table] ?? (db[table] = [])
      if (op === 'insert') {
        if (table === 'pagos' && rows.some(r => r.transaccion_id === payload.transaccion_id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        rows.push({ id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...payload })
        return { data: null, error: null }
      }
      const matched = rows.filter(r => filters.every(f => f(r)))
      if (op === 'update') {
        matched.forEach(r => Object.assign(r, payload))
        return { data: matched, error: null }
      }
      return { data: lim ? matched.slice(0, lim) : matched, error: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.order = () => b
    b.limit = (n: number) => { lim = n; return b }
    b.eq = (k: string, v: unknown) => { filters.push(r => r[k] === v); return b }
    b.neq = (k: string, v: unknown) => { filters.push(r => r[k] !== v); return b }
    b.is = (k: string, v: unknown) => { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return b }
    b.in = (k: string, arr: unknown[]) => { filters.push(r => arr.includes(r[k])); return b }
    b.insert = (row: Row) => { op = 'insert'; payload = row; return b }
    b.update = (obj: Row) => { op = 'update'; payload = obj; return b }
    b.single = async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } }
    b.maybeSingle = b.single
    b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(run()).then(res, rej)
    return b
  }

  const wa = {
    enviarAnticipoConfirmadoCliente: vi.fn(),
    enviarAnticipoConfirmadoTecnico: vi.fn(),
    enviarSaldoConfirmadoCliente: vi.fn(),
    enviarSaldoConfirmadoTecnico: vi.fn(),
    enviarAbonoConfirmadoTecnico: vi.fn(),
    enviarAbonoConfirmadoCliente: vi.fn(),
    enviarMensajeTexto: vi.fn(),
  }
  return { db, mockFrom: vi.fn(from), wa }
})

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/services/whatsapp.service', () => wa)

import { registrarPagoWompi, calcularMontoSaldo, cargarSolicitudPago } from '@/lib/services/pagos.service'
import type { TransaccionWompi } from '@/lib/wompi'

const SOL_ID = '6c7efe75-6309-432e-8809-61d2a5013e3e'

function solicitud(extra: Row = {}): Row {
  return {
    id: SOL_ID,
    estado: 'asignada',
    es_garantia: false,
    tipo_equipo: 'Lavadora',
    tipo_solicitud: 'Diagnóstico',
    cotizacion: null,
    recargo_weekend_aplicado: 0,
    anticipo_pagado_at: null,
    abono_pagado_at: null,
    saldo_pagado_at: null,
    horario_confirmado: 'jueves, 15 de octubre · 6pm-8pm',
    cliente_nombre: 'Henry Mosquera',
    monto_pagado_online: 0,
    ultimo_pago_at: null,
    ...extra,
  }
}

function tx(over: Partial<TransaccionWompi> = {}): TransaccionWompi {
  return {
    id: '1510245-1791684095-17537',
    reference: `anticipo-${SOL_ID}`,
    status: 'APPROVED',
    amount_in_cents: 4200000,
    currency: 'COP',
    payment_method_type: 'PSE',
    finalized_at: '2026-10-11T02:06:39.144Z',
    ...over,
  }
}

const sol = () => db.solicitudes_servicio[0]
const eventos = () => db.solicitud_eventos
const pagos = () => db.pagos

beforeEach(() => {
  db.pagos = []
  db.solicitudes_servicio = [solicitud()]
  db.solicitud_eventos = []
  for (const f of Object.values(wa)) f.mockReset()
  wa.enviarAnticipoConfirmadoCliente.mockResolvedValue({ ok: true })
  wa.enviarAnticipoConfirmadoTecnico.mockResolvedValue({ ok: true })
  wa.enviarSaldoConfirmadoCliente.mockResolvedValue({ ok: true })
  wa.enviarSaldoConfirmadoTecnico.mockResolvedValue({ ok: true })
  wa.enviarAbonoConfirmadoTecnico.mockResolvedValue({ ok: true })
  wa.enviarAbonoConfirmadoCliente.mockResolvedValue({ ok: true })
  wa.enviarMensajeTexto.mockResolvedValue(undefined)
})

describe('registrarPagoWompi — contrato', () => {
  it('1. referencia ajena (pedido de la tienda) no se registra ni falla', async () => {
    const r = await registrarPagoWompi(tx({ reference: 'rst7305icwclarukFEva9CKCN' }), 'webhook')
    expect(r.ok).toBe(true)
    expect(pagos()).toHaveLength(0)
    expect(wa.enviarAnticipoConfirmadoCliente).not.toHaveBeenCalled()
  })

  it('2. anticipo APPROVED: fila en pagos, resumen, anticipo_pagado_at, evento 💰 y avisos a cliente + técnico + equipo', async () => {
    const r = await registrarPagoWompi(tx(), 'redirect')
    expect(r).toMatchObject({ ok: true, confirmado: true, solicitudId: SOL_ID })

    expect(pagos()).toHaveLength(1)
    expect(pagos()[0]).toMatchObject({ tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: tx().id })
    expect((pagos()[0].raw as Row)._origen).toBe('redirect')

    expect(sol().anticipo_pagado_at).toBe('2026-10-11T02:06:39.144Z')
    expect(sol().monto_pagado_online).toBe(42000)
    expect(sol().ultimo_pago_at).toBe('2026-10-11T02:06:39.144Z')

    const ev = eventos().filter(e => e.tipo === 'pago_registrado')
    expect(ev).toHaveLength(1)
    expect(ev[0].motivo).toContain('Anticipo pagado')
    expect(ev[0].payload).toMatchObject({ tipo: 'anticipo', monto: 42000, origen: 'redirect', pasarela: 'wompi' })

    expect(wa.enviarAnticipoConfirmadoCliente).toHaveBeenCalledWith(SOL_ID, 42000)
    expect(wa.enviarAnticipoConfirmadoTecnico).toHaveBeenCalledWith(SOL_ID)
    expect(wa.enviarMensajeTexto).toHaveBeenCalledTimes(1) // alerta al equipo Baird
    expect(String(wa.enviarMensajeTexto.mock.calls[0][1])).toContain('ANTICIPO')
  })

  it('3. reintento con la MISMA transacción (webhook + redirect + cron) → una fila, un aviso', async () => {
    await registrarPagoWompi(tx(), 'redirect')
    const r2 = await registrarPagoWompi(tx(), 'webhook')
    const r3 = await registrarPagoWompi(tx(), 'conciliacion')
    expect(r2).toMatchObject({ ok: true, duplicado: true })
    expect(r3).toMatchObject({ ok: true, duplicado: true })
    expect(pagos()).toHaveLength(1)
    expect(wa.enviarAnticipoConfirmadoCliente).toHaveBeenCalledTimes(1)
    expect(eventos().filter(e => e.tipo === 'pago_registrado')).toHaveLength(1)
  })

  it('4. SEGUNDO pago del mismo momento (otra transacción) → se registra, NO se re-avisa, evento ⚠️ de duplicado', async () => {
    await registrarPagoWompi(tx(), 'redirect')
    const r = await registrarPagoWompi(tx({ id: '1510245-9999-1' }), 'conciliacion')
    expect(r).toMatchObject({ ok: true, duplicado: true, confirmado: false })
    expect(pagos()).toHaveLength(2)
    expect(sol().monto_pagado_online).toBe(84000) // el ledger sí suma: hay que devolver
    expect(wa.enviarAnticipoConfirmadoCliente).toHaveBeenCalledTimes(1)
    const dup = eventos().find(e => (e.payload as Row).pago_duplicado === true)
    expect(dup).toBeDefined()
    expect((dup!.payload as Row).requiere_intervencion_admin).toBe(true)
    expect(wa.enviarMensajeTexto).toHaveBeenCalledTimes(2) // alerta normal + alerta de duplicado
  })

  it('5. pago CORTO (menor al esperado) → queda en pagos, NO confirma, evento ⚠️, sin WhatsApp', async () => {
    const r = await registrarPagoWompi(tx({ amount_in_cents: 1000000 }), 'webhook')
    expect(r).toMatchObject({ ok: true, confirmado: false, error: 'Monto insuficiente' })
    expect(pagos()).toHaveLength(1)
    expect(sol().anticipo_pagado_at).toBeNull()
    expect(sol().monto_pagado_online).toBe(10000) // el dinero entró y se ve
    const ev = eventos()[0]
    expect((ev.payload as Row).requiere_intervencion_admin).toBe(true)
    expect(ev.motivo).toContain('esperado era $42000')
    expect(wa.enviarAnticipoConfirmadoCliente).not.toHaveBeenCalled()
  })

  it('6. DECLINED / PENDING → se registra para soporte, no confirma ni avisa', async () => {
    const r = await registrarPagoWompi(tx({ id: 'tx-declined', status: 'DECLINED' }), 'redirect')
    expect(r).toMatchObject({ ok: true, confirmado: false })
    expect(pagos()[0]).toMatchObject({ estado: 'DECLINED', pagado_at: null })
    expect(sol().anticipo_pagado_at).toBeNull()
    expect(sol().monto_pagado_online).toBe(0)
    expect(eventos()).toHaveLength(0)
    expect(wa.enviarAnticipoConfirmadoCliente).not.toHaveBeenCalled()
  })

  it('7. ABONO de repuestos → abono_pagado_at, avisa a cliente (con saldo restante) y técnico; segundo abono no re-avisa', async () => {
    db.solicitudes_servicio = [solicitud({
      estado: 'en_proceso',
      anticipo_pagado_at: '2026-10-09T20:49:38Z',
      cotizacion: { total: 220750, aprobado_at: '2026-10-09T21:23:46Z', productos_necesarios: [{ sku: 'WP3363394V' }] },
    })]
    db.pagos = [{ id: 'p0', solicitud_id: SOL_ID, tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: 'tx-ant', pagado_at: '2026-10-09T20:49:38Z' }]

    const r = await registrarPagoWompi(tx({ id: 'tx-abono', reference: `abono-${SOL_ID}`, amount_in_cents: 8937500, payment_method_type: 'CARD' }), 'redirect')
    expect(r).toMatchObject({ ok: true, confirmado: true })
    expect(sol().abono_pagado_at).toBe('2026-10-11T02:06:39.144Z')
    expect(sol().monto_pagado_online).toBe(131375)
    // saldo restante = 220.750 − 42.000 − 89.375
    expect(wa.enviarAbonoConfirmadoCliente).toHaveBeenCalledWith(SOL_ID, 89375, 89375)
    expect(wa.enviarAbonoConfirmadoTecnico).toHaveBeenCalledWith(SOL_ID, 89375)

    const r2 = await registrarPagoWompi(tx({ id: 'tx-abono-2', reference: `abono-${SOL_ID}`, amount_in_cents: 8937500 }), 'redirect')
    expect(r2).toMatchObject({ duplicado: true })
    expect(wa.enviarAbonoConfirmadoCliente).toHaveBeenCalledTimes(1)
  })

  it('8. SALDO: esperado = total − acreditados; cubre → saldo_pagado_at + avisos; corto → ⚠️ sin confirmar', async () => {
    db.solicitudes_servicio = [solicitud({
      estado: 'completada',
      anticipo_pagado_at: '2026-10-09T20:49:38Z',
      cotizacion: { total: 136750, aprobado_at: '2026-08-25T20:59:39Z', productos_necesarios: [] },
    })]
    db.pagos = [{ id: 'p0', solicitud_id: SOL_ID, tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: 'tx-ant', pagado_at: '2026-10-09T20:49:38Z' }]
    expect(await calcularMontoSaldo((await cargarSolicitudPago(SOL_ID))!)).toBe(94750)

    const corto = await registrarPagoWompi(tx({ id: 'tx-saldo-corto', reference: `saldo-${SOL_ID}`, amount_in_cents: 5000000 }), 'redirect')
    expect(corto).toMatchObject({ confirmado: false, error: 'Monto insuficiente' })
    expect(sol().saldo_pagado_at).toBeNull()

    // CONTRATO VIGENTE (desde 2026-08-19): un pago corto de SALDO se ve en el
    // resumen (el ledger suma todo) pero NO se acredita contra el saldo —
    // `calcularMontoSaldo` solo descuenta anticipos y abonos. El link del
    // saldo sigue cobrando los 94.750 completos; el admin resuelve el sobrante
    // a mano. Por el checkout firmado un pago corto solo puede entrar por una
    // vía manual, así que se documenta en vez de cambiarlo.
    expect(sol().monto_pagado_online).toBe(92000)
    expect(await calcularMontoSaldo((await cargarSolicitudPago(SOL_ID))!)).toBe(94750)

    const ok = await registrarPagoWompi(tx({ id: 'tx-saldo', reference: `saldo-${SOL_ID}`, amount_in_cents: 9475000 }), 'webhook')
    expect(ok).toMatchObject({ ok: true, confirmado: true })
    expect(sol().saldo_pagado_at).toBe('2026-10-11T02:06:39.144Z')
    expect(sol().monto_pagado_online).toBe(186750)
    expect(wa.enviarSaldoConfirmadoCliente).toHaveBeenCalledWith(SOL_ID, 94750)
    expect(wa.enviarSaldoConfirmadoTecnico).toHaveBeenCalledWith(SOL_ID, 94750)
  })

  it('9. un fallo de WhatsApp NUNCA revierte el registro: queda evento ⚠️ con a quién no se avisó', async () => {
    wa.enviarAnticipoConfirmadoCliente.mockResolvedValue({ ok: false, error: 'Meta 131047: fuera de ventana' })
    wa.enviarAnticipoConfirmadoTecnico.mockRejectedValue(new Error('red caída'))
    wa.enviarMensajeTexto.mockRejectedValue(new Error('ventana 24h cerrada'))

    const r = await registrarPagoWompi(tx(), 'conciliacion')
    expect(r).toMatchObject({ ok: true, confirmado: true })
    expect(sol().anticipo_pagado_at).not.toBeNull()
    expect(pagos()).toHaveLength(1)
    const aviso = eventos().find(e => Array.isArray((e.payload as Row).fallas_aviso))
    expect(aviso).toBeDefined()
    expect(aviso!.motivo).toContain('cliente')
    expect(aviso!.motivo).toContain('técnico')
  })

  it('10. solicitud inexistente → ok:false y nada escrito', async () => {
    db.solicitudes_servicio = []
    const r = await registrarPagoWompi(tx(), 'webhook')
    expect(r.ok).toBe(false)
    expect(pagos()).toHaveLength(0)
  })
})

describe('registrarPagoWompi — código de descuento (2026-10-19)', () => {
  const conDescuento = {
    estado: 'completada',
    anticipo_pagado_at: '2026-10-09T20:49:38Z',
    cotizacion: { total: 200000, aprobado_at: '2026-10-19T10:00:00Z', productos_necesarios: [] },
    descuento_codigo: 'PROMO10',
    descuento_tipo: 'porcentaje',
    descuento_valor: '10.00',
  }

  it('11. SALDO con código: esperado = total − descuento − acreditados; el abono no cambia', async () => {
    db.solicitudes_servicio = [solicitud(conDescuento)]
    db.pagos = [{ id: 'p0', solicitud_id: SOL_ID, tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: 'tx-ant', pagado_at: '2026-10-09T20:49:38Z' }]
    const s = (await cargarSolicitudPago(SOL_ID))!
    expect(await calcularMontoSaldo(s)).toBe(138000) // 200.000 − 20.000 − 42.000

    // Un pago por el saldo BRUTO viejo (158.000) sigue aceptándose (cubre el esperado).
    const ok = await registrarPagoWompi(tx({ id: 'tx-saldo-desc', reference: `saldo-${SOL_ID}`, amount_in_cents: 13800000 }), 'webhook')
    expect(ok).toMatchObject({ ok: true, confirmado: true })
    expect(sol().saldo_pagado_at).toBe('2026-10-11T02:06:39.144Z')
    expect(wa.enviarSaldoConfirmadoCliente).toHaveBeenCalledWith(SOL_ID, 138000)
  })

  it('12. SALDO corto frente al neto → ⚠️ sin confirmar (el descuento no abre la puerta a pagar menos)', async () => {
    db.solicitudes_servicio = [solicitud(conDescuento)]
    db.pagos = [{ id: 'p0', solicitud_id: SOL_ID, tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: 'tx-ant', pagado_at: '2026-10-09T20:49:38Z' }]
    const corto = await registrarPagoWompi(tx({ id: 'tx-saldo-corto-desc', reference: `saldo-${SOL_ID}`, amount_in_cents: 13000000 }), 'redirect')
    expect(corto).toMatchObject({ confirmado: false, error: 'Monto insuficiente' })
    expect(sol().saldo_pagado_at).toBeNull()
  })

  it('13. abono de repuestos con código: 50% del saldo BRUTO (el descuento va solo al último pago)', async () => {
    db.solicitudes_servicio = [solicitud({
      ...conDescuento,
      estado: 'en_proceso',
      cotizacion: { total: 200000, aprobado_at: '2026-10-19T10:00:00Z', productos_necesarios: [{ sku: 'X', cantidad: 1 }] },
    })]
    db.pagos = [{ id: 'p0', solicitud_id: SOL_ID, tipo: 'anticipo', estado: 'APPROVED', monto: 42000, transaccion_id: 'tx-ant', pagado_at: '2026-10-09T20:49:38Z' }]
    const { calcularMontoAbonoRepuestos } = await import('@/lib/services/pagos.service')
    expect(await calcularMontoAbonoRepuestos((await cargarSolicitudPago(SOL_ID))!)).toBe(79000) // 50% × 158.000
  })
})
