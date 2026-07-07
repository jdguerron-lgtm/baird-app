import { describe, it, expect } from 'vitest'
import { parsearFechaVisita, formatearFechaLargaCO } from '@/lib/utils/fecha-visita'
import { materializarFechaVisita } from '@/lib/services/agenda.service'
import { FRANJAS_HORARIO } from '@/lib/constants/franjas'

/**
 * El DateTimeSlotPicker de /solicitar emite el formato canónico
 * "lunes, 7 de julio · 8am-12pm" (formatearFechaLargaCO + franja.value).
 * Estas pruebas garantizan que ese texto:
 *   1. Es parseable por parsearFechaVisita (identidad del slot para el cupo)
 *   2. Materializa el MISMO timestamp que materializarFechaVisita — es decir,
 *      la opción del formulario cuenta contra el mismo slot que valida
 *      validarHorarioAgendable y que consulta franjasLlenasParaFecha.
 */
describe('formato emitido por DateTimeSlotPicker', () => {
  const referencia = new Date('2026-07-06T12:00:00Z')

  it.each(FRANJAS_HORARIO.map(f => [f.value, f.horaInicio] as const))(
    'fecha + franja %s → mismo slot que materializarFechaVisita',
    (franja) => {
      const ymd = '2026-07-15'
      const texto = `${formatearFechaLargaCO(ymd)} · ${franja}`
      const parseado = parsearFechaVisita(texto, referencia)
      expect(parseado).not.toBeNull()
      expect(parseado).toBe(materializarFechaVisita(ymd, franja))
    },
  )

  it('formato ejemplo completo', () => {
    expect(formatearFechaLargaCO('2026-07-07')).toBe('martes, 7 de julio')
    expect(parsearFechaVisita('martes, 7 de julio · 3pm-6pm', referencia)).toBe('2026-07-07T20:00:00.000Z')
  })
})
