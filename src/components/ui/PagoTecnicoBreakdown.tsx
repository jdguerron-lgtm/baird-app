'use client'

/**
 * PagoTecnicoBreakdown
 *
 * Card visual para mostrar al técnico cuánto va a recibir por un servicio
 * de garantía MABE. Distingue tres modos:
 *
 *   - rango:        sin diagnóstico aún → muestra min/max.
 *   - proyectado:   con diagnóstico → muestra desglose con supuestos.
 *   - consolidado:  servicio cerrado → desglose final.
 *
 * Nunca expone lo que paga MABE ni el margen Baird — solo el neto al técnico.
 */

import { formatCOP } from '@/lib/utils/format'
import type { PagoTecnicoBreakdown as PagoBreakdown } from '@/lib/utils/pago-tecnico'

interface Props {
  breakdown: PagoBreakdown
  /** Texto opcional del header. Default: "Tu pago estimado". */
  titulo?: string
  /** Si true, muestra la sección de supuestos (default true). */
  mostrarSupuestos?: boolean
  /** Estilo compacto para usar en cards de lista. */
  compacto?: boolean
}

const MODE_LABEL: Record<PagoBreakdown['mode'], string> = {
  rango: 'Rango estimado',
  proyectado: 'Pago proyectado',
  consolidado: 'Pago final',
}

const MODE_BADGE: Record<PagoBreakdown['mode'], string> = {
  rango: 'bg-slate-100 text-slate-700',
  proyectado: 'bg-purple-100 text-purple-800',
  consolidado: 'bg-emerald-100 text-emerald-800',
}

export default function PagoTecnicoBreakdown({
  breakdown,
  titulo,
  mostrarSupuestos = true,
  compacto = false,
}: Props) {
  const isRango = breakdown.mode === 'rango'
  const header = titulo ?? (isRango ? 'Rango estimado para este servicio' : 'Tu pago por este servicio')

  if (compacto) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700">
            {MODE_LABEL[breakdown.mode]}
          </p>
          {isRango ? (
            <p className="text-base font-bold text-slate-900">
              ${formatCOP(breakdown.rangoMin ?? 0)} – ${formatCOP(breakdown.rangoMax ?? 0)}
            </p>
          ) : (
            <p className="text-base font-bold text-slate-900">${formatCOP(breakdown.pagoTotal)}</p>
          )}
        </div>
        <span className="text-xl">💰</span>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 bg-white/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>💰</span>
              {header}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Valor neto que recibes (sin descuentos de retención)
            </p>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${MODE_BADGE[breakdown.mode]}`}>
            {MODE_LABEL[breakdown.mode]}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-2">
        {isRango ? (
          <>
            <div className="flex items-baseline justify-between py-2">
              <span className="text-sm text-slate-600">Mínimo posible</span>
              <span className="text-lg font-bold text-slate-900 tabular-nums">
                ${formatCOP(breakdown.rangoMin ?? 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between py-2 border-t border-emerald-100">
              <span className="text-sm text-slate-600">Máximo posible</span>
              <span className="text-lg font-bold text-emerald-700 tabular-nums">
                ${formatCOP(breakdown.rangoMax ?? 0)}
              </span>
            </div>
          </>
        ) : (
          <>
            <Row label="Mano de obra" amount={breakdown.pagoBase} />
            <Row label="Bono por tiempo" amount={breakdown.pagoBono} muted={breakdown.pagoBono === 0} />
            {breakdown.esFinDeSemana && (
              <Row label="Recargo fin de semana" amount={breakdown.pagoRecargo} />
            )}
            <div className="flex items-baseline justify-between pt-3 mt-2 border-t-2 border-slate-900">
              <span className="text-sm font-bold text-slate-900">Total para ti</span>
              <span className="text-xl font-bold text-emerald-700 tabular-nums">
                ${formatCOP(breakdown.pagoTotal)}
              </span>
            </div>
          </>
        )}
      </div>

      {mostrarSupuestos && breakdown.supuestos.length > 0 && (
        <div className="px-5 py-3 bg-slate-50 border-t border-emerald-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
            Supuestos
          </p>
          <ul className="space-y-1">
            {breakdown.supuestos.map((s, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Row({ label, amount, muted = false }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className={`text-sm ${muted ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-base font-semibold tabular-nums ${muted ? 'text-slate-400' : 'text-slate-900'}`}>
        ${formatCOP(amount)}
      </span>
    </div>
  )
}
