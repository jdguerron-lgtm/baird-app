'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface FlaggedRow {
  id: string
  solicitud_id: string
  tecnico_id: string
  gps_completado_lat: number | null
  gps_completado_lng: number | null
  gps_post_visita_lat: number | null
  gps_post_visita_lng: number | null
  gps_post_visita_at: string | null
  completado_at: string | null
  solicitudes_servicio: {
    id: string
    cliente_nombre: string
    direccion: string
    ciudad_pueblo: string
    tipo_equipo: string
    marca_equipo: string
  } | null
  tecnicos: {
    id: string
    nombre_completo: string
    whatsapp: string
  } | null
}

export default function AdminGpsAlertasPage() {
  const [items, setItems] = useState<FlaggedRow[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('evidencias_servicio')
        .select(`
          id, solicitud_id, tecnico_id,
          gps_completado_lat, gps_completado_lng,
          gps_post_visita_lat, gps_post_visita_lng, gps_post_visita_at, completado_at,
          solicitudes_servicio:solicitud_id (id, cliente_nombre, direccion, ciudad_pueblo, tipo_equipo, marca_equipo),
          tecnicos:tecnico_id (id, nombre_completo, whatsapp)
        `)
        .eq('gps_flagged', true)
        .order('gps_post_visita_at', { ascending: false })

      setItems((data ?? []) as unknown as FlaggedRow[])
      setCargando(false)
    }
    cargar()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">🚨 Alertas GPS post-visita</h1>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6 text-sm text-amber-900">
          <p className="font-semibold mb-1">¿Qué muestra esta vista?</p>
          <p>Servicios donde el técnico, 30 minutos después de marcar el servicio como completado, seguía
          dentro de un radio de 100m del sitio del cliente. Esto puede indicar trabajo realizado por fuera
          del flujo de la plataforma.</p>
        </div>

        {cargando ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-gray-500">Sin alertas activas. Todo en orden.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map(it => {
              const lat = it.gps_post_visita_lat
              const lng = it.gps_post_visita_lng
              const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
              return (
                <div key={it.id} className="rounded-2xl bg-white p-5 shadow-sm border-l-4 border-red-400">
                  <div className="flex items-start gap-4 justify-between flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                          Flagged
                        </span>
                        <span className="text-xs text-gray-500">
                          {it.gps_post_visita_at ? new Date(it.gps_post_visita_at).toLocaleString('es-CO') : '-'}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {it.tecnicos?.nombre_completo ?? '-'} → {it.solicitudes_servicio?.cliente_nombre ?? '-'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {it.solicitudes_servicio?.tipo_equipo} {it.solicitudes_servicio?.marca_equipo} ·{' '}
                        {it.solicitudes_servicio?.direccion}, {it.solicitudes_servicio?.ciudad_pueblo}
                      </p>
                      <div className="text-xs text-gray-500 mt-2 font-mono">
                        Completado: {it.gps_completado_lat?.toFixed(6)}, {it.gps_completado_lng?.toFixed(6)}<br/>
                        Post-visita: {lat?.toFixed(6)}, {lng?.toFixed(6)}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {it.solicitudes_servicio && (
                        <Link
                          href={`/admin/solicitudes/${it.solicitudes_servicio.id}`}
                          className="text-xs text-blue-600 hover:underline text-right"
                        >
                          Ver solicitud →
                        </Link>
                      )}
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline text-right"
                        >
                          Ver en mapa →
                        </a>
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
