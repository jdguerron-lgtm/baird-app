import { describe, expect, it } from 'vitest'
import {
  agruparPorCliente,
  claveOrden,
  motivoCancelacionDuplicado,
  posiblesDuplicadosDe,
  type SolicitudCliente,
} from '@/lib/utils/clientes-duplicados'

let n = 0
function sol(p: Partial<SolicitudCliente>): SolicitudCliente {
  n += 1
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    cliente_telefono: '573001112233',
    cliente_nombre: 'Ana Pérez',
    tipo_equipo: 'Lavadora',
    marca_equipo: 'Mabe',
    es_garantia: true,
    estado: 'notificada',
    numero_serie_factura: null,
    tecnico_asignado_id: null,
    created_at: '2026-10-10T15:00:00.000Z',
    ...p,
  }
}

describe('posiblesDuplicadosDe', () => {
  it('marca dos órdenes abiertas del mismo equipo', () => {
    const a = sol({ estado: 'asignada' })
    const b = sol({ estado: 'pendiente_pricing' })
    expect(posiblesDuplicadosDe(b, [a, b])).toEqual([{ id: a.id, motivo: 'mismo_equipo_abierto' }])
  })

  it('no marca equipos distintos del mismo cliente', () => {
    const a = sol({ tipo_equipo: 'Lavadora' })
    const b = sol({ tipo_equipo: 'Secadora' })
    const c = sol({ tipo_equipo: 'Nevera' })
    expect(posiblesDuplicadosDe(a, [a, b, c])).toEqual([])
  })

  it('compara el equipo sin importar mayúsculas ni tildes', () => {
    const a = sol({ tipo_equipo: 'Lavadora ' })
    const b = sol({ tipo_equipo: 'LAVADORA' })
    expect(posiblesDuplicadosDe(a, [a, b])).toHaveLength(1)
  })

  it('no marca si la otra orden del mismo equipo ya está cerrada (sin misma orden)', () => {
    const a = sol({ estado: 'completada' })
    const b = sol({ estado: 'asignada' })
    expect(posiblesDuplicadosDe(b, [a, b])).toEqual([])
  })

  it('marca el mismo número de orden aunque la otra se haya cerrado hace pocos días', () => {
    const a = sol({ estado: 'no_show_cliente', numero_serie_factura: '9415679144', created_at: '2026-10-08T10:00:00Z' })
    const b = sol({ estado: 'notificada', numero_serie_factura: ' 9415679144', created_at: '2026-10-09T10:00:00Z' })
    expect(posiblesDuplicadosDe(b, [a, b])).toEqual([{ id: a.id, motivo: 'misma_orden' }])
  })

  it('no marca la misma orden cerrada hace más de 30 días', () => {
    const a = sol({ estado: 'completada', numero_serie_factura: '9415679144', created_at: '2026-08-01T10:00:00Z' })
    const b = sol({ estado: 'notificada', numero_serie_factura: '9415679144', created_at: '2026-10-09T10:00:00Z', tipo_equipo: 'Nevera' })
    expect(posiblesDuplicadosDe(b, [a, b])).toEqual([])
  })

  it('no marca dos órdenes cerradas con el mismo número', () => {
    const a = sol({ estado: 'completada', numero_serie_factura: '9415679144' })
    const b = sol({ estado: 'cancelada', numero_serie_factura: '9415679144' })
    expect(posiblesDuplicadosDe(a, [a, b])).toEqual([])
  })

  it('ignora otros teléfonos', () => {
    const a = sol({})
    const b = sol({ cliente_telefono: '573009998877' })
    expect(posiblesDuplicadosDe(a, [a, b])).toEqual([])
  })
})

describe('claveOrden', () => {
  it('limpia símbolos y descarta textos muy cortos', () => {
    expect(claveOrden(' 94-156 79144 ')).toBe('9415679144')
    expect(claveOrden('#12')).toBe('')
    expect(claveOrden(null)).toBe('')
  })
})

describe('agruparPorCliente', () => {
  it('agrupa por teléfono y cuenta abiertas y duplicados', () => {
    const lista = [
      sol({ estado: 'asignada', created_at: '2026-10-20T10:00:00Z' }),
      sol({ estado: 'notificada', created_at: '2026-10-21T10:00:00Z', cliente_nombre: 'Ana P.' }),
      sol({ estado: 'completada', tipo_equipo: 'Nevera' }),
      sol({ cliente_telefono: '573009998877', cliente_nombre: 'Luis' }),
    ]
    const [ana, luis] = agruparPorCliente(lista)
    expect(ana.telefono).toBe('573001112233')
    expect(ana.nombre).toBe('Ana P.')
    expect(ana.total).toBe(3)
    expect(ana.activas).toBe(2)
    expect(ana.conPosibleDuplicado).toBe(2)
    expect(ana.equipos).toEqual(['Lavadora', 'Nevera'])
    expect(luis.conPosibleDuplicado).toBe(0)
  })
})

describe('motivoCancelacionDuplicado', () => {
  it('incluye la orden original y la nota', () => {
    expect(motivoCancelacionDuplicado('abcdef1234567890', 'la marca la reenvió')).toBe(
      'Duplicado de la orden #abcdef12: la marca la reenvió',
    )
  })
})
