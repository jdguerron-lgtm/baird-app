/**
 * Estado de PAGO del cliente — capa PARALELA a la máquina de estados.
 *
 * No es un estado del flujo (`solicitudes_servicio.estado` no cambia): se
 * deriva de las columnas denormalizadas que marca `registrarPagoWompi()`
 * (pagos.service.ts) al aprobar una transacción online:
 *   - `anticipo_pagado_at` → el cliente pagó el 50% de reserva (cubre la
 *     visita de diagnóstico).
 *   - `saldo_pagado_at`    → el cliente pagó el resto tras aprobar la
 *     cotización — servicio totalmente pagado en línea.
 *
 * Solo aplica a servicios PARTICULARES (`es_garantia = false`): en garantía
 * paga la marca y la capa entera es null.
 *
 * OJO: refleja únicamente el recaudo ONLINE (Wompi). Un pago en sitio con el
 * QR Bre-B no se registra automáticamente — por eso "pendiente" se lee como
 * "sin pago online registrado", no como deuda confirmada.
 */

export type EstadoPagoCliente = 'pagado' | 'anticipo_pagado' | 'pendiente'

/** Estados donde nunca hubo visita: sin pago no hay nada que cobrar ni mostrar. */
const ESTADOS_SIN_COBRO = ['cancelada', 'sin_agendar']

/**
 * Deriva el estado de pago de una solicitud. `null` = no aplica badge
 * (garantía, o servicio muerto sin ningún pago registrado).
 */
export function estadoPagoCliente(sol: {
  es_garantia: boolean | null
  anticipo_pagado_at?: string | null
  saldo_pagado_at?: string | null
  estado?: string | null
}): EstadoPagoCliente | null {
  if (sol.es_garantia) return null
  if (sol.saldo_pagado_at) return 'pagado'
  if (sol.anticipo_pagado_at) return 'anticipo_pagado'
  if (sol.estado && ESTADOS_SIN_COBRO.includes(sol.estado)) return null
  return 'pendiente'
}

export const PAGO_CLIENTE_LABELS: Record<EstadoPagoCliente, string> = {
  pagado: '✅ Pagado',
  anticipo_pagado: '💰 Anticipo pagado',
  pendiente: 'Pago pendiente',
}

export const PAGO_CLIENTE_ESTILOS: Record<EstadoPagoCliente, string> = {
  pagado: 'bg-emerald-100 text-emerald-800',
  anticipo_pagado: 'bg-blue-100 text-blue-800',
  pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
}

export const PAGO_CLIENTE_HINT: Record<EstadoPagoCliente, string> = {
  pagado: 'El cliente pagó anticipo y saldo en línea (Wompi). No cobrar nada en sitio.',
  anticipo_pagado: 'El cliente pagó el 50% de reserva en línea (cubre la visita de diagnóstico). El saldo queda pendiente.',
  pendiente: 'Sin pago online registrado (Wompi). Un pago en sitio con QR no aparece aquí.',
}
