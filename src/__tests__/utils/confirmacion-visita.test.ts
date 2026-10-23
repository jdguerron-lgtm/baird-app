import { describe, it, expect } from 'vitest'
import {
  aceptacionCuentaComoConfirmacion,
  armarAgendaTecnico,
  armarAlertaAdmin,
  etiquetaFranjaCorta,
  franjaDeVisita,
  MAX_CHARS_LINEA_AGENDA,
  nombreCorto,
  proximidadVisita,
  type ServicioAgenda,
} from '@/lib/utils/confirmacion-visita'

// "Ahora" fijo: miércoles 2026-10-22 16:00 Bogotá (21:00Z).
const AHORA = new Date('2026-10-22T21:00:00Z')
// Franja 8am Bogotá = 13:00Z.
const HOY_8AM = '2026-10-22T13:00:00.000Z'
const MANANA_8AM = '2026-10-23T13:00:00.000Z'
const MANANA_12PM = '2026-10-23T17:00:00.000Z'
const PASADO_MANANA_8AM = '2026-10-24T13:00:00.000Z'
const AYER_8AM = '2026-10-21T13:00:00.000Z'

function servicio(partial: Partial<ServicioAgenda> & { id: string; fecha_visita_at: string }): ServicioAgenda {
  return {
    cliente_nombre: 'Juan Pérez',
    tipo_equipo: 'Lavadora',
    marca_equipo: 'Mabe',
    es_garantia: true,
    direccion: 'Calle 100 #15-20',
    zona_servicio: 'Chapinero',
    ciudad_pueblo: 'Bogotá',
    visita_confirmada_at: null,
    ...partial,
  }
}

describe('proximidadVisita', () => {
  it('clasifica por día Colombia', () => {
    expect(proximidadVisita(HOY_8AM, AHORA)).toBe('hoy')
    expect(proximidadVisita(MANANA_8AM, AHORA)).toBe('manana')
    expect(proximidadVisita(PASADO_MANANA_8AM, AHORA)).toBe('futura')
    expect(proximidadVisita(AYER_8AM, AHORA)).toBe('pasada')
  })

  it('null sin fecha o con fecha inválida', () => {
    expect(proximidadVisita(null, AHORA)).toBeNull()
    expect(proximidadVisita('no-es-fecha', AHORA)).toBeNull()
  })
})

describe('aceptacionCuentaComoConfirmacion', () => {
  it('visita mañana (≤36h) → la aceptación confirma', () => {
    expect(aceptacionCuentaComoConfirmacion(MANANA_8AM, AHORA)).toBe(true)
    expect(aceptacionCuentaComoConfirmacion(MANANA_12PM, AHORA)).toBe(true)
  })

  it('visita pasado mañana (>36h) → no confirma, el recordatorio se la pedirá', () => {
    // 2026-10-24 08:00 CO está a 40 h de las 16:00 del 22.
    expect(aceptacionCuentaComoConfirmacion(PASADO_MANANA_8AM, AHORA)).toBe(false)
  })

  it('visita de HOY que ya empezó (franja 8am, son las 4pm) → sí cuenta', () => {
    expect(aceptacionCuentaComoConfirmacion(HOY_8AM, AHORA)).toBe(true)
  })

  it('visita de ayer → no', () => {
    expect(aceptacionCuentaComoConfirmacion(AYER_8AM, AHORA)).toBe(false)
  })

  it('sin fecha → no', () => {
    expect(aceptacionCuentaComoConfirmacion(null, AHORA)).toBe(false)
  })
})

describe('franjaDeVisita / etiquetaFranjaCorta / nombreCorto', () => {
  it('franja desde fecha_visita_at y etiqueta corta', () => {
    expect(franjaDeVisita(MANANA_12PM)).toBe('12pm-3pm')
    expect(etiquetaFranjaCorta('8am-12pm')).toBe('8am - 12pm')
    expect(etiquetaFranjaCorta('desconocida')).toBe('desconocida')
  })

  it('nombre corto: primer nombre + inicial del apellido', () => {
    expect(nombreCorto('Carlos Mauricio Bonilla Agudelo')).toBe('Carlos B.')
    expect(nombreCorto('Germán Arcos')).toBe('Germán A.')
    expect(nombreCorto('Néstor')).toBe('Néstor')
    expect(nombreCorto('')).toBe('—')
  })
})

