'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string | null
  ciudad_pueblo: string | null
  zona_servicio: string | null
  marca_equipo: string | null
  tipo_equipo: string | null
  tipo_solicitud: string | null
  novedades_equipo: string | null
  es_garantia: boolean | null
  ai_pre_diagnostico: string | null
  ai_repuesto_sugerido: string | null
  estado: string
  created_at: string
  numero_serie_factura: string | null
  pago_tecnico: number | null
  precio_cliente: number
  horario_visita_1: string | null
  horario_visita_2: string | null
  horario_confirmado: string | null
  siguiente_paso: string | null
  siguiente_paso_detalle: string | null
  cotizacion: Record<string, unknown> | null
  diagnosticado_at: string | null
  fecha_visita_at: string | null
  repuesto_recibido_at: string | null
  cancelado_at: string | null
  motivo_cancelacion: string | null
}

interface Tecnico {
  nombre_completo: string
  whatsapp: string | null
  ciudad_pueblo: string | null
}

interface Evento {
  tipo: string | null
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  motivo: string | null
  ocurrido_at: string | null
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{children}</p>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-4">{titulo}</h2>
      {children}
    </div>
  )
}

export default function SupervisorDetalle() {
  const params = useParams<{ token: string; id: string }>()
  const { token, id } = params

  const [sol, setSol] = useState<Solicitud | null>(null)
  const [tecnico, setTecnico] = useState<Tecnico | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const res = await fetch(
          `/api/supervisor/solicitud?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`,
        )
        if (!res.ok) {
          setError(
            res.status === 403
              ? 'Esta solicitud está fuera de tu alcance.'
              : res.status === 401
                ? 'Tu acceso no es válido.'
                : 'No se pudo cargar la solicitud.',
          )
          setCargando(false)
          return
        }
        const data = await res.json()
        setSol(data.solicitud)
        setTecnico(data.tecnico)
        setEventos(data.eventos ?? [])
      } catch {
        setError('No se pudo cargar la solicitud.')
      }
      setCargando(false)
    }
    cargar()
  }, [token, id])

  if (cargando) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
      </div>
    )
  }

  if (error || !sol) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <h1 className="text-lg font-bold text-slate-900">{error ?? 'No encontrada'}</h1>
        <Link
          href={`/supervisor/${token}`}
          className="inline-block mt-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Volver a la lista
        </Link>
      </div>
    )
  }

  const cotizacionTotal =
    sol.cotizacion && typeof sol.cotizacion.total === 'number' ? (sol.cotizacion.total as number) : null

  return (
    <div>
      {/* Volver + estado */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/supervisor/${token}`}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Volver
        </Link>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${ESTADO_ESTILOS[sol.estado] ?? 'bg-gray-100 text-gray-600'}`}>
          {ESTADO_LABELS[sol.estado] ?? sol.estado}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        {sol.tipo_equipo ?? 'Equipo'} {sol.marca_equipo ?? ''}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {sol.es_garantia ? '🛡️ Garantía' : '🧾 Particular'}
        {sol.numero_serie_factura ? ` · N° ${sol.numero_serie_factura}` : ''}
        {' · Creada '}
        {fechaHora(sol.created_at)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Seccion titulo="Cliente">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Nombre">{sol.cliente_nombre}</Campo>
            <Campo label="Teléfono">{sol.cliente_telefono}</Campo>
            <Campo label="Ciudad">{sol.ciudad_pueblo ?? '—'}</Campo>
            <Campo label="Zona">{sol.zona_servicio ?? '—'}</Campo>
            <div className="col-span-2">
              <Campo label="Dirección">{sol.direccion ?? '—'}</Campo>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Equipo y servicio">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Tipo de equipo">{sol.tipo_equipo ?? '—'}</Campo>
            <Campo label="Marca">{sol.marca_equipo ?? '—'}</Campo>
            <Campo label="Tipo de solicitud">{sol.tipo_solicitud ?? '—'}</Campo>
            <Campo label="Flujo">{sol.es_garantia ? 'Garantía' : 'Particular'}</Campo>
            <div className="col-span-2">
              <Campo label="Novedad reportada">{sol.novedades_equipo ?? '—'}</Campo>
            </div>
            {sol.ai_pre_diagnostico && (
              <div className="col-span-2">
                <Campo label="Pre-diagnóstico">{sol.ai_pre_diagnostico}</Campo>
              </div>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Agenda y valores">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Horario confirmado">{sol.horario_confirmado ?? '—'}</Campo>
            <Campo label="Fecha de visita">{fechaHora(sol.fecha_visita_at)}</Campo>
            <Campo label="Opción 1">{sol.horario_visita_1 ?? '—'}</Campo>
            <Campo label="Opción 2">{sol.horario_visita_2 ?? '—'}</Campo>
            {sol.es_garantia ? (
              <Campo label="Pago técnico">
                {sol.pago_tecnico ? `$${formatCOP(sol.pago_tecnico)}` : '—'}
              </Campo>
            ) : (
              <Campo label="Valor al cliente">
                {sol.precio_cliente ? `$${formatCOP(sol.precio_cliente)}` : '—'}
              </Campo>
            )}
            {cotizacionTotal !== null && (
              <Campo label="Total cotización">${formatCOP(cotizacionTotal)}</Campo>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Técnico asignado">
          {tecnico ? (
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Nombre">{tecnico.nombre_completo}</Campo>
              <Campo label="WhatsApp">{tecnico.whatsapp ?? '—'}</Campo>
              <Campo label="Ciudad">{tecnico.ciudad_pueblo ?? '—'}</Campo>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin técnico asignado todavía.</p>
          )}
        </Seccion>
      </div>

      {sol.cancelado_at && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800">Cancelada · {fechaHora(sol.cancelado_at)}</p>
          {sol.motivo_cancelacion && <p className="text-sm text-red-700 mt-1">{sol.motivo_cancelacion}</p>}
        </div>
      )}

      {/* Línea de tiempo */}
      <div className="mt-4">
        <Seccion titulo="Historial">
          {eventos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {eventos.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-gray-300 mt-0.5">•</span>
                  <div>
                    <p className="text-slate-800">
                      {e.estado_previo && e.estado_nuevo ? (
                        <>
                          <span className="text-gray-500">{ESTADO_LABELS[e.estado_previo] ?? e.estado_previo}</span>
                          {' → '}
                          <span className="font-medium">{ESTADO_LABELS[e.estado_nuevo] ?? e.estado_nuevo}</span>
                        </>
                      ) : (
                        <span className="font-medium">{e.tipo ?? 'evento'}</span>
                      )}
                    </p>
                    {e.motivo && <p className="text-xs text-gray-500 mt-0.5">{e.motivo}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fechaHora(e.ocurrido_at)}
                      {e.actor ? ` · ${e.actor}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Seccion>
      </div>
    </div>
  )
}
