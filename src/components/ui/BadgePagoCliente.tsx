import {
  estadoPagoCliente,
  PAGO_CLIENTE_ESTILOS,
  PAGO_CLIENTE_HINT,
  PAGO_CLIENTE_LABELS,
} from '@/lib/constants/pago-cliente'

/**
 * Badge del estado de PAGO del cliente (capa paralela — no es un estado del
 * flujo). Se pinta solo en servicios particulares; en garantía no renderiza
 * nada. Compartido por admin, portal del técnico y portal del supervisor para
 * que los tres lean lo mismo.
 */
export default function BadgePagoCliente({
  solicitud,
  size = 'sm',
}: {
  solicitud: {
    es_garantia: boolean | null
    anticipo_pagado_at?: string | null
    saldo_pagado_at?: string | null
    estado?: string | null
  }
  size?: 'sm' | 'md'
}) {
  const pago = estadoPagoCliente(solicitud)
  if (!pago) return null

  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
  return (
    <span
      title={PAGO_CLIENTE_HINT[pago]}
      className={`inline-block font-semibold rounded-full whitespace-nowrap ${padding} ${PAGO_CLIENTE_ESTILOS[pago]}`}
    >
      {PAGO_CLIENTE_LABELS[pago]}
    </span>
  )
}
