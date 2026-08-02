import { describe, it, expect } from 'vitest'
import {
  construirPdfListadoSupervisor,
  construirPdfDetalleSolicitud,
  type SolicitudListado,
  type SolicitudDetallePdf,
} from '@/lib/pdf/supervisorPdf'

const solListado = (over: Partial<SolicitudListado> = {}): SolicitudListado => ({
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  cliente_nombre: 'María Pérez',
  cliente_telefono: '573001234567',
  ciudad_pueblo: 'Bogotá',
  zona_servicio: 'Chapinero',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'MABE',
  estado: 'completada',
  pago_tecnico: 80000,
  precio_cliente: 120000,
  es_garantia: true,
  created_at: '2026-07-01T10:00:00Z',
  tecnico_nombre: 'Carlos Ruiz',
  ...over,
})

const solDetalle: SolicitudDetallePdf = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  cliente_nombre: 'María Pérez',
  cliente_telefono: '573001234567',
  direccion: 'Calle 1 # 2-3',
  ciudad_pueblo: 'Bogotá',
  zona_servicio: 'Chapinero',
  marca_equipo: 'MABE',
  tipo_equipo: 'Lavadora',
  tipo_solicitud: 'reparacion',
  novedades_equipo: 'No centrifuga',
  es_garantia: false,
  ai_pre_diagnostico: null,
  estado: 'cotizacion_enviada',
  created_at: '2026-07-01T10:00:00Z',
  numero_serie_factura: 'F-123',
  pago_tecnico: null,
  precio_cliente: 150000,
  horario_visita_1: 'lunes, 7 de julio · 8am-12pm',
  horario_visita_2: null,
  horario_confirmado: 'lunes, 7 de julio · 8am-12pm',
  cotizacion: { total: 150000 },
  triaje_resultado: null,
  fecha_visita_at: '2026-07-07T13:00:00Z',
  cancelado_at: null,
  motivo_cancelacion: null,
}

function comoPdf(doc: { output: (t: 'arraybuffer') => ArrayBuffer }): Uint8Array {
  return new Uint8Array(doc.output('arraybuffer'))
}

describe('construirPdfListadoSupervisor', () => {
  it('genera un PDF válido con resumen y tabla', () => {
    const doc = construirPdfListadoSupervisor(
      { nombre: 'Lorena', ambito: 'garantia', marca: 'MABE' },
      [solListado(), solListado({ es_garantia: false, estado: 'notificada', tecnico_nombre: null })],
    )
    const bytes = comoPdf(doc)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    const texto = doc.output()
    expect(texto).toContain('Baird Service')
    expect(texto).toContain('Lorena')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('no revienta con cero solicitudes', () => {
    const doc = construirPdfListadoSupervisor({ nombre: 'Henry', ambito: 'todos', marca: null }, [])
    expect(comoPdf(doc).length).toBeGreaterThan(0)
  })

  it('pagina bien con muchas filas', () => {
    const muchas = Array.from({ length: 120 }, (_, i) => solListado({ id: `id-${i}` }))
    const doc = construirPdfListadoSupervisor({ nombre: 'Henry', ambito: 'todos', marca: null }, muchas)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})

describe('construirPdfDetalleSolicitud', () => {
  it('genera la ficha completa con técnico, eventos y evidencia', () => {
    const doc = construirPdfDetalleSolicitud(
      solDetalle,
      { nombre_completo: 'Carlos Ruiz', whatsapp: '573134951164', ciudad_pueblo: 'Bogotá' },
      [
        {
          tipo: 'cambio_estado',
          estado_previo: 'asignada',
          estado_nuevo: 'cotizacion_enviada',
          actor: 'tecnico',
          motivo: null,
          ocurrido_at: '2026-07-07T15:00:00Z',
        },
      ],
      {
        fotos: ['https://example.com/foto1.jpg'],
        checklist: {
          diagnostico_realizado: true,
          pieza_reemplazada: false,
          prueba_encendido: true,
          prueba_ciclo_completo: false,
          limpieza_area: true,
          explicacion_cliente: true,
          notas_tecnico: 'Rodamiento desgastado',
        },
        firma_url: 'https://example.com/firma.png',
        completado_at: '2026-07-08T20:00:00Z',
        confirmado: true,
        confirmado_at: '2026-07-08T21:00:00Z',
        cliente_comentario: 'Excelente servicio',
      },
    )
    const bytes = comoPdf(doc)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    const texto = doc.output()
    expect(texto).toContain('Baird Service')
    expect(texto).toContain('Carlos Ruiz')
    expect(texto).toContain('Rodamiento desgastado')
  })

  it('no revienta sin técnico, sin eventos y sin evidencia', () => {
    const doc = construirPdfDetalleSolicitud(solDetalle, null, [], null)
    expect(comoPdf(doc).length).toBeGreaterThan(0)
  })
})
