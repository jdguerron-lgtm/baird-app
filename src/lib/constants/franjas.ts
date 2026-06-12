/**
 * Franjas horarias agendables — catálogo único compartido por los selectores
 * del cliente (HorarioSelector, ReprogramarSelector) y por la capa de agenda
 * (agenda.service.ts, /api/disponibilidad-horario).
 *
 * `horaInicio` (hora local Colombia, 0-23) debe coincidir con lo que
 * extraerHoraInicio() de fecha-visita.ts parsea del `value` — es la clave con
 * la que se materializa `fecha_visita_at` y, por lo tanto, la identidad del
 * "slot" (día + franja) sobre el que se cuenta el cupo.
 */
export const FRANJAS_HORARIO = [
  { value: '8am-12pm', label: 'Mañana (8am - 12pm)', icon: '🌅', horaInicio: 8 },
  { value: '12pm-3pm', label: 'Mediodía (12pm - 3pm)', icon: '☀️', horaInicio: 12 },
  { value: '3pm-6pm', label: 'Tarde (3pm - 6pm)', icon: '🌤️', horaInicio: 15 },
  { value: '6pm-8pm', label: 'Noche (6pm - 8pm)', icon: '🌆', horaInicio: 18 },
] as const

export type FranjaHorario = (typeof FRANJAS_HORARIO)[number]['value']

/**
 * Cupo máximo de reservas activas por slot (día + franja). Con 2 se evita que
 * muchos clientes agenden la misma fecha/franja y los técnicos no alcancen.
 */
export const MAX_RESERVAS_POR_FRANJA = 2
