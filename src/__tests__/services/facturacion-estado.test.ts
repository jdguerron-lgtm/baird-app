import { describe, expect, it } from 'vitest'
import {
  facturacionEstadoBodySchema,
  prepararCambioFacturacion,
  describirCambioFacturacion,
} from '@/lib/services/facturacion-estado.service'
import { API_LECTURA_ESCRITURA_PERMITIDA, debeBloquearSoloLectura, type ContextoGuard } from '@/lib/auth/soloLectura'

/**
 * Seguimiento de facturación (2026-10-22): validación del body, reglas de
 * transición y la excepción del rol lectura en el guard del navegador.
 */

const ID = '6c7efe75-6309-432e-8809-61d2a5013e3e'
const ACTOR = 'logistica@encompasslatam.com'
const AHORA = new Date('2026-10-22T15:00:00Z')

describe('facturacionEstadoBodySchema', () => {
  it('acepta el body mínimo y recorta espacios', () => {
    const r = facturacionEstadoBodySchema.safeParse({
      solicitud_id: ID,
      facturacion_estado: 'facturada',
      factura_numero: '  FV-2-1524 ',
      facturacion_nota: ' nota ',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.factura_numero).toBe('FV-2-1524')
      expect(r.data.facturacion_nota).toBe('nota')
    }
  })

  it('rechaza id no uuid, estado desconocido y textos demasiado largos', () => {
    expect(facturacionEstadoBodySchema.safeParse({ solicitud_id: 'abc', facturacion_estado: 'facturada' }).success).toBe(false)
    expect(facturacionEstadoBodySchema.safeParse({ solicitud_id: ID, facturacion_estado: 'pagada' }).success).toBe(false)
    expect(
      facturacionEstadoBodySchema.safeParse({ solicitud_id: ID, facturacion_estado: 'facturada', factura_numero: 'X'.repeat(41) }).success,
    ).toBe(false)
    expect(
      facturacionEstadoBodySchema.safeParse({ solicitud_id: ID, facturacion_estado: 'pendiente', facturacion_nota: 'n'.repeat(501) }).success,
    ).toBe(false)
  })

  it('rechaza body nulo', () => {
    expect(facturacionEstadoBodySchema.safeParse(null).success).toBe(false)
  })
})

