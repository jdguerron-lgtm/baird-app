import { describe, it, expect } from 'vitest'
import {
  diasSolucionBono,
  encuestaDeEvidencia,
  finDeSemanaTrabajo,
  pausaRepuesto,
  resumenBonoGarantia,
  tiempoAtencion,
  type SolicitudBono,
} from '@/lib/utils/bono-garantia'
import { calcularTarifaMABE } from '@/lib/constants/tarifas/mabe'

// Regla 2026-10-24 (pedido de Juan): el reloj del bono se pausa cuando el
// técnico pide repuesto y vuelve a correr cuando el repuesto se recibe EN EL
// SISTEMA; el recargo de finde/festivo aplica si el técnico DIAGNOSTICÓ o
// CERRÓ en sábado, domingo o festivo CO.

function sol(partial: Partial<SolicitudBono> = {}): SolicitudBono {
  return {
    created_at: '2026-10-05T15:00:00Z', // lunes 5 oct 2026, 10:00 CO
    estado: 'completada',
    diagnosticado_at: null,
    horario_confirmado_at: null,
    cumple_ta: null,
    siguiente_paso: null,
    siguiente_paso_at: null,
    repuesto_recibido_at: null,
    fin_pausa_repuesto_at: null,
    recargo_weekend_aplicado: null,
    triaje_resultado: { complejidad: 'media' },
    ...partial,
  }
}

describe('pausaRepuesto / diasSolucionBono', () => {
  it('sin repuesto: días = creación → cierre, sin pausa', () => {
    const d = diasSolucionBono(sol(), '2026-10-07T15:00:00Z')
    expect(d.netos).toBe(2)
    expect(d.brutos).toBe(2)
    expect(d.pausa.aplica).toBe(false)
  })

  it('pausa desde el diagnóstico con esperar_repuesto hasta repuesto_recibido_at', () => {
    const s = sol({
      diagnosticado_at: '2026-10-06T15:00:00Z',
      siguiente_paso: 'esperar_repuesto',
      siguiente_paso_at: '2026-10-06T15:00:00Z',
      repuesto_recibido_at: '2026-10-13T15:00:00Z', // 7 días esperando
    })
    const d = diasSolucionBono(s, '2026-10-14T15:00:00Z') // 9 días brutos
    expect(d.brutos).toBe(9)
    expect(d.pausa).toMatchObject({ aplica: true, abierta: false, dias: 7, origenFin: 'recibido' })
    expect(d.netos).toBe(2)
  })

  it('sin "recibido" pero con salida del ciclo (cliente agendó con repuesto en camino): la pausa cierra en ese evento', () => {
    const s = sol({
      siguiente_paso: 'esperar_repuesto',
      siguiente_paso_at: '2026-10-06T15:00:00Z',
      fin_pausa_repuesto_at: '2026-10-10T15:00:00Z',
    })
    const d = diasSolucionBono(s, '2026-10-12T15:00:00Z') // 7 brutos − 4 pausa
    expect(d.pausa).toMatchObject({ aplica: true, dias: 4, origenFin: 'salida_ciclo' })
    expect(d.netos).toBe(3)
  })

  it('servicio aún esperando repuesto: pausa ABIERTA hasta hoy, el reloj no corre', () => {
    const s = sol({
      estado: 'esperando_repuesto',
      siguiente_paso: 'esperar_repuesto',
      siguiente_paso_at: '2026-10-06T15:00:00Z',
    })
    const p = pausaRepuesto(s, '2026-10-20T15:00:00Z')
    expect(p).toMatchObject({ aplica: true, abierta: true, fin: null, dias: 14 })
    expect(diasSolucionBono(s, '2026-10-20T15:00:00Z').netos).toBe(1)
  })

  it('fila vieja: salió del ciclo sin evento ni recibido → la pausa llega hasta el cierre', () => {
    const s = sol({ siguiente_paso: 'esperar_repuesto', siguiente_paso_at: '2026-10-06T15:00:00Z' })
    const d = diasSolucionBono(s, '2026-10-20T15:00:00Z')
    expect(d.pausa.dias).toBe(14)
    expect(d.netos).toBe(1)
  })

  it('la pausa nunca empuja los días por debajo de 0 ni se cuenta más allá del cierre', () => {
    const s = sol({
      siguiente_paso: 'esperar_repuesto',
      siguiente_paso_at: '2026-10-06T15:00:00Z',
      repuesto_recibido_at: '2026-10-30T15:00:00Z', // "recibido" después del cierre (dato sucio)
    })
    const d = diasSolucionBono(s, '2026-10-10T15:00:00Z')
    expect(d.pausa.dias).toBe(4)
    expect(d.netos).toBe(1)
  })
})

describe('tiempoAtencion', () => {
  it('calcula horas y cumplimiento con las dos fechas', () => {
    const ok = tiempoAtencion(sol({ horario_confirmado_at: '2026-10-05T15:00:00Z', diagnosticado_at: '2026-10-06T10:30:00Z' }))
    expect(ok).toMatchObject({ cumple: true, horas: 19.5, limite: 24 })
    const no = tiempoAtencion(sol({ horario_confirmado_at: '2026-10-05T15:00:00Z', diagnosticado_at: '2026-10-07T10:00:00Z' }))
    expect(no.cumple).toBe(false)
    expect(no.horas).toBe(43)
  })
  it('sin fechas cae a cumple_ta persistido o null', () => {
    expect(tiempoAtencion(sol({ cumple_ta: false })).cumple).toBe(false)
    expect(tiempoAtencion(sol()).cumple).toBeNull()
  })
})

