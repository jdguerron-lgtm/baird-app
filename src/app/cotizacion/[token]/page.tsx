'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import { trackError } from '@/lib/utils/track-error'
import { formatCOP } from '@/lib/utils/format'
import GestionarServicioLink from '@/components/ui/GestionarServicioLink'
import TiendaRepuestosLink from '@/components/ui/TiendaRepuestosLink'

interface ProductoNecesario {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario?: number
  subtotal?: number
}

interface ProductoRecomendado {
  nombre: string
  descripcion: string
}

interface DatosCotizacion {
  solicitud: {
    id: string
    tipo_equipo: string
    marca_equipo: string
    cliente_nombre: string
    novedades_equipo: string
    cliente_token: string | null
  }
  tecnico: {
    nombre_completo: string
  }
  cotizacion: {
    diagnostico_tecnico: string
    mano_obra: number
    repuestos: number
    repuestos_detalle: string | null
    total: number
    tiempo_entrega?: string | null
    productos_necesarios?: ProductoNecesario[]
    productos_recomendados?: ProductoRecomendado[]
    evidencias_diagnostico: string[]
    cotizado_at: string
    token: string
  }
}

export default function CotizacionPage() {
  const { token } = useParams<{ token: string }>()
  const [datos, setDatos] = useState<DatosCotizacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'aprobada' | 'rechazada'>('idle')
  const [comentarioRechazo, setComentarioRechazo] = useState('')
  const [mostrarRechazo, setMostrarRechazo] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      // Antipatrón conocido (ver CLAUDE.md § Filtros JSONB): cargamos todas
      // las solicitudes en estados de cotización y filtramos por token en JS.
      // Volumen bajo hoy. Retry con backoff cubre fetch errors en 4G/3G.
      const { data: solicitudes } = await querySupabase(() =>
        supabase
          .from('solicitudes_servicio')
          .select('id, tipo_equipo, marca_equipo, cliente_nombre, novedades_equipo, estado, cotizacion, tecnico_asignado_id, cliente_token')
          .in('estado', ['cotizacion_enviada', 'cotizacion_aprobada', 'cotizacion_rechazada', 'en_proceso'])
      )

      const sol = solicitudes?.find(s => {
        const cot = s.cotizacion as { token?: string } | null
        return cot?.token === token
      })

      if (!sol) {
        trackError({
          error_type: 'page_load_error',
          error_message: 'cotizacion not found by token (JSONB scan)',
          actor: 'cliente',
        })
        setError('Enlace inválido o expirado')
        setCargando(false)
        return
      }

      // Check if already processed
      if (sol.estado === 'cotizacion_aprobada' || sol.estado === 'en_proceso') {
        setEstado('aprobada')
        setCargando(false)
        return
      }
      if (sol.estado === 'cotizacion_rechazada') {
        setEstado('rechazada')
        setCargando(false)
        return
      }

      // Load technician (retry para tolerar transitorios)
      const { data: tec } = await querySupabase(() =>
        supabase
          .from('tecnicos')
          .select('nombre_completo')
          .eq('id', sol.tecnico_asignado_id)
          .single()
      )

      if (!tec) {
        setError('Datos del técnico no encontrados')
        setCargando(false)
        return
      }

      setDatos({
        solicitud: {
          id: sol.id,
          tipo_equipo: sol.tipo_equipo,
          marca_equipo: sol.marca_equipo,
          cliente_nombre: sol.cliente_nombre,
          novedades_equipo: sol.novedades_equipo,
          cliente_token: sol.cliente_token ?? null,
        },
        tecnico: tec,
        cotizacion: sol.cotizacion as DatosCotizacion['cotizacion'],
      })
      setCargando(false)
    }

    if (token) cargar()
  }, [token])

  const handleAprobar = async () => {
    setEstado('enviando')
    try {
      const res = await fetch('/api/aprobar-cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, aprobado: true }),
      })
      if (res.ok) {
        setEstado('aprobada')
      } else {
        const data = await res.json()
        setError(data.error || 'Error al aprobar')
        setEstado('idle')
      }
    } catch {
      setError('Error de conexión')
      setEstado('idle')
    }
  }

  const handleRechazar = async () => {
    setEstado('enviando')
    try {
      const res = await fetch('/api/aprobar-cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, aprobado: false, comentario: comentarioRechazo }),
      })
      if (res.ok) {
        setEstado('rechazada')
      } else {
        const data = await res.json()
        setError(data.error || 'Error al rechazar')
        setEstado('idle')
      }
    } catch {
      setError('Error de conexión')
      setEstado('idle')
    }
  }

  // ── Loading state ──
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando cotización...</p>
        </div>
      </div>
    )
  }

  // ── Already processed states ──
  if (estado === 'aprobada') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Cotización aprobada!</h2>
          <p className="text-gray-600 text-sm">
            El técnico procederá con la reparación de tu equipo. Te notificaremos cuando el servicio esté completado.
          </p>
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs text-orange-700">
              ⚠️ Recuerda: todos los pagos se gestionan a través de <strong>Baird Service</strong>. No pagues nada directamente al técnico.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (estado === 'rechazada') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">❌</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Cotización rechazada</h2>
          <p className="text-gray-600 text-sm">
            Hemos notificado al técnico. Si deseas un nuevo servicio, puedes crear una nueva solicitud en nuestra plataforma.
          </p>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800"
          >
            Reintentar
          </button>
          <p className="text-[10px] text-gray-400 mt-3">Verificá tu conexión y volvé a cargar.</p>
        </div>
      </div>
    )
  }

  if (!datos) return null

  const { solicitud, tecnico, cotizacion } = datos

  // ── Main quote view ──
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="text-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl">💰</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Cotización de reparación</h1>
            <p className="text-sm text-gray-500 mt-1">
              {solicitud.tipo_equipo} {solicitud.marca_equipo}
            </p>
          </div>

          {/* Technician */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-500">Técnico</p>
            <p className="font-semibold text-gray-900">👨‍🔧 {tecnico.nombre_completo}</p>
          </div>

          {/* Diagnosis */}
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-1">🔍 Diagnóstico</h3>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
              {cotizacion.diagnostico_tecnico}
            </p>
          </div>

          {/* Evidence photos */}
          {cotizacion.evidencias_diagnostico?.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">📷 Evidencia del diagnóstico</h3>
              <div className="grid grid-cols-2 gap-2">
                {cotizacion.evidencias_diagnostico.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Evidencia ${i + 1}`}
                    className="rounded-lg w-full h-32 object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Productos necesarios */}
          {cotizacion.productos_necesarios && cotizacion.productos_necesarios.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">🔧 Repuestos requeridos</h3>
              <div className="space-y-2">
                {cotizacion.productos_necesarios.map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{p.descripcion}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">SKU: {p.sku} · cant: {p.cantidad}</p>
                      </div>
                      {typeof p.subtotal === 'number' && (
                        <span className="text-sm font-semibold text-slate-700 shrink-0">
                          ${formatCOP(p.subtotal)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productos recomendados */}
          {cotizacion.productos_recomendados && cotizacion.productos_recomendados.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-700 mb-1">✨ Recomendados (opcional)</h3>
              <p className="text-xs text-gray-500 mb-2">
                Productos opcionales que el técnico recomienda. No incluyen costo en esta cotización — puedes comprarlos por tu cuenta cuando quieras.
              </p>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside bg-blue-50 rounded-xl p-3">
                {cotizacion.productos_recomendados.map((p, i) => (
                  <li key={i}>
                    <span className="font-semibold">{p.nombre}</span>
                    {p.descripcion && <span className="text-gray-500"> — {p.descripcion}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <TiendaRepuestosLink
                  variant="inline"
                  texto="Encuéntralos en tienda.bairdservice.com (productos originales)"
                />
              </div>
            </div>
          )}

          {/* Legacy repuestos_detalle (back-compat con cotizaciones antiguas) */}
          {cotizacion.repuestos_detalle && !cotizacion.productos_necesarios?.length && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-700 mb-1">🔧 Detalle de repuestos</h3>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                {cotizacion.repuestos_detalle}
              </p>
            </div>
          )}
        </div>

        {/* Pricing breakdown — esconde el desglose cuando mano_obra y
            repuestos son 0 (flujo particular nuevo: el técnico ingresa un
            costo único y el sistema calcula total incluyendo IVA + margen).
            En ese caso solo se muestra el total para no mostrar "$0 + $0 + Total". */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">💰 Total a pagar</h3>

          <div className="space-y-2">
            {(cotizacion.mano_obra > 0 || cotizacion.repuestos > 0) && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Mano de obra</span>
                  <span className="font-medium">${formatCOP(cotizacion.mano_obra)} COP</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Repuestos</span>
                  <span className="font-medium">${formatCOP(cotizacion.repuestos)} COP</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-base">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold text-blue-600">${formatCOP(cotizacion.total)} COP</span>
                  </div>
                </div>
              </>
            )}
            {cotizacion.mano_obra === 0 && cotizacion.repuestos === 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total del servicio<br /><span className="text-[10px] text-gray-400">Incluye mano de obra, repuestos e IVA</span></span>
                <span className="font-bold text-blue-600 text-xl">${formatCOP(cotizacion.total)} <span className="text-xs font-medium">COP</span></span>
              </div>
            )}
            {cotizacion.tiempo_entrega && (
              <div className="bg-blue-50 rounded-xl p-3 mt-3 text-sm text-blue-900">
                ⏱ Tiempo de entrega estimado: <strong>{cotizacion.tiempo_entrega}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Payment warning */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-700">
            ⚠️ <strong>IMPORTANTE:</strong> No realices ningún pago directamente al técnico.
            Todos los pagos se gestionan únicamente a través de <strong>Baird Service</strong>.
          </p>
        </div>

        {/* Action buttons */}
        {!mostrarRechazo ? (
          <div className="space-y-3">
            <button
              onClick={handleAprobar}
              disabled={estado === 'enviando'}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 rounded-xl transition-colors text-base"
            >
              {estado === 'enviando' ? 'Procesando...' : '✅ Aprobar cotización'}
            </button>
            <button
              onClick={() => setMostrarRechazo(true)}
              disabled={estado === 'enviando'}
              className="w-full bg-white border-2 border-red-300 hover:bg-red-50 disabled:bg-gray-100 text-red-600 font-bold py-4 rounded-xl transition-colors text-base"
            >
              ❌ Rechazar cotización
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">¿Por qué rechazas la cotización?</h3>
            <textarea
              value={comentarioRechazo}
              onChange={(e) => setComentarioRechazo(e.target.value)}
              placeholder="Escribe tu comentario (opcional)..."
              className="w-full border rounded-xl p-3 text-sm resize-none h-24 focus:ring-2 focus:ring-red-300 focus:border-red-300"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setMostrarRechazo(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleRechazar}
                disabled={estado === 'enviando'}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-xl text-sm"
              >
                {estado === 'enviando' ? 'Procesando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        )}

        {/* Self-service portal link — cancelar o reagendar fuera de este flujo */}
        <GestionarServicioLink clienteToken={solicitud.cliente_token} />

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Baird Service — Red de técnicos verificados
        </p>
      </div>
    </div>
  )
}