describe('prepararCambioFacturacion — reglas de transición', () => {
  const completada = { id: ID, estado: 'completada', facturacion_estado: 'pendiente', factura_numero: null }

  it('solo aplica a solicitudes completadas (409 en cualquier otro estado)', () => {
    for (const estado of ['asignada', 'en_proceso', 'cancelada', 'confirmacion_pendiente', null]) {
      const r = prepararCambioFacturacion({ id: ID, estado }, { solicitud_id: ID, facturacion_estado: 'facturada', factura_numero: 'FV-2-1' }, ACTOR, AHORA)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(409)
    }
  })

  it('facturada exige número de factura (400 si falta o viene vacío)', () => {
    const sin = prepararCambioFacturacion(completada, { solicitud_id: ID, facturacion_estado: 'facturada' }, ACTOR, AHORA)
    expect(sin.ok).toBe(false)
    if (!sin.ok) expect(sin.status).toBe(400)
    const vacio = prepararCambioFacturacion(completada, { solicitud_id: ID, facturacion_estado: 'facturada', factura_numero: '   ' }, ACTOR, AHORA)
    expect(vacio.ok).toBe(false)
  })

  it('facturada guarda número, fecha, actor y nota + evento con antes/después', () => {
    const r = prepararCambioFacturacion(
      completada,
      { solicitud_id: ID, facturacion_estado: 'facturada', factura_numero: 'FV-2-1524', facturacion_nota: 'quincena 2' },
      ACTOR,
      AHORA,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.update).toEqual({
      facturacion_estado: 'facturada',
      factura_numero: 'FV-2-1524',
      facturada_at: AHORA.toISOString(),
      facturada_por: ACTOR,
      facturacion_nota: 'quincena 2',
    })
    expect(r.payload).toEqual({
      origen: 'facturacion_estado',
      antes: { facturacion_estado: 'pendiente', factura_numero: null },
      despues: { facturacion_estado: 'facturada', factura_numero: 'FV-2-1524' },
      nota: 'quincena 2',
    })
    expect(r.motivo).toContain('FV-2-1524')
    expect(r.motivo).toContain('antes: pendiente')
  })

  it('pendiente limpia número, fecha y quién', () => {
    const facturada = { id: ID, estado: 'completada', facturacion_estado: 'facturada', factura_numero: 'FV-2-1524' }
    const r = prepararCambioFacturacion(facturada, { solicitud_id: ID, facturacion_estado: 'pendiente' }, ACTOR, AHORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.update).toEqual({
      facturacion_estado: 'pendiente',
      factura_numero: null,
      facturada_at: null,
      facturada_por: null,
      facturacion_nota: null,
    })
    expect(r.payload.antes).toEqual({ facturacion_estado: 'facturada', factura_numero: 'FV-2-1524' })
    expect(r.payload.despues).toEqual({ facturacion_estado: 'pendiente', factura_numero: null })
  })

  it('no_aplica no exige número (lo descarta si viene) y registra fecha/actor', () => {
    const r = prepararCambioFacturacion(completada, { solicitud_id: ID, facturacion_estado: 'no_aplica', factura_numero: 'FV-x' }, ACTOR, AHORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.update.facturacion_estado).toBe('no_aplica')
    expect(r.update.factura_numero).toBeNull()
    expect(r.update.facturada_at).toBe(AHORA.toISOString())
    expect(r.update.facturada_por).toBe(ACTOR)
  })

  it('una solicitud sin columna (migración no aplicada) se trata como pendiente', () => {
    const r = prepararCambioFacturacion({ id: ID, estado: 'completada' }, { solicitud_id: ID, facturacion_estado: 'no_aplica' }, ACTOR, AHORA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.antes.facturacion_estado).toBe('pendiente')
  })
})

describe('describirCambioFacturacion', () => {
  it('arma el texto del historial', () => {
    expect(describirCambioFacturacion('pendiente', 'facturada', 'FV-2-9', null)).toBe('Facturación: facturada (FV-2-9) · antes: pendiente')
    expect(describirCambioFacturacion('facturada', 'pendiente', null, 'error de número')).toBe('Facturación: vuelve a pendiente · antes: facturada · error de número')
    expect(describirCambioFacturacion('pendiente', 'no_aplica', null, null)).toBe('Facturación: no aplica · antes: pendiente')
    expect(describirCambioFacturacion('facturada', 'facturada', 'FV-2-10', null)).toBe('Facturación: facturada (FV-2-10)')
  })
})

describe('guard solo lectura — excepción de facturación', () => {
  const ctx: ContextoGuard = { origen: 'https://lineablanca.bairdservice.com', supabaseUrl: 'https://abc.supabase.co' }
  const b = (url: string, metodo: string) => debeBloquearSoloLectura(url, metodo, ctx)

  it('la única escritura permitida es exactamente /api/admin/facturacion-estado', () => {
    expect(API_LECTURA_ESCRITURA_PERMITIDA).toEqual(['/api/admin/facturacion-estado'])
    expect(b('/api/admin/facturacion-estado', 'POST')).toBe(false)
    expect(b('https://lineablanca.bairdservice.com/api/admin/facturacion-estado', 'POST')).toBe(false)
  })

  it('no abre subrutas, prefijos parecidos ni otros endpoints de escritura', () => {
    expect(b('/api/admin/facturacion-estado/otro', 'POST')).toBe(true)
    expect(b('/api/admin/facturacion-estado-x', 'POST')).toBe(true)
    expect(b('/api/admin/cambiar-estado', 'POST')).toBe(true)
    expect(b('/api/admin/notas', 'POST')).toBe(true)
    expect(b('https://abc.supabase.co/rest/v1/solicitudes_servicio?id=eq.1', 'PATCH')).toBe(true)
  })
})
