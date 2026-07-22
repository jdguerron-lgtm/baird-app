import { describe, it, expect } from 'vitest'
import {
  RECARGO_FIN_DE_SEMANA_PARTICULAR,
  RECARGO_FIN_DE_SEMANA_PARTICULAR_TECNICO,
  RECARGO_FIN_DE_SEMANA_PARTICULAR_CLIENTE,
  recargoParticularParaHorario,
  recargoTecnicoDesdeBruto,
  recargoClienteDesdeBruto,
  calcularTarifaParticular,
} from '@/lib/constants/tarifas/particular'
import { RECARGO_FIN_DE_SEMANA } from '@/lib/constants/tarifas/mabe'
import { precioClienteServicio, TARIFAS_MANTENIMIENTO, TARIFA_DIAGNOSTICO } from '@/types/solicitud'

describe('recargo finde/festivo particular — constantes', () => {
  it('usa la tarifa MEDIA de garantía como bruto ($6.000)', () => {
    expect(RECARGO_FIN_DE_SEMANA_PARTICULAR).toBe(RECARGO_FIN_DE_SEMANA.media)
    expect(RECARGO_FIN_DE_SEMANA_PARTICULAR).toBe(6000)
  })

  it('reparte igual que garantía: técnico 90%, cliente paga bruto + IVA', () => {
    expect(RECARGO_FIN_DE_SEMANA_PARTICULAR_TECNICO).toBe(5400)  // 6000 × 0.90
    expect(RECARGO_FIN_DE_SEMANA_PARTICULAR_CLIENTE).toBe(7140)  // 6000 × 1.19
  })

  it('helpers 0-safe', () => {
    expect(recargoTecnicoDesdeBruto(6000)).toBe(5400)
    expect(recargoClienteDesdeBruto(6000)).toBe(7140)
    expect(recargoTecnicoDesdeBruto(0)).toBe(0)
    expect(recargoTecnicoDesdeBruto(null)).toBe(0)
    expect(recargoClienteDesdeBruto(undefined)).toBe(0)
  })

  it('recargoParticularParaHorario: finde/festivo → 6000, hábil → 0', () => {
    expect(recargoParticularParaHorario('2026-07-25T15:00:00Z')).toBe(6000) // sábado
    expect(recargoParticularParaHorario('2026-07-20T15:00:00Z')).toBe(6000) // festivo
    expect(recargoParticularParaHorario('2026-07-22T15:00:00Z')).toBe(0)    // miércoles
    expect(recargoParticularParaHorario(null)).toBe(0)
  })
})

describe('calcularTarifaParticular con recargo', () => {
  it('sin recargo conserva la fórmula previa ($100k → $134.470)', () => {
    const t = calcularTarifaParticular({ costoTecnico: 100_000 })
    expect(t.margenBaird).toBe(13_000)
    expect(t.baseVenta).toBe(113_000)
    expect(t.ivaCliente).toBe(21_470)
    expect(t.totalCliente).toBe(134_470)
    expect(t.recargoBruto).toBe(0)
    expect(t.pagoTecnicoTotal).toBe(100_000)
  })

  it('con recargo: el bruto entra a la base gravable y el técnico recibe 90%', () => {
    const t = calcularTarifaParticular({ costoTecnico: 100_000, recargoBruto: 6000 })
    expect(t.baseVenta).toBe(119_000)          // 113.000 + 6.000
    expect(t.ivaCliente).toBe(22_610)          // 19% de 119.000
    expect(t.totalCliente).toBe(141_610)       // = 134.470 + 7.140
    expect(t.recargoTecnico).toBe(5_400)
    expect(t.pagoTecnicoTotal).toBe(105_400)   // costo + 90% del recargo
    expect(t.margenBaird).toBe(13_600)         // 13% costo + 10% recargo
  })

  it('cuadra: total = técnico + margen Baird + IVA', () => {
    const t = calcularTarifaParticular({ costoTecnico: 250_000, recargoBruto: 6000 })
    expect(t.pagoTecnicoTotal + t.margenBaird + t.ivaCliente).toBe(t.totalCliente)
  })
})

describe('precioClienteServicio con recargo', () => {
  it('tarifa fija: catálogo + recargo con IVA', () => {
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', false, null, 6000))
      .toBe(TARIFAS_MANTENIMIENTO['Lavadora'] + 7140)
  })

  it('diagnóstico: tarifa + recargo con IVA', () => {
    expect(precioClienteServicio('Nevera', 'Diagnóstico', false, null, 6000))
      .toBe(TARIFA_DIAGNOSTICO + 7140)
  })

  it('sin recargo: catálogo puro (comportamiento previo)', () => {
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', false, null))
      .toBe(TARIFAS_MANTENIMIENTO['Lavadora'])
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', false, null, 0))
      .toBe(TARIFAS_MANTENIMIENTO['Lavadora'])
  })

  it('cotización manda: su total YA incluye recargo — no se suma doble', () => {
    expect(precioClienteServicio('Lavadora', 'Reparación', false, { total: 141_610 }, 6000))
      .toBe(141_610)
  })

  it('garantía nunca suma recargo al cliente', () => {
    expect(precioClienteServicio('Lavadora', 'Mantenimiento', true, null, 6000)).toBe(0)
  })
})
