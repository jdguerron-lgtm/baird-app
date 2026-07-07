'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ESTADO_ESTILOS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  estado: string
  pago_tecnico: number
  precio_cliente: number
  es_garantia: boolean
  created_at: string
  tecnico_nombre: string | null
}

interface SupervisorInfo {
  nombre: string
  ambito: 'todos' | 'garantia' | 'particular'
  marca: string | null
}

const AMBITO_LABEL: Record<string, string> = {
  todos: 'Garantía y particular',
  garantia: 'Solo garantía',
  particular: 'Solo particular',
}

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'notificada', label: 'Notificada' },
  { value: 'asignada', label: 'Asignada' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

export default function SupervisorSolicitudes() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorAcceso, setErrorAcceso] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/supervisor/solicitudes?token=${encodeURIComponent(token)}`)
        if (!res.ok) {
          setErrorAcceso(true)
          setCargando(false)
          return
        }
        const data = await res.json()
        setSupervisor(data.supervisor)
        setSolicitudes(data.solicitudes ?? [])
      } catch {
        setErrorAcceso(true)
      }
      setCargando(false)
    }
    cargar()
  }, [token])

  if (errorAcceso) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <h1 className="text-lg font-bold text-slate-900">Acceso no válido</h1>
        <p className="text-sm text-gray-500 mt-1">
          Este enlace no es válido o fue desactivado. Pídele al administrador que te reenvíe tu acceso.
        </p>
      </div>
    )
  }

  const porEstado = filtro === 'todos' ? solicitudes : solicitudes.filter(s => s.estado === filtro)
  const filtradas = busqueda
    ? porEstado.filter(s => {
        const q = busqueda.toLowerCase()
        return (
          (s.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (s.ciudad_pueblo ?? '').toLowerCase().includes(q) ||
          (s.tipo_equipo ?? '').toLowerCase().includes(q) ||
          s.id.includes(busqueda)
        )
      })
    : porEstado

  return (
    <div>
      {/* Encabezado con alcance */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {supervisor ? `Hola, ${supervisor.nombre.split(' ')[0]}` : 'Solicitudes'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {cargando
            ? 'Cargando…'
            : `${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''} en tu alcance`}
          {supervisor && (
            <span className="text-gray-400">
              {' · '}
              {AMBITO_LABEL[supervisor.ambito] ?? supervisor.ambito}
              {supervisor.marca ? ` · ${supervisor.marca}` : ''}
            </span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {FILTROS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                filtro === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por cliente, ciudad o equipo…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No hay solicitudes que mostrar</p>
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
                {filtradas.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.cliente_nombre}</p>
                      <p className="text-xs text-gray-400">{s.cliente_telefono}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.tipo_equipo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.marca_equipo ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.ciudad_pueblo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.zona_servicio ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      {s.es_garantia ? (
                        !s.pago_tecnico || s.pago_tecnico === 0 ? (
                          <p className="text-sm font-medium text-gray-700">
                            <span className="text-xs text-gray-400 mr-1">desde</span>
                            ${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)}
                          </p>
                        ) : (
                          <p className="text-sm font-medium text-gray-700">${formatCOP(s.pago_tecnico)}</p>
                        )
                      ) : (
                        <p className="text-sm font-medium text-gray-700">${formatCOP(s.precio_cliente)}</p>
                      )}
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
                        href={`/supervisor/${token}/${s.id}`}
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
