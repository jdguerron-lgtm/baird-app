'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'
import {
  RESULTADO_LABELS,
  type ReporteCumplimiento,
  type ResultadoReserva,
} from '@/lib/services/incumplidos.service'

/**
 * /admin/incumplidos — visitas que NO se atendieron el día reservado.
 * Datos de GET /api/admin/incumplidos (rango por día de reserva, hora
 * Colombia; hoy y el futuro no se evalúan). Admin + rol lectura.
 */

function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

type Atajo = '7d' | '30d' | 'mes' | 'mes_pasado' | 'todo'

function rangoAtajo(atajo: Atajo): { desde: string; hasta: string } {
  const hoy = hoyColombia()
  const ayer = sumarDias(hoy, -1)
  const [y, m] = hoy.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (atajo === '7d') return { desde: sumarDias(hoy, -7), hasta: ayer }
  if (atajo === '30d') return { desde: sumarDias(hoy, -30), hasta: ayer }
  if (atajo === 'mes') return { desde: `${y}-${pad(m)}-01`, hasta: ayer }
  if (atajo === 'mes_pasado') {
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate()
    return { desde: `${py}-${pad(pm)}-01`, hasta: `${py}-${pad(pm)}-${pad(ultimo)}` }
  }
  return { desde: '2026-01-01', hasta: ayer }
}

function pct(v: number | null): string {
  if (v === null) return '—'
  return `${Math.round(v * 100)}%`
}

function fechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** Franja de la reserva ("8am-12pm") a partir del texto confirmado. */
function franjaDe(horario: string | null): string | null {
  if (!horario) return null
  const m = horario.match(/\d{1,2}\s*(?:am|pm)\s*-\s*\d{1,2}\s*(?:am|pm)/i)
  return m ? m[0].replace(/\s+/g, '') : null
}

const RESULTADO_ESTILOS: Record<ResultadoReserva, string> = {
  vencida: 'bg-red-100 text-red-800',
  sin_tecnico: 'bg-orange-100 text-orange-800',
  tarde: 'bg-amber-100 text-amber-800',
  cerrada_sin_visita: 'bg-gray-200 text-gray-700',
  sin_evidencia: 'bg-gray-100 text-gray-500',
  cumplida: 'bg-emerald-100 text-emerald-800',
  futura: 'bg-blue-100 text-blue-800',
}

const EVIDENCIA_LABELS: Record<string, string> = {
  gps: 'GPS del técnico',
  diagnostico: 'Diagnóstico enviado',
  completado: 'Servicio completado',
}

type VistaItems = 'incumplidas' | 'pendientes' | 'todas'

const VISTAS: { value: VistaItems; label: string; title: string }[] = [
  { value: 'incumplidas', label: 'Incumplidas', title: 'Vencidas sin atender + sin técnico + atendidas tarde' },
  { value: 'pendientes', label: 'Solo pendientes', title: 'Vencidas que siguen abiertas: hay que reagendar o reasignar' },
  { value: 'todas', label: 'Todas las reservas', title: 'Incluye las atendidas a tiempo y las cerradas sin visita' },
]