describe('armarAgendaTecnico', () => {
  const base = {
    nombre: 'Carlos Mauricio Bonilla',
    fechaYMD: '2026-10-23',
    portalUrl: 'https://lineablanca.bairdservice.com/tecnico/tok',
  }

  it('lista servicios ordenados por franja, marca confirmadas y cuenta pendientes', () => {
    const r = armarAgendaTecnico({
      ...base,
      servicios: [
        servicio({ id: 'b', fecha_visita_at: MANANA_12PM, cliente_nombre: 'Ana Gómez', visita_confirmada_at: '2026-10-22T20:00:00Z', es_garantia: false, tipo_equipo: 'Nevera', marca_equipo: 'LG' }),
        servicio({ id: 'a', fecha_visita_at: MANANA_8AM }),
      ],
      bloqueos: [{ franja: '3pm-6pm', titulo: 'Taller particular', bloquea_franja: true }],
    })
    expect(r.totalServicios).toBe(2)
    expect(r.totalBloqueos).toBe(1)
    expect(r.pendientes).toBe(1)
    expect(r.texto).toContain('Hola Carlos 👋 Tu agenda Baird de mañana, viernes, 23 de octubre')
    expect(r.texto).toContain('🔧 Servicios Baird (2)')
    // 8am antes que 12pm aunque llegaron al revés
    expect(r.texto.indexOf('Juan Pérez')).toBeLessThan(r.texto.indexOf('Ana Gómez'))
    expect(r.texto).toContain('Lavadora Mabe (garantía)')
    expect(r.texto).toContain('⏳ sin confirmar')
    expect(r.texto).toContain('✅ confirmada')
    expect(r.texto).toContain('📌 Tus compromisos (1)')
    expect(r.texto).toContain('3pm - 6pm · Taller particular (franja cerrada)')
    expect(r.texto).toContain('"No alcanzo"')
    expect(r.texto).toContain(base.portalUrl)
    expect(r.resumen).toBe('2 servicios Baird y 1 compromiso propio')
    expect(r.linea).toContain('8am - 12pm Juan Pérez (Lavadora Mabe (garantía), Chapinero)')
    expect(r.linea).toContain('Ana Gómez (Nevera LG, Chapinero) ✓')
    expect(r.linea).toContain('Propio 3pm - 6pm: Taller particular')
    expect(r.linea).not.toContain('\n')
  })

  it('todo confirmado → agradece en vez de pedir confirmación', () => {
    const r = armarAgendaTecnico({
      ...base,
      servicios: [servicio({ id: 'a', fecha_visita_at: MANANA_8AM, visita_confirmada_at: '2026-10-22T20:00:00Z' })],
      bloqueos: [],
    })
    expect(r.pendientes).toBe(0)
    expect(r.texto).toContain('ya están confirmadas')
    expect(r.texto).not.toContain('📌 Tus compromisos')
    expect(r.resumen).toBe('1 servicio Baird')
  })

  it('la línea de la plantilla respeta el tope', () => {
    const muchos = Array.from({ length: 30 }, (_, i) =>
      servicio({ id: `s${i}`, fecha_visita_at: MANANA_8AM, cliente_nombre: `Cliente Con Nombre Largo Número ${i}` }),
    )
    const r = armarAgendaTecnico({ ...base, servicios: muchos, bloqueos: [] })
    expect(r.linea.length).toBeLessThanOrEqual(MAX_CHARS_LINEA_AGENDA)
    expect(r.linea.endsWith('…')).toBe(true)
  })
})

describe('armarAlertaAdmin', () => {
  const appUrl = 'https://lineablanca.bairdservice.com'

  it("'' cuando no hay nada que hacer", () => {
    expect(armarAlertaAdmin({ fechaYMD: '2026-10-23', sinConfirmar: [], sinTecnico: [], confirmadas: 3, appUrl })).toBe('')
  })

  it('lista sin confirmar y sin técnico con link a la ficha', () => {
    const t = armarAlertaAdmin({
      fechaYMD: '2026-10-23',
      sinConfirmar: [
        { id: 'x1', cliente_nombre: 'Juan Pérez', equipo: 'Lavadora Mabe', franja: '12pm-3pm', ciudad: 'Bogotá', tecnico: 'Carlos B.' },
        { id: 'x2', cliente_nombre: 'Luis Díaz', equipo: 'Nevera LG', franja: '8am-12pm', ciudad: 'Bogotá', tecnico: 'Carlos B.' },
      ],
      sinTecnico: [{ id: 'y1', cliente_nombre: 'Ana Gómez', equipo: 'Estufa Mabe', franja: '8am-12pm', ciudad: 'Soacha', tecnico: null }],
      confirmadas: 2,
      appUrl,
    })
    expect(t).toContain('Visitas de mañana (viernes, 23 de octubre)')
    expect(t).toContain('⏳ Con técnico, SIN confirmar (2)')
    // ordenadas por franja: Luis (8am) antes que Juan (12pm)
    expect(t.indexOf('Luis Díaz')).toBeLessThan(t.indexOf('Juan Pérez'))
    expect(t).toContain(`${appUrl}/admin/solicitudes/x1`)
    expect(t).toContain('✅ Confirmadas: 2')
    expect(t).toContain('🚫 Sin técnico (1)')
    expect(t).toContain('Ana Gómez · Estufa Mabe · Soacha')
    expect(t).toContain('Liberar técnico y reofertar')
  })
})
