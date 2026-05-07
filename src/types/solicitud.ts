// Tipos y enums para el sistema de solicitudes de servicio

// Enums para valores predefinidos
export const TIPOS_EQUIPO = [
  'Lavadora',
  'Secadora',
  'Lavadora Secadora',  // equipo combo (2-en-1)
  'Nevera',
  'Nevecón',
  'Horno',
  'Estufa',
  'Aire Acondicionado',
  'Lavavajillas',
] as const

export type TipoEquipo = typeof TIPOS_EQUIPO[number]

export const TIPOS_SOLICITUD = [
  'Diagnóstico',
  'Reparación',
  'Mantenimiento',
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
  pago_tecnico: number          // Valor del servicio en COP (pago a Baird Service)
  horario_visita_1: string      // Primera franja horaria preferida
  horario_visita_2: string      // Segunda franja horaria preferida
}

// Tipo del registro completo en BD (con ID y metadata del servidor)
// Estados del flujo de solicitud (customer-first scheduling)
// Warranty:     pendiente_horario → notificada → asignada → en_proceso | esperando_repuesto → en_proceso → en_verificacion → completada | en_disputa
//                                                          | finalizado_sin_reparacion | cancelada_cliente
//                                 → sin_agendar (timeout)
// Non-warranty: pendiente_horario → notificada → diagnostico_pendiente → cotizacion_enviada → cotizacion_aprobada → en_proceso → en_verificacion → completada
//                                                                                            → cotizacion_rechazada
export type EstadoSolicitud =
  | 'pendiente'                    // legacy — kept for back-compat with existing rows
  | 'pendiente_horario'            // NEW: cliente debe elegir horario antes de notificar técnicos
  | 'sin_agendar'                  // NEW: cliente no confirmó horario tras 24h+12h recordatorio (terminal)
  | 'notificada'
  | 'asignada'
  | 'diagnostico_pendiente'        // Non-warranty: tech assigned, diagnostic pending
  | 'verificacion_pendiente'       // NEW: post-diagnóstico (garantía), cliente debe aprobar el siguiente paso propuesto
  | 'cotizacion_enviada'           // Non-warranty: quote sent to customer
  | 'cotizacion_aprobada'          // Non-warranty: customer approved quote
  | 'cotizacion_rechazada'         // Non-warranty: customer rejected quote
  | 'esperando_repuesto'           // NEW: post-diagnóstico, repuesto pendiente
  | 'reagendamiento_pendiente'     // NEW: cliente pidió reagendar después de aceptación; espera nuevo horario
  | 'finalizado_sin_reparacion'    // NEW: equipo no reparable (terminal)
  | 'cancelada_cliente'            // NEW: cliente rechazó proceder con reparación (terminal)
  | 'en_proceso'
  | 'en_verificacion'
  | 'completada'
  | 'cancelada'
  | 'en_disputa'

// Acción siguiente al diagnóstico — el técnico elige una de 4 opciones
export type SiguientePasoDiagnostico =
  | 'reparar'             // proceder con la reparación (estado: en_proceso)
  | 'esperar_repuesto'    // requiere repuesto (estado: esperando_repuesto)
  | 'no_reparable'        // imposibilidad de arreglo (estado: finalizado_sin_reparacion)
  | 'negativa_cliente'    // cliente rechazó reparación (estado: cancelada_cliente)

// Detalle del repuesto requerido — siempre con SKU
export interface RepuestoRequerido {
  sku: string
  descripcion: string
  costo?: number          // 0 en garantía (lo cubre el fabricante)
  tiempo_estimado: string // ej: "3-5 días hábiles"
}

// Versión vigente de los Términos y Condiciones
export const TYC_VERSION = '2026.04.27'

// ──────────────────────────────────────────────────────────
// Self-service (cliente cancela / reagenda desde WhatsApp)
// ──────────────────────────────────────────────────────────
// Tiempo mínimo antes del horario en que la cancelación es "a tiempo".
// Por debajo del cutoff la solicitud se cancela igual, pero queda marcada
// como tardía para liquidación al técnico (visita-en-falso garantía) o
// no-reembolso del anticipo (particular).
export const CANCELACION_CUTOFF_HORAS = 4

// Máximo de reagendamientos que el cliente puede hacer por sí mismo.
// Pasado este número, el flujo cae a admin manual.
export const MAX_REAGENDAMIENTOS_CLIENTE = 2

/** Estados desde los cuales el cliente puede cancelar por sí mismo */
export const ESTADOS_CANCELABLES_POR_CLIENTE: ReadonlySet<string> = new Set([
  'pendiente',
  'pendiente_horario',
  'notificada',
  'asignada',
  'diagnostico_pendiente',
  'verificacion_pendiente',
  'cotizacion_enviada',
  'esperando_repuesto',
  'reagendamiento_pendiente',
])

