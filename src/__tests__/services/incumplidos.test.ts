import { describe, it, expect } from 'vitest'
import {
  calcularReporteCumplimiento,
  diasEntreYMD,
  evaluarReserva,
  nivelPrioridad,
  ordenarPorPrioridad,
  ordenarPorUrgencia,
  type SolicitudIncumplidos,
} from '@/lib/services/incumplidos.service'

// "Ahora" fijo: lunes 2026-10-19 10:00 Bogotá (15:00Z).
const AHORA = new Date('2026-10-19T15:00:00Z')

// Slot día + franja en hora CO: 8am Bogotá = 13:00Z.
const RESERVA_15_OCT = '2026-10-15T13:00:00.000Z'
const RESERVA_HOY = '2026-10-19T13:00:00.000Z'

function sol(partial: Partial<SolicitudIncumplidos> & { id: string }): SolicitudIncumplidos {
  return {
    estado: 'asignada',
    es_garantia: true,
    cliente_nombre: 'Cliente',
    cliente_telefono: '573001234567',
    ciudad_pueblo: 'Bogotá',
    tipo_equipo: 'Lavadora',
    marca_equipo: 'MABE',
    tipo_solicitud: 'Reparación',
    numero_serie_factura: null,
    horario_confirmado: 'jueves, 15 de octubre · 8am-12pm',
    fecha_visita_at: RESERVA_15_OCT,
    diagnosticado_at: null,
    siguiente_paso_at: null,
    tecnico_asignado_id: 'tec-1',
    reagendamientos_count: 0,
    created_at: '2026-10-10T12:00:00Z',
    ...partial,
  }
}

describe('incumplidos.service — evaluarReserva', () => {
  it('sin fecha_visita_at no hay reserva que evaluar', () => {
    expect(evaluarReserva(sol({ id: 'a', fecha_visita_at: null }), { ahora: AHORA })).toBeNull()
  })

  it('reserva de hoy o futura no se evalúa (misma regla que esFechaVisitaPasada)', () => {
    const r = evaluarReserva(sol({ id: 'a', fecha_visita_at: RESERVA_HOY }), { ahora: AHORA })
    expect(r?.resultado).toBe('futura')
  })

  it('cumplida: diagnóstico el mismo día de la reserva (hora CO)', () => {
    // 15 oct 21:30 Bogotá = 16 oct 02:30Z → sigue siendo el 15 en Colombia.
    const r = evaluarReserva(
      sol({ id: 'a', estado: 'en_proceso', diagnosticado_at: '2026-10-16T02:30:00Z' }),
      { ahora: AHORA },
    )
    expect(r?.resultado).toBe('cumplida')
    expect(r?.dias_retraso).toBe(0)
    expect(r?.evidencia).toBe('diagnostico')
  })

  it('cumplida por ping GPS aunque no haya diagnóstico (tarifa fija / visita en curso)', () => {
    const r = evaluarReserva(
      sol({ id: 'a' }),
      { ahora: AHORA, pings: [{ solicitud_id: 'a', capturado_at: '2026-10-15T14:10:00Z' }] },
    )
    expect(r?.resultado).toBe('cumplida')
    expect(r?.evidencia).toBe('gps')
  })

  it('tarde: atendida dos días después de la reserva', () => {
    const r = evaluarReserva(
      sol({ id: 'a', estado: 'completada' }),
      { ahora: AHORA, evidencias: [{ solicitud_id: 'a', completado_at: '2026-10-17T18:00:00Z' }] },
    )
    expect(r?.resultado).toBe('tarde')
    expect(r?.dias_retraso).toBe(2)
    expect(r?.dia_atencion).toBe('2026-10-17')
    expect(r?.evidencia).toBe('completado')
  })

  it('vencida: técnico asignado, fecha pasada, sin ninguna evidencia', () => {
    const r = evaluarReserva(sol({ id: 'a' }), { ahora: AHORA })
    expect(r?.resultado).toBe('vencida')
    expect(r?.dias_retraso).toBe(4) // 15 → 19 oct
  })

  it('sin_tecnico: nadie aceptó y la fecha pasó', () => {
    const r = evaluarReserva(sol({ id: 'a', estado: 'notificada', tecnico_asignado_id: null }), { ahora: AHORA })
    expect(r?.resultado).toBe('sin_tecnico')
  })

  it('vencida en 2ª visita tras repuesto: el diagnóstico quedó ANTES de la nueva fecha', () => {
    const r = evaluarReserva(
      sol({ id: 'a', estado: 'en_proceso', diagnosticado_at: '2026-10-02T15:00:00Z' }),
      { ahora: AHORA },
    )
    expect(r?.resultado).toBe('vencida')
  })

  it('cerrada_sin_visita: cancelada después de la fecha sin que nadie fuera', () => {
    const r = evaluarReserva(sol({ id: 'a', estado: 'cancelada' }), { ahora: AHORA })
    expect(r?.resultado).toBe('cerrada_sin_visita')
  })

  it('no_show_cliente con ping del técnico ese día cuenta como cumplida (Baird sí fue)', () => {
    const r = evaluarReserva(
      sol({ id: 'a', estado: 'no_show_cliente' }),
      { ahora: AHORA, pings: [{ solicitud_id: 'a', capturado_at: '2026-10-15T13:30:00Z' }] },
    )
    expect(r?.resultado).toBe('cumplida')
  })

  it('sin_evidencia: estado post-visita histórico sin ningún timestamp', () => {
    const r = evaluarReserva(sol({ id: 'a', estado: 'completada' }), { ahora: AHORA })
    expect(r?.resultado).toBe('sin_evidencia')
  })

  it('usa siguiente_paso_at como marcador si diagnosticado_at falta', () => {
    const r = evaluarReserva(
      sol({ id: 'a', estado: 'esperando_repuesto', siguiente_paso_at: '2026-10-15T16:00:00Z' }),
      { ahora: AHORA },
    )
    expect(r?.resultado).toBe('cumplida')
  })

  it('ignora timestamps inválidos', () => {
    const r = evaluarReserva(sol({ id: 'a', diagnosticado_at: 'no-es-fecha' }), { ahora: AHORA })
    expect(r?.resultado).toBe('vencida')
  })
})

