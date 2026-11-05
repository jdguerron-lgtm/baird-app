import { describe, expect, it, vi } from 'vitest'

/**
 * Cobros fuera del camino feliz (2026-11-05, decisión de Juan):
 *   - servicio sin reparación tras la visita → se cobra el diagnóstico completo;
 *   - cancelación antes de la visita con anticipo → devolución pendiente (manual);
 *   - recordatorios de cobro: 24 h sin pago, máximo 2, alerta al equipo en el 2.º.
 */

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/services/whatsapp.service', () => ({
  enviarPagoSaldoCliente: vi.fn(),
  enviarAbonoRepuestosCliente: vi.fn(),
  enviarCobroAnticipoCliente: vi.fn(),
  enviarMensajeTexto: vi.fn(),
}))
vi.mock('@/lib/services/pagos.service', () => ({
  cargarSolicitudPago: vi.fn(),
  calcularMontoSaldo: vi.fn(),
  calcularMontoAbonoRepuestos: vi.fn(),
  calcularMontoAnticipo: vi.fn(),
}))

import {
  cobroDiagnosticoAplica,
  totalClienteParaCobro,
  etapaPagoCliente,
  faltanteCobroCliente,
  pasosPagoCliente,
  type SolicitudParaEtapaPago,
} from '@/lib/constants/pago-cliente'
import { decidirRecordatorio, RECORDATORIO_COBRO_MAX } from '@/lib/services/cobros.service'

const base: SolicitudParaEtapaPago = {
  es_garantia: false,
  estado: 'reparacion_rechazada',
  tipo_solicitud: 'Diagnóstico',
  tipo_equipo: 'Lavadora',
  tecnico_asignado_id: 'tec-1',
  cotizacion: null,
  recargo_weekend_aplicado: 0,
  anticipo_pagado_at: '2026-10-28T13:15:00Z',
  abono_pagado_at: null,
  saldo_pagado_at: null,
  monto_pagado_online: 42000,
  diagnosticado_at: '2026-10-28T16:04:00Z',
}

describe('cobroDiagnosticoAplica — cuándo se cobra la visita completa', () => {
  it('aplica en los tres cierres sin reparación y en la cancelación posterior al diagnóstico', () => {
    for (const estado of ['reparacion_rechazada', 'finalizado_sin_reparacion', 'cotizacion_rechazada', 'cancelada']) {
      expect(cobroDiagnosticoAplica({ ...base, estado })).toBe(true)
    }
  })

  it('NO aplica sin diagnóstico registrado, en garantía, en precio fijo ni con el servicio vivo', () => {
    expect(cobroDiagnosticoAplica({ ...base, diagnosticado_at: null })).toBe(false)
    expect(cobroDiagnosticoAplica({ ...base, diagnosticado_at: undefined })).toBe(false)
    expect(cobroDiagnosticoAplica({ ...base, es_garantia: true })).toBe(false)
    expect(cobroDiagnosticoAplica({ ...base, tipo_solicitud: 'Mantenimiento' })).toBe(false)
    expect(cobroDiagnosticoAplica({ ...base, estado: 'cotizacion_enviada' })).toBe(false)
    expect(cobroDiagnosticoAplica({ ...base, estado: 'completada' })).toBe(false)
  })
})

describe('totalClienteParaCobro — tarifa de diagnóstico en cierres sin reparación', () => {
  it('Lina Paola Vasquez (de31afee): rechazó reparar → total $84.000, no 0', () => {
    expect(totalClienteParaCobro(base)).toBe(84000)
  })

  it('cotización rechazada: manda la tarifa de diagnóstico, no el total de la cotización', () => {
    expect(totalClienteParaCobro({ ...base, estado: 'cotizacion_rechazada', cotizacion: { total: 843388 } })).toBe(84000)
  })

  it('incluye el recargo finde/festivo con IVA si la visita cayó en finde', () => {
    // recargo bruto $6.000 → cliente $7.140 (×1.19)
    expect(totalClienteParaCobro({ ...base, recargo_weekend_aplicado: 6000 })).toBe(91140)
  })

  it('sin diagnóstico el cierre no cobra nada (comportamiento anterior)', () => {
    expect(totalClienteParaCobro({ ...base, diagnosticado_at: null })).toBe(0)
  })
})

