'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { quincenaDe } from '@/lib/utils/facturacion'

/**
 * Liquidaciones descargables (Excel) para el admin:
 *   1. Por técnico — cuánto debe pagarle Baird a cada técnico.
 *   2. MABE — cuánto debe facturarle Baird a MABE por garantías.
 *   3. Particulares — ventas a clientes (base/IVA/recaudo Wompi).
 *   4. Facturación (Siigo) — paquete para contabilidad: renglones de FV por
 *      cliente, FV consolidada a MABE + relación, ledger de pagos Wompi y
 *      checklist de datos faltantes (docs/FACTURACION.md).
 *
 * El corte es por FECHA DE CIERRE del servicio (completado del técnico,
 * con fallback a la confirmación del cliente), día calendario Colombia.
 * Genera /api/admin/liquidaciones — ver ese route para el detalle.
 */

type TipoLiquidacion = 'tecnicos' | 'mabe' | 'particular' | 'facturacion'

interface TecnicoOption {
  id: string
  nombre_completo: string
}

const TIPOS: { tipo: TipoLiquidacion; icono: string; titulo: string; descripcion: string }[] = [
  {
    tipo: 'tecnicos',
    icono: '🔧',
    titulo: 'Liquidación de técnicos',
    descripcion: 'Cuánto debe pagarle Baird a cada técnico por los servicios completados en el período. Hoja resumen por técnico + detalle por servicio (garantía con consolidado real: encuesta, TA y días).',
  },
  {
    tipo: 'mabe',
    icono: '🛡️',
    titulo: 'Liquidación MABE',
    descripcion: 'Cuánto debe facturarle Baird a MABE por las garantías completadas: N° de orden, complejidad, tarifa base, bono (según encuesta y TA reales), recargo de fin de semana y total.',
  },
  {
    tipo: 'particular',
    icono: '💳',
    titulo: 'Liquidación de particulares',
    descripcion: 'Ventas a clientes particulares completadas: total, base gravable e IVA (facturación DIAN), cédula/NIT del cliente, pago al técnico, margen Baird y recaudo online Wompi vs. pendiente.',
  },
  {
    tipo: 'facturacion',
    icono: '🧾',
    titulo: 'Facturación (Siigo)',
    descripcion: 'Paquete para contabilidad: renglones de factura por cliente particular (tercero, ítem, base, IVA, forma de pago), factura consolidada a MABE con relación de órdenes, ledger de TODOS los pagos Wompi del período cruzados con su servicio, y checklist de datos faltantes.',
  },
]

/** YYYY-MM-DD del día de hoy en Colombia. */
function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

export default function LiquidacionesPage() {
  const hoy = hoyColombia()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`) // primer día del mes actual
  const [hasta, setHasta] = useState(hoy)
  const [tecnicoId, setTecnicoId] = useState('')
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([])
  const [descargando, setDescargando] = useState<TipoLiquidacion | null>(null)
  const quincenaActual = quincenaDe(hoy)
  const quincenaAnterior = quincenaDe(hoy, -1)
  const aplicarRango = (r: { desde: string; hasta: string }) => {
    setDesde(r.desde)
    setHasta(r.hasta)
  }
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    // Para el filtro opcional de la liquidación de técnicos.
    const cargarTecnicos = async () => {
      const { data } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo')
        .order('nombre_completo')
      setTecnicos(data ?? [])
    }
    cargarTecnicos()
  }, [])

  const descargar = async (tipo: TipoLiquidacion) => {
    setError(null)
    setOk(null)
    if (!desde || !hasta) {
      setError('Selecciona el rango de fechas.')
      return
    }
    setDescargando(tipo)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Sesión expirada. Inicia sesión de nuevo.')
        setDescargando(null)
        return
      }

      const res = await fetch('/api/admin/liquidaciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tipo,
          desde,
          hasta,
          ...(tipo === 'tecnicos' && tecnicoId ? { tecnico_id: tecnicoId } : {}),
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        let msg = `Error ${res.status}`
        try {
          const j = JSON.parse(text)
          if (j?.error) msg = j.error
        } catch { /* respuesta no es JSON */ }
        setError(msg)
        setDescargando(null)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `liquidacion-${tipo}-${desde}-a-${hasta}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setOk(`Liquidación descargada: ${tipo} · ${desde} a ${hasta}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error descargando la liquidación')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">💰 Liquidaciones</h1>
        <p className="text-sm text-gray-500 mt-1">
          Descarga en Excel las cuentas del período: pago a técnicos (quincenal), facturación a MABE,
          ventas a particulares y el paquete de facturación para contabilidad. Solo incluye servicios{' '}
          <span className="font-semibold">completados</span>, cortados por su fecha de cierre (día
          calendario Colombia); el ledger de pagos Wompi va por fecha de pago.
        </p>
      </div>

      {/* Rango de fechas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Período</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { etiqueta: `Quincena anterior (${quincenaAnterior.desde} → ${quincenaAnterior.hasta})`, rango: quincenaAnterior },
            { etiqueta: `Quincena actual (${quincenaActual.desde} → ${quincenaActual.hasta})`, rango: quincenaActual },
            { etiqueta: 'Mes actual', rango: { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy } },
          ].map((p) => (
            <button
              key={p.etiqueta}
              type="button"
              onClick={() => aplicarRango(p.rango)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-slate-700 hover:bg-gray-100 transition-colors"
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="liq-desde" className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              id="liq-desde"
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label htmlFor="liq-hasta" className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              id="liq-hasta"
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label htmlFor="liq-tecnico" className="block text-xs font-medium text-gray-600 mb-1">
              Técnico (solo liquidación de técnicos)
            </label>
            <select
              id="liq-tecnico"
              value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-52"
            >
              <option value="">Todos los técnicos</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre_completo}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
          ✅ {ok}
        </div>
      )}

      {/* Las cuatro descargas */}
      <div className="space-y-4">
        {TIPOS.map(({ tipo, icono, titulo, descripcion }) => (
          <div key={tipo} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
            <span className="text-3xl">{icono}</span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
              <p className="text-xs text-gray-500 mt-1">{descripcion}</p>
            </div>
            <button
              onClick={() => descargar(tipo)}
              disabled={descargando !== null}
              className="shrink-0 bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {descargando === tipo ? 'Generando…' : '⬇️ Descargar Excel'}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-gray-400">
        El recaudo online solo refleja transacciones Wompi aprobadas; pagos recibidos por fuera
        (transferencia, QR en sitio) no se registran automáticamente. En garantía, el pago
        consolidado al técnico usa la encuesta del cliente (calificación en la confirmación),
        el TA y los días de solución reales — puede diferir de la proyección hecha en el diagnóstico.
      </p>
    </div>
  )
}
