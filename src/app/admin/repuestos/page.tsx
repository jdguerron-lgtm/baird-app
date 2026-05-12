'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import TiendaRepuestosLink from '@/components/ui/TiendaRepuestosLink'

interface RepuestoConSolicitud {
  id: string
  sku: string
  descripcion: string
  costo: number
  tiempo_estimado: string | null
  estado: string
  solicitado_at: string
  solicitud_id: string
  solicitudes_servicio: {
    id: string
    cliente_nombre: string
    tipo_equipo: string
    marca_equipo: string
    estado: string | null
    es_garantia: boolean
  } | null
}

export default function AdminRepuestosPage() {
  const [repuestos, setRepuestos] = useState<RepuestoConSolicitud[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendiente' | 'recibido' | 'todos'>('pendiente')

  const cargar = async () => {
    setCargando(true)
    let q = supabase
      .from('repuestos_pendientes')
      .select(`
        id, sku, descripcion, costo, tiempo_estimado, estado, solicitado_at, solicitud_id,
        solicitudes_servicio:solicitud_id (
          id, cliente_nombre, tipo_equipo, marca_equipo, estado, es_garantia
        )
      `)
      .order('solicitado_at', { ascending: false })

    if (filtro !== 'todos') q = q.eq('estado', filtro)

    const { data } = await q
    setRepuestos((data ?? []) as unknown as RepuestoConSolicitud[])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [filtro])

  const marcarRecibido = async (id: string) => {
    if (!confirm('¿Marcar este repuesto como recibido? Esto notificará al cliente y reactivará el servicio.')) return
    setActualizando(id)
    const res = await fetch('/api/repuesto-recibido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repuestoId: id }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(`Error: ${data.error}`)
    } else {
      cargar()
    }
    setActualizando(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">📦 Repuestos pendientes</h1>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
        </div>

        <div className="mb-4">
          <TiendaRepuestosLink
            variant="banner"
            tone="emerald"
            texto="Cómprale los repuestos pendientes a la tienda oficial — tienda.bairdservice.com — productos originales con factura electrónica DIAN."
          />
        </div>

        <div className="flex gap-2 mb-6">
          {(['pendiente', 'recibido', 'todos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filtro === f ? 'bg-slate-900 text-white' : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {f === 'pendiente' ? 'Pendientes' : f === 'recibido' ? 'Recibidos' : 'Todos'}
            </button>
          ))}
        </div>

        {cargando ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
          </div>
        ) : repuestos.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-500">No hay repuestos en estado &quot;{filtro}&quot;</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {repuestos.map(r => {
              const sol = r.solicitudes_servicio
              return (
                <div key={r.id} className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-sm font-bold text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded">
                          {r.sku}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.estado === 'pendiente' ? 'bg-amber-100 text-amber-800' :
                          r.estado === 'recibido' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {r.estado}
                        </span>
                        {sol?.es_garantia && (
                          <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                            Garantía
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900">{r.descripcion}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {sol ? `${sol.tipo_equipo} ${sol.marca_equipo} — ${sol.cliente_nombre}` : '-'}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>⏱ Estimado: {r.tiempo_estimado || 'N/A'}</span>
                        {r.costo > 0 && <span>💰 ${formatCOP(r.costo)} COP</span>}
                        <span>📅 {new Date(r.solicitado_at).toLocaleDateString('es-CO')}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {sol && (
                        <Link
                          href={`/admin/solicitudes/${sol.id}`}
                          className="text-xs text-blue-600 hover:underline text-right"
                        >
                          Ver solicitud →
                        </Link>
                      )}
                      {r.estado === 'pendiente' && (
                        <button
                          onClick={() => marcarRecibido(r.id)}
                          disabled={actualizando === r.id}
                          className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {actualizando === r.id ? 'Procesando...' : '✅ Marcar recibido'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
