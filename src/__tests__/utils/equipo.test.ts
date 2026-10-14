import { describe, it, expect } from 'vitest'
import {
  auxiliaresPorDefecto,
  auxiliaresVisiblesAlCliente,
  cambioRequiereReverificacion,
  codigoCarnetAuxiliar,
  construirCarnetAuxiliar,
  fraseAcompanantes,
  nombreCorto,
  resolverEquipoServicio,
  textoEquipoWhatsApp,
  validarAuxiliar,
  type AuxiliarRow,
} from '@/lib/utils/equipo'
import { urlImagenCarnet } from '@/lib/utils/carnet'

const base: AuxiliarRow = {
  id: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
  tecnico_id: 'tec-1',
  nombre_completo: 'Juan Carlos Pérez Gómez',
  tipo_documento: 'CC',
  numero_documento: '1032456789',
  foto_perfil_url: 'https://x/aux.jpg',
  estado_verificacion: 'verificado',
  acompana_por_defecto: true,
  activo: true,
}

describe('auxiliaresVisiblesAlCliente / auxiliaresPorDefecto / resolverEquipoServicio', () => {
  const pendiente = { ...base, id: 'p', nombre_completo: 'Ana Ruiz', estado_verificacion: 'pendiente' }
  const inactivo = { ...base, id: 'i', nombre_completo: 'Beto Díaz', activo: false }
  const sinDefault = { ...base, id: 'd', nombre_completo: 'Carla Mora', acompana_por_defecto: false }

  it('solo muestra al cliente los activos y verificados, ordenados por nombre', () => {
    const visibles = auxiliaresVisiblesAlCliente([sinDefault, pendiente, base, inactivo])
    expect(visibles.map(a => a.id)).toEqual(['d', base.id])
  })

  it('por defecto solo van los visibles con acompana_por_defecto', () => {
    expect(auxiliaresPorDefecto([sinDefault, pendiente, base, inactivo]).map(a => a.id)).toEqual([base.id])
  })

  it('resolverEquipoServicio descarta ids ajenos, inactivos o sin verificar', () => {
    const equipo = resolverEquipoServicio(['p', 'i', base.id, 'otro-tecnico'], [pendiente, inactivo, base])
    expect(equipo.map(a => a.id)).toEqual([base.id])
    expect(resolverEquipoServicio(null, [base])).toEqual([])
    expect(resolverEquipoServicio([], [base])).toEqual([])
  })
})

describe('construirCarnetAuxiliar', () => {
  it('enmascara el documento y nunca expone el número completo', () => {
    const c = construirCarnetAuxiliar(base)
    expect(c.documento).toBe('••32.456.789')
    expect(JSON.stringify(c)).not.toContain('1032456789')
    expect(c.verificado).toBe(true)
    expect(c.codigo).toBe('BA-3F2A9C1E')
  })

  it('codigoCarnetAuxiliar usa prefijo BA- para distinguirlo del técnico', () => {
    expect(codigoCarnetAuxiliar('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b')).toBe('BA-3F2A9C1E')
  })
})

describe('nombreCorto / textoEquipoWhatsApp / fraseAcompanantes', () => {
  it('nombreCorto deja nombre + primer apellido', () => {
    expect(nombreCorto('Juan Carlos Pérez Gómez')).toBe('Juan Pérez')
    expect(nombreCorto('Juan Pérez Gómez')).toBe('Juan Pérez')
    expect(nombreCorto('Juan Pérez')).toBe('Juan Pérez')
    expect(nombreCorto('Juan')).toBe('Juan')
    expect(nombreCorto('')).toBe('')
  })

  it('sin auxiliares devuelve el nombre del técnico tal cual', () => {
    expect(textoEquipoWhatsApp('Pedro Gómez', [])).toBe('Pedro Gómez')
    expect(fraseAcompanantes([])).toBe('')
  })

  it('un auxiliar: singular', () => {
    expect(textoEquipoWhatsApp('Pedro Gómez', [base])).toBe('Pedro Gómez · lo acompaña Juan Pérez (auxiliar)')
    expect(fraseAcompanantes([base])).toBe('Lo acompaña Juan Pérez (auxiliar)')
  })

  it('varios auxiliares: plural con "y"', () => {
    const otro = { nombre_completo: 'Ana Ruiz' }
    const tercero = { nombre_completo: 'Beto Díaz Mora' }
    expect(textoEquipoWhatsApp('Pedro Gómez', [base, otro, tercero]))
      .toBe('Pedro Gómez · lo acompañan Juan Pérez, Ana Ruiz y Beto Díaz (auxiliares)')
  })

  it('el texto es de una sola línea (parámetro Meta)', () => {
    expect(textoEquipoWhatsApp('Pedro Gómez', [base, { nombre_completo: 'Ana Ruiz' }])).not.toMatch(/\n/)
  })
})