describe('etapaPagoCliente — diagnóstico pendiente y devolución pendiente', () => {
  it('anticipo pagado + cierre sin reparación → diagnostico_pendiente por los $42.000 restantes', () => {
    const r = etapaPagoCliente(base)
    expect(r).toMatchObject({ etapa: 'diagnostico_pendiente', total: 84000, pagado: 42000, porCobrar: 42000 })
    expect(faltanteCobroCliente(base)).toEqual({ tipo: 'saldo', monto: 42000 })
    expect(pasosPagoCliente(base).map(p => [p.paso, p.estado])).toEqual([['anticipo', 'pagado'], ['saldo', 'pendiente']])
  })

  it('sin anticipo pagado también se cobra: $84.000 completos', () => {
    const r = etapaPagoCliente({ ...base, anticipo_pagado_at: null, monto_pagado_online: 0 })
    expect(r).toMatchObject({ etapa: 'diagnostico_pendiente', porCobrar: 84000 })
  })

  it('ya pagó la visita completa → pagado; nada por cobrar', () => {
    const sol = { ...base, monto_pagado_online: 84000 }
    expect(etapaPagoCliente(sol)?.etapa).toBe('pagado')
    expect(faltanteCobroCliente(sol)).toBeNull()
  })

  it('Eliana Muñoz (1b64aa19): canceló ANTES de la visita con $63.000 pagados → devolucion_pendiente', () => {
    const sol: SolicitudParaEtapaPago = {
      ...base, estado: 'cancelada', tipo_solicitud: 'Mantenimiento', diagnosticado_at: null,
      anticipo_pagado_at: '2026-10-11T17:10:00Z', monto_pagado_online: 63000,
    }
    expect(etapaPagoCliente(sol)).toMatchObject({ etapa: 'devolucion_pendiente', pagado: 63000, porCobrar: 63000 })
    expect(faltanteCobroCliente(sol)).toBeNull()
  })

  it('canceló DESPUÉS del diagnóstico → se cobra la visita (diagnostico_pendiente)', () => {
    expect(etapaPagoCliente({ ...base, estado: 'cancelada' })?.etapa).toBe('diagnostico_pendiente')
  })

  it('cancelada sin pago ni visita → null (nada que cobrar ni devolver); tras devolver queda null', () => {
    expect(etapaPagoCliente({ ...base, estado: 'cancelada', diagnosticado_at: null, anticipo_pagado_at: null, monto_pagado_online: 0 })).toBeNull()
  })

  it('precio fijo cancelado tras una visita registrada: no hay tarifa de diagnóstico → cerrado_con_pago', () => {
    expect(etapaPagoCliente({ ...base, estado: 'cancelada', tipo_solicitud: 'Mantenimiento' })?.etapa).toBe('cerrado_con_pago')
  })
})

describe('decidirRecordatorio — 24 h sin pago, máximo 2, cuenta recordatorios previos', () => {
  const ahora = new Date('2026-11-05T14:00:00Z')
  const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString()
  const msg = (plantilla: string, h: number, extra: Record<string, unknown> = {}) =>
    ({ solicitud_id: 's1', ocurrido_at: hace(h), payload: { plantilla, canal: 'whatsapp', ...extra } })

  it('sin link enviado nunca → no recuerda (lo gestiona el admin con "Cobrar faltante")', () => {
    expect(decidirRecordatorio('saldo', [], ahora).enviar).toBe(false)
    expect(decidirRecordatorio('saldo', [msg('cotizacion_cliente_v3', 30)], ahora).enviar).toBe(false)
  })

  it('link hace 25 h y sin recordatorios → envía el 1.º; hace 10 h → todavía no', () => {
    expect(decidirRecordatorio('saldo', [msg('saldo_final_cliente_v1', 25)], ahora)).toMatchObject({ enviar: true, n: 1 })
    expect(decidirRecordatorio('saldo', [msg('saldo_final_cliente_v1', 10)], ahora).enviar).toBe(false)
    expect(decidirRecordatorio('anticipo', [msg('pago_anticipo_cliente_v2', 25)], ahora)).toMatchObject({ enviar: true, n: 1 })
    expect(decidirRecordatorio('abono', [msg('abono_repuestos_cliente_v1', 25)], ahora)).toMatchObject({ enviar: true, n: 1 })
  })

  it('el recordatorio reinicia el reloj: 1.º hace 10 h → espera; 1.º hace 25 h → 2.º; con 2 previos → nunca más', () => {
    const primero = [msg('saldo_final_cliente_v1', 40), msg('saldo_final_cliente_v1', 10), msg('recordatorio_cobro_saldo', 10, { recordatorio_cobro: 'saldo', n: 1 })]
    expect(decidirRecordatorio('saldo', primero, ahora).enviar).toBe(false)
    const listoSegundo = [msg('saldo_final_cliente_v1', 50), msg('saldo_final_cliente_v1', 25), msg('recordatorio_cobro_saldo', 25, { recordatorio_cobro: 'saldo', n: 1 })]
    expect(decidirRecordatorio('saldo', listoSegundo, ahora)).toMatchObject({ enviar: true, n: RECORDATORIO_COBRO_MAX })
    const agotado = [
      ...listoSegundo,
      msg('saldo_final_cliente_v1', 25), msg('recordatorio_cobro_saldo', 25, { recordatorio_cobro: 'saldo', n: 2 }),
    ]
    expect(decidirRecordatorio('saldo', agotado, ahora)).toMatchObject({ enviar: false, recordatoriosPrevios: 2 })
  })

  it('los recordatorios de OTRO cobro no cuentan; el texto libre de fallback sí cuenta como envío', () => {
    const eventos = [msg('pago_saldo_cliente_v1 (texto libre)', 30), msg('recordatorio_cobro_anticipo', 30, { recordatorio_cobro: 'anticipo', n: 2 })]
    expect(decidirRecordatorio('saldo', eventos, ahora)).toMatchObject({ enviar: true, n: 1, recordatoriosPrevios: 0 })
  })
})
