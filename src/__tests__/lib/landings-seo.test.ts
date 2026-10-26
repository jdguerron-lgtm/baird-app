import { describe, it, expect } from 'vitest'
import { SERVICIOS_SEO } from '@/lib/constants/servicios-seo'
import { MARCAS_LANDING } from '@/lib/constants/marcas-seo'
import { TARIFAS_MANTENIMIENTO } from '@/types/solicitud'
import { urlWhatsAppAtencion, WHATSAPP_ATENCION } from '@/lib/constants/contacto'

const todas = [...SERVICIOS_SEO, ...MARCAS_LANDING]

describe('landings SEO /servicios/[slug]', () => {
  it('no hay slugs repetidos entre equipos y marcas (comparten la ruta)', () => {
    const slugs = todas.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  // Google corta por ancho en píxeles (~600 px ≈ 60–65 caracteres en español).
  it('títulos ≤ 65 y descripciones ≤ 160 caracteres', () => {
    for (const p of todas) {
      expect(p.metaTitle.length, p.slug).toBeLessThanOrEqual(65)
      expect(p.metaDescription.length, p.slug).toBeLessThanOrEqual(160)
    }
  })

  it('cada equipo de una marca enlaza a una landing de equipo que existe y tiene tarifa', () => {
    const slugsEquipo = new Set(SERVICIOS_SEO.map((s) => s.slug))
    for (const m of MARCAS_LANDING) {
      for (const e of m.equipos) {
        expect(slugsEquipo.has(e.slugServicio), `${m.slug} → ${e.slugServicio}`).toBe(true)
        expect(TARIFAS_MANTENIMIENTO[e.equipo], e.equipo).toBeGreaterThan(0)
      }
    }
  })

  it('ninguna landing de marca se presenta como servicio técnico oficial', () => {
    for (const m of MARCAS_LANDING) {
      const textoAfirmativo = [m.metaTitle, m.metaDescription, m.h1, m.intro].join(' ').toLowerCase()
      expect(textoAfirmativo, m.slug).not.toMatch(/oficial/)
    }
  })

  it('Whirlpool aclara que no es servicio oficial ni atiende su garantía', () => {
    const w = MARCAS_LANDING.find((m) => m.marca === 'Whirlpool')!
    expect(w.aviso).toMatch(/No somos el servicio técnico oficial/)
    expect(w.garantia).toBeUndefined()
  })

  it('el singular del equipo corrige "Tu aires acondicionado"', () => {
    const aire = SERVICIOS_SEO.find((s) => s.equipo === 'Aire Acondicionado')!
    expect(aire.singular).toBe('aire acondicionado')
  })
})

describe('contacto WhatsApp', () => {
  it('arma el link wa.me con el mensaje codificado', () => {
    expect(urlWhatsAppAtencion('Hola, mi nevera')).toBe(`https://wa.me/${WHATSAPP_ATENCION}?text=Hola%2C%20mi%20nevera`)
  })
})
