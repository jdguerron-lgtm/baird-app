'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fraseAcompanantes } from '@/lib/utils/equipo'

/**
 * "¿Quién va a este servicio?" — card del servicio en el portal del técnico
 * (2026-10-13). Muestra los auxiliares VERIFICADOS del técnico como chips
 * que se activan/desactivan; cada cambio guarda al instante vía
 * PATCH /api/tecnico/equipo-servicio y le avisa al cliente (plantilla
 * `equipo_servicio_actualizado_v1`, best-effort).
 *
 * Solo se renderiza si el técnico tiene al menos un auxiliar (verificado o
 * no): sin equipo, la card queda como siempre.
 */

export interface AuxiliarSelector {
  id: string
  nombre_completo: string
  estado_verificacion: 'pendiente' | 'verificado' | 'rechazado'
  activo: boolean
}

interface Props {
  token: string
  solicitudId: string
  auxiliares: AuxiliarSelector[]
  /** auxiliares_ids actuales del servicio (null = nunca definido). */
  seleccionados: string[] | null
  onChange?: (ids: string[]) => void
}

export default function EquipoServicioSelector({ token, solicitudId, auxiliares, seleccionados, onChange }: Props) {
  const [ids, setIds] = useState<string[]>(seleccionados ?? [])
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const activos = auxiliares.filter(a => a.activo)
  if (activos.length === 0) return null
  const verificados = activos.filter(a => a.estado_verificacion === 'verificado')
  const pendientes = activos.length - verificados.length

  const toggle = async (id: string) => {
    const nuevos = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    setGuardando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/tecnico/equipo-servicio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken: token, solicitudId, auxiliaresIds: nuevos }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setIds(nuevos)
      onChange?.(nuevos)
      if (body.cambio) {
        setAviso(body.cliente_notificado
          ? '✅ Guardado. Le avisamos al cliente quién lo visita.'
          : '✅ Guardado. El cliente lo ve en su portal (el WhatsApp no salió: ' + (body.whatsapp_error ?? 'sin ventana') + ').')
      }
    } catch (err) {
      setAviso('⚠️ ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setGuardando(false)
    }
  }

  const elegidos = verificados.filter(a => ids.includes(a.id))

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">👥 ¿Quién va a este servicio?</p>
        <Link href={`/tecnico/${token}/equipo`} className="text-[11px] text-blue-700 underline shrink-0">Mi equipo</Link>
      </div>
      {verificados.length === 0 ? (
        <p className="text-xs text-amber-700">
          Tus auxiliares aún no están verificados por Baird: por ahora el cliente solo te ve a ti.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {verificados.map(a => {
              const on = ids.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={guardando}
                  aria-pressed={on}
                  onClick={() => toggle(a.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                    on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                  }`}
                >
                  {on ? '✓ ' : '+ '}{a.nombre_completo.split(' ').slice(0, 2).join(' ')}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {elegidos.length === 0 ? 'Vas solo a este servicio.' : fraseAcompanantes(elegidos) + '.'}
            {pendientes > 0 && ` ${pendientes} auxiliar(es) pendiente(s) de verificación no aparecen aquí.`}
          </p>
        </>
      )}
      {aviso && <p className="text-[11px] text-slate-600 mt-1">{aviso}</p>}
    </div>
  )
}
