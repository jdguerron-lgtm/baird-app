'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import { codigoServicio } from '@/lib/utils/facturacion'
import type {
  CuentaPorPagarTecnico,
  LiquidacionItem,
  LiquidacionTecnico,
} from '@/lib/services/liquidacion-tecnicos.service'

/**
 * /admin/pagos-tecnicos — cuentas por pagar a técnicos y liquidaciones.
 *
 *   1. "Por pagar": servicios completados que aún no están en ninguna
 *      liquidación, agrupados por técnico. El admin selecciona servicios y
 *      crea una liquidación (queda PENDIENTE).
 *   2. "Liquidaciones": historial; marcar PAGADA (con referencia del giro)
 *      o ANULAR (libera los servicios).
 *
 * Solo admin. API: /api/admin/liquidaciones-tecnicos.
 */

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' })
}

function codigoLiq(id: string): string {
  return `LQ-${id.slice(0, 8).toUpperCase()}`
}

const ESTADO_BADGE: Record<LiquidacionTecnico['estado'], string> = {
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  pagada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  anulada: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function PagosTecnicosPage() {
  const [cuentas, setCuentas] = useState<CuentaPorPagarTecnico[]>([])
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionTecnico[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Liquidar: técnico abierto + servicios marcados
  const [abierto, setAbierto] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Historial: detalle expandido + referencia de pago por liquidación
  const [detalle, setDetalle] = useState<Record<string, LiquidacionItem[]>>({})
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(null)
  const [referencia, setReferencia] = useState<Record<string, string>>({})
  const [accionando, setAccionando] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todas' | LiquidacionTecnico['estado']>('todas')

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/liquidaciones-tecnicos', { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo cargar')
      setCuentas(json.cuentas ?? [])
      setLiquidaciones(json.liquidaciones ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setCargando(false)
    }
  }, [authHeaders])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirTecnico = (c: CuentaPorPagarTecnico) => {
    if (abierto === c.tecnico_id) {
      setAbierto(null)
      return
    }
    setAbierto(c.tecnico_id)
    setSeleccion(new Set(c.servicios.map((s) => s.solicitud_id)))
    setNota('')
  }

  const toggleServicio = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const crear = async (c: CuentaPorPagarTecnico) => {
    const ids = c.servicios.filter((s) => seleccion.has(s.solicitud_id)).map((s) => s.solicitud_id)
    if (ids.length === 0) {
      setError('Selecciona al menos un servicio.')
      return
    }
    const total = c.servicios.filter((s) => seleccion.has(s.solicitud_id)).reduce((a, s) => a + s.monto, 0)
    if (!window.confirm(`Crear liquidación para ${c.nombre_completo}: ${ids.length} servicio(s) por $${formatCOP(total)}?`)) return
    setEnviando(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch('/api/admin/liquidaciones-tecnicos', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ tecnico_id: c.tecnico_id, solicitud_ids: ids, nota: nota || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo crear la liquidación')
      setOk(`Liquidación ${codigoLiq(json.id)} creada: ${json.servicios} servicio(s), $${formatCOP(json.total)}. Queda pendiente de pago.`)
      setAbierto(null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setEnviando(false)
    }
  }

  const verDetalle = async (id: string) => {
    if (detalleAbierto === id) {
      setDetalleAbierto(null)
      return
    }
    setDetalleAbierto(id)
    if (detalle[id]) return
    try {
      const res = await fetch(`/api/admin/liquidaciones-tecnicos/${id}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo cargar el detalle')
      setDetalle((prev) => ({ ...prev, [id]: json.items ?? [] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }

  const accion = async (l: LiquidacionTecnico, tipo: 'pagar' | 'anular') => {
    const msg = tipo === 'pagar'
      ? `Marcar ${codigoLiq(l.id)} (${l.tecnico_nombre}, $${formatCOP(l.total)}) como PAGADA?`
      : `Anular ${codigoLiq(l.id)}? Los ${l.servicios} servicio(s) vuelven a "por pagar".`
    if (!window.confirm(msg)) return
    setAccionando(l.id)
    setError(null)
    setOk(null)
    try {
      const res = await fetch(`/api/admin/liquidaciones-tecnicos/${l.id}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify(tipo === 'pagar' ? { accion: 'pagar', referencia: referencia[l.id] || null } : { accion: 'anular' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo completar la acción')
      setOk(tipo === 'pagar' ? `${codigoLiq(l.id)} marcada como pagada.` : `${codigoLiq(l.id)} anulada; servicios liberados.`)
      setDetalle((prev) => {
        const next = { ...prev }
        delete next[l.id]
        return next
      })
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setAccionando(null)
    }
  }

  const totalPorPagar = cuentas.reduce((a, c) => a + c.total, 0)
  const serviciosPorPagar = cuentas.reduce((a, c) => a + c.servicios.length, 0)
  const pendientes = liquidaciones.filter((l) => l.estado === 'pendiente')
  const totalPendiente = pendientes.reduce((a, l) => a + l.total, 0)
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
  const pagadoMes = liquidaciones
    .filter((l) => l.estado === 'pagada' && (l.pagada_at ?? '').slice(0, 7) === mesActual)
    .reduce((a, l) => a + l.total, 0)
  const liquidacionesFiltradas = filtroEstado === 'todas' ? liquidaciones : liquidaciones.filter((l) => l.estado === filtroEstado)

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pagos a técnicos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cuánto le debe Baird a cada técnico por servicios completados y qué liquidaciones ya se giraron.
          </p>
        </div>
        <Link href="/admin/liquidaciones" className="text-sm text-slate-600 hover:text-slate-900 underline whitespace-nowrap">
          Exportar Excel (documento soporte) →
        </Link>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {ok && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{ok}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Por liquidar" valor={`$${formatCOP(totalPorPagar)}`} sub={`${serviciosPorPagar} servicio(s) · ${cuentas.length} técnico(s)`} destacado />
        <Kpi label="Liquidado sin pagar" valor={`$${formatCOP(totalPendiente)}`} sub={`${pendientes.length} liquidación(es) pendiente(s)`} />
        <Kpi label="Deuda total con técnicos" valor={`$${formatCOP(totalPorPagar + totalPendiente)}`} sub="por liquidar + pendiente de giro" />
        <Kpi label="Pagado este mes" valor={`$${formatCOP(pagadoMes)}`} sub={mesActual} />
      </div>

      {cargando && cuentas.length === 0 && liquidaciones.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-900 rounded-full" />
        </div>
      ) : (
        <div className={cargando ? 'opacity-60 transition-opacity' : ''}>
          {/* Por pagar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900">Por liquidar</h2>
              <p className="text-xs text-slate-500">Servicios completados que no están en ninguna liquidación. Abre un técnico, marca los servicios y crea la liquidación.</p>
            </div>
            {cuentas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">No hay servicios pendientes de liquidar. 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Técnico</th>
                    <th className="text-right px-3 py-2 font-medium">Servicios</th>
                    <th className="text-right px-3 py-2 font-medium">Gar. / Part.</th>
                    <th className="text-right px-3 py-2 font-medium">Más antiguo</th>
                    <th className="text-right px-3 py-2 font-medium">Total a pagar</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cuentas.map((c) => (
                    <CuentaRows
                      key={c.tecnico_id}
                      c={c}
                      abierta={abierto === c.tecnico_id}
                      seleccion={seleccion}
                      nota={nota}
                      enviando={enviando}
                      onAbrir={() => abrirTecnico(c)}
                      onToggle={toggleServicio}
                      onTodos={(todos) => setSeleccion(todos ? new Set(c.servicios.map((s) => s.solicitud_id)) : new Set())}
                      onNota={setNota}
                      onCrear={() => crear(c)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Liquidaciones */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-slate-900">Liquidaciones</h2>
                <p className="text-xs text-slate-500">Pendiente = creada, falta girar. Marca pagada cuando hagas la transferencia (guarda la referencia).</p>
              </div>
              <div className="flex gap-1">
                {(['todas', 'pendiente', 'pagada', 'anulada'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroEstado(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${filtroEstado === f ? 'bg-slate-900 text-white border-slate-900' : 'border-gray-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {liquidacionesFiltradas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">Aún no hay liquidaciones{filtroEstado !== 'todas' ? ` en estado "${filtroEstado}"` : ''}.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Liquidación</th>
                    <th className="text-left px-3 py-2 font-medium">Técnico</th>
                    <th className="text-right px-3 py-2 font-medium">Serv.</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                    <th className="text-left px-3 py-2 font-medium">Pago</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {liquidacionesFiltradas.map((l) => (
                    <LiquidacionRows
                      key={l.id}
                      l={l}
                      abierta={detalleAbierto === l.id}
                      items={detalle[l.id]}
                      referencia={referencia[l.id] ?? ''}
                      accionando={accionando === l.id}
                      onVer={() => verDetalle(l.id)}
                      onReferencia={(v) => setReferencia((prev) => ({ ...prev, [l.id]: v }))}
                      onPagar={() => accion(l, 'pagar')}
                      onAnular={() => accion(l, 'anular')}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-4">
            Los montos son el pago consolidado al técnico (garantía con encuesta/TA/días reales; particular = costo cotizado + recargo), sin retención en la fuente. La retención la decide contabilidad al girar (ver hoja &quot;Documento soporte&quot; del Excel).
          </p>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, destacado }: { label: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${destacado ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${destacado ? 'text-amber-800' : 'text-slate-900'}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function CuentaRows(props: {
  c: CuentaPorPagarTecnico
  abierta: boolean
  seleccion: Set<string>
  nota: string
  enviando: boolean
  onAbrir: () => void
  onToggle: (id: string) => void
  onTodos: (todos: boolean) => void
  onNota: (v: string) => void
  onCrear: () => void
}) {
  const { c, abierta, seleccion, nota, enviando, onAbrir, onToggle, onTodos, onNota, onCrear } = props
  const seleccionados = c.servicios.filter((s) => seleccion.has(s.solicitud_id))
  const totalSel = seleccionados.reduce((a, s) => a + s.monto, 0)
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-5 py-2.5">
          <p className="font-medium text-slate-900">{c.nombre_completo}</p>
          <p className="text-xs text-slate-400">{c.numero_documento ? `CC ${c.numero_documento} · ` : ''}{c.whatsapp}</p>
        </td>
        <td className="px-3 py-2.5 text-right text-slate-700">{c.servicios.length}</td>
        <td className="px-3 py-2.5 text-right text-slate-500">{c.garantia} / {c.particular}</td>
        <td className="px-3 py-2.5 text-right text-slate-500">{fmtFecha(c.mas_antiguo)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">${formatCOP(c.total)}</td>
        <td className="px-5 py-2.5 text-right">
          <button
            type="button"
            onClick={onAbrir}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${abierta ? 'bg-slate-200 text-slate-800' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
          >
            {abierta ? 'Cerrar' : 'Liquidar'}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
              <span>
                <button type="button" className="underline mr-3" onClick={() => onTodos(true)}>Todos</button>
                <button type="button" className="underline" onClick={() => onTodos(false)}>Ninguno</button>
              </span>
              <span>{seleccionados.length} de {c.servicios.length} seleccionados · <strong className="text-slate-900">${formatCOP(totalSel)}</strong></span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-1.5 w-8" />
                    <th className="text-left px-2 py-1.5 font-medium">Servicio</th>
                    <th className="text-left px-2 py-1.5 font-medium">Cierre</th>
                    <th className="text-left px-2 py-1.5 font-medium">Cliente</th>
                    <th className="text-left px-2 py-1.5 font-medium">Equipo</th>
                    <th className="text-left px-2 py-1.5 font-medium">Flujo</th>
                    <th className="text-right px-3 py-1.5 font-medium">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {c.servicios.map((s) => (
                    <tr key={s.solicitud_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onToggle(s.solicitud_id)}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={seleccion.has(s.solicitud_id)} onChange={() => onToggle(s.solicitud_id)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/admin/solicitudes/${s.solicitud_id}`} className="text-slate-700 underline" onClick={(e) => e.stopPropagation()}>
                          {codigoServicio(s.solicitud_id)}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{fmtFecha(s.fecha_cierre)}</td>
                      <td className="px-2 py-1.5 text-slate-700">{s.cliente_nombre} <span className="text-slate-400">· {s.ciudad_pueblo}</span></td>
                      <td className="px-2 py-1.5 text-slate-600">{s.equipo}</td>
                      <td className="px-2 py-1.5">{s.es_garantia ? '🛡️ Garantía' : '💳 Particular'}{s.estimado && <span title="Garantía sin complejidad en diagnóstico: pago proyectado" className="ml-1 text-amber-600">⚠️</span>}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-900">${formatCOP(s.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-xs font-medium text-slate-600 flex-1 min-w-[240px]">
                Nota (opcional)
                <input
                  type="text"
                  value={nota}
                  maxLength={500}
                  onChange={(e) => onNota(e.target.value)}
                  placeholder="p.ej. Quincena 1–15 oct"
                  className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <button
                type="button"
                disabled={enviando || seleccionados.length === 0}
                onClick={onCrear}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {enviando ? 'Creando…' : `Crear liquidación · $${formatCOP(totalSel)}`}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function LiquidacionRows(props: {
  l: LiquidacionTecnico
  abierta: boolean
  items: LiquidacionItem[] | undefined
  referencia: string
  accionando: boolean
  onVer: () => void
  onReferencia: (v: string) => void
  onPagar: () => void
  onAnular: () => void
}) {
  const { l, abierta, items, referencia, accionando, onVer, onReferencia, onPagar, onAnular } = props
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-5 py-2.5">
          <button type="button" onClick={onVer} className="font-mono text-xs text-slate-700 underline">{codigoLiq(l.id)}</button>
          <p className="text-xs text-slate-400">{fmtFecha(l.created_at)}{l.nota ? ` · ${l.nota}` : ''}</p>
        </td>
        <td className="px-3 py-2.5 text-slate-800">{l.tecnico_nombre}</td>
        <td className="px-3 py-2.5 text-right text-slate-700">{l.servicios}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">${formatCOP(l.total)}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-medium ${ESTADO_BADGE[l.estado]}`}>{l.estado}</span>
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500">
          {l.estado === 'pagada' ? (
            <>{fmtFecha(l.pagada_at)}{l.referencia_pago ? ` · ref. ${l.referencia_pago}` : ''}</>
          ) : l.estado === 'pendiente' ? (
            <input
              type="text"
              value={referencia}
              maxLength={120}
              onChange={(e) => onReferencia(e.target.value)}
              placeholder="Ref. transferencia"
              className="border border-gray-300 rounded-md px-2 py-1 text-xs w-36 text-slate-900"
            />
          ) : (
            <>anulada {fmtFecha(l.anulada_at)}</>
          )}
        </td>
        <td className="px-5 py-2.5 text-right whitespace-nowrap">
          {l.estado === 'pendiente' && (
            <>
              <button type="button" disabled={accionando} onClick={onPagar} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 mr-2">
                Marcar pagada
              </button>
              <button type="button" disabled={accionando} onClick={onAnular} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Anular
              </button>
            </>
          )}
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-5 py-3">
            {!items ? (
              <p className="text-xs text-slate-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-500">Sin servicios (liquidación anulada).</p>
            ) : (
              <table className="w-full text-xs bg-white border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Servicio</th>
                    <th className="text-left px-2 py-1.5 font-medium">Cierre</th>
                    <th className="text-left px-2 py-1.5 font-medium">Cliente</th>
                    <th className="text-left px-2 py-1.5 font-medium">Equipo</th>
                    <th className="text-left px-2 py-1.5 font-medium">Flujo</th>
                    <th className="text-right px-3 py-1.5 font-medium">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((i) => (
                    <tr key={i.solicitud_id}>
                      <td className="px-3 py-1.5">
                        <Link href={`/admin/solicitudes/${i.solicitud_id}`} className="text-slate-700 underline">{codigoServicio(i.solicitud_id)}</Link>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{fmtFecha(i.fecha_cierre)}</td>
                      <td className="px-2 py-1.5 text-slate-700">{i.cliente_nombre}</td>
                      <td className="px-2 py-1.5 text-slate-600">{i.equipo}</td>
                      <td className="px-2 py-1.5">{i.es_garantia ? '🛡️ Garantía' : '💳 Particular'}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-900">${formatCOP(i.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
