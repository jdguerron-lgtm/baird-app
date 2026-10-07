import { mapFamilia, type ExcelRow, type MappedSolicitud, type ParsedRow } from '@/lib/utils/excel-mapping'
import { FRANJAS_HORARIO, type FranjaHorario } from '@/lib/constants/franjas'
import { formatearFechaLargaCO, fechaColombiaYMD } from '@/lib/utils/fecha-visita'

/**
 * pdf-orden-mapping.ts — Parser del PDF "TALLER" de órdenes de servicio MABE
 * (garantía de fábrica) para carga masiva.
 *
 * El PDF trae N órdenes por documento, cada una con campos etiquetados en
 * layout fijo ("NO. ORDEN:", "NOMBRE DEL CLIENTE:", "FECHA PROG:", ...).
 * La extracción de texto de pdf.js NO respeta el orden visual, así que el
 * pipeline es: items posicionados (x, y) → reconstrucción de líneas →
 * split por etiquetas conocidas → una orden por cada "NO. ORDEN".
 *
 * Produce el MISMO shape `ParsedRow`/`MappedSolicitud` que excel-mapping.ts
 * para que /api/carga-masiva y la UI de preview traten ambos formatos igual.
 *
 * Diferencia clave con la BITÁCORA Excel: el PDF trae FECHA PROG (fecha y
 * hora ya acordadas por MABE con el cliente) → se convierte al formato
 * canónico parseable "martes, 26 de agosto · 8am-12pm" en horario_visita_1,
 * que parsearFechaVisita() entiende y cuenta contra el cupo por franja.
 */

/** Item de texto posicionado, como lo entrega pdf.js getTextContent(). */
export interface PdfTextItem {
  str: string
  x: number
  y: number
}

/**
 * Reconstruye líneas de texto a partir de items posicionados de UNA página:
 * agrupa por Y (tolerancia 2.5pt), ordena de arriba hacia abajo (Y de PDF
 * crece hacia arriba) y dentro de la línea de izquierda a derecha.
 */
export function reconstruirLineas(items: PdfTextItem[]): string[] {
  const TOLERANCIA_Y = 2.5
  const lineas: { y: number; items: PdfTextItem[] }[] = []

  for (const item of items) {
    if (!item.str.trim()) continue
    const linea = lineas.find(l => Math.abs(l.y - item.y) <= TOLERANCIA_Y)
    if (linea) {
      linea.items.push(item)
    } else {
      lineas.push({ y: item.y, items: [item] })
    }
  }

  lineas.sort((a, b) => b.y - a.y)
  return lineas.map(l =>
    l.items
      .sort((a, b) => a.x - b.x)
      .map(i => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Quita tildes y pasa a mayúsculas para matching de etiquetas. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/**
 * Etiquetas del formato TALLER. El orden no importa: se buscan todas las
 * ocurrencias por línea y el valor de cada una es el texto hasta la
 * siguiente etiqueta. Todas requieren ":" excepto FALLA REPORTADA/QUIEN
 * (su ":" queda en la línea siguiente "REPORTA:").
 */
const ETIQUETAS = [
  { campo: 'taller', patron: 'TALLER:' },
  { campo: 'orden', patron: 'NO. ORDEN:' },
  { campo: 'tipo_servicio', patron: 'TIPO SERVICIO:' },
  { campo: 'fecha_prog', patron: 'FECHA PROG:' },
  { campo: 'cliente_nombre', patron: 'NOMBRE DEL CLIENTE:' },
  { campo: 'municipio', patron: 'DELEGACION O MUNICIPIO:' },
  { campo: 'direccion', patron: 'DIRECCION:' },
  { campo: 'cod_postal', patron: 'COD. POSTAL:' },
  { campo: 'colonia', patron: 'COLONIA:' },
  { campo: 'entre_calles', patron: 'ENTRE CALLES:' },
  { campo: 'tel_casa', patron: 'TEL. CASA:' },
  { campo: 'tel_cel', patron: 'TEL. CEL.:' },
  { campo: 'tel_oficina', patron: 'TEL. OFICINA:' },
  { campo: 'ext', patron: 'EXT.:' },
  { campo: 'asignado_a', patron: 'ASIGNADO A:' },
  { campo: 'lugar_compra', patron: 'LUGAR DE COMPRA:' },
  { campo: 'no_tecnico', patron: 'NO. TECNICO:' },
  { campo: 'modelo', patron: 'MODELO:' },
  { campo: 'modulo', patron: 'MODULO:' },
  { campo: 'numero_serie', patron: 'NO. DE SERIE:' },
  { campo: 'base', patron: 'BASE:' },
  { campo: 'descripcion_producto', patron: 'DESCRIPCION PRODUCTO:' },
  { campo: 'falla', patron: 'FALLA REPORTADA/QUIEN' },
  { campo: 'falla_cont', patron: 'REPORTA:' },
] as const

type CampoOrden = (typeof ETIQUETAS)[number]['campo']
type OrdenCruda = Partial<Record<CampoOrden, string>> & { linea: number }

/**
 * Corta las líneas del PDF en órdenes: cada "NO. ORDEN:" abre una nueva.
 * Los valores se extraen como el texto entre una etiqueta y la siguiente
 * de la misma línea.
 */
export function extraerOrdenes(lineas: string[]): OrdenCruda[] {
  const ordenes: OrdenCruda[] = []
  let actual: OrdenCruda | null = null

  lineas.forEach((linea, idx) => {
    const lineaNorm = normalizar(linea)

    const hits: { campo: CampoOrden; inicio: number; finEtiqueta: number }[] = []
    for (const { campo, patron } of ETIQUETAS) {
      let desde = 0
      while (true) {
        const pos = lineaNorm.indexOf(patron, desde)
        if (pos === -1) break
        // "REPORTA:" no debe matchear dentro de "FALLA REPORTADA/QUIEN REPORTA:"
        const solapado = hits.some(h => pos >= h.inicio && pos < h.finEtiqueta)
        if (!solapado) hits.push({ campo, inicio: pos, finEtiqueta: pos + patron.length })
        desde = pos + patron.length
      }
    }
    if (hits.length === 0) return

    hits.sort((a, b) => a.inicio - b.inicio)

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i]
      const finValor = i + 1 < hits.length ? hits[i + 1].inicio : lineaNorm.length
      const valor = lineaNorm.slice(hit.finEtiqueta, finValor).trim()

      if (hit.campo === 'orden') {
        if (actual) ordenes.push(actual)
        actual = { linea: idx + 1 }
      }
      if (!actual) continue
      if (hit.campo === 'falla_cont') {
        if (valor) actual.falla = actual.falla ? `${actual.falla} ${valor}` : valor
        continue
      }
      if (valor && !actual[hit.campo]) actual[hit.campo] = valor
    }
  })

  if (actual) ordenes.push(actual)
  return ordenes
}

/** "26.08.2026 08:00:00" → { ymd: '2026-08-26', hora: 8 } o null. */
function parseFechaProg(raw: string | undefined): { ymd: string; hora: number } | null {
  if (!raw) return null
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, dd, mm, yyyy, hh] = m
  const dia = Number(dd)
  const mes = Number(mm)
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
  return { ymd: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, hora: Number(hh) }
}

