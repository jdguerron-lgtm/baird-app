import { describe, it, expect } from 'vitest'
import {
  reconstruirLineas,
  extraerOrdenes,
  parsePdfTallerData,
  horaAFranja,
  separarTelefono,
} from '@/lib/utils/pdf-orden-mapping'
import { parsearFechaVisita } from '@/lib/utils/fecha-visita'

// Líneas como quedan tras reconstruir el layout del PDF TALLER real
const LINEAS_TALLER = [
  'TALLER: CSATDEABTA9P',
  'NO. ORDEN: 9415564335 TIPO SERVICIO: GARANTÍA DE FÁBRICA FECHA PROG: 26.08.2026 08:00:00',
  'NOMBRE DEL CLIENTE: JENNIFER PAOLA GOMEZ ASSIAS DELEGACIÓN O MUNICIPIO: BOGOTA',
  'DIRECCIÓN: CR 87 G CL59 C SUR 58C 69S COD. POSTAL: 110711',
  'COLONIA: ESCOCIA/BOSA ENTRE CALLES:',
  'TEL. CASA: 0 TEL. CEL.: 3028346147',
  'TEL. OFICINA: EXT.: 13',
  'ASIGNADO A: BAIRD SERVICE SAS LUGAR DE COMPRA: ALKOSTO VENECIA',
  'NO. TÉCNICO: 101015938 MODELO: LMD1123HBAB0',
  'MÓDULO: SUPERVISION DE CAMP TEC TA Z NO. DE SERIE:',
  'BASE: CSATDEABTA9P DESCRIPCIÓN PRODUCTO: LAVADORA 2 TINAS 11 KG MABE BLA',
  'FALLA REPORTADA/QUIÉN SOLICITA LAURA RANGEL VIA EMAIL',
  'REPORTA:',
  'NO. ORDEN: 9415566836 TIPO SERVICIO: GARANTÍA DE FÁBRICA FECHA PROG: 26.08.2026 09:00:00',
  'NOMBRE DEL CLIENTE: NICOLLE BERNATE DELEGACIÓN O MUNICIPIO: SOACHA',
  'DIRECCIÓN: TRANS 14A 38A 13 COD. POSTAL: 250051',
  'COLONIA: LOS OLIVOS I ENTRE CALLES:',
  'TEL. CASA: 00000000000 TEL. CEL.: 3239980408',
  'TEL. OFICINA: EXT.: 13',
  'ASIGNADO A: BAIRD SERVICE SAS LUGAR DE COMPRA: INVERSIONES INNOVAR SOACHA',
  'NO. TÉCNICO: 101015938 MODELO: LMA8120WDGAB0',
  'MÓDULO: SUPERVISION DE CAMP TEC TA Z NO. DE SERIE: SS',
  'BASE: CSATDEABTA9P DESCRIPCIÓN PRODUCTO: LAVADORA AUT 18 KG MABE DIAMOND GRAY',
  'FALLA REPORTADA/QUIÉN NO LAVA SE APAGA DE UN MOMENTO A OTRO VALIDAR SERIE',
  'REPORTA:',
]

describe('reconstruirLineas', () => {
  it('agrupa items por Y (tolerancia) y ordena arriba→abajo, izquierda→derecha', () => {
    const items = [
      { str: 'TEL. CEL.:', x: 200, y: 500.8 },
      { str: 'NO. ORDEN:', x: 10, y: 700 },
      { str: '3028346147', x: 280, y: 501.5 },
      { str: '9415564335', x: 100, y: 699.2 },
      { str: 'TEL. CASA:', x: 10, y: 501 },
      { str: '0', x: 120, y: 500 },
      { str: '  ', x: 0, y: 400 },
    ]
    expect(reconstruirLineas(items)).toEqual([
      'NO. ORDEN: 9415564335',
      'TEL. CASA: 0 TEL. CEL.: 3028346147',
    ])
  })
})

describe('extraerOrdenes', () => {
  it('corta el documento en una orden por cada NO. ORDEN', () => {
    const ordenes = extraerOrdenes(LINEAS_TALLER)
    expect(ordenes).toHaveLength(2)
    expect(ordenes[0].orden).toBe('9415564335')
    expect(ordenes[1].orden).toBe('9415566836')
  })

  it('extrae los campos etiquetados aunque compartan línea', () => {
    const [o1, o2] = extraerOrdenes(LINEAS_TALLER)
    expect(o1.cliente_nombre).toBe('JENNIFER PAOLA GOMEZ ASSIAS')
    expect(o1.municipio).toBe('BOGOTA')
    expect(o1.direccion).toBe('CR 87 G CL59 C SUR 58C 69S')
    expect(o1.colonia).toBe('ESCOCIA/BOSA')
    expect(o1.tel_casa).toBe('0')
    expect(o1.tel_cel).toBe('3028346147')
    expect(o1.modelo).toBe('LMD1123HBAB0')
    expect(o1.descripcion_producto).toBe('LAVADORA 2 TINAS 11 KG MABE BLA')
    expect(o1.lugar_compra).toBe('ALKOSTO VENECIA')
    expect(o1.falla).toBe('SOLICITA LAURA RANGEL VIA EMAIL')

    expect(o2.municipio).toBe('SOACHA')
    expect(o2.numero_serie).toBe('SS')
    expect(o2.falla).toBe('NO LAVA SE APAGA DE UN MOMENTO A OTRO VALIDAR SERIE')
  })
})

