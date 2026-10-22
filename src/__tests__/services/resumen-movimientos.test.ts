import { describe, it, expect } from 'vitest'
import {
  armarResumenSupervisor,
  compactarLinea,
  diasEntreYMD,
  esEventoAgendamiento,
  DIAS_AGENDA_CERRAR_PARA_ABRIR,
  describirEquipo,
  describirRepuestos,
  etiquetaHoraCorte,
  fechaCortaResumen,
  fechaLargaResumen,
  partirTexto,
  ventanaResumen,
  MAX_CHARS_MENSAJE,
  type EventoMovimiento,
  type RepuestoResumen,
  type SolicitudResumen,
  type SupervisorResumen,
} from '@/lib/services/resumen-movimientos.service'

// ─────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────

// Corte: martes 2026-10-20 17:00 Bogotá = 22:00Z.
const CORTE = new Date('2026-10-20T22:00:00Z')
const VENTANA = ventanaResumen(new Date('2026-10-20T22:03:00Z'))

function sup(partial: Partial<SupervisorResumen> = {}): SupervisorResumen {
  return {
    id: 'sup-1',
    nombre: 'Andrés Rojas',
    whatsapp: '573001112233',
    ambito: 'todos',
    marca: null,
    estados: null,
    activo: true,
    portal_token: 'tok-abc',
    ...partial,
  }
}

function sol(partial: Partial<SolicitudResumen> & { id: string }): SolicitudResumen {
  return {
    cliente_nombre: 'Juan Pérez',
    tipo_equipo: 'Nevera',
    marca_equipo: 'Mabe',
    ciudad_pueblo: 'Bogotá',
    es_garantia: true,
    numero_serie_factura: '9415091231',
    estado: 'asignada',
    tecnico_asignado_id: 'tec-1',
    ...partial,
  }
}

function ev(partial: Partial<EventoMovimiento> & { solicitud_id: string; estado_nuevo: string }): EventoMovimiento {
  return {
    tipo: 'cambio_estado',
    estado_previo: 'notificada',
    actor: 'tecnico',
    ocurrido_at: '2026-10-20T15:32:00Z', // 10:32 Bogotá
    ...partial,
  }
}

const TECNICOS = new Map([['tec-1', 'Néstor Castro']])

// ─────────────────────────────────────────────────────────────────
// Ventana
// ─────────────────────────────────────────────────────────────────

describe('ventanaResumen', () => {
  it('a las 5:03 pm Bogotá reporta desde ayer 5 pm hasta hoy 5 pm', () => {
    const v = ventanaResumen(new Date('2026-10-20T22:03:00Z'))
    expect(v.hasta.toISOString()).toBe('2026-10-20T22:00:00.000Z')
    expect(v.desde.toISOString()).toBe('2026-10-19T22:00:00.000Z')
    expect(v.fechaYMD).toBe('2026-10-20')
  })

  it('si el cron llega tarde (5:58 pm) sigue siendo el corte de hoy', () => {
    const v = ventanaResumen(new Date('2026-10-20T22:58:00Z'))
    expect(v.hasta.toISOString()).toBe('2026-10-20T22:00:00.000Z')
    expect(v.fechaYMD).toBe('2026-10-20')
  })

  it('antes de las 5 pm Bogotá el último corte es el de ayer', () => {
    // 10:00 Bogotá del 20 = 15:00Z
    const v = ventanaResumen(new Date('2026-10-20T15:00:00Z'))
    expect(v.hasta.toISOString()).toBe('2026-10-19T22:00:00.000Z')
    expect(v.desde.toISOString()).toBe('2026-10-18T22:00:00.000Z')
    expect(v.fechaYMD).toBe('2026-10-19')
  })

  it('después de medianoche UTC pero antes de las 5 pm CO no se corre de día', () => {
    // 2026-10-21 01:00Z = 20 oct 8:00 pm Bogotá → último corte: 20 oct 5 pm
    const v = ventanaResumen(new Date('2026-10-21T01:00:00Z'))
    expect(v.hasta.toISOString()).toBe('2026-10-20T22:00:00.000Z')
    expect(v.fechaYMD).toBe('2026-10-20')
  })

  it('exactamente a las 5 pm el corte es ese instante', () => {
    const v = ventanaResumen(CORTE)
    expect(v.hasta.getTime()).toBe(CORTE.getTime())
  })

  it("corte 'ahora' va desde el último corte hasta este instante", () => {
    const ahora = new Date('2026-10-20T15:00:00Z')
    const v = ventanaResumen(ahora, 'ahora')
    expect(v.desde.toISOString()).toBe('2026-10-19T22:00:00.000Z')
    expect(v.hasta.getTime()).toBe(ahora.getTime())
    expect(v.fechaYMD).toBe('2026-10-20')
  })
})

