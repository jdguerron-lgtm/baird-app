export const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  pendiente_horario: 'bg-yellow-100 text-yellow-800',
  sin_agendar: 'bg-gray-200 text-gray-700',
  notificada: 'bg-blue-100 text-blue-800',
  asignada: 'bg-green-100 text-green-800',
  diagnostico_pendiente: 'bg-indigo-100 text-indigo-800',
  aprobacion_paso_pendiente: 'bg-violet-100 text-violet-800',
  cotizacion_enviada: 'bg-cyan-100 text-cyan-800',
  cotizacion_aprobada: 'bg-teal-100 text-teal-800',
  cotizacion_rechazada: 'bg-rose-100 text-rose-800',
  esperando_repuesto: 'bg-fuchsia-100 text-fuchsia-800',
  repuesto_recibido: 'bg-lime-100 text-lime-800',
  pendiente_pricing: 'bg-orange-100 text-orange-800',
  reagendamiento_pendiente: 'bg-yellow-100 text-yellow-800',
  finalizado_sin_reparacion: 'bg-stone-200 text-stone-700',
  reparacion_rechazada: 'bg-red-100 text-red-700',
  no_show_cliente: 'bg-stone-200 text-stone-700',
  en_proceso: 'bg-purple-100 text-purple-800',
  confirmacion_pendiente: 'bg-amber-100 text-amber-800',
  completada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-red-100 text-red-800',
  en_disputa: 'bg-orange-100 text-orange-800',
  // ── Aliases legacy (renombre 2026-07-09) ──
  // solicitud_eventos es append-only: la historia guarda los nombres viejos.
  // Estos aliases mantienen el render del timeline; NO usar en código nuevo.
  verificacion_pendiente: 'bg-violet-100 text-violet-800',
  en_verificacion: 'bg-amber-100 text-amber-800',
  cancelada_cliente: 'bg-red-100 text-red-700',
}

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_horario: 'Pendiente horario',
  sin_agendar: 'Sin agendar',
  notificada: 'Notificada',
  asignada: 'Asignada',
  diagnostico_pendiente: 'Diagnóstico pendiente',
  aprobacion_paso_pendiente: 'Cliente debe aprobar siguiente paso',
  cotizacion_enviada: 'Cotización enviada',
  cotizacion_aprobada: 'Cotización aprobada',
  cotizacion_rechazada: 'Cotización rechazada',
  esperando_repuesto: 'Esperando repuesto',
  repuesto_recibido: 'Repuesto recibido',
  pendiente_pricing: 'Pendiente tiempo entrega (admin)',
  reagendamiento_pendiente: 'Reagendamiento pendiente',
  finalizado_sin_reparacion: 'Finalizado sin reparación',
  reparacion_rechazada: 'Reparación rechazada por cliente',
  no_show_cliente: 'No-show del cliente',
  en_proceso: 'En proceso',
  confirmacion_pendiente: 'Cliente debe confirmar servicio',
  completada: 'Completada',
  cancelada: 'Cancelada',
  en_disputa: 'En disputa',
  // ── Aliases legacy (renombre 2026-07-09) — solo para historia en solicitud_eventos ──
  verificacion_pendiente: 'Cliente debe aprobar siguiente paso',
  en_verificacion: 'Cliente debe confirmar servicio',
  cancelada_cliente: 'Reparación rechazada por cliente',
}

// Lista canónica de estados válidos de `solicitudes_servicio`.
// DEBE coincidir con el CHECK constraint `solicitudes_servicio_estado_check`
// (ver supabase/migrations/20260709_renombrar_estados_contract.sql). Si añades
// un estado, actualizá la migración, este array y `EstadoSolicitud` en
// src/types/solicitud.ts. Usado por el dropdown de cambio manual de estado en
// el admin y por /api/admin/cambiar-estado para validar el destino.
// Renombre 2026-07-09: verificacion_pendiente → aprobacion_paso_pendiente,
// en_verificacion → confirmacion_pendiente, cancelada_cliente → reparacion_rechazada.
export const ESTADOS_VALIDOS = [
  'pendiente',
  'pendiente_horario',
  'sin_agendar',
  'notificada',
  'asignada',
  'diagnostico_pendiente',
  'aprobacion_paso_pendiente',
  'pendiente_pricing',
  'cotizacion_enviada',
  'cotizacion_aprobada',
  'cotizacion_rechazada',
  'esperando_repuesto',
  'repuesto_recibido',
  'reagendamiento_pendiente',
  'finalizado_sin_reparacion',
  'reparacion_rechazada',
  'no_show_cliente',
  'en_proceso',
  'confirmacion_pendiente',
  'completada',
  'cancelada',
  'en_disputa',
] as const

// Estados terminales — no permiten más transiciones
// Debe coincidir con docs/MAQUINA-DE-ESTADOS.md § "Estados terminales" y con
// el set local en src/app/admin/solicitudes/[id]/page.tsx (que se usa para
// detener el polling de actualización).
export const ESTADOS_TERMINALES = new Set([
  'sin_agendar',
  'finalizado_sin_reparacion',
  'reparacion_rechazada',
  'no_show_cliente',
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
