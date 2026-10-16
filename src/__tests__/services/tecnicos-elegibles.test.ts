import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

import {
  listarTecnicosElegibles,
  resolverTecnicoPreferido,
  tecnicoCubreCiudad,
} from '@/lib/services/tecnicos-elegibles.service'

// Builder mínimo: `.in('id', ids)` y `.eq(col, v)` SÍ filtran las filas para
// que el test refleje lo que haría Postgres (el servicio pre-filtra por
// especialidad con `.in` y por verificado con `.eq`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryBuilder(resolved: { data: any; error: any }): any {
  let rows = resolved.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve({ ...resolved, data: rows }).then(resolve),
  }
  builder.select = vi.fn().mockReturnValue(builder)
  builder.order = vi.fn().mockReturnValue(builder)
  builder.in = vi.fn((col: string, ids: string[]) => {
    if (Array.isArray(rows)) rows = rows.filter((r: Record<string, unknown>) => ids.includes(r[col] as string))
    return builder
  })
  builder.eq = vi.fn((col: string, v: unknown) => {
    if (Array.isArray(rows)) rows = rows.filter((r: Record<string, unknown>) => r[col] === v)
    return builder
  })
  return builder
}

const ESPS = [
  { tecnico_id: 'tec-visible', especialidad: 'Lavadoras' },
  { tecnico_id: 'tec-visible', especialidad: 'Neveras y Nevecones' },
  { tecnico_id: 'tec-oculto', especialidad: 'Lavadoras' },
  { tecnico_id: 'tec-otra-ciudad', especialidad: 'Lavadoras' },
  { tecnico_id: 'tec-sin-esp', especialidad: 'Aires Acondicionados' },
  { tecnico_id: 'tec-null', especialidad: 'Lavadoras' },
]

const TECS = [
  {
    id: 'tec-visible', nombre_completo: 'Carlos Mauricio Bonilla Agudelo', ciudad_pueblo: 'Bogotá',
    ciudades_cobertura: ['Bogotá', 'Soacha'], estado_verificacion: 'verificado', visible_para_cliente: true,
    foto_perfil_url: 'https://x/foto.jpg',
  },
  {
    id: 'tec-oculto', nombre_completo: 'Juan David Guerron', ciudad_pueblo: 'Bogota',
    ciudades_cobertura: ['Bogota'], estado_verificacion: 'verificado', visible_para_cliente: false,
    foto_perfil_url: null,
  },
  {
    id: 'tec-otra-ciudad', nombre_completo: 'Jose Francisco', ciudad_pueblo: 'la mesa',
    ciudades_cobertura: ['la mesa', 'Anapoima'], estado_verificacion: 'verificado', visible_para_cliente: true,
    foto_perfil_url: null,
  },
  {
    // Fila sin la columna (migración sin aplicar) → cuenta como visible
    id: 'tec-null', nombre_completo: 'Nestor Castro', ciudad_pueblo: 'Bogotá',
    ciudades_cobertura: [], estado_verificacion: 'verificado', visible_para_cliente: null,
    foto_perfil_url: null,
  },
]

function setup(tecs = TECS, esps = ESPS) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'especialidades_tecnico') return queryBuilder({ data: esps, error: null })
    if (table === 'tecnicos') return queryBuilder({ data: tecs, error: null })
    return queryBuilder({ data: null, error: null })
  })
}

describe('tecnicoCubreCiudad', () => {
  it('matchea por cobertura, case/acento-insensitive', () => {
    expect(tecnicoCubreCiudad({ ciudad_pueblo: 'Bogota', ciudades_cobertura: ['Bogotá', 'soacha'] }, 'SOACHA')).toBe(true)
    expect(tecnicoCubreCiudad({ ciudad_pueblo: 'Bogota', ciudades_cobertura: [] }, 'Soacha')).toBe(false)
    expect(tecnicoCubreCiudad({ ciudad_pueblo: 'Bogotá', ciudades_cobertura: null }, 'Bogotá D.C.')).toBe(true)
  })
  it('ciudad vacía no filtra', () => {
    expect(tecnicoCubreCiudad({ ciudad_pueblo: 'Pasto' }, '')).toBe(true)
  })
})

describe('listarTecnicosElegibles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excluye ocultos y los de otra ciudad; incluye visible y NULL; sin PII', async () => {
    setup()
    const r = await listarTecnicosElegibles({ ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })
    expect(r.map(t => t.id).sort()).toEqual(['tec-null', 'tec-visible'])
    const carlos = r.find(t => t.id === 'tec-visible')
    expect(carlos?.nombre).toBe('Carlos Bonilla')
    expect(carlos?.foto_url).toBe('https://x/foto.jpg')
    expect(carlos?.especialidades).toEqual(['Lavadoras', 'Neveras y Nevecones'])
    expect(Object.keys(carlos ?? {}).sort()).toEqual(['especialidades', 'foto_url', 'id', 'nombre'])
  })

  it('filtra por la especialidad del tipo de equipo', async () => {
    setup()
    const r = await listarTecnicosElegibles({ ciudad: 'Bogotá', tipoEquipo: 'Aire Acondicionado' })
    expect(r).toEqual([])
  })

  it('devuelve [] sin ciudad o sin tipo de equipo (no consulta BD)', async () => {
    setup()
    expect(await listarTecnicosElegibles({ ciudad: '', tipoEquipo: 'Lavadora' })).toEqual([])
    expect(await listarTecnicosElegibles({ ciudad: 'Bogotá', tipoEquipo: '' })).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('devuelve [] si falla la BD (fail-open del selector)', async () => {
    mockFrom.mockImplementation(() => queryBuilder({ data: null, error: { message: 'boom' } }))
    expect(await listarTecnicosElegibles({ ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toEqual([])
  })
})

describe('resolverTecnicoPreferido', () => {
  beforeEach(() => vi.clearAllMocks())

  it('conserva el id si es elegible', async () => {
    setup()
    expect(await resolverTecnicoPreferido({ tecnicoId: 'tec-visible', ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBe('tec-visible')
  })

  it('descarta ocultos, de otra ciudad, inexistentes y vacío', async () => {
    setup()
    expect(await resolverTecnicoPreferido({ tecnicoId: 'tec-oculto', ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBeNull()
    expect(await resolverTecnicoPreferido({ tecnicoId: 'tec-otra-ciudad', ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBeNull()
    expect(await resolverTecnicoPreferido({ tecnicoId: 'no-existe', ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBeNull()
    expect(await resolverTecnicoPreferido({ tecnicoId: '', ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBeNull()
    expect(await resolverTecnicoPreferido({ tecnicoId: undefined, ciudad: 'Bogotá', tipoEquipo: 'Lavadora' })).toBeNull()
  })
})