// ─────────────────────────────────────────────────────────────────
// Helpers de formato
// ─────────────────────────────────────────────────────────────────

describe('formato', () => {
  it('fecha larga y corta en español', () => {
    expect(fechaLargaResumen('2026-10-20')).toBe('martes 20 de octubre de 2026')
    expect(fechaCortaResumen('2026-10-20')).toBe('20 de octubre')
  })

  it('etiqueta de hora de corte en 12 h', () => {
    expect(etiquetaHoraCorte(17)).toBe('5:00 pm')
    expect(etiquetaHoraCorte(9)).toBe('9:00 am')
    expect(etiquetaHoraCorte(12)).toBe('12:00 pm')
  })

  it('describirEquipo anexa el No. de garantía solo en garantía', () => {
    expect(describirEquipo(sol({ id: 'a' }))).toBe('Nevera Mabe · Garantía 9415091231')
    expect(describirEquipo(sol({ id: 'b', es_garantia: false, marca_equipo: 'LG', tipo_equipo: 'Lavadora' }))).toBe('Lavadora LG')
    expect(describirEquipo(sol({ id: 'c', numero_serie_factura: null }))).toBe('Nevera Mabe')
  })

  it('describirRepuestos: SKU · descripción ×cantidad; ignora cancelados', () => {
    const reps: RepuestoResumen[] = [
      { solicitud_id: 'a', sku: 'WR60X10185', descripcion: 'Compresor 1/4 HP', cantidad: 2, estado: 'pendiente' },
      { solicitud_id: 'a', sku: null, descripcion: 'Filtro', cantidad: 1, estado: 'pendiente' },
      { solicitud_id: 'a', sku: 'X', descripcion: 'Cancelado', cantidad: 1, estado: 'cancelado' },
    ]
    expect(describirRepuestos(reps)).toBe('WR60X10185 · Compresor 1/4 HP ×2; Filtro')
    expect(describirRepuestos([])).toBe('Sin repuesto especificado')
  })
})

// ─────────────────────────────────────────────────────────────────
// Armado del resumen
// ─────────────────────────────────────────────────────────────────

