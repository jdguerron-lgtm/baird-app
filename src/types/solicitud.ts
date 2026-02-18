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

// Tipo completo del formulario
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
}

// Tipo de la solicitud guardada en BD (con ID y metadata)
export interface SolicitudServicio extends SolicitudFormData {
  id: string
  created_at: string
  estado?: 'pendiente' | 'asignada' | 'en_proceso' | 'completada' | 'cancelada'
  tecnico_id?: string
}

// Tipo para respuesta de triaje de IA
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

// Estado del triaje en el frontend
export interface TriajeState {
  loading: boolean
  data: TriajeResponse | null
  error: string | null
}