export default function IncumplidosPage() {
  const [{ desde, hasta }, setRango] = useState(() => rangoAtajo('30d'))
  const [data, setData] = useState<ReporteCumplimiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaItems>('incumplidas')
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Sesión expirada. Vuelve a iniciar sesión.')
        return
      }
      const res = await fetch(`/api/admin/incumplidos?desde=${desde}&hasta=${hasta}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo cargar el reporte')
        return
      }
      setData(json as ReporteCumplimiento)
    } catch {
      setError('Error de conexión')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const r = data?.resumen

  const items = useMemo(() => {
    if (!data) return []
    return data.items.filter((it) => {
      if (tecnicoFiltro !== null && (it.tecnico_id ?? '') !== tecnicoFiltro) return false
      if (vista === 'incumplidas') return it.resultado === 'vencida' || it.resultado === 'sin_tecnico' || it.resultado === 'tarde'
      if (vista === 'pendientes') return it.resultado === 'vencida' || it.resultado === 'sin_tecnico'
      return true
    })
  }, [data, vista, tecnicoFiltro])

  const tecnicoFiltroNombre = tecnicoFiltro === null
    ? null
    : data?.por_tecnico.find((t) => (t.tecnico_id ?? '') === tecnicoFiltro)?.tecnico_nombre ?? 'Técnico'

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">⏰ Reservas incumplidas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visitas que <strong>no se atendieron el día reservado</strong>. Una reserva cuenta como atendida si ese día hay
            ping GPS del técnico, diagnóstico enviado o servicio completado. Hoy y el futuro no se evalúan (hora Colombia).
          </p>
        </div>
        <Link href="/admin/solicitudes" className="text-sm text-slate-600 hover:text-slate-900 underline whitespace-nowrap">
          Ir a solicitudes →
        </Link>
      </div>

      {/* Filtros de período (por día de reserva) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Reservas desde
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setRango({ desde: e.target.value, hasta })}
            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde}
            max={sumarDias(hoyColombia(), -1)}
            onChange={(e) => setRango({ desde, hasta: e.target.value })}
            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {([
            ['7d', 'Últimos 7 días'],
            ['30d', 'Últimos 30 días'],
            ['mes', 'Este mes'],
            ['mes_pasado', 'Mes pasado'],
            ['todo', 'Todo'],
          ] as [Atajo, string][]).map(([atajo, label]) => (
            <button
              key={atajo}
              type="button"
              onClick={() => setRango(rangoAtajo(atajo))}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 text-slate-700 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {/* KPIs */}
      {cargando && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : r ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-slate-800">{r.reservas}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide">Reservas vencidas</p>
          </div>
          <button
            type="button"
            onClick={() => setVista('pendientes')}
            className="text-left bg-red-50 border border-red-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            title="Vencidas sin atender con técnico asignado + vencidas sin técnico: siguen abiertas"
          >
            <p className="text-3xl font-bold text-red-700">{r.vencidas + r.sin_tecnico}</p>
            <p className="text-xs font-semibold text-red-600 mt-1 uppercase tracking-wide">Sin atender (abiertas)</p>
            <p className="text-[11px] text-red-500 mt-1">{r.vencidas} con técnico · {r.sin_tecnico} sin técnico</p>
          </button>
          <button
            type="button"
            onClick={() => setVista('incumplidas')}
            className="text-left bg-amber-50 border border-amber-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            title="Se atendieron, pero días después de la fecha reservada"
          >
            <p className="text-3xl font-bold text-amber-700">{r.tarde}</p>
            <p className="text-xs font-semibold text-amber-600 mt-1 uppercase tracking-wide">Atendidas tarde</p>
          </button>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <p className="text-3xl font-bold text-emerald-700">{r.cumplidas}</p>
            <p className="text-xs font-semibold text-emerald-600 mt-1 uppercase tracking-wide">A tiempo</p>
          </div>
          <div className={`border rounded-xl p-5 ${r.cumplimiento_pct !== null && r.cumplimiento_pct < 0.8 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
            <p className={`text-3xl font-bold ${r.cumplimiento_pct !== null && r.cumplimiento_pct < 0.8 ? 'text-red-700' : 'text-blue-700'}`}>{pct(r.cumplimiento_pct)}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide">Cumplimiento</p>
            <p className="text-[11px] text-slate-400 mt-1">a tiempo ÷ (a tiempo + incumplidas)</p>
          </div>
        </div>
      ) : null}

      {r && (r.cerradas_sin_visita > 0 || r.sin_evidencia > 0) && (
        <p className="text-xs text-slate-400 mb-6">
          Fuera del cumplimiento: {r.cerradas_sin_visita} cerrada{r.cerradas_sin_visita !== 1 ? 's' : ''} sin visita
          (cancelada / sin agendar / no-show) y {r.sin_evidencia} sin evidencia registrada (histórico anterior a mayo 2026).
          Se ven en «Todas las reservas».
        </p>
      )}

      {/* Por técnico */}
      {data && data.por_tecnico.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">Por técnico</h2>
              <p className="text-xs text-gray-400 mt-0.5">Clic en una fila filtra el detalle de abajo</p>
            </div>
            {tecnicoFiltro !== null && (
              <button
                type="button"
                onClick={() => setTecnicoFiltro(null)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Quitar filtro: {tecnicoFiltroNombre} ✕
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Técnico</th>
                  <th className="px-5 py-3 text-right">Reservas</th>
                  <th className="px-5 py-3 text-right">Sin atender</th>
                  <th className="px-5 py-3 text-right">Tarde</th>
                  <th className="px-5 py-3 text-right">A tiempo</th>
                  <th className="px-5 py-3 text-right">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.por_tecnico.map((t) => {
                  const clave = t.tecnico_id ?? ''
                  const activo = tecnicoFiltro === clave
                  const sinAtender = t.vencidas + t.sin_tecnico
                  return (
                    <tr
                      key={clave || '__sin_tecnico__'}
                      onClick={() => setTecnicoFiltro(activo ? null : clave)}
                      className={`cursor-pointer transition-colors ${activo ? 'bg-blue-50' : 'hover:bg-gray-50/50'}`}
                    >
                      <td className="px-5 py-3">
                        {t.tecnico_id ? (
                          <Link href={`/admin/tecnicos/${t.tecnico_id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold text-slate-900 hover:underline">
                            {t.tecnico_nombre}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-orange-700">Sin técnico (nadie aceptó)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-slate-700">{t.reservas}</td>
                      <td className={`px-5 py-3 text-right text-sm font-semibold ${sinAtender > 0 ? 'text-red-700' : 'text-slate-400'}`}>{sinAtender}</td>
                      <td className={`px-5 py-3 text-right text-sm font-semibold ${t.tarde > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{t.tarde}</td>
                      <td className="px-5 py-3 text-right text-sm text-emerald-700">{t.cumplidas}</td>
                      <td className={`px-5 py-3 text-right text-sm font-semibold ${t.cumplimiento_pct !== null && t.cumplimiento_pct < 0.8 ? 'text-red-700' : 'text-slate-700'}`}>{pct(t.cumplimiento_pct)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalle */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {VISTAS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVista(v.value)}
            title={v.title}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
              vista === v.value ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {v.label}
          </button>
        ))}
        {data && (
          <span className="text-xs text-gray-400 ml-auto">
            {items.length} reserva{items.length !== 1 ? 's' : ''}{tecnicoFiltroNombre ? ` · ${tecnicoFiltroNombre}` : ''}
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando && !data ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">
            {vista === 'todas' ? 'No hay reservas vencidas en este período' : 'Sin incumplimientos en este período 🎉'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Reserva</th>
                  <th className="px-5 py-3">Resultado</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Equipo</th>
                  <th className="px-5 py-3">Técnico</th>
                  <th className="px-5 py-3">Estado actual</th>
                  <th className="px-5 py-3 sticky right-0 bg-gray-50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((it) => {
                  const franja = franjaDe(it.horario_confirmado)
                  return (
                    <tr key={it.solicitud_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <p className="text-sm font-semibold text-slate-900">{fechaCorta(it.dia_reserva)}</p>
                        <p className="text-xs text-gray-400">
                          {franja ?? '—'}
                          {it.reagendamientos > 0 && <span className="ml-1 text-amber-600" title="Veces reagendada por el cliente">· {it.reagendamientos}× reagendada</span>}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${RESULTADO_ESTILOS[it.resultado]}`}>
                          {RESULTADO_LABELS[it.resultado]}
                        </span>
                        {(it.resultado === 'vencida' || it.resultado === 'sin_tecnico') && (
                          <p className="text-xs text-red-600 mt-1">
                            hace {it.dias_retraso} día{it.dias_retraso !== 1 ? 's' : ''} · sigue abierta
                          </p>
                        )}
                        {it.resultado === 'tarde' && it.dia_atencion && (
                          <p className="text-xs text-amber-700 mt-1">
                            +{it.dias_retraso} día{it.dias_retraso !== 1 ? 's' : ''} → {fechaCorta(it.dia_atencion)}
                            {it.evidencia && <span className="text-gray-400"> ({EVIDENCIA_LABELS[it.evidencia]})</span>}
                          </p>
                        )}
                        {it.resultado === 'cumplida' && it.evidencia && (
                          <p className="text-xs text-gray-400 mt-1">{EVIDENCIA_LABELS[it.evidencia]}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-slate-900">{it.cliente_nombre}</p>
                        <p className="text-xs text-gray-400">{it.ciudad ?? '—'}{it.cliente_telefono ? ` · ${it.cliente_telefono}` : ''}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-sm text-gray-700">{it.equipo}</p>
                        <p className="text-xs text-gray-400">
                          {it.es_garantia ? '🛡️ Garantía' : 'Particular'}
                          {it.numero_orden ? ` · ${it.numero_orden}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        {it.tecnico_nombre ? (
                          <p className="text-sm text-green-700 font-medium">{it.tecnico_nombre}</p>
                        ) : (
                          <span className="text-xs text-orange-600 font-semibold">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ESTADO_ESTILOS[it.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ESTADO_LABELS[it.estado] ?? it.estado}
                        </span>
                      </td>
                      <td className="px-5 py-3 sticky right-0 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)]">
                        <Link
                          href={`/admin/solicitudes/${it.solicitud_id}`}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                        >
                          Ver detalle →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