describe('armarResumenSupervisor', () => {
  it('sin movimientos → texto "sin movimientos hoy" y vacio=true', () => {
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos: [], solicitudes: [], repuestos: [] })
    expect(r.vacio).toBe(true)
    expect(r.movimientos).toBe(0)
    expect(r.conteo).toBe('sin movimientos')
    expect(r.texto).toContain('📋 *Resumen diario Baird Service*')
    expect(r.texto).toContain('Martes 20 de octubre de 2026 · corte 5:00 pm')
    expect(r.texto).toContain('Hola Andrés: sin movimientos hoy en tus servicios.')
    expect(r.lineaCompacta).toBe('Sin movimientos hoy.')
  })

  it('agrupa por servicio, ordena cronológicamente y muestra estado anterior → nuevo con hora Bogotá', () => {
    const solicitudes = [
      sol({ id: 'a', cliente_nombre: 'Juan Pérez', estado: 'en_proceso' }),
      sol({ id: 'b', cliente_nombre: 'María Gómez', tipo_equipo: 'Lavadora', numero_serie_factura: '777', estado: 'asignada' }),
    ]
    const eventos = [
      ev({ solicitud_id: 'a', estado_previo: 'asignada', estado_nuevo: 'en_proceso', actor: 'cliente', ocurrido_at: '2026-10-20T19:02:00Z' }),
      ev({ solicitud_id: 'b', estado_previo: 'notificada', estado_nuevo: 'asignada', actor: 'tecnico', ocurrido_at: '2026-10-20T13:15:00Z' }),
      ev({ solicitud_id: 'a', estado_previo: 'notificada', estado_nuevo: 'asignada', actor: 'tecnico', ocurrido_at: '2026-10-20T12:00:00Z' }),
    ]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [], tecnicos: TECNICOS, appUrl: 'https://lineablanca.bairdservice.com/' })

    expect(r.vacio).toBe(false)
    expect(r.movimientos).toBe(3)
    expect(r.servicios).toBe(2)
    expect(r.conteo).toBe('3 movimientos en 2 servicios')
    expect(r.texto).toContain('Hola Andrés: 3 movimientos en 2 servicios.')

    // Juan (primer evento 07:00) va antes que María (08:15).
    const iJuan = r.texto.indexOf('*Juan Pérez*')
    const iMaria = r.texto.indexOf('*María Gómez*')
    expect(iJuan).toBeGreaterThan(-1)
    expect(iMaria).toBeGreaterThan(iJuan)

    expect(r.texto).toContain('*Juan Pérez* · Nevera Mabe · Garantía 9415091231 · Bogotá')
    expect(r.texto).toContain('07:00  Notificada → Asignada (Néstor Castro)')
    expect(r.texto).toContain('14:02  Asignada → En proceso (cliente)')
    expect(r.texto).toContain('*María Gómez* · Lavadora Mabe · Garantía 777 · Bogotá')
    expect(r.texto).toContain('08:15  Notificada → Asignada (Néstor Castro)')
    // Sin repuesto en juego: no aparece la línea 🔩
    expect(r.texto).not.toContain('🔩')
    // Link al portal con el token del supervisor (sin doble barra)
    expect(r.texto).toContain('Panel: https://lineablanca.bairdservice.com/supervisor/tok-abc')

    expect(r.lineaCompacta).toBe(
      'Juan Pérez (Nevera Mabe · Garantía 9415091231): Notificada → Asignada → En proceso • María Gómez (Lavadora Mabe · Garantía 777): Notificada → Asignada',
    )
  })

  it('si el servicio quedó esperando repuesto anexa el repuesto (SKU + descripción)', () => {
    const solicitudes = [sol({ id: 'a', estado: 'esperando_repuesto' })]
    const eventos = [ev({ solicitud_id: 'a', estado_previo: 'asignada', estado_nuevo: 'esperando_repuesto', actor: 'tecnico' })]
    const repuestos: RepuestoResumen[] = [
      { solicitud_id: 'a', sku: 'WR60X10185', descripcion: 'Compresor 1/4 HP', cantidad: 1, estado: 'pendiente' },
      { solicitud_id: 'otra', sku: 'ZZZ', descripcion: 'De otro servicio', cantidad: 1, estado: 'pendiente' },
    ]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos })
    expect(r.texto).toContain('10:32  Asignada → Esperando repuesto (técnico)')
    expect(r.texto).toContain('🔩 Repuesto: WR60X10185 · Compresor 1/4 HP')
    expect(r.texto).not.toContain('ZZZ')
    expect(r.lineaCompacta).toContain('Asignada → Esperando repuesto, repuesto WR60X10185 · Compresor 1/4 HP')
  })

  it('servicio en estado de repuesto sin filas → "Sin repuesto especificado"', () => {
    const solicitudes = [sol({ id: 'a', estado: 'repuesto_en_camino' })]
    const eventos = [ev({ solicitud_id: 'a', estado_previo: 'esperando_repuesto', estado_nuevo: 'repuesto_en_camino', actor: 'supervisor' })]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.texto).toContain('Esperando repuesto → Repuesto en camino (supervisor)')
    expect(r.texto).toContain('🔩 Repuesto: Sin repuesto especificado')
  })

  it('cada supervisor recibe SOLO sus servicios (ámbito + marca)', () => {
    const solicitudes = [
      sol({ id: 'g-mabe', cliente_nombre: 'Garantía Mabe', es_garantia: true, marca_equipo: 'MABE' }),
      sol({ id: 'g-lg', cliente_nombre: 'Garantía LG', es_garantia: true, marca_equipo: 'LG' }),
      sol({ id: 'p-mabe', cliente_nombre: 'Particular Mabe', es_garantia: false, marca_equipo: 'mabe', numero_serie_factura: null }),
    ]
    const eventos = solicitudes.map(s => ev({ solicitud_id: s.id, estado_nuevo: 'asignada' }))

    const general = armarResumenSupervisor({ supervisor: sup({ ambito: 'todos', marca: null }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(general.servicios).toBe(3)

    const mabeGarantia = armarResumenSupervisor({ supervisor: sup({ id: 'sup-2', ambito: 'garantia', marca: 'Mabe' }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(mabeGarantia.servicios).toBe(1)
    expect(mabeGarantia.texto).toContain('Garantía Mabe')
    expect(mabeGarantia.texto).not.toContain('Garantía LG')
    expect(mabeGarantia.texto).not.toContain('Particular Mabe')

    const particular = armarResumenSupervisor({ supervisor: sup({ id: 'sup-3', ambito: 'particular', marca: null }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(particular.servicios).toBe(1)
    expect(particular.texto).toContain('Particular Mabe')

    const sinNada = armarResumenSupervisor({ supervisor: sup({ id: 'sup-4', ambito: 'particular', marca: 'Samsung' }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(sinNada.vacio).toBe(true)
  })

  it('el campo `estados` del supervisor NO filtra (es solo para avisos instantáneos)', () => {
    const solicitudes = [sol({ id: 'a' })]
    const eventos = [ev({ solicitud_id: 'a', estado_nuevo: 'asignada' })]
    const r = armarResumenSupervisor({ supervisor: sup({ estados: ['completada'] }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.movimientos).toBe(1)
  })

  it('ignora eventos que no cambian el estado, de tipos que no son transición, o de solicitudes desconocidas', () => {
    const solicitudes = [sol({ id: 'a' })]
    const eventos = [
      ev({ solicitud_id: 'a', estado_previo: 'asignada', estado_nuevo: 'asignada' }),            // sin cambio real
      ev({ solicitud_id: 'a', tipo: 'nota_admin', estado_previo: 'asignada', estado_nuevo: 'en_proceso' }), // tipo no transición
      ev({ solicitud_id: 'fantasma', estado_nuevo: 'asignada' }),                                  // sin solicitud
      ev({ solicitud_id: 'a', tipo: 'cambio_estado_admin', estado_previo: 'asignada', estado_nuevo: 'cancelada', actor: 'admin' }),
    ]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.movimientos).toBe(1)
    expect(r.texto).toContain('Asignada → Cancelada (Baird)')
  })

  it('un movimiento de anoche (después del corte de ayer) se marca "ayer HH:mm"', () => {
    const solicitudes = [sol({ id: 'a' })]
    const eventos = [
      ev({ solicitud_id: 'a', estado_previo: 'pendiente_horario', estado_nuevo: 'notificada', actor: 'cliente', ocurrido_at: '2026-10-19T23:01:00Z' }), // 19 oct 18:01 Bogotá
      ev({ solicitud_id: 'a', estado_previo: 'notificada', estado_nuevo: 'asignada', ocurrido_at: '2026-10-20T13:00:00Z' }),                            // 20 oct 08:00
    ]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.texto).toContain('ayer 18:01  Pendiente horario → Notificada (cliente)')
    expect(r.texto).toContain('08:00  Notificada → Asignada (técnico)')
  })

  it('sin portal_token o sin appUrl no agrega el pie con el link', () => {
    const solicitudes = [sol({ id: 'a' })]
    const eventos = [ev({ solicitud_id: 'a', estado_nuevo: 'asignada' })]
    const sinToken = armarResumenSupervisor({ supervisor: sup({ portal_token: null }), ventana: VENTANA, eventos, solicitudes, repuestos: [], appUrl: 'https://x.com' })
    expect(sinToken.texto).not.toContain('Panel:')
    const sinUrl = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(sinUrl.texto).not.toContain('Panel:')
  })
})

// ─────────────────────────────────────────────────────────────────
// Partición y línea compacta
// ─────────────────────────────────────────────────────────────────

describe('partirTexto', () => {
  it('devuelve el texto entero si cabe', () => {
    expect(partirTexto('hola\n\nmundo')).toEqual(['hola\n\nmundo'])
  })

  it('parte por bloques sin superar el máximo y numera las partes', () => {
    const bloque = 'x'.repeat(1500)
    const texto = [bloque, bloque, bloque].join('\n\n')
    const partes = partirTexto(texto, 3200)
    expect(partes).toHaveLength(2)
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(3200 + 12)
    expect(partes[0].endsWith('(1/2)')).toBe(true)
    expect(partes[1].endsWith('(2/2)')).toBe(true)
  })

  it('un bloque gigante se corta por líneas', () => {
    const texto = Array.from({ length: 200 }, (_, i) => `línea ${i} ${'y'.repeat(40)}`).join('\n')
    const partes = partirTexto(texto, 1000)
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(1000 + 12)
    expect(partes.join('\n').replace(/\n\n\(\d+\/\d+\)/g, '')).toContain('línea 199')
  })

  it('el default es el margen bajo el límite de Meta', () => {
    expect(MAX_CHARS_MENSAJE).toBeLessThan(4096)
  })
})

describe('compactarLinea', () => {
  it('une con " • " y colapsa whitespace (sin saltos de línea para Meta)', () => {
    expect(compactarLinea(['a\nb', ' c  d '], 100)).toBe('a b • c d')
    expect(compactarLinea([], 100)).toBe('Sin movimientos hoy.')
  })

  it('recorta con "… y N servicios más" cuando no caben todos', () => {
    const partes = ['A'.repeat(100), 'B'.repeat(100), 'C'.repeat(100), 'D'.repeat(100)]
    const linea = compactarLinea(partes, 260)
    expect(linea.length).toBeLessThanOrEqual(260)
    expect(linea).toContain('… y 2 servicios más')
    expect(linea).toContain('A'.repeat(100))
    expect(linea).toContain('B'.repeat(100))
    expect(linea).not.toContain('CCC')
  })

  it('si una sola parte supera el máximo la trunca con "…"', () => {
    const linea = compactarLinea(['Z'.repeat(500)], 100)
    expect(linea.length).toBe(100)
    expect(linea.endsWith('…')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// Cerrar para abrir después (MABE, 2026-10-22)
// ─────────────────────────────────────────────────────────────────

describe('cerrar para abrir después (garantía agendada a más de 4 días)', () => {
  // Agendado el martes 2026-10-20 (10:32 Bogotá). Visita a 7 días = 2026-10-27.
  const VISITA_7D = '2026-10-27T13:00:00Z' // 8:00 Bogotá
  const VISITA_4D = '2026-10-24T13:00:00Z'

  it('garantía confirmada a 7 días → sección arriba + línea ⏸️ en el bloque + conteo', () => {
    const solicitudes = [sol({ id: 's1', estado: 'notificada', fecha_visita_at: VISITA_7D })]
    const eventos = [ev({ solicitud_id: 's1', estado_previo: 'pendiente_horario', estado_nuevo: 'notificada', actor: 'cliente' })]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.cerrarParaAbrir).toBe(1)
    expect(r.vacio).toBe(false)
    expect(r.conteo).toBe('1 movimiento en 1 servicio · 1 para cerrar y abrir después')
    expect(r.texto).toContain('⏸️ *Cerrar para abrir después* — visita a más de 4 días (1):')
    expect(r.texto).toContain('• *Juan Pérez* · Nevera Mabe · Garantía 9415091231 · Bogotá · visita martes 27 de octubre (7 días)')
    expect(r.texto).toContain('  ⏸️ Visita martes 27 de octubre (7 días) → cerrar para abrir después')
    expect(r.lineaCompacta).toContain('⏸️ cerrar/abrir (visita en 7 días)')
    // La sección va ANTES del detalle del servicio.
    expect(r.texto.indexOf('Cerrar para abrir después')).toBeLessThan(r.texto.indexOf('Pendiente horario → Notificada'))
  })

  it('a 4 días exactos NO se marca (la regla es "más de 4")', () => {
    const solicitudes = [sol({ id: 's1', estado: 'notificada', fecha_visita_at: VISITA_4D })]
    const eventos = [ev({ solicitud_id: 's1', estado_previo: 'pendiente_horario', estado_nuevo: 'notificada' })]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.cerrarParaAbrir).toBe(0)
    expect(r.texto).not.toContain('⏸️')
    expect(r.conteo).toBe('1 movimiento en 1 servicio')
  })

  it('particular a 10 días NO se marca (regla solo de garantía MABE)', () => {
    const solicitudes = [sol({ id: 's1', es_garantia: false, numero_serie_factura: null, estado: 'notificada', fecha_visita_at: '2026-10-30T13:00:00Z' })]
    const eventos = [ev({ solicitud_id: 's1', estado_previo: 'pendiente_horario', estado_nuevo: 'notificada' })]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.cerrarParaAbrir).toBe(0)
    expect(r.texto).not.toContain('⏸️')
  })

  it('reagendamiento del admin (nota_admin, sin cambio de estado) cuenta y usa la fecha del payload', () => {
    const solicitudes = [sol({ id: 's1', estado: 'asignada', fecha_visita_at: VISITA_4D })]
    const eventos: EventoMovimiento[] = [
      {
        solicitud_id: 's1',
        tipo: 'nota_admin',
        estado_previo: 'asignada',
        estado_nuevo: 'asignada',
        actor: 'admin@baird.co',
        ocurrido_at: '2026-10-20T15:32:00Z',
        payload: { origen: 'reagendamiento_admin', fecha_visita_at: VISITA_7D },
      },
    ]
    const r = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(r.movimientos).toBe(0)
    expect(r.vacio).toBe(false)
    expect(r.cerrarParaAbrir).toBe(1)
    expect(r.texto).toContain('sin cambios de estado hoy, pero 1 servicio para cerrar y abrir después')
    expect(r.texto).toContain('visita martes 27 de octubre (7 días)')
    expect(r.lineaCompacta).toBe('Juan Pérez (Nevera Mabe · Garantía 9415091231): ⏸️ cerrar/abrir (visita en 7 días)')
  })

  it('solo el supervisor con alcance la ve; el último agendamiento del día manda', () => {
    const solicitudes = [sol({ id: 's1', marca_equipo: 'LG', estado: 'en_proceso', fecha_visita_at: VISITA_4D })]
    const eventos: EventoMovimiento[] = [
      ev({ solicitud_id: 's1', tipo: 'reagendamiento_confirmado', estado_previo: 'repuesto_recibido', estado_nuevo: 'en_proceso', actor: 'cliente', ocurrido_at: '2026-10-20T14:00:00Z', payload: { fecha_visita_at: VISITA_7D } }),
      ev({ solicitud_id: 's1', tipo: 'nota_admin', estado_previo: 'en_proceso', estado_nuevo: 'en_proceso', ocurrido_at: '2026-10-20T16:00:00Z', payload: { origen: 'reagendamiento_admin', fecha_visita_at: VISITA_4D } }),
    ]
    const todos = armarResumenSupervisor({ supervisor: sup(), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(todos.cerrarParaAbrir).toBe(0) // el admin la acercó a 4 días → ya no aplica
    const mabe = armarResumenSupervisor({ supervisor: sup({ ambito: 'garantia', marca: 'MABE' }), ventana: VENTANA, eventos, solicitudes, repuestos: [] })
    expect(mabe.vacio).toBe(true) // LG no está en su alcance
  })

  it('helpers: esEventoAgendamiento y diasEntreYMD', () => {
    expect(esEventoAgendamiento(ev({ solicitud_id: 'x', estado_previo: 'pendiente_horario', estado_nuevo: 'notificada' }))).toBe(true)
    expect(esEventoAgendamiento(ev({ solicitud_id: 'x', estado_previo: 'asignada', estado_nuevo: 'notificada' }))).toBe(false)
    expect(esEventoAgendamiento(ev({ solicitud_id: 'x', tipo: 'reagendamiento', estado_previo: 'notificada', estado_nuevo: 'notificada' }))).toBe(true)
    expect(esEventoAgendamiento(ev({ solicitud_id: 'x', tipo: 'nota_admin', estado_nuevo: 'asignada', payload: { origen: 'otro' } }))).toBe(false)
    expect(diasEntreYMD('2026-10-20', '2026-10-27')).toBe(7)
    expect(diasEntreYMD('2026-10-31', '2026-11-02')).toBe(2)
    expect(DIAS_AGENDA_CERRAR_PARA_ABRIR).toBe(4)
  })
})
