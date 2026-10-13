'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import type { CifrasFlujo, CifrasPeriodo, ResumenFinanciero } from '@/lib/services/finanzas.service'

/**
 * /admin/finanzas — cómo va el negocio: ventas, pago a técnicos (costo
 * directo), utilidad y mix garantía vs particular, por período y por mes.
 * Datos de /api/admin/finanzas (servicios COMPLETADOS, corte por fecha de
 * cierre, TZ Colombia). Solo admin.
 */

/** YYYY-MM-DD de hoy en Colombia. */
function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1).replace('.', ',')}%`
}

function nombreMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

type Atajo = 'mes' | 'mes_pasado' | 'anio' | 'todo'

function rangoAtajo(atajo: Atajo): { desde: string; hasta: string } {
  const hoy = hoyColombia()
  const [y, m] = hoy.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (atajo === 'mes') return { desde: `${y}-${pad(m)}-01`, hasta: hoy }
  if (atajo === 'mes_pasado') {
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate()
    return { desde: `${py}-${pad(pm)}-01`, hasta: `${py}-${pad(pm)}-${pad(ultimo)}` }
  }
  if (atajo === 'anio') return { desde: `${y}-01-01`, hasta: hoy }
  return { desde: '2024-01-01', hasta: hoy }
}

export default function FinanzasPage() {
  const [{ desde, hasta }, setRango] = useState(() => rangoAtajo('anio'))
  const [data, setData] = useState<ResumenFinanciero | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Sesión expirada. Vuelve a iniciar sesión.')
        return
      }
      const res = await fetch(`/api/admin/finanzas?desde=${desde}&hasta=${hasta}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo cargar el resumen')
        return
      }
      setData(json as ResumenFinanciero)
    } catch {
      setError('Error de conexión')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const p = data?.periodo

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finanzas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ventas, pago a técnicos y utilidad sobre servicios <strong>completados</strong>, por fecha de cierre (hora Colombia).
          </p>
        </div>
        <Link href="/admin/liquidaciones" className="text-sm text-slate-600 hover:text-slate-900 underline whitespace-nowrap">
          Ir a liquidaciones (Excel) →
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Desde
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setRango({ desde: e.target.value, hasta })}
            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setRango({ desde, hasta: e.target.value })}
            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {([
            ['mes', 'Este mes'],
            ['mes_pasado', 'Mes pasado'],
            ['anio', 'Este año'],
            ['todo', 'Todo'],
          ] as [Atajo, string][]).map(([atajo, label]) => (
            <button
              key={atajo}
              type="button"
              onClick={() => setRango(rangoAtajo(atajo))}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 text-slate-700 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {cargando && !data ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-900 rounded-full" />
        </div>
      ) : p ? (
        <div className={cargando ? 'opacity-60 transition-opacity' : ''}>
          {/* KPIs del período */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Kpi label="Servicios" valor={String(p.total.servicios)} sub={`${p.garantia.servicios} garantía · ${p.particular.servicios} particular`} />
            <Kpi label="Ventas (sin IVA)" valor={`$${formatCOP(p.total.ventas)}`} sub={`$${formatCOP(p.total.ventasConIva)} con IVA`} />
            <Kpi label="Pago a técnicos" valor={`$${formatCOP(p.total.pagoTecnicos)}`} sub="costo directo" />
            <Kpi label="Utilidad Baird" valor={`$${formatCOP(p.total.utilidad)}`} sub={`margen ${pct(p.total.margen)}`} destacado />
            <Kpi label="Mix de ventas" valor={`${pct(p.mix.ventasGarantia)} / ${pct(p.mix.ventasParticular)}`} sub="garantía / particular" />
          </div>

          {/* Garantía vs particular */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900">Garantía vs. particular</h2>
              <p className="text-xs text-slate-500">
                Del {data!.desde} al {data!.hasta}. Garantía = tarifa MABE (base sin IVA); particular = base gravable de la venta al cliente.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Concepto</th>
                  <th className="text-right px-4 py-2 font-medium">🛡️ Garantía</th>
                  <th className="text-right px-4 py-2 font-medium">💳 Particular</th>
                  <th className="text-right px-5 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <FilaFlujo label="Servicios completados" p={p} f={(c) => String(c.servicios)} />
                <FilaFlujo label="% de servicios" p={p} f={(c) => (p.total.servicios ? pct(c.servicios / p.total.servicios) : '—')} muted />
                <FilaFlujo label="Ventas (sin IVA)" p={p} f={(c) => `$${formatCOP(c.ventas)}`} />
                <FilaFlujo label="Ventas (con IVA)" p={p} f={(c) => `$${formatCOP(c.ventasConIva)}`} muted />
                <FilaFlujo label="% de ventas" p={p} f={(c) => (p.total.ventas ? pct(c.ventas / p.total.ventas) : '—')} muted />
                <FilaFlujo label="Pago a técnicos (costo)" p={p} f={(c) => `$${formatCOP(c.pagoTecnicos)}`} />
                <FilaFlujo label="Utilidad Baird" p={p} f={(c) => `$${formatCOP(c.utilidad)}`} bold />
                <FilaFlujo label="Margen sobre ventas" p={p} f={(c) => (c.ventas ? pct(c.margen) : '—')} bold />
                <FilaFlujo label="% de la utilidad" p={p} f={(c) => (p.total.utilidad ? pct(c.utilidad / p.total.utilidad) : '—')} muted />
                <FilaFlujo label="Ticket promedio (sin IVA)" p={p} f={(c) => (c.servicios ? `$${formatCOP(Math.round(c.ventas / c.servicios))}` : '—')} muted />
                <tr>
                  <td className="px-5 py-2 text-slate-600">Recaudo online Wompi</td>
                  <td className="px-4 py-2 text-right text-slate-400">—</td>
                  <td className="px-4 py-2 text-right text-slate-700">${formatCOP(p.particular.recaudadoOnline)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">${formatCOP(p.particular.recaudadoOnline)}</td>
                </tr>
              </tbody>
            </table>
            {p.total.estimados > 0 && (
              <p className="px-5 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
                ⚠️ {p.total.estimados} garantía(s) sin complejidad en el diagnóstico: su venta se estimó a partir del pago proyectado al técnico (pago ÷ 0,78).
              </p>
            )}
          </div>

          {/* Por mes */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900">Evolución mensual</h2>
              <p className="text-xs text-slate-500">Mes de cierre del servicio. Ventas y utilidad sin IVA.</p>
            </div>
            {data!.meses.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">No hay servicios completados en este rango.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium">Mes</th>
                      <th className="text-right px-3 py-2 font-medium">Serv.</th>
                      <th className="text-right px-3 py-2 font-medium">Gar. / Part.</th>
                      <th className="text-right px-3 py-2 font-medium">Ventas garantía</th>
                      <th className="text-right px-3 py-2 font-medium">Ventas particular</th>
                      <th className="text-right px-3 py-2 font-medium">Ventas total</th>
                      <th className="text-right px-3 py-2 font-medium">Pago técnicos</th>
                      <th className="text-right px-3 py-2 font-medium">Utilidad</th>
                      <th className="text-right px-3 py-2 font-medium">Margen</th>
                      <th className="text-right px-5 py-2 font-medium">% ventas gar.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data!.meses.map((m) => (
                      <tr key={m.mes} className="hover:bg-slate-50">
                        <td className="px-5 py-2 font-medium text-slate-900 capitalize">{nombreMes(m.mes)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{m.total.servicios}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{m.garantia.servicios} / {m.particular.servicios}</td>
                        <td className="px-3 py-2 text-right text-slate-700">${formatCOP(m.garantia.ventas)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">${formatCOP(m.particular.ventas)}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">${formatCOP(m.total.ventas)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">${formatCOP(m.total.pagoTecnicos)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">${formatCOP(m.total.utilidad)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{pct(m.total.margen)}</td>
                        <td className="px-5 py-2 text-right text-slate-500">{pct(m.mix.ventasGarantia)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-900">
                    <tr>
                      <td className="px-5 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{p.total.servicios}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{p.garantia.servicios} / {p.particular.servicios}</td>
                      <td className="px-3 py-2 text-right">${formatCOP(p.garantia.ventas)}</td>
                      <td className="px-3 py-2 text-right">${formatCOP(p.particular.ventas)}</td>
                      <td className="px-3 py-2 text-right">${formatCOP(p.total.ventas)}</td>
                      <td className="px-3 py-2 text-right">${formatCOP(p.total.pagoTecnicos)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">${formatCOP(p.total.utilidad)}</td>
                      <td className="px-3 py-2 text-right">{pct(p.total.margen)}</td>
                      <td className="px-5 py-2 text-right text-slate-500">{pct(p.mix.ventasGarantia)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-4">
            &quot;Pago a técnicos&quot; es el único costo que registra la plataforma. Gastos de operación (Meta, Vercel, Wompi, nómina, repuestos comprados) viven en contabilidad (Siigo) y no están descontados acá.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Kpi({ label, valor, sub, destacado }: { label: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${destacado ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${destacado ? 'text-emerald-800' : 'text-slate-900'}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function FilaFlujo({ label, p, f, bold, muted }: { label: string; p: CifrasPeriodo; f: (c: CifrasFlujo) => string; bold?: boolean; muted?: boolean }) {
  const cls = bold ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'
  return (
    <tr>
      <td className={`px-5 py-2 ${muted ? 'text-slate-500' : 'text-slate-600'}`}>{label}</td>
      <td className={`px-4 py-2 text-right ${cls}`}>{f(p.garantia)}</td>
      <td className={`px-4 py-2 text-right ${cls}`}>{f(p.particular)}</td>
      <td className={`px-5 py-2 text-right ${cls}`}>{f(p.total)}</td>
    </tr>
  )
}
