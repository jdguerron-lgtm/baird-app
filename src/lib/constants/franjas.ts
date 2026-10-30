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
 * Cupo máximo de reservas activas por slot (día + franja) en TODA la
 * plataforma. Evita que muchos clientes agenden la misma fecha/franja y los
 * técnicos no alcancen. Subido de 2 a 3 el 2026-10-11 para que el tope por
 * técnico (abajo) sea alcanzable: con cupo global 2 ningún técnico podía
 * llegar a 3 servicios en una franja. Subido de 3 a 5 el 2026-10-12 junto
 * con el tope por técnico (misma razón: el global nunca puede ser menor que
 * el tope por técnico o éste queda inalcanzable).
 */
export const MAX_RESERVAS_POR_FRANJA = 5

/**
 * Cupo máximo de servicios que UN técnico puede tener en el mismo slot
 * (día + franja). Cuenta tanto los servicios Baird activos asignados como
 * los bloqueos externos que el técnico registra en su agenda
 * (`agenda_tecnico_bloqueos`). Lo aplica `tecnicoOcupadoEnSlot`
 * (agenda.service) al aceptar un servicio. Era 1 hasta el 2026-10-11 y 3
 * hasta el 2026-10-12 (pedido del user: "2 servicios más por franja").
 */
export const MAX_SERVICIOS_TECNICO_POR_FRANJA = 5

/**
 * Días (YYYY-MM-DD, hora Colombia) cerrados a reservas NUEVAS. Las visitas
 * que ya estaban agendadas ese día se mantienen; solo se rechaza agendar,
 * reagendar o confirmar un horario NUEVO para esa fecha (validarHorarioAgendable)
 * y los calendarios muestran todas sus franjas como llenas
 * (franjasLlenasParaFecha). El admin puede seguir forzando desde la ficha
 * (/api/admin/reagendar-solicitud solo avisa). Quitar la fecha para reabrir.
 *
 * 2026-11-03 (martes): cerrado a pedido del user el 2026-10-30.
 */
export const FECHAS_SIN_RESERVAS_NUEVAS: readonly string[] = ['2026-11-03']

export function fechaCerradaAReservas(fechaYMD: string): boolean {
  return FECHAS_SIN_RESERVAS_NUEVAS.includes(fechaYMD)
}
