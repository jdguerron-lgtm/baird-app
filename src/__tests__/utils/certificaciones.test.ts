import { describe, it, expect } from 'vitest'
import {
  CERTIFICACIONES,
  CERTIFICACION_POR_ID,
  aplicarDeclaracionTecnico,
  certificacionesAplicables,
  certificacionVigente,
  estadoGasTecnico,
  parseCertificaciones,
} from '@/lib/constants/certificaciones'
import { ESPECIALIDADES, ESPECIALIDADES_INFO, TIPO_A_ESPECIALIDAD, esPosibleGasodomestico } from '@/lib/constants/especialidades'
import { TIPOS_EQUIPO } from '@/types/solicitud'

describe('catálogo de especialidades', () => {
  it('todo tipo_equipo del formulario mapea a una especialidad registrable', () => {
    for (const tipo of TIPOS_EQUIPO) {
      const esp = TIPO_A_ESPECIALIDAD[tipo]
      expect(esp, `tipo_equipo "${tipo}" sin especialidad`).toBeDefined()
      expect(ESPECIALIDADES).toContain(esp)
    }
  })

  it('cada especialidad tiene descripción de alcance', () => {
    for (const esp of ESPECIALIDADES) {
      expect(ESPECIALIDADES_INFO[esp].cubre.length).toBeGreaterThan(10)
    }
  })

  it('detecta tipos de equipo que pueden ser gasodomésticos', () => {
    expect(esPosibleGasodomestico('Estufa')).toBe(true)
    expect(esPosibleGasodomestico('Secadora')).toBe(true)
    expect(esPosibleGasodomestico('Nevera')).toBe(false)
    expect(esPosibleGasodomestico(null)).toBe(false)
  })
})

describe('catálogo de certificaciones', () => {
  it('ids únicos y catálogo indexado', () => {
    const ids = CERTIFICACIONES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(CERTIFICACION_POR_ID).sort()).toEqual([...ids].sort())
  })

  it('aplicaA solo referencia especialidades existentes', () => {
    for (const c of CERTIFICACIONES) {
      if (c.aplicaA === 'todos') continue
      for (const esp of c.aplicaA) expect(ESPECIALIDADES).toContain(esp)
    }
  })

  it('exactamente una certificación es requerida para gas y es la de competencia', () => {
    const req = CERTIFICACIONES.filter(c => c.requeridaParaGas)
    expect(req.map(c => c.id)).toEqual(['competencia_gas'])
    expect(req[0].soloGas).toBe(true)
    expect(req[0].declarable).toBe(true)
  })
})

describe('certificacionesAplicables', () => {
  it('técnico de neveras sin gas: refrigeración sí, gas no, alturas no', () => {
    const ids = certificacionesAplicables(['Neveras y Nevecones'], false).map(c => c.id)
    expect(ids).toContain('refrigeracion_sena')
    expect(ids).toContain('manejo_refrigerantes')
    expect(ids).toContain('conte')
    expect(ids).not.toContain('competencia_gas')
    expect(ids).not.toContain('trabajo_alturas')
  })

  it('técnico de estufas que cubre gas: competencia_gas aplica', () => {
    const ids = certificacionesAplicables(['Hornos y Estufas'], true).map(c => c.id)
    expect(ids).toContain('competencia_gas')
    expect(ids).not.toContain('refrigeracion_sena')
  })

  it('gas no informado (null): las de gas se muestran igual', () => {
    const ids = certificacionesAplicables(['Hornos y Estufas'], null).map(c => c.id)
    expect(ids).toContain('competencia_gas')
  })

  it('compara especialidades sin tildes ni mayúsculas', () => {
    const ids = certificacionesAplicables(['aires acondicionados'], false).map(c => c.id)
    expect(ids).toContain('trabajo_alturas')
  })
})

describe('certificacionVigente / estadoGasTecnico', () => {
  const hoy = new Date('2026-10-08T12:00:00Z')

  it('solo verificada y no vencida cuenta', () => {
    expect(certificacionVigente(undefined, hoy)).toBe(false)
    expect(certificacionVigente({ estado: 'declarada' }, hoy)).toBe(false)
    expect(certificacionVigente({ estado: 'verificada' }, hoy)).toBe(true)
    expect(certificacionVigente({ estado: 'verificada', vence: '2026-10-08' }, hoy)).toBe(true)
    expect(certificacionVigente({ estado: 'verificada', vence: '2026-10-07' }, hoy)).toBe(false)
  })

  it('resume el estado de gas del técnico', () => {
    expect(estadoGasTecnico(null, {}, hoy)).toBe('no_informado')
    expect(estadoGasTecnico(false, {}, hoy)).toBe('no_cubre')
    expect(estadoGasTecnico(true, {}, hoy)).toBe('cubre_sin_certificado')
    expect(estadoGasTecnico(true, { competencia_gas: { estado: 'declarada' } }, hoy)).toBe('cubre_sin_certificado')
    expect(estadoGasTecnico(true, { competencia_gas: { estado: 'verificada', vence: '2028-01-01' } }, hoy)).toBe('cubre_certificado')
    expect(estadoGasTecnico(true, { competencia_gas: { estado: 'verificada', vence: '2020-01-01' } }, hoy)).toBe('cubre_sin_certificado')
  })
})

describe('parseCertificaciones', () => {
  it('tolera null, arrays legacy y basura', () => {
    expect(parseCertificaciones(null)).toEqual({})
    expect(parseCertificaciones([])).toEqual({})
    expect(parseCertificaciones('x')).toEqual({})
    expect(parseCertificaciones({ inventada: { estado: 'verificada' } })).toEqual({})
  })

  it('normaliza estados inválidos a sin_revisar y conserva campos', () => {
    const out = parseCertificaciones({
      conte: { estado: 'lo-que-sea', numero: 'TE6-123', vence: 7 },
      competencia_gas: { estado: 'verificada', entidad: 'SENA', vence: '2029-01-01' },
    })
    expect(out.conte?.estado).toBe('sin_revisar')
    expect(out.conte?.numero).toBe('TE6-123')
    expect(out.conte?.vence).toBeUndefined()
    expect(out.competencia_gas).toMatchObject({ estado: 'verificada', entidad: 'SENA', vence: '2029-01-01' })
  })
})

describe('aplicarDeclaracionTecnico', () => {
  const ahora = new Date('2026-10-08T15:00:00Z')

  it('siembra "declarada" y conserva "no la tengo" como sin_revisar con nota', () => {
    const out = aplicarDeclaracionTecnico({}, { competencia_gas: true, conte: false }, 'registro', ahora)
    expect(out.competencia_gas).toMatchObject({ estado: 'declarada', actualizado_por: 'registro' })
    expect(out.conte).toMatchObject({ estado: 'sin_revisar', actualizado_por: 'registro' })
    expect(out.conte?.nota).toMatch(/NO tenerla/)
  })

  it('NUNCA pisa una decisión del admin', () => {
    const actual = {
      competencia_gas: { estado: 'verificada' as const, numero: 'ABC', actualizado_por: 'admin@x' },
      conte: { estado: 'rechazada' as const },
    }
    const out = aplicarDeclaracionTecnico(actual, { competencia_gas: false, conte: true }, 'portal', ahora)
    expect(out.competencia_gas).toEqual(actual.competencia_gas)
    expect(out.conte).toEqual(actual.conte)
  })

  it('ignora ids desconocidos y undefined', () => {
    const out = aplicarDeclaracionTecnico({}, { inventada: true, conte: undefined } as never, 'portal', ahora)
    expect(out).toEqual({})
  })
})
