/**
 * mapa-colors.ts — Colores hex para los pines del mapa admin (/admin/mapa).
 *
 * Equivalencia visual aproximada con ESTADO_ESTILOS (que son clases Tailwind).
 * Leaflet necesita colores CSS reales, no clases — por eso este map separado.
 *
 * Si se agrega un estado nuevo en src/lib/constants/estados.ts, sumar acá un
 * color que mantenga el "vibe" del bg-{color}-100 correspondiente.
 */

export const COLOR_POR_ESTADO: Record<string, string> = {
  pendiente:               '#eab308', // yellow-500
  pendiente_horario:       '#eab308', // yellow-500
  sin_agendar:             '#9ca3af', // gray-400
  notificada:              '#3b82f6', // blue-500
  asignada:                '#22c55e', // green-500
  diagnostico_pendiente:   '#6366f1', // indigo-500
  aprobacion_paso_pendiente:'#8b5cf6',// violet-500
  cotizacion_enviada:      '#06b6d4', // cyan-500
  cotizacion_aprobada:     '#14b8a6', // teal-500
  cotizacion_rechazada:    '#f43f5e', // rose-500
  esperando_repuesto:      '#d946ef', // fuchsia-500
  pendiente_pricing:       '#f97316', // orange-500
  reagendamiento_pendiente:'#eab308', // yellow-500
  finalizado_sin_reparacion:'#78716c',// stone-500
  reparacion_rechazada:    '#ef4444', // red-500
  no_show_cliente:         '#78716c', // stone-500
  en_proceso:              '#a855f7', // purple-500
  confirmacion_pendiente:  '#f59e0b', // amber-500
  completada:              '#10b981', // emerald-500
  cancelada:               '#ef4444', // red-500
  en_disputa:              '#f97316', // orange-500
}

/** Fallback para estados desconocidos. */
export const COLOR_ESTADO_DEFAULT = '#6b7280' // gray-500

/**
 * Color determinístico por técnico — hash de UUID a hue HSL.
 * Pinta cada técnico de un color estable (mismo UUID → mismo color siempre).
 * Saturación y luminosidad fijas para que se vean consistentes.
 */
export function colorPorTecnico(tecnicoId: string | null): string {
  if (!tecnicoId) return '#9ca3af' // gray-400 para sin asignar
  // Hash determinístico simple: suma de char codes, mod 360 para HSL hue.
  let hash = 0
  for (let i = 0; i < tecnicoId.length; i++) {
    hash = ((hash << 5) - hash + tecnicoId.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 50%)`
}
