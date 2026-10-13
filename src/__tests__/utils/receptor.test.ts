import { describe, it, expect } from 'vitest'
import {
  validarReceptor,
  componentesParaReceptor,
  receptorActivo,
  primerNombre,
  labelRelacionReceptor,
  RELACIONES_RECEPTOR,
} from '@/lib/utils/receptor'

// Receptor del servicio (2026-10-13): persona distinta del titular que recibe
// al técnico y sigue el flujo en paralelo. Estos helpers son la frontera que
// decide (a) qué se guarda y (b) a quién se espejan los WhatsApp. Un fallo
// acá = mensajes duplicados a la misma persona o a un número roto.

describe('validarReceptor', () => {
  const titular = '573001234567'

  it('acepta un receptor válido y normaliza nombre + celular', () => {
    const r = validarReceptor({ nombre: '  Marta   Rodríguez ', telefono: '310 555 1234', relacion: 'familiar' }, titular)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.receptor).toEqual({ nombre: 'Marta Rodríguez', telefono: '573105551234', relacion: 'familiar' })
  })

  it('acepta el celular con +57 o 57 y lo deja en dígitos con prefijo', () => {
    for (const tel of ['+57 310 555 1234', '573105551234', '57-310-555-1234']) {
      const r = validarReceptor({ nombre: 'Marta', telefono: tel, relacion: 'otro' }, titular)
      expect(r.ok, tel).toBe(true)
      if (r.ok) expect(r.receptor.telefono).toBe('573105551234')
    }
  })

  it('rechaza nombre corto, celular no móvil CO y relación fuera de la lista', () => {
    expect(validarReceptor({ nombre: 'Ma', telefono: '3105551234', relacion: 'familiar' }).ok).toBe(false)
    expect(validarReceptor({ nombre: 'Marta', telefono: '6015551234', relacion: 'familiar' }).ok).toBe(false)
    expect(validarReceptor({ nombre: 'Marta', telefono: '310555123', relacion: 'familiar' }).ok).toBe(false)
    expect(validarReceptor({ nombre: 'Marta', telefono: '3105551234', relacion: 'vecino' }).ok).toBe(false)
    expect(validarReceptor(null).ok).toBe(false)
  })

  it('rechaza el mismo número del titular (no tiene sentido duplicar)', () => {
    const r = validarReceptor({ nombre: 'Marta', telefono: '300 123 4567', relacion: 'familiar' }, '+57 300 123 4567')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/titular/)
  })

  it('cada relación de la lista cerrada es válida y tiene label', () => {
    for (const rel of RELACIONES_RECEPTOR) {
      const r = validarReceptor({ nombre: 'Marta', telefono: '3105551234', relacion: rel.value })
      expect(r.ok).toBe(true)
      expect(labelRelacionReceptor(rel.value)).toBe(rel.label)
    }
    expect(labelRelacionReceptor(null)).toBe('—')
  })
})

describe('componentesParaReceptor', () => {
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: 'Carlos' },
        { type: 'text', text: 'Pedro Gómez' },
        { type: 'text', text: 'Lavadora LG' },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'tok' }] },
  ]

  it('reemplaza SOLO el primer parámetro del body por el primer nombre del receptor', () => {
    const out = componentesParaReceptor(components, 'Marta Rodríguez')!
    const body = out[0] as { parameters: { text: string }[] }
    expect(body.parameters.map(p => p.text)).toEqual(['Marta', 'Pedro Gómez', 'Lavadora LG'])
    expect(out[1]).toEqual(components[1])
  })

  it('no muta el array original', () => {
    componentesParaReceptor(components, 'Marta')
    expect((components[0] as { parameters: { text: string }[] }).parameters[0].text).toBe('Carlos')
  })

  it('tolera undefined y bodies sin parámetros', () => {
    expect(componentesParaReceptor(undefined, 'Marta')).toBeUndefined()
    expect(componentesParaReceptor([{ type: 'body' }], 'Marta')).toEqual([{ type: 'body' }])
  })
})

describe('receptorActivo', () => {
  const base = { cliente_telefono: '573001234567', receptor_nombre: 'Marta', receptor_telefono: '573105551234' }

  it('solo es activo si aceptó (receptor_acepto_at) — consentimiento previo', () => {
    expect(receptorActivo({ ...base, receptor_acepto_at: null })).toBeNull()
    expect(receptorActivo({ ...base, receptor_acepto_at: '2026-10-13T10:00:00Z' })).toEqual({ nombre: 'Marta', telefono: '573105551234' })
  })

  it('nunca espeja al mismo número del titular ni a un número roto', () => {
    expect(receptorActivo({ ...base, receptor_telefono: '573001234567', receptor_acepto_at: '2026-10-13T10:00:00Z' })).toBeNull()
    expect(receptorActivo({ ...base, receptor_telefono: '6015551234', receptor_acepto_at: '2026-10-13T10:00:00Z' })).toBeNull()
    expect(receptorActivo(null)).toBeNull()
    expect(receptorActivo({})).toBeNull()
  })
})

describe('primerNombre', () => {
  it('devuelve la primera palabra y un fallback neutro', () => {
    expect(primerNombre('  Marta Rodríguez ')).toBe('Marta')
    expect(primerNombre('')).toBe('Hola')
    expect(primerNombre(null)).toBe('Hola')
  })
})
