'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Config {
  activo: boolean
  minutos_ventaja: number
  max_servicios_semana: number
  updated_at: string | null
  updated_by: string | null
}

interface TecnicoReparto {
  id: string
  nombre: string
  cobertura: string[]
  servicios: number
  prioridad: boolean
}

interface SolicitudEnEspera {
  id: string
  tipo_equipo: string | null
  ciudad_pueblo: string | null
  es_garantia: boolean
  oferta_abierta_at: string
}

interface Datos {
  config: Config
  migracionPendiente: boolean
  ventanaDias: number
  limites: { minutos: { min: number; max: number }; servicios: { min: number; max: number } }
  tecnicos: TecnicoReparto[]
  enEspera: SolicitudEnEspera[]
}

function minutosRestantes(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'abriendo…'
  const min = Math.ceil(ms / 60_000)
  return `se abre en ${min} min`
}

export default function RepartoAdmin() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [minutos, setMinutos] = useState('')
  const [maxServicios, setMaxServicios] = useState('')

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    }
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await fetch('/api/admin/reparto', { headers: await authHeaders() })
    const data = await res.json()
    if (res.ok) {
      setDatos(data)
      setMinutos(String(data.config.minutos_ventaja))
      setMaxServicios(String(data.config.max_servicios_semana))
    } else {
      setAviso({ ok: false, texto: data.error ?? 'No se pudo cargar' })
    }
    setCargando(false)
  }, [authHeaders])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (cambios: Partial<Config>) => {
    setGuardando(true)
    setAviso(null)
    const res = await fetch('/api/admin/reparto', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(cambios),
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) {
      setAviso({ ok: false, texto: data.error ?? 'No se pudo guardar' })
      return
    }
    setAviso({ ok: true, texto: 'Cambios guardados. Aplican desde la próxima solicitud.' })
    await cargar()
  }

  if (cargando && !datos) {
    return <div className="p-6 lg:p-8 text-sm text-gray-500">Cargando…</div>
  }
  if (!datos) {
    return <div className="p-6 lg:p-8 text-sm text-amber-700">{aviso?.texto ?? 'Sin datos'}</div>
  }

  const { config, tecnicos, enEspera, limites, ventanaDias } = datos
  const enPrioridad = tecnicos.filter(t => t.prioridad).length

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reparto de ofertas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Los técnicos con menos servicios reciben la oferta primero. Si nadie la acepta en
          los minutos de ventaja, se abre a todos. Aplica a la primera oferta de cada solicitud;
          el botón &quot;Notificar técnicos&quot; y el reenvío masivo siguen saliendo a todos.
        </p>
      </div>

      {datos.migracionPendiente && (
        <div className="mb-6 rounded-lg p-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          ⚠️ Falta aplicar la migración <code>20261019_reparto_escalonado.sql</code> en Supabase.
          Mientras tanto las ofertas salen a todos al mismo tiempo.
        </div>
      )}

      {aviso && (
        <div
          className={`mb-6 rounded-lg p-3 text-sm ${
            aviso.ok
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          {aviso.ok ? '✅ ' : '⚠️ '}{aviso.texto}
        </div>
      )}

      {/* Configuración */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Prioridad para quien tiene menos servicios</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {config.activo ? 'Encendido' : 'Apagado — las ofertas salen a todos al mismo tiempo'}
            </p>
          </div>
          <button
            onClick={() => guardar({ activo: !config.activo })}
            disabled={guardando || datos.migracionPendiente}
            role="switch"
            aria-checked={config.activo}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              config.activo ? 'bg-green-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                config.activo ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Minutos de ventaja</span>
            <input
              type="number"
              inputMode="numeric"
              min={limites.minutos.min}
              max={limites.minutos.max}
              value={minutos}
              onChange={e => setMinutos(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-400 mt-1">
              Tiempo que tienen los de prioridad antes de que la oferta se abra a todos.
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">
              Tiene prioridad quien lleve menos de… servicios en {ventanaDias} días
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={limites.servicios.min}
              max={limites.servicios.max}
              value={maxServicios}
              onChange={e => setMaxServicios(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-400 mt-1">
              Cuenta los servicios aceptados en los últimos {ventanaDias} días.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {config.updated_by
              ? `Último cambio: ${config.updated_by}${config.updated_at ? ` · ${new Date(config.updated_at).toLocaleString('es-CO')}` : ''}`
              : ''}
          </p>
          <button
            onClick={() => guardar({ minutos_ventaja: Number(minutos), max_servicios_semana: Number(maxServicios) })}
            disabled={guardando || datos.migracionPendiente}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Ofertas esperando abrirse */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Ofertas en espera ({enEspera.length})
        </h2>
        {enEspera.length === 0 ? (
          <p className="text-sm text-gray-500">Ninguna oferta está esperando ahora mismo.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {enEspera.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <a href={`/admin/solicitudes/${s.id}`} className="text-slate-900 hover:underline min-w-0 truncate">
                  {s.tipo_equipo ?? 'Equipo'} · {s.ciudad_pueblo ?? '—'} · {s.es_garantia ? 'Garantía' : 'Particular'}
                </a>
                <span className="text-xs text-amber-700 shrink-0">{minutosRestantes(s.oferta_abierta_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Técnicos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Técnicos verificados</h2>
        <p className="text-xs text-gray-500 mb-3">
          {enPrioridad} de {tecnicos.length} tienen prioridad hoy. Solo cuenta entre los técnicos que
          cubren la ciudad y el tipo de equipo de cada solicitud.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Técnico</th>
                <th className="py-2 pr-3 font-medium">Cobertura</th>
                <th className="py-2 pr-3 font-medium text-right">Servicios {ventanaDias}d</th>
                <th className="py-2 font-medium">Recibe la oferta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tecnicos.map(t => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 text-slate-900">
                    <a href={`/admin/tecnicos/${t.id}`} className="hover:underline">{t.nombre}</a>
                  </td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{t.cobertura.join(', ') || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.servicios}</td>
                  <td className="py-2 text-xs">
                    {!config.activo ? (
                      <span className="text-gray-400">Al mismo tiempo que todos</span>
                    ) : t.prioridad ? (
                      <span className="rounded-full bg-green-50 text-green-800 px-2 py-0.5">Primero</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">
                        Después de {config.minutos_ventaja} min
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
