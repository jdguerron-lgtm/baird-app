'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Stats {
  pendientes: number
  verificados: number
  rechazados: number
  totalSolicitudes: number
  solicitudesActivas: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recientes, setRecientes] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    const cargarStats = async () => {
      const [pendientes, verificados, rechazados, totalSol, solActivas, tecRecientes] = await Promise.all([
        supabase.from('tecnicos').select('id', { count: 'exact', head: true }).eq('estado_verificacion', 'pendiente'),
        supabase.from('tecnicos').select('id', { count: 'exact', head: true }).eq('estado_verificacion', 'verificado'),
        supabase.from('tecnicos').select('id', { count: 'exact', head: true }).eq('estado_verificacion', 'rechazado'),
        supabase.from('solicitudes_servicio').select('id', { count: 'exact', head: true }),
        supabase.from('solicitudes_servicio').select('id', { count: 'exact', head: true }).in('estado', ['pendiente', 'notificada', 'asignada']),
        supabase.from('tecnicos').select('id, nombre_completo, ciudad_pueblo, estado_verificacion, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      setStats({
        pendientes: pendientes.count ?? 0,
        verificados: verificados.count ?? 0,
        rechazados: rechazados.count ?? 0,
        totalSolicitudes: totalSol.count ?? 0,
        solicitudesActivas: solActivas.count ?? 0,
      })

      setRecientes(tecRecientes.data ?? [])
    }

    cargarStats()
  }, [])

  const estadoBadge = (estado: string) => {
    const estilos: Record<string, string> = {
      pendiente: 'bg-yellow-100 text-yellow-800',
      verificado: 'bg-green-100 text-green-800',
      rechazado: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estilos[estado] ?? 'bg-gray-100 text-gray-600'}`}>
        {estado}
      </span>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen general de Baird Service</p>
      </div>

      {/* Stats cards */}
      {stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Link href="/admin/tecnicos?filtro=pendiente" className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-yellow-700">{stats.pendientes}</p>
            <p className="text-xs font-semibold text-yellow-600 mt-1 uppercase tracking-wide">Pendientes</p>
          </Link>
          <Link href="/admin/tecnicos?filtro=verificado" className="bg-green-50 border border-green-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-green-700">{stats.verificados}</p>
            <p className="text-xs font-semibold text-green-600 mt-1 uppercase tracking-wide">Verificados</p>
          </Link>
          <Link href="/admin/tecnicos?filtro=rechazado" className="bg-red-50 border border-red-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <p className="text-3xl font-bold text-red-700">{stats.rechazados}</p>
            <p className="text-xs font-semibold text-red-600 mt-1 uppercase tracking-wide">Rechazados</p>
          </Link>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-blue-700">{stats.totalSolicitudes}</p>
            <p className="text-xs font-semibold text-blue-600 mt-1 uppercase tracking-wide">Solicitudes total</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-purple-700">{stats.solicitudesActivas}</p>
            <p className="text-xs font-semibold text-purple-600 mt-1 uppercase tracking-wide">Sol. activas</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      {/* Recent technicians */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Registros recientes</h2>
          <Link href="/admin/tecnicos" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Ver todos →
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recientes.length === 0 ? (
            <p className="text-sm text-gray-400 p-5 text-center">Sin registros aún</p>
          ) : (
            recientes.map((t) => (
              <Link key={t.id} href={`/admin/tecnicos/${t.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.nombre_completo}</p>
                  <p className="text-xs text-gray-400">{t.ciudad_pueblo}</p>
                </div>
                <div className="flex items-center gap-3">
                  {estadoBadge(t.estado_verificacion)}
                  <span className="text-xs text-gray-300">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('es-CO') : ''}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
