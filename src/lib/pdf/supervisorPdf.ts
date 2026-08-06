import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ESTADO_LABELS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import type { ChecklistServicio } from '@/types/solicitud'

/**
 * Generación client-side de los PDF del portal de supervisores (solo lectura).
 * Se importa con dynamic import desde las páginas para que jsPDF no entre al
 * bundle inicial del portal.
 *
 * Dos reportes:
 *  - generarPdfListadoSupervisor: todas las solicitudes del alcance del
 *    supervisor (resumen por estado + tabla completa).
 *  - generarPdfDetalleSolicitud: ficha completa de una solicitud (cliente,
 *    equipo, agenda, técnico, evidencia e historial).
 *
 * La ficha embebe las fotos y la firma del cliente (2026-08-06). El bucket
 * `evidencias-servicio` es público y responde `Access-Control-Allow-Origin: *`,
 * así que el navegador puede leerlas a canvas sin manchar el contexto. Cada
 * imagen se reescala a MAX_PX y se recodifica a JPEG antes de entrar al PDF:
 * los originales pesan ~1,7 MB y el documento sería inmanejable. La carga vive
 * en `generarPdfDetalleSolicitud` (browser); `construirPdfDetalleSolicitud`
 * recibe los bitmaps ya resueltos y sigue siendo puro para poder testearlo.
 */

// ── Tipos (espejo de lo que devuelven /api/supervisor/solicitudes y /solicitud) ──

export interface SolicitudListado {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  estado: string
  pago_tecnico: number
  precio_cliente: number
  es_garantia: boolean
  created_at: string
  tecnico_nombre: string | null
  /** Diagnóstico del técnico, aplanado desde triaje_resultado por la API. */
  codigo_falla?: string | null
  descripcion_falla?: string | null
  complejidad_falla?: string | null
}

export interface SupervisorInfoPdf {
  nombre: string
  ambito: string
  marca: string | null
}

export interface SolicitudDetallePdf {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string | null
  ciudad_pueblo: string | null
  zona_servicio: string | null
  marca_equipo: string | null
  tipo_equipo: string | null
  tipo_solicitud: string | null
  novedades_equipo: string | null
  es_garantia: boolean | null
  ai_pre_diagnostico: string | null
  estado: string
  created_at: string
  numero_serie_factura: string | null
  pago_tecnico: number | null
  precio_cliente: number
  horario_visita_1: string | null
  horario_visita_2: string | null
  horario_confirmado: string | null
  cotizacion: Record<string, unknown> | null
  triaje_resultado: Record<string, unknown> | null
  fecha_visita_at: string | null
  cancelado_at: string | null
  motivo_cancelacion: string | null
}

export interface TecnicoPdf {
  nombre_completo: string
  whatsapp: string | null
  ciudad_pueblo: string | null
}

export interface EventoPdf {
  tipo: string | null
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  motivo: string | null
  ocurrido_at: string | null
}

/** Imagen ya cargada y reescalada, lista para `doc.addImage`. */
export interface ImagenEvidencia {
  /** data:image/jpeg;base64,… */
  dataUrl: string
  /** Dimensiones del bitmap reescalado (para conservar el aspecto en el PDF). */
  ancho: number
  alto: number
  titulo: string
  /** Fecha de subida del archivo (storage), null si no se pudo determinar. */
  subida_at: string | null
  grupo: 'diagnostico' | 'completacion' | 'firma'
}

export interface EvidenciaPdf {
  fotos: string[]
  checklist: ChecklistServicio
  firma_url: string | null
  completado_at: string
  confirmado: boolean | null
  confirmado_at: string | null
  cliente_comentario: string | null
  /** Firma del técnico (juramento). Opcional: no todas las evidencias la traen. */
  oath_firma?: string | null
  oath_firmado_at?: string | null
}

// ── Helpers ──

const AZUL_MARINO: [number, number, number] = [15, 23, 42] // slate-900
const GRIS_TEXTO: [number, number, number] = [71, 85, 105] // slate-600