describe('horaAFranja', () => {
  it.each([
    [8, '8am-12pm'],
    [11, '8am-12pm'],
    [12, '12pm-3pm'],
    [14, '12pm-3pm'],
    [15, '3pm-6pm'],
    [17, '3pm-6pm'],
    [18, '6pm-8pm'],
    [20, '6pm-8pm'],
  ])('hora %i → franja %s', (hora, franja) => {
    expect(horaAFranja(hora)).toBe(franja)
  })
})

describe('parsePdfTallerData', () => {
  const { parsed, totalRawRows } = parsePdfTallerData(LINEAS_TALLER)

  it('mapea las 2 órdenes como válidas', () => {
    expect(totalRawRows).toBe(2)
    expect(parsed.filter(r => r.mapped !== null)).toHaveLength(2)
  })

  it('mapea la orden 1 al shape MappedSolicitud (garantía MABE)', () => {
    const m = parsed[0].mapped!
    expect(m.cliente_nombre).toBe('JENNIFER PAOLA GOMEZ ASSIAS')
    expect(m.cliente_telefono).toBe('573028346147')
    expect(m.ciudad_pueblo).toBe('BOGOTA')
    expect(m.zona_servicio).toBe('ESCOCIA/BOSA')
    expect(m.tipo_equipo).toBe('Lavadora')
    expect(m.marca_equipo).toBe('MABE')
    expect(m.es_garantia).toBe(true)
    expect(m.numero_serie_factura).toBe('9415564335')
    expect(m.pago_tecnico).toBe(0)
    expect(m.novedades_equipo).toContain('LMD1123HBAB0')
    expect(m.novedades_equipo).toContain('SOLICITA LAURA RANGEL')
  })

  it('FECHA PROG → horario_visita_1 canónico parseable por parsearFechaVisita', () => {
    const h1 = parsed[0].mapped!.horario_visita_1
    expect(h1).toContain('26 de agosto')
    expect(h1).toContain('8am-12pm')

    const iso = parsearFechaVisita(h1, new Date('2026-08-01T12:00:00Z'))
    expect(iso).toBe('2026-08-26T13:00:00.000Z') // 8am Colombia = 13:00 UTC
  })

  it('descarta placeholders de teléfono (0, 00000000000) y prefiere el celular', () => {
    expect(parsed[1].mapped!.cliente_telefono).toBe('573239980408')
  })

  it('marca error si no hay teléfono válido', () => {
    const idx = LINEAS_TALLER.findIndex(l => l.startsWith('TEL. CASA:'))
    const sinTel = [...LINEAS_TALLER]
    sinTel[idx] = 'TEL. CASA: 0 TEL. CEL.: 0'
    const { parsed: p } = parsePdfTallerData(sinTel)
    expect(p[0].mapped).toBeNull()
    expect(p[0].errors.join(' ')).toContain('teléfono')
    // la 2ª orden no se ve afectada
    expect(p[1].mapped).not.toBeNull()
  })

  it('advierte cuando FECHA PROG ya pasó', () => {
    const conFechaVieja = LINEAS_TALLER.map(l => l.replace('26.08.2026', '02.01.2020'))
    const { parsed: p } = parsePdfTallerData(conFechaVieja)
    expect(p[0].mapped).not.toBeNull()
    expect(p[0].warnings.join(' ')).toContain('ya pasó')
  })

  it('retorna totalRawRows 0 si el texto no es formato TALLER', () => {
    const { totalRawRows: n } = parsePdfTallerData(['factura', 'otro documento', 'sin ordenes'])
    expect(n).toBe(0)
  })
})

// Orden real 9415615498 (2026-09-23): pdf.js pega "APTO 102" (columna ENTRE
// CALLES) al renglón de TEL. CEL. — antes el teléfono quedaba 3208041857102.
describe('apto pegado al teléfono', () => {
  const LINEAS = [
    'NO. ORDEN: 9415615498 TIPO SERVICIO: GARANTÍA DE FÁBRICA FECHA PROG: 16.09.2026 09:00:00',
    'NOMBRE DEL CLIENTE: KELLY ARROYO DELEGACIÓN O MUNICIPIO: SOACHA',
    'DIRECCIÓN: CR 7A 3 80 TORRE 29 COD. POSTAL: 250057',
    'COLONIA: SOACHA ENTRE CALLES: CAMPO CAMPESTRE ETAPA 12',
    'TEL. CASA: 0000000 TEL. CEL.: 3208041857 APTO 102',
    'TEL. OFICINA: EXT.: 13',
    'BASE: CSATDEABTA9P DESCRIPCIÓN PRODUCTO: MANUFAC REFRIG MABE NF 2P 415L G NIRV',
    'FALLA REPORTADA/QUIÉN NO ENFRIA CASO ALKOSTO',
    'REPORTA:',
  ]

  it('separarTelefono corta en la primera letra', () => {
    expect(separarTelefono('3208041857 APTO 102')).toEqual({ digits: '3208041857', resto: 'APTO 102' })
    expect(separarTelefono('320 804-1857')).toEqual({ digits: '3208041857', resto: '' })
  })

  it('teléfono limpio y apto + conjunto en la dirección', () => {
    const { parsed } = parsePdfTallerData(LINEAS)
    const m = parsed[0].mapped!
    expect(m.cliente_telefono).toBe('573208041857')
    expect(m.direccion).toBe('CR 7A 3 80 TORRE 29 - APTO 102 - CAMPO CAMPESTRE ETAPA 12')
    expect(m.tipo_equipo).toBe('Nevera')
  })
})
