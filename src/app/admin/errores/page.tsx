'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ConnectionError {
  id: string
  created_at: string
  url: string
  error_type: string
  error_message: string | null
  attempt_number: number | null
  user_agent: string | null
  network_effective_type: string | null
  network_downlink: number | null
  network_rtt: number | null
  online: boolean | null
  actor: string | null
  ip: string | null
}

type RangoTiempo = '1h' | '24h' | '7d' | '30d'

const RANGOS: { value: RangoTiempo; label: string; hours: number }[] = [
  { value: '1h', label: 'Última hora', hours: 1 },
  { value: '24h', label: '24 horas', hours: 24 },
  { value: '7d', label: '7 días', hours: 24 * 7 },
  { value: '30d', label: '30 días', hours: 24 * 30 },
]

function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `hace ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function detectarBrowser(ua: string | null): string {
  if (!ua) return '—'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Chrome/.test(ua)) return 'Chrome'
  if (/Firefox/.test(ua)) return 'Firefox'
  if (/Safari/.test(ua)) return 'Safari'
  return 'Otro'
}

const ETIQUETA_TIPO: Record<string, { label: string; color: string }> = {
  query_retry: { label: 'Retry', color: 'bg-amber-100 text-amber-800' },
  query_failed: { label: 'Query falló', color: 'bg-red-100 text-red-800' },
  page_load_error: { label: 'Página falló', color: 'bg-red-100 text-red-800' },
  fetch_failed: { label: 'Fetch falló', color: 'bg-orange-100 text-orange-800' },
  unknown: { label: 'Desconocido', color: 'bg-gray-100 text-gray-700' },
}

const ETIQUETA_ACTOR: Record<string, string> = {
  tecnico: '🔧 Técnico',
  cliente: '👤 Cliente',
  admin: '🛡️ Admin',
  desconocido: '❓',
}

export default function AdminErroresPage() {
  const [errores, setErrores] = useState<ConnectionError[]>([])
  const [cargando, setCargando] = useState(true)
  const [rango, setRango] = useState<RangoTiempo>('24h')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroActor, setFiltroActor] = useState<string>('todos')

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      const hours = RANGOS.find(r => r.value === rango)?.hours ?? 24
      const desde = new Date(Date.now() - hours * 3600 * 1000).toISOString()

      const { data } = await supabase
        .from('connection_errors')
        .select('*')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(500)

      setErrores((data ?? []) as ConnectionError[])
      setCargando(false)
    }
    cargar()
  }, [rango])

  // Agregaciones
  const stats = useMemo(() => {
    const total = errores.length

    const porTipo = errores.reduce((acc, e) => {
      acc[e.error_type] = (acc[e.error_type] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const porActor = errores.reduce((acc, e) => {
      const k = e.actor ?? 'desconocido'
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const porUrl = errores.reduce((acc, e) => {
      // Normalizar urls con tokens UUID: /tecnico/abc-123 → /tecnico/[token]
      const norm = e.url.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/[token]')
      acc[norm] = (acc[norm] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const porRed = errores.reduce((acc, e) => {
      const k = e.network_effective_type ?? '—'
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    return { total, porTipo, porActor, porUrl, porRed }
  }, [errores])

  const visibles = useMemo(() => {
    return errores.filter(e =>
      (filtroTipo === 'todos' || e.error_type === filtroTipo) &&
      (filtroActor === 'todos' || e.actor === filtroActor)
    )
  }, [errores, filtroTipo, filtroActor])

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📡 Errores de conexión</h1>
            <p className="text-sm text-gray-500 mt-1">
              Reportes de errores de red/carga desde clientes (técnicos + clientes) en últimas {RANGOS.find(r => r.value === rango)?.label.toLowerCase()}.
            </p>
          </div>

          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {RANGOS.map(r => (
              <button
                key={r.value}
                onClick={() => setRango(r.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  rango === r.value ? 'bg-slate-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <p className="text-xs text-red-600 uppercase tracking-wider">Page failed</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{stats.porTipo.page_load_error ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-orange-200 p-4">
            <p className="text-xs text-orange-600 uppercase tracking-wider">Query failed</p>
            <p className="text-3xl font-bold text-orange-700 mt-1">{stats.porTipo.query_failed ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider">Retries</p>
            <p className="text-3xl font-bold text-amber-700 mt-1">{stats.porTipo.query_retry ?? 0}</p>
          </div>
        </div>

        {/* Breakdown grids */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <BreakdownCard titulo="Por URL" rows={stats.porUrl} />
          <BreakdownCard titulo="Por actor" rows={stats.porActor} />
          <BreakdownCard titulo="Por red" rows={stats.porRed} />
        </div>

        {/* Filtros + tabla */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-slate-700">Eventos</span>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1"
            >
              <option value="todos">Todos los tipos</option>
              <option value="page_load_error">Page failed</option>
              <option value="query_failed">Query failed</option>
              <option value="query_retry">Retries</option>
              <option value="fetch_failed">Fetch failed</option>
              <option value="unknown">Unknown</option>
            </select>
            <select
              value={filtroActor}
              onChange={e => setFiltroActor(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1"
            >
              <option value="todos">Todos los actores</option>
              <option value="tecnico">Técnico</option>
              <option value="cliente">Cliente</option>
              <option value="admin">Admin</option>
              <option value="desconocido">Desconocido</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{visibles.length} de {errores.length}</span>
          </div>

          {cargando ? (
            <div className="p-12 text-center">
              <div className="animate-spin h-6 w-6 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
            </div>
          ) : visibles.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              {errores.length === 0
                ? '✅ No hay errores reportados en el rango seleccionado'
                : 'Ningún evento coincide con los filtros'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Cuándo</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">URL</th>
                    <th className="text-left px-3 py-2">Actor</th>
                    <th className="text-left px-3 py-2">Red</th>
                    <th className="text-left px-3 py-2">Browser</th>
                    <th className="text-left px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibles.map(e => {
                    const tipo = ETIQUETA_TIPO[e.error_type] ?? ETIQUETA_TIPO.unknown
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap" title={new Date(e.created_at).toLocaleString('es-CO')}>
                          {tiempoRelativo(e.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-md px-2 py-0.5 font-semibold ${tipo.color}`}>{tipo.label}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-700 max-w-xs truncate" title={e.url}>{e.url}</td>
                        <td className="px-3 py-2 text-gray-600">{ETIQUETA_ACTOR[e.actor ?? 'desconocido']}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {e.network_effective_type ?? '—'}
                          {e.online === false && <span className="ml-1 text-red-600 font-bold">OFFLINE</span>}
                          {e.network_rtt && <span className="text-gray-400 ml-1">({e.network_rtt}ms)</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{detectarBrowser(e.user_agent)}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={e.error_message ?? ''}>
                          {e.error_message ?? '—'}
                          {e.attempt_number ? <span className="text-gray-400 ml-1">#{e.attempt_number}</span> : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-400 mt-6">
          Tip: también podés filtrar estos eventos en Vercel Runtime Logs buscando <code>[ConnectionError]</code>.
        </p>
      </div>
    </div>
  )
}

function BreakdownCard({ titulo, rows }: { titulo: string; rows: Record<string, number> }) {
  const sorted = Object.entries(rows).sort(([, a], [, b]) => b - a).slice(0, 6)
  const total = Object.values(rows).reduce((a, b) => a + b, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{titulo}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-300">Sin datos</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map(([key, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <li key={key} className="text-xs">
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-gray-700 truncate max-w-[180px]" title={key}>{key}</span>
                  <span className="font-semibold text-slate-900 ml-2 shrink-0">{count} <span className="text-gray-400">({pct}%)</span></span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-700" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
