'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

interface Tecnico {
  id: string
  nombre_completo: string
  whatsapp: string
  ciudad_pueblo: string
  tipo_documento: string
  numero_documento: string
  foto_perfil_url: string | null
  estado_verificacion: string
  created_at: string
  especialidades: string[]
}

const ESTADOS = [
  { value: 'todos', label: 'Todos', color: 'bg-gray-100 text-gray-700' },
  { value: 'pendiente', label: 'Pendientes', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'verificado', label: 'Verificados', color: 'bg-green-100 text-green-800' },
  { value: 'rechazado', label: 'Rechazados', color: 'bg-red-100 text-red-800' },
]

export default function TecnicosAdmin() {
  const searchParams = useSearchParams()
  const filtroInicial = searchParams.get('filtro') ?? 'todos'

  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [filtro, setFiltro] = useState(filtroInicial)
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)

      let query = supabase
        .from('tecnicos')
        .select('id, nombre_completo, whatsapp, ciudad_pueblo, tipo_documento, numero_documento, foto_perfil_url, estado_verificacion, created_at')
        .order('created_at', { ascending: false })

      if (filtro !== 'todos') {
        query = query.eq('estado_verificacion', filtro)
      }

      const { data: tecnicosData } = await query

      if (!tecnicosData) {
        setTecnicos([])
        setCargando(false)
        return
      }

      // Cargar especialidades para cada tecnico
      const ids = tecnicosData.map(t => t.id)
      const { data: especialidadesData } = await supabase
        .from('especialidades_tecnico')
        .select('tecnico_id, especialidad')
        .in('tecnico_id', ids)

      const espMap = new Map<string, string[]>()
      especialidadesData?.forEach((e: { tecnico_id: string; especialidad: string }) => {
        const existing = espMap.get(e.tecnico_id) ?? []
        espMap.set(e.tecnico_id, [...existing, e.especialidad])
      })

      const resultado: Tecnico[] = tecnicosData.map(t => ({
        ...t,
        especialidades: espMap.get(t.id) ?? [],
      }))

      setTecnicos(resultado)
      setCargando(false)
    }

    cargar()
  }, [filtro])

  const tecnicosFiltrados = busqueda
    ? tecnicos.filter(t =>
        t.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
        t.ciudad_pueblo.toLowerCase().includes(busqueda.toLowerCase()) ||
        t.numero_documento.includes(busqueda)
      )
    : tecnicos

  const estadoBadge = (estado: string) => {
    const estilos: Record<string, string> = {
      pendiente: 'bg-yellow-100 text-yellow-800',
      verificado: 'bg-green-100 text-green-800',
      rechazado: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estilos[estado] ?? 'bg-gray-100 text-gray-600'}`}>
        {estado}
      </span>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Técnicos</h1>
        <p className="text-sm text-gray-500 mt-1">
          {tecnicos.length} técnico{tecnicos.length !== 1 ? 's' : ''} registrado{tecnicos.length !== 1 ? 's' : ''}
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
            placeholder="Buscar por nombre, ciudad o documento..."
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
        ) : tecnicosFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No se encontraron técnicos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Técnico</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ciudad</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Especialidades</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Registro</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tecnicosFiltrados.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0 relative">
                          {t.foto_perfil_url ? (
                            <Image src={t.foto_perfil_url} alt="" fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                              {t.nombre_completo.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{t.nombre_completo}</p>
                          <p className="text-xs text-gray-400">{t.tipo_documento} {t.numero_documento}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{t.ciudad_pueblo}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.especialidades.map(esp => (
                          <span key={esp} className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {esp}
                          </span>
                        ))}
                        {t.especialidades.length === 0 && (
                          <span className="text-xs text-gray-300">Sin especialidades</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {estadoBadge(t.estado_verificacion)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-400">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString('es-CO') : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/tecnicos/${t.id}`}
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
