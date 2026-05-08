import Link from 'next/link'

interface Props {
  /** UUID en `solicitudes_servicio.cliente_token`. */
  clienteToken: string | null | undefined
  /** Variante visual: 'banner' (caja completa) o 'inline' (texto simple). */
  variant?: 'banner' | 'inline'
}

/**
 * Link explícito al portal /servicio/{cliente_token} para que el cliente
 * sepa que puede cancelar o reagendar en cualquier momento del flujo.
 *
 * Pensado para incrustar en /horario, /verificar-paso, /cotizacion y
 * cualquier otro webview que el cliente abra. Evita que el cliente quede
 * sin un camino claro para modificar/cancelar el servicio (garantía o
 * particular tienen el mismo portal).
 */
export default function GestionarServicioLink({ clienteToken, variant = 'banner' }: Props) {
  if (!clienteToken) return null

  const href = `/servicio/${clienteToken}`

  if (variant === 'inline') {
    return (
      <p className="text-xs text-gray-500 mt-3 text-center">
        ¿Necesitas <Link href={href} className="text-blue-600 underline font-medium">cancelar o cambiar la fecha</Link>? Puedes hacerlo desde el portal del servicio.
      </p>
    )
  }

  return (
    <div className="mt-4 rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🔧</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900 mb-1">¿Necesitas cancelar o cambiar la fecha?</h3>
          <p className="text-xs text-gray-600 mb-2">
            Aplica para servicios en garantía y servicios particulares. Hasta 4 horas antes del horario podés cancelar sin costo, y reagendar hasta 2 veces.
          </p>
          <Link
            href={href}
            className="inline-block text-sm font-semibold text-blue-600 hover:text-blue-800 underline"
          >
            Ir al portal del servicio →
          </Link>
        </div>
      </div>
    </div>
  )
}
