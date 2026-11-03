import { describe, it, expect } from 'vitest'
import {
  guardarBorradorDiagnostico,
  leerBorradorDiagnostico,
  borrarBorradorDiagnostico,
  claveBorradorDiagnostico,
  borradorVacio,
  BORRADOR_DIAGNOSTICO_TTL_MS,
  type DatosBorradorDiagnostico,
  type StorageLike,
} from '@/lib/utils/borrador-diagnostico'

function memoria(): StorageLike & { datos: Map<string, string> } {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: k => datos.get(k) ?? null,
    setItem: (k, v) => { datos.set(k, v) },
    removeItem: k => { datos.delete(k) },
  }
}

const vacio = (): DatosBorradorDiagnostico => ({
  diagnosticoTexto: '',
  complejidad: null,
  codigoFalla: null,
  siguientePaso: null,
  productosNecesarios: [],
  productosRecomendados: [],
  costoTecnico: '',
  oathFirma: null,
  evidencias: [],
  placa: null,
})

const URL_OK = 'https://x.supabase.co/storage/v1/object/public/evidencias-servicio/sol/a.jpg'

describe('borrador del diagnóstico', () => {
  it('guarda y recupera todos los campos con las URLs ya subidas', () => {
    const s = memoria()
    const datos: DatosBorradorDiagnostico = {
      ...vacio(),
      diagnosticoTexto: 'No centrifuga, motor quemado',
      complejidad: 'media' as DatosBorradorDiagnostico['complejidad'],
      siguientePaso: { paso: 'reparar', detalle: '' },
      productosNecesarios: [{ sku: 'ABC', descripcion: 'Motor', cantidad: 1 }],
      costoTecnico: '120.000',
      oathFirma: 'Lynn Mari',
      evidencias: [{ url: URL_OK, tipo: 'imagen', nombre: 'a.jpg' }],
      placa: { url: URL_OK, tipo: 'imagen', nombre: 'placa.jpg' },
    }
    expect(guardarBorradorDiagnostico('sol-1', datos, { storage: s, ahora: 1000 })).toBe(true)
    const leido = leerBorradorDiagnostico('sol-1', { storage: s, ahora: 2000 })
    expect(leido).toMatchObject({ ...datos, savedAt: 1000 })
  })

  it('usa una clave por solicitud', () => {
    expect(claveBorradorDiagnostico('abc')).toBe('baird:diag-borrador:abc')
    const s = memoria()
    guardarBorradorDiagnostico('a', { ...vacio(), diagnosticoTexto: 'x' }, { storage: s })
    expect(leerBorradorDiagnostico('b', { storage: s })).toBeNull()
  })

  it('vence a las 24 h y lo borra', () => {
    const s = memoria()
    guardarBorradorDiagnostico('sol', { ...vacio(), diagnosticoTexto: 'x' }, { storage: s, ahora: 0 })
    expect(leerBorradorDiagnostico('sol', { storage: s, ahora: BORRADOR_DIAGNOSTICO_TTL_MS + 1 })).toBeNull()
    expect(s.datos.size).toBe(0)
  })

  it('JSON corrupto o versión distinta → null y se limpia', () => {
    const s = memoria()
    s.setItem(claveBorradorDiagnostico('sol'), '{no es json')
    expect(leerBorradorDiagnostico('sol', { storage: s })).toBeNull()
    expect(s.datos.size).toBe(0)
    s.setItem(claveBorradorDiagnostico('sol'), JSON.stringify({ v: 99, savedAt: Date.now() }))
    expect(leerBorradorDiagnostico('sol', { storage: s })).toBeNull()
  })

  it('descarta archivos con URL no https o tipo desconocido', () => {
    const s = memoria()
    s.setItem(claveBorradorDiagnostico('sol'), JSON.stringify({
      ...vacio(),
      v: 1,
      savedAt: 0,
      evidencias: [{ url: 'blob:abc', tipo: 'imagen', nombre: 'x' }, { url: URL_OK, tipo: 'pdf', nombre: 'y' }, { url: URL_OK, tipo: 'video', nombre: 'v.mp4' }],
      placa: { url: 'javascript:alert(1)', tipo: 'imagen', nombre: 'p' },
    }))
    const b = leerBorradorDiagnostico('sol', { storage: s, ahora: 10 })
    expect(b?.evidencias).toEqual([{ url: URL_OK, tipo: 'video', nombre: 'v.mp4' }])
    expect(b?.placa).toBeNull()
  })

  it('un borrador sin contenido (solo la firma) no se guarda', () => {
    const s = memoria()
    guardarBorradorDiagnostico('sol', { ...vacio(), diagnosticoTexto: 'algo' }, { storage: s })
    expect(s.datos.size).toBe(1)
    guardarBorradorDiagnostico('sol', { ...vacio(), oathFirma: 'Firma' }, { storage: s })
    expect(s.datos.size).toBe(0)
    expect(borradorVacio({ ...vacio(), oathFirma: 'Firma' })).toBe(true)
  })

  it('sin storage o con storage que lanza, no rompe', () => {
    expect(guardarBorradorDiagnostico('sol', { ...vacio(), diagnosticoTexto: 'x' }, { storage: null })).toBe(false)
    expect(leerBorradorDiagnostico('sol', { storage: null })).toBeNull()
    const roto: StorageLike = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(guardarBorradorDiagnostico('sol', { ...vacio(), diagnosticoTexto: 'x' }, { storage: roto })).toBe(false)
    expect(leerBorradorDiagnostico('sol', { storage: roto })).toBeNull()
    expect(() => borrarBorradorDiagnostico('sol', { storage: roto })).not.toThrow()
  })
})