/** Hora local (0-23) → franja canónica del catálogo. */
export function horaAFranja(hora: number): FranjaHorario {
  if (hora < 12) return FRANJAS_HORARIO[0].value // 8am-12pm
  if (hora < 15) return FRANJAS_HORARIO[1].value // 12pm-3pm
  if (hora < 18) return FRANJAS_HORARIO[2].value // 3pm-6pm
  return FRANJAS_HORARIO[3].value // 6pm-8pm
}

/**
 * Separa un campo de teléfono en { digits, resto }: el teléfono es el prefijo
 * numérico (dígitos, espacios, guiones, "+") hasta la primera letra; lo que
 * sigue es texto de otra columna que pdf.js pegó en el mismo renglón (p.ej.
 * "3208041857 APTO 102" — el apto viene de la columna ENTRE CALLES).
 */
export function separarTelefono(raw: string | undefined): { digits: string; resto: string } {
  const texto = (raw ?? '').trim()
  const m = texto.match(/^[\d\s+\-().]*/)
  const prefijo = m ? m[0] : ''
  return { digits: prefijo.replace(/\D/g, ''), resto: texto.slice(prefijo.length).trim() }
}

/**
 * Elige el teléfono útil: celular primero, luego casa/oficina. Descarta
 * placeholders de MABE ("0", "00000000000") y números de menos de 7 dígitos.
 */
function elegirTelefono(orden: OrdenCruda): string {
  for (const raw of [orden.tel_cel, orden.tel_casa, orden.tel_oficina]) {
    const { digits } = separarTelefono(raw)
    if (digits.length >= 7 && !/^0+$/.test(digits)) return digits
  }
  return ''
}

/**
 * Complemento de dirección: ENTRE CALLES (conjunto/barrio) + texto que quedó
 * pegado a los teléfonos (apto/interior, misma columna visual que ENTRE
 * CALLES). Ej.: "APTO 102 - CAMPO CAMPESTRE ETAPA 12".
 */
function complementoDireccion(orden: OrdenCruda): string {
  const restos = [orden.tel_cel, orden.tel_casa, orden.tel_oficina]
    .map(r => separarTelefono(r).resto)
    .filter(Boolean)
  return [...restos, orden.entre_calles ?? ''].filter(Boolean).join(' - ')
}

