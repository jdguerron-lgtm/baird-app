export const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  pendiente_horario: 'bg-yellow-100 text-yellow-800',
  sin_agendar: 'bg-gray-200 text-gray-700',
  notificada: 'bg-blue-100 text-blue-800',
  asignada: 'bg-green-100 text-green-800',
  diagnostico_pendiente: 'bg-indigo-100 text-indigo-800',
  verificacion_pendiente: 'bg-violet-100 text-violet-800',
  cotizacion_enviada: 'bg-cyan-100 text-cyan-800',
  cotizacion_aprobada: 'bg-teal-100 text-teal-800',
  cotizacion_rechazada: 'bg-rose-100 text-rose-800',
  esperando_repuesto: 'bg-fuchsia-100 text-fuchsia-800',
  pendiente_pricing: 'bg-orange-100 text-orange-800',
  reagendamiento_pendiente: 'bg-yellow-100 text-yellow-800',
  finalizado_sin_reparacion: 'bg-stone-200 text-stone-700',
  cancelada_cliente: 'bg-red-100 text-red-700',
  en_proceso: 'bg-purple-100 text-purple-800',
  en_verificacion: 'bg-amber-100 text-amber-800',
  completada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-red-100 text-red-800',
  en_disputa: 'bg-orange-100 text-orange-800',
}

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_horario: 'Pendiente horario',
  sin_agendar: 'Sin agendar',
  notificada: 'Notificada',
  asignada: 'Asignada',
  diagnostico_pendiente: 'Diagnóstico pendiente',
  verificacion_pendiente: 'Esperando aprobación cliente',
  cotizacion_enviada: 'Cotización enviada',
  cotizacion_aprobada: 'Cotización aprobada',
  cotizacion_rechazada: 'Cotización rechazada',
  esperando_repuesto: 'Esperando repuesto',
  pendiente_pricing: 'Pendiente precio admin',
  reagendamiento_pendiente: 'Reagendamiento pendiente',
  finalizado_sin_reparacion: 'Finalizado sin reparación',
  cancelada_cliente: 'Cancelada por cliente',
  en_proceso: 'En proceso',
  en_verificacion: 'En verificación',
  completada: 'Completada',
  cancelada: 'Cancelada',
  en_disputa: 'En disputa',
}

// Estados terminales — no permiten más transiciones
export const ESTADOS_TERMINALES = new Set([
  'sin_agendar',
  'finalizado_sin_reparacion',
  'cancelada_cliente',
  'cancelada',
  'completada',
  'cotizacion_rechazada',
])

export const NOTIF_ESTILOS: Record<string, string> = {
  enviado: 'bg-blue-100 text-blue-800',
  aceptado: 'bg-green-100 text-green-800',
  invalidado: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-800',
  expirado: 'bg-yellow-100 text-yellow-800',
}

// Etiquetas para el siguiente paso post-diagnóstico
export const SIGUIENTE_PASO_LABELS: Record<string, string> = {
  reparar: 'Proceder con reparación',
  esperar_repuesto: 'Esperar repuesto',
  no_reparable: 'Imposibilidad de arreglo',
  negativa_cliente: 'Negativa del cliente',
}
