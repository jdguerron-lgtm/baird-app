'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * "🔁 Cambiar técnico" en la ficha admin (2026-10-26). El admin elige al
 * técnico que debe ir y se le asigna directo (POST /api/admin/cambiar-tecnico).
 * Lista primero a los candidatos (cubren ciudad + tipo de equipo) y luego al
 * resto de verificados. Plegado por defecto: un botón.
 */
interface Opcion { id: string; nombre: string; detalle?: string }

export default function CambiarTecnicoAdmin(props: {
  solicitudId: string
  tecnicoActualId: string | null
  tecnicoActualNombre?: string | null
}) {
  const { solicitudId, tecnicoActualId, tecnicoActualNombre } = props
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [candidatos, setCandidatos] = useState<Opcion[]>([])
  const [otros, setOtros] = useState<Opcion[]>([])
  const [elegido, setElegido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [notificar, setNotificar] = useState(true)
  const [cuentaIncumplimiento, setCuentaIncumplimiento] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null

  const abrir = async () => {
    setAbierto(true)
    setResultado(null)
    if (candidatos.length || otros.length) return
    setCargando(true)
    try {
      const t = await token()
      if (!t) { setResultado({ ok: false, mensaje: 'Sesión expirada. Inicia sesión de nuevo.' }); return }
      const res = await fetch(`/api/admin/candidatos-oferta?solicitudId=${encodeURIComponent(solicitudId)}&todos=1`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setResultado({ ok: false, mensaje: body.error || 'No se pudo cargar la lista de técnicos.' }); return }
      const sinActual = (o: Opcion) => o.id !== tecnicoActualId
      setCandidatos(((body.candidatos ?? []) as Array<{ id: string; nombre: string; especialidades?: string[] }>)
        .map(c => ({ id: c.id, nombre: c.nombre, detalle: (c.especialidades ?? []).join(', ') }))
        .filter(sinActual))
      setOtros(((body.otros ?? []) as Array<{ id: string; nombre: string; ciudad: string | null }>)
        .map(o => ({ id: o.id, nombre: o.nombre, detalle: o.ciudad ?? undefined }))
        .filter(sinActual))
    } catch (e) {
      setResultado({ ok: false, mensaje: e instanceof Error ? e.message : 'Error de conexión.' })
    } finally {
      setCargando(false)
    }
  }

  const enviar = async (forzarCupo = false) => {
    if (!elegido) return
    setEnviando(true)
    setResultado(null)
    try {
      const t = await token()
      if (!t) { setResultado({ ok: false, mensaje: 'Sesión expirada. Inicia sesión de nuevo.' }); return }
      const res = await fetch('/api/admin/cambiar-tecnico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          solicitudId,
          tecnicoId: elegido,
          motivo: motivo.trim() || undefined,
          notificar,
          forzarCupo,
          cuentaIncumplimiento: !!tecnicoActualId && cuentaIncumplimiento,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.codigo === 'cupo_lleno' && !forzarCupo) {
          if (window.confirm(`${data.error}\n\n¿Asignarlo de todas formas?`)) {
            setEnviando(false)
            return enviar(true)
          }
        }
        setResultado({ ok: false, mensaje: data.error || 'No se pudo cambiar el técnico.' })
        return
      }
      setResultado({
        ok: true,
        mensaje: `Listo: ${data.tecnicoNuevoNombre} quedó asignado${notificar ? ' y se le avisó por WhatsApp (también al cliente)' : ' (sin avisos)'}. Recargando…`,
      })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setResultado({ ok: false, mensaje: e instanceof Error ? e.message : 'Error de conexión.' })
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
        title="Asignar directamente a otro técnico (cuando la programación quedó mal)"
      >
        🔁 {tecnicoActualId ? 'Cambiar técnico' : 'Asignar técnico manualmente'}
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-800">
        {tecnicoActualId ? `Cambiar a ${tecnicoActualNombre ?? 'el técnico actual'} por:` : 'Asignar a:'}
      </p>
      {cargando ? (
        <p className="text-xs text-gray-500">Cargando técnicos…</p>
      ) : (
        <select
          value={elegido}
          onChange={e => setElegido(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-slate-900"
        >
          <option value="">— Elige un técnico —</option>
          {candidatos.length > 0 && (
            <optgroup label="Cubren esta ciudad y equipo">
              {candidatos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.detalle ? ` · ${c.detalle}` : ''}</option>
              ))}
            </optgroup>
          )}
          {otros.length > 0 && (
            <optgroup label="Otros técnicos verificados">
              {otros.map(o => (
                <option key={o.id} value={o.id}>{o.nombre}{o.detalle ? ` · ${o.detalle}` : ''}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      <input
        type="text"
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        maxLength={300}
        placeholder="Motivo (opcional, queda en el historial)"
        className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-slate-900"
      />
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={notificar} onChange={e => setNotificar(e.target.checked)} />
        Avisar por WhatsApp al técnico nuevo, al anterior y al cliente
      </label>
      {tecnicoActualId && (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={cuentaIncumplimiento} onChange={e => setCuentaIncumplimiento(e.target.checked)} />
          Contar como incumplimiento de {tecnicoActualNombre ?? 'el técnico actual'} (le retrasa las próximas ofertas)
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!elegido || enviando}
          onClick={() => enviar(false)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enviando ? 'Asignando…' : 'Asignar'}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => setAbierto(false)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
      {resultado && (
        <p className={`text-xs ${resultado.ok ? 'text-emerald-700' : 'text-red-600'}`}>{resultado.mensaje}</p>
      )}
    </div>
  )
}
