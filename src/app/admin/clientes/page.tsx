'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DetalleClienteOrdenes from '@/components/admin/DetalleClienteOrdenes'
import type { ResumenCliente } from '@/lib/utils/clientes-duplicados'

/**
 * /admin/clientes — órdenes agrupadas por teléfono del cliente (2026-10-28).
 *
 * Sirve para encontrar órdenes duplicadas (la marca reenvía la misma orden o
 * saca una nueva para el mismo equipo; el cliente vuelve a llenar el
 * formulario) y cancelarlas sin tocar la que ya está en curso. Admin + rol
 * lectura (lectura no ve el botón de cancelar). Datos: GET /api/admin/clientes.
 */

type Filtro = 'duplicados' | 'varias' | 'todos'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'duplicados', label: '🔁 Posibles duplicados' },
  { id: 'varias', label: 'Con varias órdenes' },
  { id: 'todos', label: 'Todos' },
]

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'America/Bogota' })
}

function telefonoLegible(tel: string) {
  const d = tel.startsWith('57') && tel.length === 12 ? tel.slice(2) : tel
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : tel
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ResumenCliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dias, setDias] = useState(180)
  const [filtro, setFiltro] = useState<Filtro>('duplicados')
  const [busqueda, setBusqueda] = useState('')
  const q = useDeferredValue(busqueda)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Sesión expirada. Vuelve a iniciar sesión.')
        return
      }
      const res = await fetch(`/api/admin/clientes?dias=${dias}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo cargar')
        return
      }
      setClientes(json.clientes as ResumenCliente[])
    } catch {
      setError('Error de conexión')
    }
  }, [dias])

  useEffect(() => {
    // Fetch al montar / al cambiar la ventana: el setState sync es solo el reset del error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [cargar])

  // Link directo desde la lista de solicitudes / la ficha: ?telefono=57…
  useEffect(() => {
    const tel = new URLSearchParams(window.location.search).get('telefono')?.replace(/\D/g, '')
    if (!tel) return
    // Lectura única de la URL al montar (no existe en el render del servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiltro('todos')
    setBusqueda(tel)
    setAbierto(tel)
  }, [])

  const conteos = useMemo(() => {
    const c = clientes ?? []
    return {
      duplicados: c.filter((x) => x.conPosibleDuplicado > 0).length,
      varias: c.filter((x) => x.total > 1).length,
      todos: c.length,
    }
  }, [clientes])

  const visibles = useMemo(() => {
    let c = clientes ?? []
    if (filtro === 'duplicados') c = c.filter((x) => x.conPosibleDuplicado > 0)
    else if (filtro === 'varias') c = c.filter((x) => x.total > 1)
    const texto = q.trim().toLowerCase()
    if (texto) {
      const digitos = texto.replace(/\D/g, '')
      c = c.filter((x) => x.nombre.toLowerCase().includes(texto) || (digitos.length >= 3 && x.telefono.includes(digitos)))
    }
    return c
  }, [clientes, filtro, q])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-600">
          Órdenes agrupadas por teléfono. Un <b>posible duplicado</b> es otra orden abierta del mismo equipo, o con el mismo número de orden.
          Los equipos distintos del mismo cliente no se marcan.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filtro === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            {f.label} <span className="opacity-75">({conteos[f.id]})</span>
          </button>
        ))}
        <select
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          aria-label="Ventana de órdenes"
        >
          <option value={30}>Órdenes de los últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={180}>Últimos 180 días</option>
          <option value={730}>Últimos 2 años</option>
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar nombre o teléfono"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64 bg-white"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!clientes && !error && <p className="text-sm text-gray-500">Cargando…</p>}
      {clientes && visibles.length === 0 && (
        <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 p-6 text-center">
          {filtro === 'duplicados' ? '🎉 No hay posibles duplicados en esta ventana.' : 'Sin resultados.'}
        </p>
      )}

      {abierto && clientes && !visibles.some((c) => c.telefono === abierto) && (
        // Cliente abierto por link cuyo historial está fuera de la ventana elegida.
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">{telefonoLegible(abierto)}</p>
          <DetalleClienteOrdenes telefono={abierto} onCambio={cargar} />
        </div>
      )}

      <div className="space-y-2">
        {visibles.map((c) => (
          <div key={c.telefono} className="bg-white rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setAbierto(abierto === c.telefono ? null : c.telefono)}
              className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-semibold text-gray-900 min-w-40">{c.nombre}</span>
              <span className="font-mono text-sm text-gray-600">{telefonoLegible(c.telefono)}</span>
              <span className="text-sm text-gray-700">
                {c.total} {c.total === 1 ? 'orden' : 'órdenes'} · <b>{c.activas}</b> abiertas
              </span>
              {c.conPosibleDuplicado > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                  🔁 {c.conPosibleDuplicado} órdenes con posible duplicado
                </span>
              )}
              <span className="text-xs text-gray-500">{c.equipos.join(' · ')}</span>
              <span className="text-xs text-gray-400 ml-auto">Última {fechaCorta(c.ultimaAt)} {abierto === c.telefono ? '▲' : '▼'}</span>
            </button>
            {abierto === c.telefono && (
              <div className="px-4 pb-4">
                <DetalleClienteOrdenes telefono={c.telefono} onCambio={cargar} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
