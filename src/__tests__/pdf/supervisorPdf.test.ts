import { describe, it, expect } from 'vitest'
import {
  construirPdfListadoSupervisor,
  construirPdfDetalleSolicitud,
  type SolicitudListado,
  type SolicitudDetallePdf,
  type ImagenEvidencia,
} from '@/lib/pdf/supervisorPdf'

// JPEG 1×1 real — addImage lo decodifica sin canvas, así la grilla se puede
// testear en Node (la carga vía Image/canvas solo corre en el navegador).
const JPEG_1PX =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

const imagen = (over: Partial<ImagenEvidencia> = {}): ImagenEvidencia => ({
  dataUrl: JPEG_1PX,
  ancho: 800,
  alto: 600,
  titulo: 'Diagnóstico 1',
  subida_at: '2026-07-07T14:30:00Z',
  grupo: 'diagnostico',
  ...over,
})

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

  it('incluye el código de falla y su descripción (tabla + resumen)', () => {
    const doc = construirPdfListadoSupervisor(
      { nombre: 'Lorena', ambito: 'garantia', marca: 'MABE' },
      [
        solListado({ codigo_falla: 'D5', descripcion_falla: 'No centrifuga' }),
        solListado({ id: 'otra', codigo_falla: 'D5', descripcion_falla: 'No centrifuga' }),
        solListado({ id: 'tercera', codigo_falla: 'B2', descripcion_falla: 'Fuga de agua' }),
      ],
    )
    const texto = doc.output()
    expect(texto).toContain('D5')
    expect(texto).toContain('No centrifuga')
    expect(texto).toContain('B2')
    expect(texto).toContain('Fuga de agua')
    expect(texto).toContain('Descripción falla')
  })

  it('omite el resumen de fallas cuando ninguna solicitud tiene diagnóstico', () => {
    const doc = construirPdfListadoSupervisor(
      { nombre: 'Lorena', ambito: 'garantia', marca: 'MABE' },
      [solListado()],
    )
    expect(doc.output()).not.toContain('Casos')
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

  it('imprime el código de falla del diagnóstico con su descripción', () => {
    const doc = construirPdfDetalleSolicitud(
      {
        ...solDetalle,
        triaje_resultado: {
          codigo_falla: 'D5',
          descripcion_falla: 'No centrifuga',
          complejidad_falla: 'Media',
          diagnostico_tecnico: 'Rodamiento del tambor desgastado',
        },
      },
      null,
      [],
      null,
    )
    const texto = doc.output()
    expect(texto).toContain('D5')
    expect(texto).toContain('No centrifuga')
    expect(texto).toContain('Media')
  })

  it('embebe la galería con las fechas de subida y la firma del cliente', () => {
    const paginasSinFotos = construirPdfDetalleSolicitud(solDetalle, null, [], null).getNumberOfPages()
    const doc = construirPdfDetalleSolicitud(solDetalle, null, [], null, [
      imagen(),
      imagen({ titulo: 'Diagnóstico 2' }),
      imagen({ titulo: 'Completación 1', grupo: 'completacion', subida_at: '2026-07-08T20:05:00Z' }),
      imagen({ titulo: 'Firma del cliente', grupo: 'firma', subida_at: '2026-07-08T20:10:00Z' }),
    ])
    const texto = doc.output()
    expect(texto).toContain('Evidencia fotográfica')
    expect(texto).toContain('Fotos del diagnóstico')
    expect(texto).toContain('Fotos del servicio completado')
    expect(texto).toContain('Firma del cliente')
    expect(texto).toContain('Subida:')
    // La galería siempre abre página propia.
    expect(doc.getNumberOfPages()).toBeGreaterThan(paginasSinFotos)
  })

  it('rotula las imágenes sin fecha de subida en vez de omitirlas', () => {
    const doc = construirPdfDetalleSolicitud(solDetalle, null, [], null, [imagen({ subida_at: null })])
    expect(doc.output()).toContain('Fecha de subida no disponible')
  })

  it('no agrega la galería cuando no hay imágenes', () => {
    const doc = construirPdfDetalleSolicitud(solDetalle, null, [], null, [])
    expect(doc.output()).not.toContain('Evidencia fotográfica')
  })

  it('no revienta sin técnico, sin eventos y sin evidencia', () => {
    const doc = construirPdfDetalleSolicitud(solDetalle, null, [], null)
    expect(comoPdf(doc).length).toBeGreaterThan(0)
  })
})
