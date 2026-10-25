import { describe, it, expect } from 'vitest'
import {
  hostMedido,
  rutaSinMedicion,
  rutaConToken,
  sanitizarRuta,
  sanitizarUrl,
  urlNecesitaSaneo,
} from '@/lib/analytics/rutas'

const BASE = 'https://lineablanca.bairdservice.com'
const UUID = '3f2b8c1e-9a4d-4e7b-8c2f-1a2b3c4d5e6f'

describe('rutaSinMedicion', () => {
  it('excluye los portales internos por segmento', () => {
    expect(rutaSinMedicion('/admin')).toBe(true)
    expect(rutaSinMedicion('/admin/establecer-clave')).toBe(true)
    expect(rutaSinMedicion(`/tecnico/${UUID}/agenda`)).toBe(true)
    expect(rutaSinMedicion('/supervisor')).toBe(true)
    expect(rutaSinMedicion(`/aceptar/${UUID}`)).toBe(true)
  })

  it('no confunde prefijos parecidos', () => {
    expect(rutaSinMedicion('/administracion')).toBe(false)
    expect(rutaSinMedicion('/tecnicos-bogota')).toBe(false)
  })

  it('mide las páginas públicas y las del cliente', () => {
    expect(rutaSinMedicion('/')).toBe(false)
    expect(rutaSinMedicion('/solicitar')).toBe(false)
    expect(rutaSinMedicion('/registro')).toBe(false)
    expect(rutaSinMedicion('/servicios/reparacion-lavadoras-bogota')).toBe(false)
    expect(rutaSinMedicion(`/servicio/${UUID}`)).toBe(false)
  })
})

describe('hostMedido', () => {
  it('por defecto solo mide el dominio oficial', () => {
    expect(hostMedido('lineablanca.bairdservice.com')).toBe(true)
    expect(hostMedido('LineaBlanca.BairdService.com')).toBe(true)
  })

  it('no mide previews de Vercel, el alias ni localhost', () => {
    expect(hostMedido('baird-9sbmpm2sr-servicebairdapps-projects.vercel.app')).toBe(false)
    expect(hostMedido('baird-app.vercel.app')).toBe(false)
    expect(hostMedido('localhost')).toBe(false)
  })

  it('acepta una lista propia (NEXT_PUBLIC_ANALYTICS_HOSTS)', () => {
    expect(hostMedido('localhost', ['localhost'])).toBe(true)
  })
})

describe('rutaConToken', () => {
  it('reconoce las páginas del cliente con token', () => {
    expect(rutaConToken(`/servicio/${UUID}`)).toBe(true)
    expect(rutaConToken(`/pago/anticipo/${UUID}`)).toBe(true)
    expect(rutaConToken(`/receptor/${UUID}`)).toBe(true)
  })

  it('/servicios (landings) no es /servicio', () => {
    expect(rutaConToken('/servicios')).toBe(false)
    expect(rutaConToken('/servicios/reparacion-neveras-bogota')).toBe(false)
  })
})

describe('sanitizarRuta', () => {
  it('reemplaza UUIDs y tokens largos', () => {
    expect(sanitizarRuta(`/pago/anticipo/${UUID}`)).toBe('/pago/anticipo/[token]')
    expect(sanitizarRuta('/x/abcdefABCDEF0123456789_xyz')).toBe('/x/[token]')
  })

  it('deja intactos los slugs de las landings', () => {
    expect(sanitizarRuta('/servicios/reparacion-aires-acondicionados-bogota')).toBe(
      '/servicios/reparacion-aires-acondicionados-bogota',
    )
  })
})

describe('sanitizarUrl', () => {
  it('quita token, query y fragmento en páginas con token', () => {
    expect(sanitizarUrl(`${BASE}/pago/anticipo/${UUID}?id=123-wompi#x`)).toBe(
      `${BASE}/pago/anticipo/[token]`,
    )
  })

  it('en páginas públicas conserva solo los parámetros de campaña', () => {
    const limpia = sanitizarUrl(`${BASE}/?gclid=abc&utm_source=google&token_hash=SECRETO&type=recovery`)
    expect(limpia).toContain('gclid=abc')
    expect(limpia).toContain('utm_source=google')
    expect(limpia).not.toContain('SECRETO')
    expect(limpia).not.toContain('type=')
  })

  it('URL inválida → vacío', () => {
    expect(sanitizarUrl('no es url')).toBe('')
  })
})

describe('urlNecesitaSaneo', () => {
  it('URL pública limpia o con campaña: no (medición estándar)', () => {
    expect(urlNecesitaSaneo(`${BASE}/`)).toBe(false)
    expect(urlNecesitaSaneo(`${BASE}/solicitar`)).toBe(false)
    expect(urlNecesitaSaneo(`${BASE}/?gclid=abc&utm_campaign=x`)).toBe(false)
    expect(urlNecesitaSaneo(`${BASE}/?_gl=1*abc&srsltid=xyz`)).toBe(false)
  })

  it('páginas con token o query no permitida: sí', () => {
    expect(urlNecesitaSaneo(`${BASE}/servicio/${UUID}`)).toBe(true)
    expect(urlNecesitaSaneo(`${BASE}/?token_hash=x&type=recovery`)).toBe(true)
  })
})