const AMBITO_LABEL: Record<string, string> = {
  todos: 'Garantía y particular',
  garantia: 'Solo garantía',
  particular: 'Solo particular',
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO')
}

function hoyCO(): string {
  return new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
}

/** Encabezado de marca en cada documento. Devuelve la Y donde sigue el contenido. */
function encabezado(doc: jsPDF, titulo: string, subtitulo: string): number {
  const ancho = doc.internal.pageSize.getWidth()
  doc.setFillColor(...AZUL_MARINO)
  doc.rect(0, 0, ancho, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Baird Service', 14, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Reparación de línea blanca — lineablanca.bairdservice.com', 14, 16)

  doc.setTextColor(...AZUL_MARINO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(titulo, 14, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS_TEXTO)
  doc.text(subtitulo, 14, 38)
  return 44
}

/** Pie con número de página y fecha de generación (todas las páginas). */
function pieDePagina(doc: jsPDF) {
  const paginas = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Generado el ${hoyCO()} · Documento informativo de solo lectura`, 14, alto - 8)
    doc.text(`Página ${i} de ${paginas}`, ancho - 14, alto - 8, { align: 'right' })
  }
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 44
}

/** Tabla clave→valor para las secciones de la ficha. */
function seccionCampos(doc: jsPDF, titulo: string, campos: Array<[string, string]>, startY: number): number {
  autoTable(doc, {
    startY,
    head: [[{ content: titulo, colSpan: 2 }]],
    body: campos,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: AZUL_MARINO, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold', textColor: GRIS_TEXTO },
    },
    margin: { left: 14, right: 14 },
  })
  return finalY(doc) + 6
}

// ── Reporte 1: listado completo del alcance ──

/** Construye el documento (exportado aparte para poder testearlo en Node). */
export function construirPdfListadoSupervisor(
  supervisor: SupervisorInfoPdf,
  solicitudes: SolicitudListado[],
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const alcance = `${AMBITO_LABEL[supervisor.ambito] ?? supervisor.ambito}${supervisor.marca ? ` · ${supervisor.marca}` : ''}`
  let y = encabezado(
    doc,
    `Reporte de servicios — ${supervisor.nombre}`,
    `Alcance: ${alcance} · ${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''}`,
  )

  // Resumen por estado
  const conteo = new Map<string, number>()
  solicitudes.forEach(s => conteo.set(s.estado, (conteo.get(s.estado) ?? 0) + 1))
  const resumen = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([estado, n]) => [ESTADO_LABELS[estado] ?? estado, String(n)])

  if (resumen.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Estado', 'Cantidad']],
      body: [...resumen, ['Total', String(solicitudes.length)]],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: AZUL_MARINO, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right', cellWidth: 25 } },
      tableWidth: 110,
      margin: { left: 14 },
      didParseCell: data => {
        if (data.section === 'body' && data.row.index === resumen.length) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = finalY(doc) + 8
  }

  // Resumen por código de falla — la lectura que le sirve a la marca: qué
  // falla se repite en su parque. Solo aparece si ya hay diagnósticos.
  const conteoFalla = new Map<string, { n: number; descripcion: string }>()
  solicitudes.forEach(s => {
    if (!s.codigo_falla) return
    const previo = conteoFalla.get(s.codigo_falla)
    conteoFalla.set(s.codigo_falla, {
      n: (previo?.n ?? 0) + 1,
      descripcion: previo?.descripcion || s.descripcion_falla || '',
    })
  })

  if (conteoFalla.size > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Código de falla', 'Descripción', 'Casos']],
      body: [...conteoFalla.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([codigo, { n, descripcion }]) => [codigo, descripcion || '—', String(n)]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: AZUL_MARINO, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 18 } },
      tableWidth: 150,
      margin: { left: 14, top: 26 },
    })
    y = finalY(doc) + 8
  }

  // Tabla completa
  autoTable(doc, {
    startY: y,
    head: [['Cliente', 'Teléfono', 'Equipo', 'Marca', 'Falla', 'Descripción falla', 'Ciudad', 'Zona', 'Flujo', 'Valor', 'Estado', 'Técnico', 'Fecha']],
    body: solicitudes.map(s => [
      s.cliente_nombre ?? '—',
      s.cliente_telefono ?? '—',
      s.tipo_equipo ?? '—',
      s.marca_equipo ?? '—',
      s.codigo_falla ?? '—',
      s.descripcion_falla ?? '—',
      s.ciudad_pueblo ?? '—',
      s.zona_servicio ?? '—',
      s.es_garantia ? 'Garantía' : 'Particular',
      s.es_garantia
        ? s.pago_tecnico
          ? `$${formatCOP(s.pago_tecnico)}`
          : '—'
        : s.precio_cliente
          ? `$${formatCOP(s.precio_cliente)}`
          : '—',
      ESTADO_LABELS[s.estado] ?? s.estado,
      s.tecnico_nombre ?? 'Sin asignar',
      fechaCorta(s.created_at),
    ]),
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: AZUL_MARINO, textColor: [255, 255, 255], fontSize: 7 },
    // Falla: código angosto y en negrita; la descripción se lleva el ancho
    // que necesita sin empujar el resto fuera de la hoja horizontal.
    columnStyles: {
      4: { cellWidth: 13, fontStyle: 'bold' },
      5: { cellWidth: 38 },
    },
    margin: { left: 14, right: 14, top: 26 },
  })

  pieDePagina(doc)
  return doc
}

export function generarPdfListadoSupervisor(
  supervisor: SupervisorInfoPdf,
  solicitudes: SolicitudListado[],
): void {
  const fecha = new Date().toISOString().slice(0, 10)
  construirPdfListadoSupervisor(supervisor, solicitudes).save(`baird-servicios-${fecha}.pdf`)
}

// ── Reporte 2: ficha completa de una solicitud ──

/** Construye el documento (exportado aparte para poder testearlo en Node). */
export function construirPdfDetalleSolicitud(
  sol: SolicitudDetallePdf,
  tecnico: TecnicoPdf | null,
  eventos: EventoPdf[],
  evidencia: EvidenciaPdf | null,
  imagenes: ImagenEvidencia[] = [],
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = encabezado(
    doc,
    `${sol.tipo_equipo ?? 'Equipo'} ${sol.marca_equipo ?? ''}`.trim(),
    `${sol.es_garantia ? 'Garantía' : 'Particular'}${sol.numero_serie_factura ? ` · N° ${sol.numero_serie_factura}` : ''} · Estado: ${ESTADO_LABELS[sol.estado] ?? sol.estado} · Creada ${fechaHora(sol.created_at)}`,
  )

  y = seccionCampos(doc, 'Cliente', [
    ['Nombre', sol.cliente_nombre ?? '—'],
    ['Teléfono', sol.cliente_telefono ?? '—'],
    ['Ciudad', sol.ciudad_pueblo ?? '—'],
    ['Zona', sol.zona_servicio ?? '—'],
    ['Dirección', sol.direccion ?? '—'],
  ], y)

  const equipo: Array<[string, string]> = [
    ['Tipo de equipo', sol.tipo_equipo ?? '—'],
    ['Marca', sol.marca_equipo ?? '—'],
    ['Tipo de solicitud', sol.tipo_solicitud ?? '—'],
    ['Flujo', sol.es_garantia ? 'Garantía' : 'Particular'],
    ['Novedad reportada', sol.novedades_equipo ?? '—'],
  ]
  if (sol.ai_pre_diagnostico) equipo.push(['Pre-diagnóstico', sol.ai_pre_diagnostico])
  y = seccionCampos(doc, 'Equipo y servicio', equipo, y)

  // Diagnóstico del técnico (código de falla + texto), si ya existe.
  const triaje = sol.triaje_resultado
  if (triaje?.codigo_falla || triaje?.diagnostico_tecnico) {
    const diag: Array<[string, string]> = []
    if (triaje.codigo_falla) {
      const partes = [triaje.descripcion_falla, triaje.familia_falla, triaje.sistema_falla, triaje.componente_falla, triaje.complejidad_falla]
        .filter(Boolean)
        .map(String)
      diag.push(['Código de falla', `${String(triaje.codigo_falla)}${partes.length ? ` — ${partes.join(' · ')}` : ''}`])
    }
    if (triaje.diagnostico_tecnico) diag.push(['Diagnóstico', String(triaje.diagnostico_tecnico)])
    y = seccionCampos(doc, 'Diagnóstico del técnico', diag, y)
  }

  const cotizacionTotal =
    sol.cotizacion && typeof sol.cotizacion.total === 'number' ? (sol.cotizacion.total as number) : null
  const agenda: Array<[string, string]> = [
    ['Horario confirmado', sol.horario_confirmado ?? '—'],
    ['Fecha de visita', fechaHora(sol.fecha_visita_at)],
    ['Opción 1', sol.horario_visita_1 ?? '—'],
    ['Opción 2', sol.horario_visita_2 ?? '—'],
  ]
  if (sol.es_garantia) {
    agenda.push(['Pago técnico', sol.pago_tecnico ? `$${formatCOP(sol.pago_tecnico)}` : '—'])
  } else {
    agenda.push(['Valor al cliente', sol.precio_cliente ? `$${formatCOP(sol.precio_cliente)}` : '—'])
  }
  if (cotizacionTotal !== null) agenda.push(['Total cotización', `$${formatCOP(cotizacionTotal)}`])
  y = seccionCampos(doc, 'Agenda y valores', agenda, y)

  y = seccionCampos(doc, 'Técnico asignado', tecnico
    ? [
        ['Nombre', tecnico.nombre_completo],
        ['WhatsApp', tecnico.whatsapp ?? '—'],
        ['Ciudad', tecnico.ciudad_pueblo ?? '—'],
      ]
    : [['Técnico', 'Sin asignar todavía']], y)

  if (sol.cancelado_at) {
    y = seccionCampos(doc, 'Cancelación', [
      ['Cancelada el', fechaHora(sol.cancelado_at)],
      ['Motivo', sol.motivo_cancelacion ?? '—'],
    ], y)
  }

  if (evidencia) {
    const CHECK_LABELS: Array<[keyof ChecklistServicio, string]> = [
      ['diagnostico_realizado', 'Diagnóstico realizado'],
      ['pieza_reemplazada', 'Pieza reemplazada'],
      ['prueba_encendido', 'Prueba de encendido'],
      ['prueba_ciclo_completo', 'Prueba de ciclo completo'],
      ['limpieza_area', 'Limpieza del área'],
      ['explicacion_cliente', 'Explicación al cliente'],
    ]
    const filas: Array<[string, string]> = [
      ['Completado', fechaHora(evidencia.completado_at)],
      ['Checklist', CHECK_LABELS.map(([k, l]) => `${evidencia.checklist?.[k] ? 'Sí' : 'No'} — ${l}`).join('\n')],
    ]
    const pieza = evidencia.checklist?.pieza_detalle
    if (typeof pieza === 'string' && pieza) filas.push(['Pieza', pieza])
    const notas = evidencia.checklist?.notas_tecnico
    if (typeof notas === 'string' && notas) filas.push(['Notas del técnico', notas])
    filas.push([
      'Confirmación cliente',
      evidencia.confirmado === true
        ? `Confirmó satisfacción${evidencia.confirmado_at ? ` (${fechaHora(evidencia.confirmado_at)})` : ''}`
        : evidencia.confirmado === false
          ? 'Reportó un problema'
          : 'Esperando confirmación',
    ])
    if (evidencia.cliente_comentario) filas.push(['Comentario cliente', evidencia.cliente_comentario])
    if (evidencia.fotos?.length) filas.push(['Fotos', `${evidencia.fotos.length} foto(s) — ver galería al final`])
    if (evidencia.firma_url) filas.push(['Firma cliente', 'Registrada — ver galería al final'])
    y = seccionCampos(doc, 'Evidencia del servicio', filas, y)
  }

  // Historial (línea de tiempo append-only)
  if (eventos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [[{ content: 'Historial', colSpan: 3 }], ['Fecha', 'Cambio', 'Actor / motivo']],
      body: eventos.map(e => [
        fechaHora(e.ocurrido_at),
        e.estado_previo && e.estado_nuevo
          // '->' y no '→': las fuentes estándar de jsPDF (WinAnsi) no traen esa flecha
          ? `${ESTADO_LABELS[e.estado_previo] ?? e.estado_previo} -> ${ESTADO_LABELS[e.estado_nuevo] ?? e.estado_nuevo}`
          : e.tipo ?? 'evento',
        [e.actor, e.motivo].filter(Boolean).join(' · ') || '—',
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: AZUL_MARINO, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 40 } },
      margin: { left: 14, right: 14, top: 26 },
    })
  }

  // Galería: fotos del diagnóstico, de la completación y las firmas, cada una
  // con su fecha de subida. Siempre en página propia — así la ficha de texto
  // queda legible y las imágenes no parten una tabla por la mitad.
  if (imagenes.length > 0) galeriaEvidencia(doc, imagenes)

  pieDePagina(doc)
  return doc
}

const GRUPO_TITULO: Record<ImagenEvidencia['grupo'], string> = {
  diagnostico: 'Fotos del diagnóstico',
  completacion: 'Fotos del servicio completado',
  firma: 'Firmas',
}

/** Grilla de imágenes con su fecha de subida al pie de cada una. */
function galeriaEvidencia(doc: jsPDF, imagenes: ImagenEvidencia[]) {
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const MARGEN = 14
  const COLS = 3
  const GAP = 6
  const CELDA = (ancho - MARGEN * 2 - GAP * (COLS - 1)) / COLS
  const CAJA_ALTO = 42 // alto máximo del bitmap
  const PIE = 8        // título + fecha bajo cada imagen
  const FILA = CAJA_ALTO + PIE + 4

  doc.addPage()
  let y = encabezado(doc, 'Evidencia fotográfica', `${imagenes.length} archivo${imagenes.length !== 1 ? 's' : ''} · fecha de subida al pie de cada imagen`)

  for (const grupo of ['diagnostico', 'completacion', 'firma'] as const) {
    const delGrupo = imagenes.filter(i => i.grupo === grupo)
    if (delGrupo.length === 0) continue

    if (y + FILA + 8 > alto - 16) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...AZUL_MARINO)
    doc.text(`${GRUPO_TITULO[grupo]} (${delGrupo.length})`, MARGEN, y)
    y += 5

    delGrupo.forEach((img, i) => {
      const col = i % COLS
      if (col === 0 && i > 0) y += FILA
      if (col === 0 && y + FILA > alto - 16) {
        doc.addPage()
        y = 20
      }
      const x = MARGEN + col * (CELDA + GAP)

      // Escalar conservando aspecto dentro de CELDA × CAJA_ALTO.
      const escala = Math.min(CELDA / img.ancho, CAJA_ALTO / img.alto)
      const w = img.ancho * escala
      const h = img.alto * escala
      const offsetX = x + (CELDA - w) / 2

      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.rect(x, y, CELDA, CAJA_ALTO, 'FD')
      try {
        doc.addImage(img.dataUrl, 'JPEG', offsetX, y + (CAJA_ALTO - h) / 2, w, h)
      } catch {
        // Una imagen corrupta no puede tumbar el PDF completo.
        doc.setFontSize(7)
        doc.setTextColor(...GRIS_TEXTO)
        doc.text('No se pudo cargar', x + 2, y + CAJA_ALTO / 2)
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...AZUL_MARINO)
      doc.text(img.titulo, x, y + CAJA_ALTO + 4, { maxWidth: CELDA })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRIS_TEXTO)
      doc.text(
        img.subida_at ? `Subida: ${fechaHora(img.subida_at)}` : 'Fecha de subida no disponible',
        x,
        y + CAJA_ALTO + 7.5,
        { maxWidth: CELDA },
      )
    })

    y += FILA + 4
  }
}

// ── Carga de imágenes (solo browser: usa Image + canvas) ──

/** Lado mayor al que se reescala cada foto antes de entrar al PDF. */
const MAX_PX = 900

/**
 * Descarga una imagen del storage y la devuelve como JPEG reescalado.
 * Fondo blanco explícito: las firmas son PNG con transparencia y en JPEG
 * el canal alfa se volvería negro. null si falla (CORS, 404, formato que el
 * navegador no decodifica) — una foto perdida no debe frenar el PDF.
 */
async function cargarImagen(
  url: string,
  titulo: string,
  grupo: ImagenEvidencia['grupo'],
  subida_at: string | null,
): Promise<ImagenEvidencia | null> {
  try {
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('load'))
      el.src = url
    })

    const escala = Math.min(1, MAX_PX / Math.max(bitmap.naturalWidth, bitmap.naturalHeight))
    const ancho = Math.max(1, Math.round(bitmap.naturalWidth * escala))
    const alto = Math.max(1, Math.round(bitmap.naturalHeight * escala))

    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bitmap, 0, 0, ancho, alto)

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.72), ancho, alto, titulo, subida_at, grupo }
  } catch {
    return null
  }
}

/** Fecha de subida: primero storage (`archivosAt`), si no el stamp del nombre. */
function fechaSubida(url: string, archivosAt: Record<string, string>): string | null {
  const nombre = url.split('/').pop() ?? ''
  const deStorage = archivosAt[nombre]
  if (deStorage) return deStorage
  // Los nombres se generan con Date.now(): diagnostico_<ms>_…, firma_<ms>.png,
  // <ms>_<rand>_<i>.jpg. Sirve de respaldo si el listado de storage falla.
  const ms = nombre.match(/(?:^|_)(\d{13})(?:_|\.)/)?.[1]
  if (!ms) return null
  const fecha = new Date(Number(ms))
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

/**
 * Reúne las URLs de la solicitud (diagnóstico + completación + firmas) y las
 * carga en paralelo. Las que fallen se descartan.
 */
export async function cargarImagenesEvidencia(
  sol: SolicitudDetallePdf,
  evidencia: EvidenciaPdf | null,
  archivosAt: Record<string, string> = {},
): Promise<ImagenEvidencia[]> {
  const diagTriaje = (sol.triaje_resultado?.evidencias_diagnostico as string[] | undefined) ?? []
  const diagCotizacion = (sol.cotizacion?.evidencias_diagnostico as string[] | undefined) ?? []
  const diagnostico = [...new Set([...diagTriaje, ...diagCotizacion])]

  const pendientes: Array<Promise<ImagenEvidencia | null>> = [
    ...diagnostico.map((url, i) =>
      cargarImagen(url, `Diagnóstico ${i + 1}`, 'diagnostico', fechaSubida(url, archivosAt)),
    ),
    ...(evidencia?.fotos ?? []).map((url, i) =>
      cargarImagen(url, `Completación ${i + 1}`, 'completacion', fechaSubida(url, archivosAt)),
    ),
  ]
  if (evidencia?.firma_url) {
    pendientes.push(
      cargarImagen(
        evidencia.firma_url,
        'Firma del cliente',
        'firma',
        fechaSubida(evidencia.firma_url, archivosAt) ?? evidencia.confirmado_at ?? evidencia.completado_at,
      ),
    )
  }
  if (evidencia?.oath_firma) {
    pendientes.push(
      cargarImagen(
        evidencia.oath_firma,
        'Oath del técnico',
        'firma',
        fechaSubida(evidencia.oath_firma, archivosAt) ?? evidencia.oath_firmado_at ?? null,
      ),
    )
  }

  return (await Promise.all(pendientes)).filter((i): i is ImagenEvidencia => i !== null)
}

export async function generarPdfDetalleSolicitud(
  sol: SolicitudDetallePdf,
  tecnico: TecnicoPdf | null,
  eventos: EventoPdf[],
  evidencia: EvidenciaPdf | null,
  archivosAt: Record<string, string> = {},
): Promise<void> {
  const imagenes = await cargarImagenesEvidencia(sol, evidencia, archivosAt)
  construirPdfDetalleSolicitud(sol, tecnico, eventos, evidencia, imagenes).save(
    `baird-solicitud-${sol.id.slice(0, 8)}.pdf`,
  )
}