/** Estados desde los cuales el cliente puede reagendar por sí mismo */
export const ESTADOS_REAGENDABLES_POR_CLIENTE: ReadonlySet<string> = new Set([
  'pendiente_horario',
  'notificada',
  'asignada',
  'diagnostico_pendiente',
  'reagendamiento_pendiente',
])

// Timeouts del flujo de horario — extendidos para no romper enlaces durante la jornada del cliente
export const HORARIO_TIMEOUT_HORAS = 24       // recordatorio tras 24h
export const HORARIO_FINAL_TIMEOUT_HORAS = 36 // sin_agendar tras 24h + 12h adicionales
// Tokens de aceptación de técnicos: ahora 3h (era 30 min) — coordinar con TOKEN_EXPIRATION_MS en whatsapp.service.ts

// Cotización de reparación (non-warranty)
export interface CotizacionReparacion {
  diagnostico_tecnico: string
  mano_obra: number
  repuestos: number
  repuestos_detalle?: string
  total: number
  evidencias_diagnostico?: string[]
  cotizado_at: string
  aprobado_at?: string
  rechazado_at?: string
  token: string                // Token for customer approval page
}

// ──────────────────────────────────────────────────────────
// IVA — Estatuto Tributario, art. 420
// Los servicios de mantenimiento y reparación de
// electrodomésticos están gravados con IVA al 19%
// (regla general; no están en la lista de excluidos).
// Baird Service SAS, como sociedad, siempre es responsable
// de IVA, sin importar el tope de UVT.
//
// Convención del catálogo: TODAS las tarifas listadas en
// TARIFAS_MANTENIMIENTO y TARIFA_DIAGNOSTICO son precios
// AL CONSUMIDOR (IVA incluido). El desglose base + IVA se
// calcula con calcularBaseSinIva() para la facturación
// electrónica DIAN.
// ──────────────────────────────────────────────────────────
export const IVA_TARIFA = 0.19           // 19% — tarifa general Colombia

/** Devuelve la base gravable a partir de un precio con IVA incluido. */
export function calcularBaseSinIva(precioConIva: number): number {
  return Math.round(precioConIva / (1 + IVA_TARIFA))
}

/** Devuelve el IVA contenido en un precio con IVA incluido. */
export function calcularIvaIncluido(precioConIva: number): number {
  return precioConIva - calcularBaseSinIva(precioConIva)
}

// Tarifa de diagnóstico para servicios particulares (non-warranty)
// Precio AL CONSUMIDOR (IVA 19% incluido). Ajuste +5% (2026-05).
export const TARIFA_DIAGNOSTICO = 84000  // COP — diagnostic fee, IVA incluido (base $70.588 + IVA $13.412)
export const ANTICIPO_PORCENTAJE = 0.5   // 50% upfront

// ──────────────────────────────────────────────────────────
// Tarifas fijas del catálogo (non-warranty). Investigadas
// contra precios de talleres en Colombia (2025-2026).
// El cliente NO ingresa el precio; se calcula a partir de
// tipo_equipo × tipo_solicitud. Garantía siempre = 0 (la
// marca paga al técnico vía tariff_codigo_complejidad).
//
// IMPORTANTE: estos valores son precios AL CONSUMIDOR con
// IVA 19% incluido. Para facturación electrónica usar
// calcularBaseSinIva() y calcularIvaIncluido().
// ──────────────────────────────────────────────────────────
// Ajuste de tarifas +5% aplicado el 2026-05.
export const TARIFAS_MANTENIMIENTO: Record<TipoEquipo, number> = {
  'Lavadora':           126000,  // IVA incluido (base $105.882 + IVA $20.118)
  'Secadora':           136500,  // IVA incluido (base $114.706 + IVA $21.794)
  'Lavadora Secadora':  189000,  // IVA incluido (base $158.824 + IVA $30.176) — combo 2-en-1
  'Nevera':             147000,  // IVA incluido (base $123.529 + IVA $23.471)
  'Nevecón':            168000,  // IVA incluido (base $141.176 + IVA $26.824)
  'Estufa':             105000,  // IVA incluido (base $88.235  + IVA $16.765)
  'Horno':              115500,  // IVA incluido (base $97.059  + IVA $18.441)
  'Aire Acondicionado': 136500,  // IVA incluido (base $114.706 + IVA $21.794)
  'Lavavajillas':       147000,  // IVA incluido (base $123.529 + IVA $23.471)
}

