// Tipos y enums para el sistema de solicitudes de servicio

// Enums para valores predefinidos
export const TIPOS_EQUIPO = [
  'Lavadora',
  'Nevera',
  'Nevecón',
  'Horno',
  'Estufa',
  'Aire Acondicionado',
  'Secadora',
  'Lavavajillas',
] as const

export type TipoEquipo = typeof TIPOS_EQUIPO[number]

export const TIPOS_SOLICITUD = [
  'Diagnóstico',
  'Reparación',
  'Mantenimiento',
  'Instalación',
] as const

export type TipoSolicitud = typeof TIPOS_SOLICITUD[number]

// Tipo completo del formulario del cliente
export interface SolicitudFormData {
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  ciudad_pueblo: string
  zona_servicio: string
  marca_equipo: string
  tipo_equipo: TipoEquipo
  tipo_solicitud: TipoSolicitud
  novedades_equipo: string
  es_garantia: boolean
  numero_serie_factura: string
  // Campos para WhatsApp y coordinación de visita
  pago_tecnico: number          // Monto en COP que recibirá el técnico
  horario_visita_1: string      // Primera franja horaria preferida
  horario_visita_2: string      // Segunda franja horaria preferida
}

// Tipo del registro completo en BD (con ID y metadata del servidor)
export interface SolicitudServicio extends Omit<SolicitudFormData, 'pago_tecnico'> {
  id: string
  created_at: string
  pago_tecnico: number
  estado?: 'pendiente' | 'notificada' | 'asignada' | 'en_proceso' | 'completada' | 'cancelada'
  tecnico_id?: string
  notificados_at?: string
  triaje_resultado?: TriajeResponse | null
}

// Tipo para respuesta de triaje de IA (deshabilitado temporalmente — ver TODO.md)
export interface TriajeResponse {
  posible_falla: string
  nivel_complejidad: 'baja' | 'media' | 'alta'
  requiere_repuestos: boolean
  repuestos_sugeridos: string[]
  tiempo_estimado_horas: number
  costo_estimado_min: number
  costo_estimado_max: number
  recomendaciones: string[]
  urgencia: 'baja' | 'media' | 'alta'
}

// Estado del triaje en el frontend (reservado para reactivación futura)
export interface TriajeState {
  loading: boolean
  data: TriajeResponse | null
  error: string | null
}

// Registro de notificación WhatsApp enviada a un técnico
export interface NotificacionWhatsApp {
  id: string
  solicitud_id: string
  tecnico_id: string
  token: string
  estado: 'enviado' | 'aceptado' | 'expirado' | 'invalidado' | 'error'
  enviado_at: string
  respondido_at?: string
}