describe('validarAuxiliar', () => {
  const ok = {
    nombre_completo: '  Juan   Pérez ',
    tipo_documento: 'CC',
    numero_documento: '1.032.456.789',
    foto_perfil_url: 'https://ceblicvdmephhktedsyv.supabase.co/storage/v1/object/public/tecnicos-fotos/t/auxiliares/a.jpg',
    autoriza_datos: true,
  }

  it('normaliza nombre y documento', () => {
    const r = validarAuxiliar(ok)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.auxiliar.nombre_completo).toBe('Juan Pérez')
    expect(r.auxiliar.numero_documento).toBe('1032456789')
    expect(r.auxiliar.acompana_por_defecto).toBe(true)
    expect(r.auxiliar.whatsapp).toBeNull()
  })

  it('exige la autorización de datos', () => {
    const r = validarAuxiliar({ ...ok, autoriza_datos: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autoriz/)
  })

  it('exige foto', () => {
    expect(validarAuxiliar({ ...ok, foto_perfil_url: '' }).ok).toBe(false)
  })

  it('rechaza una foto fuera del bucket esperado', () => {
    const r = validarAuxiliar({ ...ok, foto_perfil_url: 'https://evil.example/x.jpg' }, { bucketUrlPrefix: 'https://ceblicvdmephhktedsyv.supabase.co/storage/v1/object/public/tecnicos-fotos/' })
    expect(r.ok).toBe(false)
  })

  it('rechaza que el técnico se registre a sí mismo', () => {
    const r = validarAuxiliar(ok, { documentoTecnico: '1032456789' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/propio documento/)
  })

  it('CC solo números; pasaporte alfanumérico ok', () => {
    expect(validarAuxiliar({ ...ok, numero_documento: 'AB123' }).ok).toBe(false)
    expect(validarAuxiliar({ ...ok, tipo_documento: 'Pasaporte', numero_documento: 'ab 123456' }).ok).toBe(true)
    expect(validarAuxiliar({ ...ok, tipo_documento: 'TI' }).ok).toBe(false)
  })

  it('celular opcional: normaliza a 57 + 10 dígitos o rechaza', () => {
    const r = validarAuxiliar({ ...ok, whatsapp: '313 495 1164' })
    expect(r.ok && r.auxiliar.whatsapp).toBe('573134951164')
    expect(validarAuxiliar({ ...ok, whatsapp: '6012345' }).ok).toBe(false)
  })
})

describe('cambioRequiereReverificacion', () => {
  it('nombre, documento o foto nuevos → volver a pendiente', () => {
    const nuevo = { nombre_completo: base.nombre_completo, tipo_documento: 'CC' as const, numero_documento: '1032456789', foto_perfil_url: 'https://x/aux.jpg' }
    expect(cambioRequiereReverificacion(base, nuevo)).toBe(false)
    expect(cambioRequiereReverificacion(base, { ...nuevo, foto_perfil_url: 'https://x/otra.jpg' })).toBe(true)
    expect(cambioRequiereReverificacion(base, { ...nuevo, numero_documento: '99' })).toBe(true)
  })
})

describe('urlImagenCarnet con equipo', () => {
  it('sin auxiliares no cambia la URL; con auxiliares agrega ?aux=', () => {
    expect(urlImagenCarnet('tec-1')).toMatch(/\/api\/carnet\/tec-1$/)
    expect(urlImagenCarnet('tec-1', [])).toMatch(/\/api\/carnet\/tec-1$/)
    expect(urlImagenCarnet('tec-1', ['a', 'b'])).toMatch(/\/api\/carnet\/tec-1\?aux=a%2Cb$/)
  })
})
