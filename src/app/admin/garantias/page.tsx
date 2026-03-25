'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'

interface GarantiaSolicitud {
  id: string
  cliente_nombre: string
  marca_equipo: string
  tipo_equipo: string
  ciudad_pueblo: string
  zona_servicio: string
  estado: string
  pago_tecnico: number
  numero_serie_factura: string | null
  novedades_equipo: string
  created_at: string
  tecnico_asignado_id: string | null
}

interface BrandSummary {
  marca: string
  total: number
  pendiente: number
  notificada: number
  asignada: number
  completada: number
  cancelada: number
}

interface EquipoSummary {
  tipo: string
  total: number
}

interface EstadoSummary {
  estado: string
  count: number
}

export default function GarantiasPage() {
  const [solicitudes, setSolicitudes] = useState<GarantiaSolicitud[]>([])
  const [brandSummary, setBrandSummary] = useState<BrandSummary[]>([])
  const [equipoSummary, setEquipoSummary] = useState<EquipoSummary[]>([])
  const [estadoSummary, setEstadoSummary] = useState<EstadoSummary[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroMarca, setFiltroMarca] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)

      const { data, error } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, marca_equipo, tipo_equipo, ciudad_pueblo, zona_servicio, estado, pago_tecnico, numero_serie_factura, novedades_equipo, created_at, tecnico_asignado_id')
        .eq('es_garantia', true)
        .order('created_at', { ascending: false })

      if (error || !data) {
        console.error('Error loading warranty data:', error)
        setCargando(false)
        return
      }

      const sols = data.map(s => ({
        ...s,
        estado: s.estado ?? 'pendiente',
        pago_tecnico: s.pago_tecnico ?? 0,
      })) as GarantiaSolicitud[]

      setSolicitudes(sols)

      // Compute brand summary
      const brandMap = new Map<string, BrandSummary>()
      for (const s of sols) {
        const marca = (s.marca_equipo || 'Sin marca').toUpperCase()
        if (!brandMap.has(marca)) {
          brandMap.set(marca, { marca, total: 0, pendiente: 0, notificada: 0, asignada: 0, completada: 0, cancelada: 0 })
        }
        const entry = brandMap.get(marca)!
        entry.total++
        const estado = s.estado
        if (estado === 'pendiente') entry.pendiente++
        else if (estado === 'notificada') entry.notificada++
        else if (estado === 'asignada') entry.asignada++
        else if (estado === 'completada') entry.completada++
        else if (estado === 'cancelada') entry.cancelada++
      }
      setBrandSummary(
        Array.from(brandMap.values()).sort((a, b) => b.total - a.total)
      )

      // Compute equipment type summary
      const equipoMap = new Map<string, number>()
      for (const s of sols) {
        const tipo = s.tipo_equipo || 'Otro'
        equipoMap.set(tipo, (equipoMap.get(tipo) ?? 0) + 1)
      }
      setEquipoSummary(
        Array.from(equipoMap.entries())
          .map(([tipo, total]) => ({ tipo, total }))
          .sort((a, b) => b.total - a.total)
      )

      // Compute estado summary
      const estadoMap = new Map<string, number>()
      for (const s of sols) {
        estadoMap.set(s.estado, (estadoMap.get(s.estado) ?? 0) + 1)
      }
      setEstadoSummary(
        Array.from(estadoMap.entries())
          .map(([estado, count]) => ({ estado, count }))
          .sort((a, b) => b.count - a.count)
      )

      setCargando(false)
    }

    cargar()
  }, [])

  // Filter solicitudes
  const filtradas = solicitudes.filter(s => {
    if (filtroMarca !== 'todas' && s.marca_equipo?.toUpperCase() !== filtroMarca) return false
    if (filtroEstado !== 'todos' && s.estado !== filtroEstado) return false
    return true
  })

  const marcas = [...new Set(solicitudes.map(s => (s.marca_equipo || 'Sin marca').toUpperCase()))]

  if (cargando) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Garantías</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Garantías</h1>
        <p className="text-sm text-gray-500 mt-1">
          {solicitudes.length} servicio{solicitudes.length !== 1 ? 's' : ''} de garantía
        </p>
      </div>

      {/* Stats by estado */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-700">{solicitudes.length}</p>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total</p>
        </div>
        {estadoSummary.map(({ estado, count }) => {
          const colors: Record<string, string> = {
            pendiente: 'bg-yellow-50 border-yellow-200 text-yellow-700',
            notificada: 'bg-sky-50 border-sky-200 text-sky-700',
            asignada: 'bg-green-50 border-green-200 text-green-700',
            completada: 'bg-emerald-50 border-emerald-200 text-emerald-700',
            cancelada: 'bg-red-50 border-red-200 text-red-700',
          }
          const colorClass = colors[estado] ?? 'bg-gray-50 border-gray-200 text-gray-700'
          return (
            <div key={estado} className={`border rounded-xl p-4 ${colorClass}`}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs font-semibold uppercase tracking-wide capitalize">{estado}</p>
            </div>
          )
        })}
      </div>

      {/* Summary by brand */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-slate-900 text-sm">Resumen por Marca</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Marca</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Total</th>
                <th className="text-center text-xs font-semibold text-yellow-600 uppercase tracking-wide px-3 py-3">Pend.</th>
                <th className="text-center text-xs font-semibold text-sky-600 uppercase tracking-wide px-3 py-3">Notif.</th>
                <th className="text-center text-xs font-semibold text-green-600 uppercase tracking-wide px-3 py-3">Asig.</th>
                <th className="text-center text-xs font-semibold text-emerald-600 uppercase tracking-wide px-3 py-3">Compl.</th>
                <th className="text-center text-xs font-semibold text-red-600 uppercase tracking-wide px-3 py-3">Canc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brandSummary.map(b => (
                <tr
                  key={b.marca}
                  className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => setFiltroMarca(filtroMarca === b.marca ? 'todas' : b.marca)}
                >
                  <td className="px-5 py-3">
                    <span className={`text-sm font-semibold ${filtroMarca === b.marca ? 'text-blue-700' : 'text-slate-900'}`}>
                      {b.marca}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-bold text-slate-700">{b.total}</td>
                  <td className="px-3 py-3 text-center text-sm text-yellow-700">{b.pendiente || '—'}</td>
                  <td className="px-3 py-3 text-center text-sm text-sky-700">{b.notificada || '—'}</td>
                  <td className="px-3 py-3 text-center text-sm text-green-700">{b.asignada || '—'}</td>
                  <td className="px-3 py-3 text-center text-sm text-emerald-700">{b.completada || '—'}</td>
                  <td className="px-3 py-3 text-center text-sm text-red-700">{b.cancelada || '—'}</td>
                </tr>
              ))}
              {brandSummary.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">
                    No hay solicitudes de garantía registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary by equipment type */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-slate-900 text-sm">Resumen por Tipo de Equipo</h2>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-3">
          {equipoSummary.map(({ tipo, total }) => (
            <div key={tipo} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{total}</span>
              <span className="text-sm text-gray-600">{tipo}</span>
            </div>
          ))}
          {equipoSummary.length === 0 && (
            <p className="text-sm text-gray-400">Sin datos</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroEstado('todos')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
              filtroEstado === 'todos' ? 'bg-gray-200 text-gray-800 ring-2 ring-offset-1 ring-gray-300' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            Todos
          </button>
          {['pendiente', 'notificada', 'asignada', 'completada', 'cancelada'].map(e => (
            <button
              key={e}
              onClick={() => setFiltroEstado(filtroEstado === e ? 'todos' : e)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all capitalize ${
                filtroEstado === e ? 'bg-gray-200 text-gray-800 ring-2 ring-offset-1 ring-gray-300' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        {filtroMarca !== 'todas' && (
          <button
            onClick={() => setFiltroMarca('todas')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
          >
            Marca: {filtroMarca} &times;
          </button>
        )}
      </div>

      {/* Service list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Servicios de garantía ({filtradas.length})
          </h3>
        </div>
        {filtradas.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No se encontraron servicios</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Marca</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Equipo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ciudad</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Orden</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.cliente_nombre}</p>
                      <p className="text-xs text-gray-400">{s.zona_servicio}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">{s.marca_equipo}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{s.tipo_equipo}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{s.ciudad_pueblo}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{s.numero_serie_factura ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_ESTILOS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-700">
                      ${formatCOP(s.pago_tecnico)}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {new Date(s.created_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/solicitudes/${s.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
