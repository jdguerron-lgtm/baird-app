'use client'

/**
 * /admin/mapa — Mapa geolocalizado de todas las solicitudes con coordenadas.
 *
 * Layout: 30% panel de detalle (izquierda) / 70% mapa (derecha).
 * Filtros: fecha de visita, estado (multi), técnico (multi).
 * Toggle de color: por estado (default) | por técnico (hash → HSL).
 *
 * El componente Leaflet se importa via dynamic({ ssr: false }) — Leaflet usa
 * window/document directamente. El bundle (~150 KB) solo se descarga al entrar
 * a esta ruta.
 */

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADO_LABELS, ESTADOS_VALIDOS } from '@/lib/constants/estados'
import type { SolicitudPin } from './MapView'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-100">
      <div className="text-slate-500 text-sm">Cargando mapa…</div>
    </div>
  ),
})

interface Tecnico {
  id: string
  nombre_completo: string
}

interface SolicitudRaw {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  direccion: string
  ciudad_pueblo: string
  estado: string
  tecnico_asignado_id: string | null
  direccion_lat: number | null
  direccion_lng: number | null
  direccion_geocoding_aproximada: boolean | null
  fecha_visita_at: string | null
  horario_confirmado: string | null
}

export default function AdminMapaPage() {
  const [solicitudes, setSolicitudes] = useState<SolicitudPin[]>([])
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [colorMode, setColorMode] = useState<'estado' | 'tecnico'>('estado')
  const [filtroDesde, setFiltroDesde] = useState('') // YYYY-MM-DD, vacío = sin filtro
  const [filtroHasta, setFiltroHasta] = useState('') // YYYY-MM-DD
  const [filtroEstados, setFiltroEstados] = useState<Set<string>>(new Set())
  const [filtroTecnicos, setFiltroTecnicos] = useState<Set<string>>(new Set())
  const [filtroSinAsignar, setFiltroSinAsignar] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Fetch inicial
  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      setError(null)
      try {
        const [{ data: solRaw, error: solErr }, { data: tecRaw, error: tecErr }] = await Promise.all([
          supabase
            .from('solicitudes_servicio')
            .select('id, cliente_nombre, tipo_equipo, marca_equipo, direccion, ciudad_pueblo, estado, tecnico_asignado_id, direccion_lat, direccion_lng, direccion_geocoding_aproximada, fecha_visita_at, horario_confirmado')
            .not('direccion_lat', 'is', null)
            .not('direccion_lng', 'is', null)
            .order('created_at', { ascending: false })
            .limit(2000),
          supabase
            .from('tecnicos')
            .select('id, nombre_completo')
            .order('nombre_completo'),
        ])
        if (solErr) throw solErr
        if (tecErr) throw tecErr

        const tecnicosArr = (tecRaw ?? []) as Tecnico[]
        const tecMap = new Map(tecnicosArr.map((t) => [t.id, t.nombre_completo]))

        const pins: SolicitudPin[] = (solRaw as SolicitudRaw[] ?? []).map((s) => ({
          id: s.id,
          cliente_nombre: s.cliente_nombre,
          tipo_equipo: s.tipo_equipo,
          marca_equipo: s.marca_equipo,
          direccion: s.direccion,
          ciudad_pueblo: s.ciudad_pueblo,
          estado: s.estado,
          tecnico_asignado_id: s.tecnico_asignado_id,
          tecnico_nombre: s.tecnico_asignado_id ? tecMap.get(s.tecnico_asignado_id) ?? null : null,
          direccion_lat: s.direccion_lat as number,
          direccion_lng: s.direccion_lng as number,
          direccion_geocoding_aproximada: !!s.direccion_geocoding_aproximada,
          fecha_visita_at: s.fecha_visita_at,
          horario_confirmado: s.horario_confirmado,
        }))

        setTecnicos(tecnicosArr)
        setSolicitudes(pins)
      } catch (err) {
        console.error('[admin/mapa] error cargando:', err)
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [])

  // Aplicar filtros client-side (dataset chico, no vale la pena round-trip)
  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      // Filtro por estado
      if (filtroEstados.size > 0 && !filtroEstados.has(s.estado)) return false

      // Filtro por técnico (con opción "sin asignar")
      if (filtroSinAsignar && filtroTecnicos.size === 0) {
        if (s.tecnico_asignado_id !== null) return false
      } else if (filtroTecnicos.size > 0) {
        const matchAsignado = s.tecnico_asignado_id && filtroTecnicos.has(s.tecnico_asignado_id)
        const matchSinAsignar = filtroSinAsignar && s.tecnico_asignado_id === null
        if (!matchAsignado && !matchSinAsignar) return false
      }

      // Filtro por rango de fechas (sobre fecha_visita_at)
      if (filtroDesde || filtroHasta) {
        if (!s.fecha_visita_at) return false
        const f = s.fecha_visita_at.slice(0, 10) // YYYY-MM-DD
        if (filtroDesde && f < filtroDesde) return false
        if (filtroHasta && f > filtroHasta) return false
      }

      return true
    })
  }, [solicitudes, filtroEstados, filtroTecnicos, filtroSinAsignar, filtroDesde, filtroHasta])

  const seleccionada = solicitudes.find((s) => s.id === selectedId) ?? null

  const toggleSet = (set: Set<string>, value: string): Set<string> => {
    const nuevo = new Set(set)
    if (nuevo.has(value)) nuevo.delete(value); else nuevo.add(value)
    return nuevo
  }

  const limpiarFiltros = () => {
    setFiltroDesde('')
    setFiltroHasta('')
    setFiltroEstados(new Set())
    setFiltroTecnicos(new Set())
    setFiltroSinAsignar(false)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Mapa de servicios</h1>
        <span className="text-xs text-slate-500">
          {cargando ? '…' : `${solicitudesFiltradas.length} de ${solicitudes.length}`}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Toggle color */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs font-medium">
            <button
              onClick={() => setColorMode('estado')}
              className={`px-3 py-1.5 rounded-md transition ${colorMode === 'estado' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Color por estado
            </button>
            <button
              onClick={() => setColorMode('tecnico')}
              className={`px-3 py-1.5 rounded-md transition ${colorMode === 'tecnico' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Color por técnico
            </button>
          </div>

          <button
            onClick={limpiarFiltros}
            className="text-xs text-slate-500 hover:text-slate-900 underline"
          >
            Limpiar filtros
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-4 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-slate-600">Visita desde:</label>
          <input
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 bg-white"
          />
          <label className="text-slate-600">hasta:</label>
          <input
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 bg-white"
          />
        </div>

        <details className="relative">
          <summary className="cursor-pointer px-3 py-1.5 bg-white border border-slate-300 rounded select-none">
            Estados {filtroEstados.size > 0 && <span className="text-blue-600">({filtroEstados.size})</span>}
          </summary>
          <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded shadow-lg p-2 w-56 max-h-72 overflow-y-auto">
            {ESTADOS_VALIDOS.map((est) => (
              <label key={est} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroEstados.has(est)}
                  onChange={() => setFiltroEstados(toggleSet(filtroEstados, est))}
                />
                {ESTADO_LABELS[est] ?? est}
              </label>
            ))}
          </div>
        </details>

        <details className="relative">
          <summary className="cursor-pointer px-3 py-1.5 bg-white border border-slate-300 rounded select-none">
            Técnicos {(filtroTecnicos.size > 0 || filtroSinAsignar) && (
              <span className="text-blue-600">
                ({filtroTecnicos.size + (filtroSinAsignar ? 1 : 0)})
              </span>
            )}
          </summary>
          <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded shadow-lg p-2 w-56 max-h-72 overflow-y-auto">
            <label className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer font-medium border-b border-slate-100 mb-1">
              <input
                type="checkbox"
                checked={filtroSinAsignar}
                onChange={(e) => setFiltroSinAsignar(e.target.checked)}
              />
              Sin asignar
            </label>
            {tecnicos.map((t) => (
              <label key={t.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroTecnicos.has(t.id)}
                  onChange={() => setFiltroTecnicos(toggleSet(filtroTecnicos, t.id))}
                />
                {t.nombre_completo}
              </label>
            ))}
          </div>
        </details>
      </div>

      {/* Body: 30/70 split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Detail panel (30%) */}
        <aside className="w-[30%] min-w-[280px] max-w-[420px] bg-white border-r border-slate-200 overflow-y-auto p-4">
          {seleccionada ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Cliente</div>
                <div className="font-semibold text-slate-900">{seleccionada.cliente_nombre}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Equipo</div>
                <div>{seleccionada.tipo_equipo} {seleccionada.marca_equipo}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Dirección</div>
                <div>{seleccionada.direccion}</div>
                <div className="text-slate-500">{seleccionada.ciudad_pueblo}</div>
                {seleccionada.direccion_geocoding_aproximada && (
                  <div className="text-amber-700 text-xs italic mt-1">⚠ ubicación aproximada (no se pudo geocodificar la dirección exacta)</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Estado</div>
                <div>{ESTADO_LABELS[seleccionada.estado] ?? seleccionada.estado}</div>
              </div>
              {seleccionada.tecnico_nombre && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Técnico asignado</div>
                  <div>👨‍🔧 {seleccionada.tecnico_nombre}</div>
                </div>
              )}
              {seleccionada.horario_confirmado && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Horario</div>
                  <div>{seleccionada.horario_confirmado}</div>
                </div>
              )}
              <Link
                href={`/admin/solicitudes/${seleccionada.id}`}
                className="inline-block mt-3 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-700"
              >
                Ver detalle completo →
              </Link>
            </div>
          ) : (
            <div className="text-slate-400 text-sm text-center mt-12">
              Click en un pin del mapa para ver el detalle
            </div>
          )}
        </aside>

        {/* Map (70%) */}
        <div className="flex-1 relative">
          {cargando ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-900 rounded-full" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-red-50">
              <div className="text-red-700 text-sm">Error: {error}</div>
            </div>
          ) : solicitudes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-8">
              <div className="text-center text-slate-500 max-w-md">
                <div className="text-2xl mb-3">📍</div>
                <p className="font-medium text-slate-700 mb-2">No hay solicitudes con coordenadas todavía</p>
                <p className="text-xs">Cuando se cree una solicitud nueva, su dirección se geocodifica en background. Para las solicitudes antiguas, corré <code className="bg-slate-200 px-1 rounded">node --env-file=.env.local scripts/backfill-geocoding.mjs</code> una vez.</p>
              </div>
            </div>
          ) : (
            <MapView
              solicitudes={solicitudesFiltradas}
              colorMode={colorMode}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
