import Link from 'next/link'

const TIENDA_URL = 'https://tienda.bairdservice.com'

interface Props {
  /**
   * 'banner' — caja completa con icono y descripción (admin / cliente).
   * 'inline' — link compacto de una línea (técnico, formularios).
   * 'compact' — chip pequeño con icono solamente.
   */
  variant?: 'banner' | 'inline' | 'compact'
  /** Texto custom — sobrescribe el default según variant. */
  texto?: string
  /** Color tone — neutral por default. */
  tone?: 'neutral' | 'emerald'
}

/**
 * Link al store oficial de repuestos (tienda.bairdservice.com).
 *
 * Se usa en flows donde el actor necesita conseguir productos:
 * - Técnico en /tecnico/[token]/diagnostico/[id]: para verificar SKUs.
 * - Cliente en /cotizacion/[token]: para comprar recomendados.
 * - Admin en /admin/repuestos: para comprar repuestos requeridos.
 *
 * Es link externo — abre en pestaña nueva con noopener/noreferrer.
 */
export default function TiendaRepuestosLink({
  variant = 'banner',
  texto,
  tone = 'neutral',
}: Props) {
  if (variant === 'compact') {
    return (
      <Link
        href={TIENDA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
      >
        🛒 {texto ?? 'Tienda Baird'}
      </Link>
    )
  }

  if (variant === 'inline') {
    return (
      <p className="text-xs text-gray-600 mt-2">
        💡 ¿Necesitas conseguir el repuesto?{' '}
        <Link
          href={TIENDA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline font-semibold hover:text-emerald-900"
        >
          {texto ?? 'Búscalo en tienda.bairdservice.com'} ↗
        </Link>
      </p>
    )
  }

  const colors = tone === 'emerald'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : 'bg-white border-gray-200'

  return (
    <div className={`rounded-2xl border ${colors} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🛒</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Repuestos originales — Tienda Baird
          </h3>
          <p className="text-xs text-gray-600 mb-2">
            {texto ?? 'Consigue repuestos originales para la reparación en tienda.bairdservice.com. Cobertura nacional, factura electrónica DIAN.'}
          </p>
          <Link
            href={TIENDA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-900 underline"
          >
            Ir a tienda.bairdservice.com →
          </Link>
        </div>
      </div>
    </div>
  )
}
