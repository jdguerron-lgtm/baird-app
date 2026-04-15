export const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  notificada: 'bg-blue-100 text-blue-800',
  asignada: 'bg-green-100 text-green-800',
  diagnostico_pendiente: 'bg-indigo-100 text-indigo-800',
  cotizacion_enviada: 'bg-cyan-100 text-cyan-800',
  cotizacion_aprobada: 'bg-teal-100 text-teal-800',
  cotizacion_rechazada: 'bg-rose-100 text-rose-800',
  en_proceso: 'bg-purple-100 text-purple-800',
  en_verificacion: 'bg-amber-100 text-amber-800',
  completada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-red-100 text-red-800',
  en_disputa: 'bg-orange-100 text-orange-800',
}

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  notificada: 'Notificada',
  asignada: 'Asignada',
  diagnostico_pendiente: 'Diagnóstico pendiente',
  cotizacion_enviada: 'Cotización enviada',
  cotizacion_aprobada: 'Cotización aprobada',
  cotizacion_rechazada: 'Cotización rechazada',
  en_proceso: 'En proceso',
  en_verificacion: 'En verificación',
  completada: 'Completada',
  cancelada: 'Cancelada',
  en_disputa: 'En disputa',
}

export const NOTIF_ESTILOS: Record<string, string> = {
  enviado: 'bg-blue-100 text-blue-800',
  aceptado: 'bg-green-100 text-green-800',
  invalidado: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-800',
  expirado: 'bg-yellow-100 text-yellow-800',
}