describe('incumplidos.service — calcularReporteCumplimiento', () => {
  it('agrega resumen global y por técnico, excluye futuras y fuera de rango, ordena urgentes primero', () => {
    const reporte = calcularReporteCumplimiento({
      solicitudes: [
        sol({ id: 'cumplida', estado: 'en_proceso', diagnosticado_at: '2026-10-15T15:00:00Z' }),
        sol({ id: 'tarde', estado: 'completada', tecnico_asignado_id: 'tec-2' }),
        sol({ id: 'vencida-vieja', fecha_visita_at: '2026-10-10T13:00:00.000Z' }),
        sol({ id: 'vencida-nueva', fecha_visita_at: '2026-10-17T13:00:00.000Z' }),
        sol({ id: 'sin-tec', estado: 'notificada', tecnico_asignado_id: null }),
        sol({ id: 'futura', fecha_visita_at: RESERVA_HOY }),
        sol({ id: 'fuera-de-rango', fecha_visita_at: '2026-09-01T13:00:00.000Z' }),
        sol({ id: 'sin-fecha', fecha_visita_at: null }),
      ],
      evidencias: [{ solicitud_id: 'tarde', completado_at: '2026-10-16T18:00:00Z' }],
      pings: [],
      tecnicos: { 'tec-1': 'Néstor', 'tec-2': 'Henry' },
      desde: '2026-10-01',
      hasta: '2026-10-18',
      ahora: AHORA,
    })

    expect(reporte.resumen).toMatchObject({
      reservas: 5,
      cumplidas: 1,
      tarde: 1,
      vencidas: 2,
      sin_tecnico: 1,
      incumplidas: 4,
    })
    expect(reporte.resumen.cumplimiento_pct).toBeCloseTo(0.2)

    // Sin reagendamientos y misma antigüedad (todas creadas el 10 oct): manda la
    // gravedad — vencidas primero, la más atrasada arriba; luego sin técnico; luego tarde.
    expect(reporte.items.map((i) => i.solicitud_id)).toEqual(['vencida-vieja', 'vencida-nueva', 'sin-tec', 'tarde', 'cumplida'])
    expect(reporte.items.every((i) => i.dias_desde_solicitud === 9 && i.prioridad === 'media')).toBe(true)

    expect(reporte.por_tecnico[0]).toMatchObject({ tecnico_id: 'tec-1', tecnico_nombre: 'Néstor', reservas: 3, vencidas: 2, cumplidas: 1 })
    const sinTec = reporte.por_tecnico.find((t) => t.tecnico_id === null)
    expect(sinTec).toMatchObject({ tecnico_nombre: 'Sin técnico', sin_tecnico: 1 })
    const henry = reporte.por_tecnico.find((t) => t.tecnico_id === 'tec-2')
    expect(henry).toMatchObject({ tarde: 1, incumplidas: 1, cumplimiento_pct: 0 })
  })

  it('prioriza por reagendamientos y luego por antigüedad de la solicitud, por encima de la gravedad', () => {
    const reporte = calcularReporteCumplimiento({
      solicitudes: [
        // Vencida, pero nueva y sin reagendar → va después.
        sol({ id: 'vencida-nueva', created_at: '2026-10-14T12:00:00Z' }),
        // Atendida tarde, reagendada 2 veces por contador → primera.
        sol({ id: 'tarde-reagendada', estado: 'completada', reagendamientos_count: 2 }),
        // Sin técnico, 1 reagendamiento que SOLO quedó en eventos (reagendar vencido).
        sol({ id: 'sin-tec-evento', estado: 'notificada', tecnico_asignado_id: null, created_at: '2026-10-01T12:00:00Z' }),
        // Vencida, sin reagendar, pero la solicitud más vieja del grupo sin reagendamientos.
        sol({ id: 'vencida-vieja', created_at: '2026-09-20T12:00:00Z' }),
      ],
      evidencias: [{ solicitud_id: 'tarde-reagendada', completado_at: '2026-10-16T18:00:00Z' }],
      pings: [],
      reagendamientos: [{ solicitud_id: 'sin-tec-evento' }],
      tecnicos: { 'tec-1': 'Néstor' },
      desde: '2026-10-01',
      hasta: '2026-10-18',
      ahora: AHORA,
    })

    expect(reporte.items.map((i) => i.solicitud_id)).toEqual([
      'tarde-reagendada', // 2 reagendamientos
      'sin-tec-evento', // 1 reagendamiento (por evento), 18 días
      'vencida-vieja', // 0 reagendamientos, 29 días
      'vencida-nueva', // 0 reagendamientos, 5 días
    ])
    const porId = Object.fromEntries(reporte.items.map((i) => [i.solicitud_id, i]))
    expect(porId['tarde-reagendada']).toMatchObject({ reagendamientos: 2, dias_desde_solicitud: 9, prioridad: 'alta' })
    expect(porId['sin-tec-evento']).toMatchObject({ reagendamientos: 1, dias_desde_solicitud: 18, prioridad: 'alta' })
    expect(porId['vencida-vieja']).toMatchObject({ reagendamientos: 0, dias_desde_solicitud: 29, prioridad: 'alta' })
    expect(porId['vencida-nueva']).toMatchObject({ reagendamientos: 0, dias_desde_solicitud: 5, prioridad: 'baja' })

    // El orden por urgencia sigue disponible para la vista: vencidas primero.
    expect(ordenarPorUrgencia(reporte.items).map((i) => i.solicitud_id)).toEqual([
      'vencida-vieja', 'vencida-nueva', 'sin-tec-evento', 'tarde-reagendada',
    ])
    // ordenarPorPrioridad no muta y es estable con la salida del reporte.
    const copia = [...reporte.items].reverse()
    expect(ordenarPorPrioridad(copia).map((i) => i.solicitud_id)).toEqual(reporte.items.map((i) => i.solicitud_id))
    expect(copia[0].solicitud_id).toBe('vencida-nueva')
  })

  it('reagendamientos = máximo entre el contador y los eventos (no se suman)', () => {
    const conAmbos = evaluarReserva(sol({ id: 'a', reagendamientos_count: 3 }), {
      ahora: AHORA,
      reagendamientos: [{ solicitud_id: 'a' }, { solicitud_id: 'a' }],
    })
    expect(conAmbos?.reagendamientos).toBe(3)
    const soloEventos = evaluarReserva(sol({ id: 'b', reagendamientos_count: null }), {
      ahora: AHORA,
      reagendamientos: [{ solicitud_id: 'b' }],
    })
    expect(soloEventos?.reagendamientos).toBe(1)
  })

  it('dias_desde_solicitud cuenta días calendario CO y nunca es negativo', () => {
    // 18 oct 23:30 Bogotá = 19 oct 04:30Z → sigue siendo el 18 en Colombia: 1 día.
    expect(evaluarReserva(sol({ id: 'a', created_at: '2026-10-19T04:30:00Z' }), { ahora: AHORA })?.dias_desde_solicitud).toBe(1)
    expect(evaluarReserva(sol({ id: 'b', created_at: '2026-10-25T12:00:00Z' }), { ahora: AHORA })?.dias_desde_solicitud).toBe(0)
    // created_at inválido: cae a la fecha de la reserva (15 oct → 4 días).
    expect(evaluarReserva(sol({ id: 'c', created_at: 'no-es-fecha' }), { ahora: AHORA })?.dias_desde_solicitud).toBe(4)
  })

  it('cumplimiento_pct es null sin base (solo cerradas sin visita)', () => {
    const reporte = calcularReporteCumplimiento({
      solicitudes: [sol({ id: 'a', estado: 'cancelada' })],
      evidencias: [],
      pings: [],
      tecnicos: {},
      desde: '2026-10-01',
      hasta: '2026-10-18',
      ahora: AHORA,
    })
    expect(reporte.resumen.cerradas_sin_visita).toBe(1)
    expect(reporte.resumen.cumplimiento_pct).toBeNull()
  })
})

describe('incumplidos.service — nivelPrioridad', () => {
  it('alta con ≥2 reagendamientos o ≥15 días; media con ≥1 o ≥7; baja el resto', () => {
    expect(nivelPrioridad(0, 0)).toBe('baja')
    expect(nivelPrioridad(0, 6)).toBe('baja')
    expect(nivelPrioridad(1, 0)).toBe('media')
    expect(nivelPrioridad(0, 7)).toBe('media')
    expect(nivelPrioridad(2, 0)).toBe('alta')
    expect(nivelPrioridad(0, 15)).toBe('alta')
    expect(nivelPrioridad(1, 20)).toBe('alta')
  })
})

describe('incumplidos.service — diasEntreYMD', () => {
  it('cuenta días calendario (b − a), cruzando mes', () => {
    expect(diasEntreYMD('2026-10-15', '2026-10-19')).toBe(4)
    expect(diasEntreYMD('2026-09-30', '2026-10-02')).toBe(2)
    expect(diasEntreYMD('2026-10-19', '2026-10-15')).toBe(-4)
  })
})