/**
 * Calcula el valor del servicio que el cliente paga a Baird Service.
 *
 * - Garantía → 0 (la marca paga vía tarifa por código de complejidad)
 * - Diagnóstico → TARIFA_DIAGNOSTICO ($80.000)
 * - Reparación → TARIFA_DIAGNOSTICO ($80.000) — el técnico cotizará
 *   la reparación tras el diagnóstico (flujo cotización ya existente)
 * - Mantenimiento → tarifa fija por tipo_equipo (TARIFAS_MANTENIMIENTO)
 */
export function calcularPagoTecnico(
  tipoEquipo: TipoEquipo,
  tipoSolicitud: TipoSolicitud,
  esGarantia: boolean,
): number {
  if (esGarantia) return 0
  if (tipoSolicitud === 'Diagnóstico') return TARIFA_DIAGNOSTICO
  if (tipoSolicitud === 'Reparación') return TARIFA_DIAGNOSTICO
  if (tipoSolicitud === 'Mantenimiento') return TARIFAS_MANTENIMIENTO[tipoEquipo]
  return TARIFA_DIAGNOSTICO
}

export interface SolicitudServicio extends Omit<SolicitudFormData, 'pago_tecnico'> {
  id: string
  created_at: string
  pago_tecnico: number
  estado?: EstadoSolicitud
  tecnico_asignado_id?: string
  notificados_at?: string
  triaje_resultado?: TriajeResponse | null
  cotizacion?: CotizacionReparacion | null  // Non-warranty: quote data
  // Customer-first scheduling
  horario_token?: string
  horario_confirmado?: string
  horario_confirmado_at?: string
  horario_recordatorio_at?: string
  // Post-diagnosis branching
  siguiente_paso?: SiguientePasoDiagnostico
  siguiente_paso_detalle?: string
  siguiente_paso_at?: string
  // T&C acceptance
  tyc_aceptados_at?: string
  tyc_version?: string
  // Verificación del siguiente paso (post-diagnóstico)
  verificacion_paso_token?: string
  verificacion_paso_decision?: 'aprobado' | 'rechazado'
  verificacion_paso_at?: string
  verificacion_paso_comentario?: string
  // Self-service (cliente cancela / reagenda)
  cliente_token?: string
  cancelado_at?: string
  cancelado_por?: 'cliente' | 'tecnico' | 'admin' | 'sistema'
  motivo_cancelacion?: string
  cancelado_tarde?: boolean
  reagendamientos_count?: number
  ultimo_reagendado_at?: string
}

// Evento append-only en la tabla solicitud_eventos.
export interface SolicitudEvento {
  id: number
  solicitud_id: string
  tipo:
    | 'cancelacion'
    | 'reagendamiento'
    | 'reagendamiento_confirmado'
    | 'cancelacion_revertida'
    | 'cambio_estado_admin'
    | 'nota_admin'
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  motivo: string | null
  payload: Record<string, unknown>
  ocurrido_at: string
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

// Checklist de completación del servicio
export interface ChecklistServicio {
  diagnostico_realizado: boolean
  pieza_reemplazada: boolean
  pieza_detalle?: string
  prueba_encendido: boolean
  prueba_ciclo_completo: boolean
  limpieza_area: boolean
  explicacion_cliente: boolean
  notas_tecnico?: string
}

// Evidencia de servicio completado
export interface EvidenciaServicio {
  id: string
  solicitud_id: string
  tecnico_id: string
  fotos: string[]                   // URLs en Supabase Storage
  checklist: ChecklistServicio
  firma_url: string | null          // Firma digital del cliente
  gps_lat: number | null
  gps_lng: number | null
  completado_at: string
  confirmacion_token: string        // Token para que el cliente confirme
  confirmado_at?: string
  confirmado?: boolean
  cliente_comentario?: string
  // Oath del técnico antes del diagnóstico
  oath_firma?: string               // base64 PNG firma del técnico
  oath_firmado_at?: string
  // GPS tracking en cada fase
  gps_diagnostico_lat?: number
  gps_diagnostico_lng?: number
  gps_completado_lat?: number
  gps_completado_lng?: number
  gps_post_visita_lat?: number
  gps_post_visita_lng?: number
  gps_post_visita_at?: string
  gps_flagged?: boolean             // true si el técnico sigue en sitio del cliente 30min después
}

// Repuesto pendiente — un registro por SKU requerido
export interface RepuestoPendiente {
  id: string
  solicitud_id: string
  sku: string
  descripcion: string
  costo: number                     // 0 en garantía
  estado: 'pendiente' | 'recibido' | 'cancelado'
  solicitado_at: string
  recibido_at?: string
}

// Ping GPS individual — registro de ubicación en una fase
export interface GpsPing {
  id: string
  solicitud_id: string
  tecnico_id: string
  lat: number
  lng: number
  fase: 'llegada' | 'diagnostico' | 'completado' | 'post_visita'
  capturado_at: string
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
