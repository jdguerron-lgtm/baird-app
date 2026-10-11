import {
  etapaPagoCliente,
  pasosPagoCliente,
  ETAPA_PAGO_ESTILOS,
  ETAPA_PAGO_HINT,
  ETAPA_PAGO_LABELS,
  type SolicitudParaEtapaPago,
} from '@/lib/constants/pago-cliente'
import { formatCOP } from '@/lib/utils/format'

/**
 * Badge de la ETAPA de pago del cliente (2026-10-11): en qué cobro va —
 * anticipo / abono de repuestos / saldo — y cuánto falta. Capa paralela, no
 * es un estado del flujo. Solo particulares; en garantía no renderiza nada.
 *
 * `mostrarMontos={false}` en el portal del técnico: él no debe ver el precio
 * al cliente (margen Baird), solo la etapa.
 */
export default function BadgePagoCliente({
  solicitud,
  size = 'sm',
  mostrarMontos = true,
}: {
  solicitud: SolicitudParaEtapaPago
  size?: 'sm' | 'md'
  mostrarMontos?: boolean
}) {
  const resumen = etapaPagoCliente(solicitud)
  if (!resumen) return null

  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
  const monto = mostrarMontos && resumen.porCobrar > 0 ? ` · $${formatCOP(resumen.porCobrar)}` : ''
  const hint = mostrarMontos && resumen.total > 0
    ? `${ETAPA_PAGO_HINT[resumen.etapa]} Pagado $${formatCOP(resumen.pagado)} de $${formatCOP(resumen.total)}.`
    : ETAPA_PAGO_HINT[resumen.etapa]

  return (
    <span
      title={hint}
      className={`inline-block font-semibold rounded-full whitespace-nowrap ${padding} ${ETAPA_PAGO_ESTILOS[resumen.etapa]}`}
    >
      {ETAPA_PAGO_LABELS[resumen.etapa]}{monto}
    </span>
  )
}

/**
 * Stepper de cobros "Anticipo → (Abono) → Saldo" con fecha de cada pago y
 * barra de avance pagado/total. Para la ficha admin y la del supervisor.
 */
export function ProgresoPagoCliente({ solicitud }: { solicitud: SolicitudParaEtapaPago }) {
  const resumen = etapaPagoCliente(solicitud)
  if (!resumen) return null
  const pasos = pasosPagoCliente(solicitud)
  const NOMBRE = { anticipo: 'Anticipo', abono: 'Abono repuestos', saldo: 'Saldo' } as const
  const pct = resumen.total > 0 ? Math.min(100, Math.round((resumen.pagado / resumen.total) * 100)) : 0
  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <BadgePagoCliente solicitud={solicitud} size="md" />
        {resumen.total > 0 && (
          <span className="text-xs text-gray-600">
            Pagado <strong>${formatCOP(resumen.pagado)}</strong> de ${formatCOP(resumen.total)}
          </span>
        )}
      </div>
      {resumen.total > 0 && (
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden" aria-hidden>
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ol className="flex items-stretch gap-1.5 text-[11px]">
        {pasos.map((p, i) => (
          <li
            key={p.paso}
            className={`flex-1 rounded-lg border px-2 py-1.5 ${
              p.estado === 'pagado'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : p.estado === 'pendiente'
                  ? 'bg-amber-50 border-amber-300 text-amber-800 ring-1 ring-amber-300'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}
          >
            <p className="font-semibold">
              {p.estado === 'pagado' ? '✅' : p.estado === 'pendiente' ? '⏳' : `${i + 1}.`} {NOMBRE[p.paso]}
            </p>
            <p className="mt-0.5">
              {p.estado === 'pagado'
                ? (fecha(p.fecha) ?? 'Pagado')
                : p.estado === 'pendiente'
                  ? `Link enviado${resumen.porCobrar > 0 ? ` · $${formatCOP(resumen.porCobrar)}` : ''}`
                  : 'Aún no'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
