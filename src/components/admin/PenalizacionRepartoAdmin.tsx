'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRolAdmin } from '@/components/admin/RolAdminContext'

/**
 * Bloque "⏱️ Penalización por incumplimiento" de /admin/reparto (2026-10-26).
 * Cada incumplimiento reciente del técnico = X minutos más de espera para
 * recibir las ofertas. Ver penalizacion.service.ts.
 */
interface Cfg { activa: boolean; minutosPorIncumplimiento: number; dias: number; maxMinutos: number }

export default function PenalizacionRepartoAdmin() {
  const { soloLectura } = useRolAdmin()
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [minutos, setMinutos] = useState('')
  const [dias, setDias] = useState('')
  const [maxMinutos, setMaxMinutos] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null

  const aplicar = (c: Cfg) => {
    setCfg(c)
    setMinutos(String(c.minutosPorIncumplimiento))
    setDias(String(c.dias))
    setMaxMinutos(String(c.maxMinutos))
  }

  const cargar = useCallback(async () => {
    const t = await token()
    if (!t) return
    const res = await fetch('/api/admin/reparto/penalizacion', { headers: { Authorization: `Bearer ${t}` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setMensaje({ ok: false, texto: body.error || 'No se pudo cargar.' }); return }
    setPendiente(body.migracionPendiente === true)
    aplicar(body.config as Cfg)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (cambios: Record<string, unknown>) => {
    setGuardando(true)
    setMensaje(null)
    try {
      const t = await token()
      if (!t) { setMensaje({ ok: false, texto: 'Sesión expirada.' }); return }
      const res = await fetch('/api/admin/reparto/penalizacion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(cambios),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMensaje({ ok: false, texto: body.error || 'No se pudo guardar.' }); return }
      aplicar(body.config as Cfg)
      setMensaje({ ok: true, texto: 'Guardado.' })
    } finally {
      setGuardando(false)
    }
  }

  if (!cfg) return null
  const bloqueado = soloLectura || pendiente || guardando

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">⏱️ Penalización por incumplimiento</h2>
          <p className="text-xs text-gray-500 mt-1">
            Por cada visita incumplida en los últimos {cfg.dias} días (no atendida, atendida días después, o técnico liberado / cambiado
            por el equipo), el técnico recibe las ofertas {cfg.minutosPorIncumplimiento} min después que los demás. &quot;No alcanzo&quot;
            avisado desde su portal no cuenta. La invitación dirigida y el técnico preferido por el cliente no se retrasan.
          </p>
          {pendiente && (
            <p className="text-xs text-amber-700 mt-1">Falta aplicar la migración 20261026_restricciones_penalizacion_tecnicos.sql.</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.activa}
          disabled={bloqueado}
          onClick={() => guardar({ activa: !cfg.activa })}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${cfg.activa ? 'bg-green-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${cfg.activa ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {([
          ['Minutos por incumplimiento', minutos, setMinutos],
          ['Días hacia atrás', dias, setDias],
          ['Tope de espera (min)', maxMinutos, setMaxMinutos],
        ] as Array<[string, string, (v: string) => void]>).map(([etiqueta, valor, set]) => (
          <label key={etiqueta} className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{etiqueta}</span>
            <input
              type="number"
              inputMode="numeric"
              value={valor}
              disabled={bloqueado}
              onChange={e => set(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${mensaje?.ok === false ? 'text-red-600' : 'text-emerald-700'}`}>{mensaje?.texto ?? ''}</p>
        {!soloLectura && (
          <button
            onClick={() => guardar({ minutos: Number(minutos), dias: Number(dias), maxMinutos: Number(maxMinutos) })}
            disabled={bloqueado}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </div>
    </div>
  )
}
