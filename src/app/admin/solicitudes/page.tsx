'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  estado: string
  pago_tecnico: number
  created_at: string
  tecnico_asignado_id: string | null
  tecnico_nombre?: string
}

const ESTADOS = [
  { value: 'todos', label: 'Todos', color: 'bg-gray-100 text-gray-700' },
  { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'notificada', label: 'Notificada', color: 'bg-blue-100 text-blue-800' },
  { value: 'asignada', label: 'Asignada', color: 'bg-green-100 text-green-800' },
  { value: 'completada', label: 'Completada', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-100 text-red-800' },
]

const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  notificada: 'bg-blue-100 text-blue-800',
  asignada: 'bg-green-100 text-green-800',
  en_proceso: 'bg-purple-100 text-purple-800',
  completada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-red-100 text-red-800',
}

function formatCOP(n: number) {
  return n.toLocaleString('es-CO')
}

export default function SolicitudesAdmin() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)

      let query = supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, cliente_telefono, ciudad_pueblo, zona_servicio, tipo_equipo, marca_equipo, tipo_solicitud, estado, pago_tecnico, created_at, tecnico_asignado_id')
        .order('created_at', { ascending: false })

      if (filtro !== 'todos') {
        query = query.eq('estado', filtro)
      }

      const { data: solData } = await query

      if (!solData) {
        setSolicitudes([])
        setCargando(false)
        return
      }

      // Load assigned técnico names
      const tecnicoIds = [...new Set(solData.filter(s => s.tecnico_asignado_id).map(s => s.tecnico_asignado_id!))]
      let tecnicoMap = new Map<string, string>()

      if (tecnicoIds.length > 0) {
        const { data: tecnicos } = await supabase
          .from('tecnicos')
          .select('id, nombre_completo')
          .in('id', tecnicoIds)

        tecnicos?.forEach((t: { id: string; nombre_completo: string }) => {
          tecnicoMap.set(t.id, t.nombre_completo)
        })
      }

      const resultado: Solicitud[] = solData.map(s => ({
        ...s,
        estado: s.estado ?? 'pendiente',
        tecnico_nombre: s.tecnico_asignado_id ? tecnicoMap.get(s.tecnico_asignado_id) : undefined,
      }))

      setSolicitudes(resultado)
      setCargando(false)
    }

    cargar()
  }, [filtro])

  const filtradas = busqueda
    ? solicitudes.filter(s =>
        s.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        s.ciudad_pueblo.toLowerCase().includes(busqueda.toLowerCase()) ||
        s.tipo_equipo.toLowerCase().includes(busqueda.toLowerCase()) ||
        s.id.includes(busqueda)
      )
    : solicitudes

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Solicitudes</h1>
        <p className="text-sm text-gray-500 mt-1">
          {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''} registrada{solicitudes.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {ESTADOS.map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                filtro === value
                  ? `${color} ring-2 ring-offset-1 ring-gray-300`
                  : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por cliente, ciudad, equipo o ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No se encontraron solicitudes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Equipo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ciudad</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Asignado a</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.cliente_nombre}</p>
                      <p className="text-xs text-gray-400">{s.cliente_telefono}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.tipo_equipo}</p>
                      <p className="text-xs text-gray-400">{s.marca_equipo}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.ciudad_pueblo}</p>
                      <p className="text-xs text-gray-400">{s.zona_servicio}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-700">${formatCOP(s.pago_tecnico)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_ESTILOS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {s.tecnico_nombre ? (
                        <p className="text-sm text-green-700 font-medium">{s.tecnico_nombre}</p>
                      ) : (
                        <span className="text-xs text-gray-300">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString('es-CO')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/solicitudes/${s.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Ver detalle →
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
