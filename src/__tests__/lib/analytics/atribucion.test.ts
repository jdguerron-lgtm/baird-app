import { describe, it, expect } from 'vitest'
import {
  construirToque,
  combinarAtribucion,
  clasificarCanal,
  esToqueNoDirecto,
  type Toque,
} from '@/lib/analytics/atribucion'
import { parsearOrigen } from '@/lib/validations/origen.schema'

const HOST = 'lineablanca.bairdservice.com'
const BASE = `https://${HOST}`
const AHORA = new Date('2026-10-24T15:00:00Z')

function toque(url: string, referrer = '', ahora = AHORA): Toque {
  return construirToque(new URL(url), referrer, ahora, HOST)
}

describe('construirToque', () => {
  it('guarda parámetros de campaña, landing y solo el dominio del referrer', () => {
    const t = toque(`${BASE}/servicios/reparacion-lavadoras-bogota?gclid=G1&utm_source=google&otro=x`, 'https://www.google.com/search?q=lavadora')
    expect(t.gclid).toBe('G1')
    expect(t.utm_source).toBe('google')
    expect(t.landing).toBe('/servicios/reparacion-lavadoras-bogota')
    expect(t.referrer).toBe('www.google.com')
    expect(t).not.toHaveProperty('otro')
  })

  it('un referrer del mismo sitio no cuenta', () => {
    const t = toque(`${BASE}/solicitar`, `${BASE}/`)
    expect(t.referrer).toBeUndefined()
    expect(esToqueNoDirecto(t)).toBe(false)
  })
})

describe('combinarAtribucion', () => {
  const ads = toque(`${BASE}/?gclid=G1`)

  it('sin nada guardado: primera = última', () => {
    const a = combinarAtribucion(null, ads, AHORA)
    expect(a.primera).toEqual(ads)
    expect(a.ultima).toEqual(ads)
  })

  it('una visita directa no pisa el último toque', () => {
    const a = combinarAtribucion(null, ads, AHORA)
    const directo = toque(`${BASE}/solicitar`)
    expect(combinarAtribucion(a, directo, AHORA).ultima.gclid).toBe('G1')
  })

  it('una visita con campaña nueva pasa a ser la última y conserva la primera', () => {
    const organico = toque(`${BASE}/`, 'https://www.google.com/')
    const a = combinarAtribucion(null, organico, AHORA)
    const b = combinarAtribucion(a, ads, AHORA)
    expect(b.primera.referrer).toBe('www.google.com')
    expect(b.ultima.gclid).toBe('G1')
  })

  it('a los 90 días vence y se reinicia', () => {
    const viejo = combinarAtribucion(null, toque(`${BASE}/?gclid=VIEJO`, '', new Date('2026-06-01T00:00:00Z')), AHORA)
    const directo = toque(`${BASE}/`)
    const a = combinarAtribucion(viejo, directo, AHORA)
    expect(a.primera.gclid).toBeUndefined()
    expect(a.ultima.gclid).toBeUndefined()
  })
})

describe('clasificarCanal', () => {
  const t = (extra: Partial<Toque>): Toque => ({ ts: AHORA.toISOString(), landing: '/', ...extra })

  it('Google Ads por gclid, gbraid o utm pagado', () => {
    expect(clasificarCanal(t({ gclid: 'x' }))).toBe('google_ads')
    expect(clasificarCanal(t({ gbraid: 'x' }))).toBe('google_ads')
    expect(clasificarCanal(t({ utm_source: 'google', utm_medium: 'cpc' }))).toBe('google_ads')
  })

  it('Meta por fbclid o utm pagado', () => {
    expect(clasificarCanal(t({ fbclid: 'x' }))).toBe('meta_ads')
    expect(clasificarCanal(t({ utm_source: 'instagram', utm_medium: 'paid' }))).toBe('meta_ads')
  })

  it('campañas propias y WhatsApp', () => {
    expect(clasificarCanal(t({ utm_source: 'newsletter', utm_medium: 'email' }))).toBe('campana')
    expect(clasificarCanal(t({ utm_source: 'whatsapp' }))).toBe('whatsapp')
  })

  it('por referrer', () => {
    expect(clasificarCanal(t({ referrer: 'www.google.com.co' }))).toBe('organico_buscador')
    expect(clasificarCanal(t({ referrer: 'l.facebook.com' }))).toBe('social')
    expect(clasificarCanal(t({ referrer: 't.co' }))).toBe('social')
    expect(clasificarCanal(t({ referrer: 'microsoft.com' }))).toBe('referido')
    expect(clasificarCanal(t({ referrer: 'tienda.bairdservice.com' }))).toBe('referido')
  })

  it('sin nada: directo', () => {
    expect(clasificarCanal(t({}))).toBe('directo')
    expect(clasificarCanal(null)).toBe('directo')
  })
})

describe('parsearOrigen (servidor)', () => {
  it('acepta un origen válido, descarta claves extra y agrega los canales', () => {
    const a = combinarAtribucion(null, toque(`${BASE}/?gclid=G1`), AHORA)
    const r = parsearOrigen({ ...a, ultima: { ...a.ultima, inventado: 'x' } })
    expect(r?.canal).toBe('google_ads')
    expect(r?.canal_primera).toBe('google_ads')
    expect(r?.ultima).not.toHaveProperty('inventado')
  })

  it('origen ausente o inválido → null (el lead se crea igual)', () => {
    expect(parsearOrigen(undefined)).toBeNull()
    expect(parsearOrigen({ v: 2 })).toBeNull()
    expect(parsearOrigen({ v: 1, primera: { ts: 'x' }, ultima: {} })).toBeNull()
    expect(parsearOrigen({ v: 1, primera: { ts: 'x', landing: '/' }, ultima: { ts: 'x', landing: '/', gclid: 'a'.repeat(400) } })).toBeNull()
  })
})
