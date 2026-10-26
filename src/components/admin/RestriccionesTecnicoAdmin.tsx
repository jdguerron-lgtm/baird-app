'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRolAdmin } from '@/components/admin/RolAdminContext'

/**
 * "🚫 Restricciones y penalización" en /admin/tecnicos/[id] (2026-10-26).
 * - Bloqueo manual: no recibe ofertas de garantía y/o de particulares
 *   (posgarantía). Tampoco aparece en el selector del cliente ni en el cambio
 *   manual de técnico para ese flujo.
 * - Penalización: incumplimientos recientes × minutos de espera en las ofertas
 *   (config en /admin/reparto).
 */
interface Detalle { solicitud_id: string; motivo: 'vencida' | 'tarde' | 'liberado_admin' | 'cambiado_admin' }
interface Datos {
  disponible: boolean
  bloqueos: { garantia: boolean; particular: boolean; nota: string | null }
  penalizacion: {
    activa: boolean
    minutosPorIncumplimiento: number
    dias: number
    maxMinutos: number
    incumplimientos: number
    minutos: number
    detalle: Detalle[]
  }
}

const MOTIVO_LABEL: Record<Detalle['motivo'], string> = {
  vencida: 'Visita no atendida',
  tarde: 'Atendida días después',
  liberado_admin: 'Liberado por el equipo',
  cambiado_admin: 'Cambiado por el equipo',
}

export default function RestriccionesTecnicoAdmin({ tecnicoId }: { tecnicoId: string }) {
  const { soloLectura } = useRolAdmin()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [garantia, setGarantia] = useState(false)
  const [particular, setParticular] = useState(false)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null

  const cargar = useCallback(async () => {
    try {
      const t = await token()
      if (!t) return
      const res = await fetch(`/api/admin/tecnicos/restricciones?tecnicoId=${encodeURIComponent(tecnicoId)}`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'No se pudo cargar.'); return }
      const d = body as Datos
      setDatos(d)
      setGarantia(d.bloqueos.garantia)
      setParticular(d.bloqueos.particular)
      setNota(d.bloqueos.nota ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión.')
    }
  }, [tecnicoId])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setGuardando(true)
    setMensaje(null)
    try {
      const t = await token()
      if (!t) { setMensaje({ ok: false, texto: 'Sesión expirada.' }); return }
      const res = await fetch('/api/admin/tecnicos/restricciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ tecnicoId, garantia, particular, nota: nota.trim() || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMensaje({ ok: false, texto: body.error || 'No se pudo guardar.' }); return }
      setDatos(prev => (prev ? { ...prev, bloqueos: body.bloqueos } : prev))
      setMensaje({ ok: true, texto: 'Guardado.' })
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : 'Error de conexión.' })
    } finally {
      setGuardando(false)
    }
  }

  const cambios = !!datos && (garantia !== datos.bloqueos.garantia || particular !== datos.bloqueos.particular
    || (nota.trim() || null) !== (datos.bloqueos.nota ?? null))
  const pen = datos?.penalizacion

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">🚫 Restricciones y penalización</h2>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!datos && !error && <p className="text-xs text-gray-400">Cargando…</p>}
      {datos && (
        <>
          {!datos.disponible && (
            <p className="mb-2 text-[11px] text-amber-700">
              Falta aplicar la migración <code>20261026_restricciones_penalizacion_tecnicos.sql</code>: por ahora no se puede bloquear.
            </p>
          )}
          <p className="text-xs text-gray-400 mb-2">
            Un técnico bloqueado no recibe ofertas de ese tipo de servicio, no sale en el selector del cliente y no se le puede asignar a mano.
          </p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={garantia} disabled={soloLectura || !datos.disponible} onChange={e => setGarantia(e.target.checked)} />
              No recibe servicios de <span className="font-semibold">garantía</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={particular} disabled={soloLectura || !datos.disponible} onChange={e => setParticular(e.target.checked)} />
              No recibe servicios <span className="font-semibold">particulares (posgarantía)</span>
            </label>
          </div>
          {(garantia || particular) && (
            <input
              type="text"
              value={nota}
              onChange={e => setNota(e.target.value)}
              disabled={soloLectura || !datos.disponible}
              maxLength={300}
              placeholder="Motivo del bloqueo (opcional)"
              className="mt-2 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-slate-900"
            />
          )}
          {!soloLectura && datos.disponible && (
            <button
              type="button"
              disabled={!cambios || guardando}
              onClick={guardar}
              className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Guardar restricciones'}
            </button>
          )}
          {mensaje && <p className={`mt-1 text-xs ${mensaje.ok ? 'text-emerald-700' : 'text-red-600'}`}>{mensaje.texto}</p>}

          {pen && (
            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-sm text-slate-900">
                <span className="font-semibold">{pen.incumplimientos}</span> incumplimiento{pen.incumplimientos === 1 ? '' : 's'} en los últimos {pen.dias} días
                {pen.incumplimientos > 0 && (
                  <> → recibe las ofertas <span className="font-semibold">{pen.minutos} min</span> después que los demás</>
                )}
                {!pen.activa && pen.incumplimientos > 0 && <span className="text-amber-700"> (penalización apagada)</span>}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {pen.minutosPorIncumplimiento} min por incumplimiento, máximo {pen.maxMinutos} min. Se configura en Reparto.
              </p>
              {pen.detalle.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {pen.detalle.map(d => (
                    <li key={d.solicitud_id} className="text-xs text-slate-700">
                      <a href={`/admin/solicitudes/${d.solicitud_id}`} className="text-blue-600 hover:underline">
                        {d.solicitud_id.slice(0, 8)}
                      </a>{' '}· {MOTIVO_LABEL[d.motivo]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