describe('finDeSemanaTrabajo — recargo por trabajo real', () => {
  it('diagnóstico en sábado → aplica (motivo diagnóstico)', () => {
    const f = finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-10T14:00:00Z' }), null) // sáb 10 oct 2026
    expect(f).toMatchObject({ aplica: true, motivo: 'diagnóstico', fecha: '2026-10-10', proyeccion: false })
  })
  it('diagnóstico entre semana pero cierre en domingo → aplica (motivo cierre)', () => {
    const f = finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-07T14:00:00Z' }), { completado_at: '2026-10-11T20:00:00Z' })
    expect(f).toMatchObject({ aplica: true, motivo: 'cierre', fecha: '2026-10-11' })
  })
  it('festivo colombiano (lunes 12 oct 2026, Día de la Raza) también aplica', () => {
    const f = finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-12T14:00:00Z' }), null)
    expect(f.aplica).toBe(true)
  })
  it('entre semana sin festivo → no aplica', () => {
    const f = finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-07T14:00:00Z' }), { completado_at: '2026-10-08T20:00:00Z' })
    expect(f).toMatchObject({ aplica: false, proyeccion: false })
  })
  it('el día se evalúa en hora Colombia: sábado 11 pm CO = domingo 04:00 UTC sigue siendo finde; viernes 11 pm CO no', () => {
    expect(finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-11T04:00:00Z' }), null).fecha).toBe('2026-10-10')
    expect(finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-10T04:00:00Z' }), null).aplica).toBe(false) // vie 9 oct 23:00 CO
  })
  it('sin diagnóstico aún: proyección por la visita agendada', () => {
    const f = finDeSemanaTrabajo(sol({ fecha_visita_at: '2026-10-10T13:00:00Z' }), null)
    expect(f).toMatchObject({ aplica: true, motivo: 'horario', proyeccion: true })
  })
  it('respeta recargo_weekend_aplicado persistido en filas viejas', () => {
    const f = finDeSemanaTrabajo(sol({ diagnosticado_at: '2026-10-07T14:00:00Z', recargo_weekend_aplicado: 6000 }), null)
    expect(f).toMatchObject({ aplica: true, motivo: 'persistido' })
  })
})

describe('encuestaDeEvidencia', () => {
  it('contestada solo con confirmado=true y calificación en el comentario', () => {
    expect(encuestaDeEvidencia({ confirmado: true, cliente_comentario: 'Calificacion: 9/10 - todo bien' })).toEqual({ contestada: true, calificacion: 9 })
    expect(encuestaDeEvidencia({ confirmado: true, cliente_comentario: 'gracias' }).contestada).toBe(false)
    expect(encuestaDeEvidencia({ confirmado: false, cliente_comentario: 'Calificacion: 9/10' }).contestada).toBe(false)
    expect(encuestaDeEvidencia(null).contestada).toBe(false)
  })
})

describe('resumenBonoGarantia', () => {
  it('consolidado: cierre real, encuesta real, pausa descontada y recargo por cierre en finde', () => {
    const s = sol({
      horario_confirmado_at: '2026-10-05T15:00:00Z',
      diagnosticado_at: '2026-10-06T15:00:00Z',
      siguiente_paso: 'esperar_repuesto',
      siguiente_paso_at: '2026-10-06T15:00:00Z',
      repuesto_recibido_at: '2026-10-09T15:00:00Z',
    })
    const ev = { completado_at: '2026-10-10T15:00:00Z', confirmado: true, cliente_comentario: 'Calificacion: 10/10' } // sáb
    const r = resumenBonoGarantia(s, ev)
    expect(r.consolidado).toBe(true)
    expect(r.cierre.origen).toBe('completado')
    expect(r.dias.netos).toBe(2) // 5 brutos − 3 pausa
    expect(r.finde).toMatchObject({ aplica: true, motivo: 'cierre' })
    expect(r.ta.cumple).toBe(true)
    expect(r.tarifa).toEqual(calcularTarifaMABE({ complejidad: 'media', diasSolucion: 2, cumpleTA: true, cumpleEncuesta: true, esFinDeSemana: true }))
  })

  it('proyección (sin cierre): usa "ahora", asume encuesta y TA si no hay dato', () => {
    const s = sol({ estado: 'en_proceso', diagnosticado_at: '2026-10-06T15:00:00Z' })
    const r = resumenBonoGarantia(s, null, { ahora: new Date('2026-10-08T15:00:00Z') })
    expect(r.consolidado).toBe(false)
    expect(r.cierre.origen).toBe('ahora')
    expect(r.dias.netos).toBe(3)
    expect(r.encuestaAsumida).toBe(true)
    expect(r.taAsumido).toBe(true)
    expect(r.tarifa?.bono).toBe(calcularTarifaMABE({ complejidad: 'media', diasSolucion: 3, cumpleTA: true, cumpleEncuesta: true, esFinDeSemana: false }).bono)
  })

  it('sin complejidad no hay tarifa', () => {
    expect(resumenBonoGarantia(sol({ triaje_resultado: null }), null).tarifa).toBeNull()
  })
})
