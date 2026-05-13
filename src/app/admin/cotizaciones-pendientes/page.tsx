'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import type { CotizacionReparacion, ProductoNecesario, ProductoRecomendado } from '@/types/solicitud'
import TiendaRepuestosLink from '@/components/ui/TiendaRepuestosLink'

interface SolicitudPricing {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  tipo_equipo: string
  marca_equipo: string
  ciudad_pueblo: string
  zona_servicio: string
  es_garantia: boolean
  siguiente_paso: string | null
  cotizacion: CotizacionReparacion | null
  triaje_resultado: { diagnostico_tecnico?: string; productos_necesarios?: ProductoNecesario[]; productos_recomendados?: ProductoRecomendado[] } | null
  created_at: string
}

export default function PricingPendientePage() {
  const [solicitudes, setSolicitudes] = useState<SolicitudPricing[]>([])
  const [cargando, setCargando] = useState(true)
  const [seleccionada, setSeleccionada] = useState<SolicitudPricing | null>(null)

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, cliente_telefono, tipo_equipo, marca_equipo, ciudad_pueblo, zona_servicio, es_garantia, siguiente_paso, cotizacion, triaje_resultado, created_at')
      .eq('estado', 'pendiente_pricing')
      .order('created_at', { ascending: false })
    setSolicitudes((data ?? []) as unknown as SolicitudPricing[])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const cerrar = () => {
    setSeleccionada(null)
    cargar()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💵 Cotizaciones pendientes de pricing</h1>
            <p className="text-sm text-gray-500 mt-1">
              Solicitudes con diagnóstico listo. Fija precio y tiempo de entrega antes de notificar al cliente.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
        </div>

        {cargando ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-500">No hay cotizaciones pendientes de pricing.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {solicitudes.map((s) => {
              const productos = s.cotizacion?.productos_necesarios ?? s.triaje_resultado?.productos_necesarios ?? []
              return (
                <div key={s.id} className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-slate-900">{s.tipo_equipo} {s.marca_equipo}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          s.es_garantia ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {s.es_garantia ? 'Garantía' : 'Particular'}
                        </span>
                        {s.siguiente_paso && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            paso: {s.siguiente_paso}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{s.cliente_nombre} — {s.zona_servicio}, {s.ciudad_pueblo}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {productos.length} producto{productos.length === 1 ? '' : 's'} · creada {new Date(s.created_at).toLocaleDateString('es-CO')}
                      </p>
                    </div>
                    <button
                      onClick={() => setSeleccionada(s)}
                      className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
                    >
                      Fijar precio →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {seleccionada && (
        <PricingForm solicitud={seleccionada} onClose={cerrar} />
      )}
    </div>
  )
}

interface PricingFormProps {
  solicitud: SolicitudPricing
  onClose: () => void
}

function PricingForm({ solicitud, onClose }: PricingFormProps) {
  const productos = solicitud.cotizacion?.productos_necesarios ?? solicitud.triaje_resultado?.productos_necesarios ?? []
  const recomendados = solicitud.cotizacion?.productos_recomendados ?? solicitud.triaje_resultado?.productos_recomendados ?? []
  const diagnostico = solicitud.cotizacion?.diagnostico_tecnico ?? solicitud.triaje_resultado?.diagnostico_tecnico ?? '—'
  // Costo declarado por el técnico (mano de obra desde su perspectiva).
  // En particular+esperar_repuesto, este viene del input "Tu costo total"
  // del diagnóstico — admin lo usa como pre-fill para el campo "Mano de obra".
  const costoTecnicoOriginal = (solicitud.cotizacion as { costo_tecnico?: number } | null)?.costo_tecnico
    ?? (solicitud.triaje_resultado as { costo_tecnico?: number } | null)?.costo_tecnico
    ?? 0

  const [manoObra, setManoObra] = useState(costoTecnicoOriginal > 0 ? String(costoTecnicoOriginal) : '')
  const [tiempoEntrega, setTiempoEntrega] = useState('')
  const [precios, setPrecios] = useState<Record<string, string>>(
    Object.fromEntries(productos.map(p => [p.sku, '']))
  )
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const repuestosTotal = productos.reduce((acc, p) => {
    const precio = Number(precios[p.sku]) || 0
    return acc + precio * Math.max(1, p.cantidad || 1)
  }, 0)
  // En particular el total al cliente lleva IVA + margen Baird
  // (× 1.19 × 1.10). Calculamos en vivo para mostrar al admin lo que el
  // cliente va a ver.
  const costoTecnicoTotal = (Number(manoObra) || 0) + repuestosTotal
  const totalClienteEstimado = solicitud.es_garantia
    ? costoTecnicoTotal
    : Math.round(costoTecnicoTotal * 1.19 * 1.10)

  const submit = async () => {
    setError('')
    if (!tiempoEntrega.trim()) {
      setError('Tiempo de entrega requerido')
      return
    }
    if (!solicitud.es_garantia && (!manoObra || Number(manoObra) <= 0)) {
      setError('Mano de obra requerida (> 0) para servicios particulares')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/cotizacion-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitudId: solicitud.id,
          manoObra: Number(manoObra) || 0,
          tiempoEntrega: tiempoEntrega.trim(),
          productosPrecios: productos.map(p => ({
            sku: p.sku,
            precio_unitario: Number(precios[p.sku]) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al enviar')
        return
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Fijar precio y tiempo</h2>
            <p className="text-sm text-gray-500">{solicitud.tipo_equipo} {solicitud.marca_equipo} — {solicitud.cliente_nombre}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-700">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Diagnóstico */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Diagnóstico del técnico</h3>
            <p className="text-sm text-slate-800 bg-gray-50 rounded-xl p-3">{diagnostico}</p>
          </section>

          {/* Productos necesarios — pricing */}
          <section>
            <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Productos necesarios — fija precio unitario
              </h3>
              {productos.length > 0 && (
                <TiendaRepuestosLink variant="compact" texto="Verificar precios en tienda" />
              )}
            </div>
            {productos.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin repuestos requeridos.</p>
            ) : (
              <div className="space-y-2">
                {productos.map((p) => {
                  const precio = Number(precios[p.sku]) || 0
                  const subtotal = precio * Math.max(1, p.cantidad || 1)
                  return (
                    <div key={p.sku} className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-fuchsia-900">{p.sku}</span>
                        <span className="text-xs text-fuchsia-700">cantidad: {p.cantidad}</span>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{p.descripcion}</p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">
                            Precio unitario {solicitud.es_garantia && '(0 — cubierto por marca)'}
                          </label>
                          <input
                            type="number"
                            value={precios[p.sku] ?? ''}
                            onChange={(e) => setPrecios(prev => ({ ...prev, [p.sku]: e.target.value }))}
                            placeholder="Ej: 250000"
                            min={0}
                            disabled={solicitud.es_garantia}
                            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 disabled:bg-gray-100"
                          />
                        </div>
                        {!solicitud.es_garantia && (
                          <div className="text-xs text-gray-600 font-semibold">
                            Subtotal: ${formatCOP(subtotal)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Productos recomendados (info) */}
          {recomendados.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Productos recomendados (informativo, sin precio)
              </h3>
              <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
                {recomendados.map((p, i) => (
                  <li key={i}>
                    <span className="font-semibold">{p.nombre}</span>
                    {p.descripcion && <span className="text-gray-500"> — {p.descripcion}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Mano de obra (solo particular) */}
          {!solicitud.es_garantia && (
            <section>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Mano de obra (COP) *
              </label>
              <input
                type="number"
                value={manoObra}
                onChange={(e) => setManoObra(e.target.value)}
                placeholder="Ej: 150000"
                min={0}
                className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </section>
          )}

          {/* Tiempo de entrega */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Tiempo de entrega *
            </label>
            <input
              type="text"
              value={tiempoEntrega}
              onChange={(e) => setTiempoEntrega(e.target.value)}
              placeholder="Ej: 3-5 días hábiles"
              className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </section>

          {/* Total — particular incluye IVA + margen Baird */}
          {!solicitud.es_garantia && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Mano de obra (técnico)</span>
                <span>${formatCOP(Number(manoObra) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Repuestos</span>
                <span>${formatCOP(repuestosTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-blue-200">
                <span>Subtotal técnico</span>
                <span>${formatCOP(costoTecnicoTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>+ IVA 19%</span>
                <span>${formatCOP(Math.round(costoTecnicoTotal * 0.19))}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>+ Comisión Baird 10%</span>
                <span>${formatCOP(Math.round(costoTecnicoTotal * 1.19 * 0.10))}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-blue-900 pt-2 border-t border-blue-300">
                <span>Total al cliente</span>
                <span>${formatCOP(totalClienteEstimado)} COP</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={enviando}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {enviando ? 'Enviando...' : (solicitud.es_garantia ? 'Confirmar tiempo y notificar cliente' : 'Confirmar precio y enviar cotización')}
          </button>
        </div>
      </div>
    </div>
  )
}
