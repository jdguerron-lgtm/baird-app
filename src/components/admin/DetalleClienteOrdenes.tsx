'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import { useRolAdmin } from '@/components/admin/RolAdminContext'
import {
  ESTADOS_CANCELABLES_DUPLICADO,
  MOTIVO_DUPLICADO_LABELS,
  esActiva,
  type PosibleDuplicado,
} from '@/lib/utils/clientes-duplicados'

/**
 * Todas las órdenes de un teléfono, en línea de tiempo, con el botón
 * "Cancelar como duplicado" (2026-10-28). Lo usan `/admin/clientes` (detalle
 * del cliente) y la ficha de solicitud (aviso de duplicado).
 */

export interface OrdenCliente {
  id: string
  cliente_nombre: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  es_garantia: boolean | null
  estado: string | null
  numero_serie_factura: string | null
  ciudad_pueblo: string | null
  direccion: string | null
  horario_confirmado: string | null
  created_at: string
  motivo_cancelacion: string | null
  tecnico_nombre: string | null
  pagado_online: number
  posibles_duplicados: PosibleDuplicado[]
}

export interface DetalleCliente {
  cliente: { nombre: string; total: number; activas: number } | null
  solicitudes: OrdenCliente[]
}

export async function cargarDetalleCliente(telefono: string): Promise<DetalleCliente> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
  const res = await fetch(`/api/admin/clientes?telefono=${encodeURIComponent(telefono)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? 'No se pudo cargar el cliente')
  return json as DetalleCliente
}

function corto(id: string) {
  return `#${id.slice(0, 8)}`
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Bogota' })
}

export default function DetalleClienteOrdenes({
  telefono,
  resaltarId,
  onCambio,
}: {
  telefono: string
  /** Orden desde la que se abrió (ficha): se marca como "esta orden". */
  resaltarId?: string
  onCambio?: () => void
}) {
  const { soloLectura } = useRolAdmin()
  const [detalle, setDetalle] = useState<DetalleCliente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [conservar, setConservar] = useState<string>('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setDetalle(await cargarDetalleCliente(telefono))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
  }, [telefono])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirCancelar = (o: OrdenCliente) => {
    setCancelando(o.id)
    setConservar(o.posibles_duplicados[0]?.id ?? '')
    setNota('')
    setMensaje(null)
  }

  const confirmarCancelar = async () => {
    if (!cancelando || !conservar) return
    setEnviando(true)
    setMensaje(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión expirada')
      const res = await fetch('/api/admin/cancelar-duplicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: cancelando, originalId: conservar, detalle: nota.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo cancelar')
      setMensaje(
        `✅ ${corto(cancelando)} cancelada como duplicado de ${corto(conservar)}.` +
          (json.tecnicoAvisado ? ' Se le avisó al técnico.' : ''),
      )
      setCancelando(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setMensaje(`❌ ${err instanceof Error ? err.message : 'Error'}`)
    } finally {
      setEnviando(false)
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!detalle) return <p className="text-sm text-gray-500">Cargando órdenes del cliente…</p>

  const otrasNoCanceladas = (id: string) => detalle.solicitudes.filter((s) => s.id !== id && s.estado !== 'cancelada')

  return (
    <div className="space-y-2">
      {mensaje && <p className="text-sm rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">{mensaje}</p>}
      {detalle.solicitudes.map((o) => {
        const activa = esActiva(o.estado)
        const dup = o.posibles_duplicados.length > 0 && activa
        const cancelable = activa && ESTADOS_CANCELABLES_DUPLICADO.has(o.estado ?? '') && o.pagado_online === 0
        return (
          <div
            key={o.id}
            className={`rounded-xl border p-3 text-sm ${dup ? 'border-amber-300 bg-amber-50' : activa ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/solicitudes/${o.id}`} className="font-mono text-xs text-blue-700 hover:underline">
                {corto(o.id)}
              </Link>
              {o.id === resaltarId && <span className="text-xs font-semibold text-blue-700">(esta orden)</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_ESTILOS[o.estado ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                {ESTADO_LABELS[o.estado ?? ''] ?? o.estado}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${o.es_garantia ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {o.es_garantia ? 'Garantía' : 'Particular'}
              </span>
              <span className="font-medium text-gray-900">{[o.tipo_equipo, o.marca_equipo].filter(Boolean).join(' ')}</span>
              <span className="text-xs text-gray-500 ml-auto">Creada {fechaCorta(o.created_at)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
              {o.numero_serie_factura && <span>Orden/serie: <b>{o.numero_serie_factura}</b></span>}
              <span>Técnico: {o.tecnico_nombre ?? <i>sin asignar</i>}</span>
              {o.horario_confirmado && <span>Visita: {o.horario_confirmado}</span>}
              {o.pagado_online > 0 && <span className="text-emerald-700">Pagado online: {formatCOP(o.pagado_online)}</span>}
              {o.direccion && <span className="truncate max-w-xs">{o.direccion}{o.ciudad_pueblo ? `, ${o.ciudad_pueblo}` : ''}</span>}
            </div>
            {o.estado === 'cancelada' && o.motivo_cancelacion && (
              <p className="mt-1 text-xs text-gray-500">Motivo: {o.motivo_cancelacion}</p>
            )}
            {dup && (
              <p className="mt-1 text-xs text-amber-800">
                🔁 Posible duplicado de{' '}
                {o.posibles_duplicados.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <b>{corto(d.id)}</b> ({MOTIVO_DUPLICADO_LABELS[d.motivo].toLowerCase()})
                  </span>
                ))}
              </p>
            )}
            {!soloLectura && cancelable && cancelando !== o.id && (
              <button
                type="button"
                onClick={() => abrirCancelar(o)}
                className="mt-2 text-xs font-medium text-red-700 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"
              >
                Cancelar como duplicado
              </button>
            )}
            {cancelando === o.id && (
              <div className="mt-2 rounded-lg border border-red-200 bg-white p-3 space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  ¿Cuál orden se conserva?
                  <select
                    value={conservar}
                    onChange={(e) => setConservar(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="">Elige la orden que sigue</option>
                    {otrasNoCanceladas(o.id).map((s) => (
                      <option key={s.id} value={s.id}>
                        {corto(s.id)} · {ESTADO_LABELS[s.estado ?? ''] ?? s.estado} · {s.tipo_equipo}
                        {s.numero_serie_factura ? ` · ${s.numero_serie_factura}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  maxLength={300}
                  placeholder="Nota opcional (p. ej. la marca reenvió la orden)"
                  className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <p className="text-xs text-gray-500">
                  El cliente no recibe ningún mensaje.{' '}
                  {o.tecnico_nombre ? `A ${o.tecnico_nombre} se le avisa que no vaya a esta visita.` : 'Las ofertas abiertas a técnicos se anulan.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!conservar || enviando}
                    onClick={confirmarCancelar}
                    className="text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {enviando ? 'Cancelando…' : `Cancelar ${corto(o.id)}`}
                  </button>
                  <button type="button" onClick={() => setCancelando(null)} className="text-xs text-gray-600 px-2">
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