function mapOrden(orden: OrdenCruda, defaultHorario2: string): ParsedRow {
  const errors: string[] = []
  const warnings: string[] = []

  const numeroOrden = (orden.orden ?? '').replace(/\D/g, '')
  const nombre = orden.cliente_nombre ?? ''
  const telefono = elegirTelefono(orden)
  const direccionBase = orden.direccion ?? ''
  const complemento = complementoDireccion(orden)
  const direccion = [direccionBase, complemento].filter(Boolean).join(' - ')
  const ciudad = orden.municipio ?? ''
  const zona = orden.colonia ?? ''
  const descripcion = orden.descripcion_producto ?? ''
  const modelo = orden.modelo ?? ''
  const serie = orden.numero_serie ?? ''
  const falla = orden.falla ?? ''
  const tipoServicio = orden.tipo_servicio ?? 'GARANTIA DE FABRICA'
  const esGarantia = normalizar(tipoServicio).includes('GARANTIA')
  const tipoEquipo = mapFamilia(descripcion)
  const fechaProg = parseFechaProg(orden.fecha_prog)

  if (!numeroOrden) errors.push('NO. ORDEN vacío o inválido')
  if (!nombre || nombre.length < 3) errors.push('Nombre del cliente muy corto o vacío')
  if (!telefono) errors.push('Sin teléfono válido (cel/casa/oficina)')
  if (!direccion) errors.push('Dirección vacía')
  if (!ciudad) warnings.push('Municipio no detectado, usando "BOGOTA"')
  if (!tipoEquipo) errors.push(`Descripción "${descripcion || '(vacía)'}" no tiene mapeo a tipo de equipo`)
  if (!fechaProg) warnings.push('FECHA PROG no reconocida — el cliente elegirá horario')
  if (fechaProg && fechaProg.ymd < fechaColombiaYMD()) {
    warnings.push(`FECHA PROG (${fechaProg.ymd}) ya pasó — coordinar nueva fecha con el cliente`)
  }

  const raw: ExcelRow = {
    fila: orden.linea,
    orden: numeroOrden || (orden.orden ?? ''),
    cliente_nombre: nombre,
    tipo_servicio: tipoServicio,
    telefono,
    direccion_completa: [ciudad, direccion, zona].filter(Boolean).join(' / '),
    modelo: [modelo, descripcion].filter(Boolean).join(' / '),
    familia: descripcion,
    retorno: '',
    dias_abierta: '',
    sintoma: falla,
    diagnostico: '',
  }

  if (errors.length > 0) {
    return { fila: orden.linea, raw, mapped: null, errors, warnings }
  }

  const detalles = [
    modelo ? `Modelo: ${modelo}` : '',
    serie ? `Serie: ${serie}` : '',
    descripcion ? `Producto: ${descripcion}` : '',
    orden.lugar_compra ? `Compra: ${orden.lugar_compra}` : '',
  ].filter(Boolean)
  let novedades = `[${detalles.join(' | ')}] ${falla || 'Falla reportada en orden MABE'}`
  if (novedades.length < 20) novedades = `${novedades} - Orden MABE ${numeroOrden}`

  const horario1 = fechaProg
    ? `${formatearFechaLargaCO(fechaProg.ymd)} · ${horaAFranja(fechaProg.hora)}`
    : defaultHorario2

  const mapped: MappedSolicitud = {
    cliente_nombre: nombre,
    cliente_telefono: telefono.length === 10 ? `57${telefono}` : telefono,
    direccion,
    ciudad_pueblo: ciudad || 'BOGOTA',
    zona_servicio: zona || 'Sin especificar',
    marca_equipo: 'MABE',
    modelo_equipo: modelo,
    tipo_equipo: tipoEquipo!,
    tipo_solicitud: 'Reparación',
    novedades_equipo: novedades.slice(0, 1000),
    es_garantia: esGarantia,
    numero_serie_factura: numeroOrden,
    pago_tecnico: 0,
    horario_visita_1: horario1,
    horario_visita_2: defaultHorario2,
  }

  return { fila: orden.linea, raw, mapped, errors, warnings }
}

/**
 * Entry point: líneas reconstruidas del PDF → ParsedRow[] (mismo contrato
 * que parseExcelData). `totalRawRows === 0` ⇒ el PDF no es formato TALLER.
 */
export function parsePdfTallerData(
  lineas: string[],
  options: { defaultHorario2?: string } = {}
): { parsed: ParsedRow[]; totalRawRows: number } {
  const { defaultHorario2 = 'Lunes a Viernes 2:00 PM - 5:00 PM' } = options
  const ordenes = extraerOrdenes(lineas)
  const parsed = ordenes.map(o => mapOrden(o, defaultHorario2))
  return { parsed, totalRawRows: ordenes.length }
}
