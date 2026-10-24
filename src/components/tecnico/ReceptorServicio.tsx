'use client'

import { useState } from 'react'
import { RELACIONES_RECEPTOR, validarReceptor, labelRelacionReceptor } from '@/lib/utils/receptor'

export interface ReceptorEstado {
  nombre: string
  telefono: string
  /** '' o null cuando el técnico no la indicó (opcional desde 2026-10-24). */
  relacion: string | null
  acepto: boolean
}

interface Props {
  solicitudId: string
  portalToken: string
  /** Nombre del titular (chip "👤 Nombre"). */
  clienteNombre: string
  /** Teléfono del titular — bloquea registrar el mismo número. */
  clienteTelefono?: string | null
  /** Receptor ya guardado en BD (si el técnico recargó la página). */
  inicial: ReceptorEstado | null
  onChange?: (receptor: ReceptorEstado | null) => void
}

/**
 * Bloque "¿Quién recibe el servicio?" (2026-10-13) al inicio del diagnóstico
 * y de "Completar servicio".
 *
 * Default: "El titular" (quien reservó) — un toque, nada que llenar. Con
 * "Otra persona" se piden nombre + celular; la relación con el titular es
 * opcional y no hay casilla de consentimiento (2026-10-24, pedido de Juan:
 * el consentimiento real lo da la propia persona al aceptar T&C + privacidad
 * desde el WhatsApp que recibe, receptor_bienvenida_v1 → /receptor/{token}).
 * El bloque es compacto para no estorbar al comienzo del formulario.
 *
 * Se GUARDA DE INMEDIATO vía POST /api/tecnico/receptor; desde ahí ambas
 * personas siguen el flujo. El formulario principal no depende de este
 * bloque: si falla, el diagnóstico sigue igual.
 */
export default function ReceptorServicio({ solicitudId, portalToken, clienteNombre, clienteTelefono, inicial, onChange }: Props) {
  const [modo, setModo] = useState<'titular' | 'otra'>(inicial ? 'otra' : 'titular')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [telefono, setTelefono] = useState(inicial?.telefono ? inicial.telefono.replace(/^57/, '') : '')
  const [relacion, setRelacion] = useState(inicial?.relacion ?? '')
  const [guardado, setGuardado] = useState<ReceptorEstado | null>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const titularPrimerNombre = clienteNombre.split(' ')[0]
  const haCambiado = !guardado
    || guardado.nombre !== nombre.trim()
    || guardado.telefono.replace(/^57/, '') !== telefono.replace(/\D/g, '')
    || (guardado.relacion ?? '') !== relacion

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/tecnico/receptor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitudId, portalToken, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data as { receptor: ReceptorEstado | null; whatsapp_sent?: boolean | null; whatsapp_error?: string | null; sin_cambios?: boolean }
  }

  /** Vuelve a "recibe el titular": quita el receptor guardado (si lo hay) y cierra los campos. */
  const elegirTitular = async () => {
    setError(null)
    setAviso(null)
    if (guardado) {
      if (guardado.acepto) {
        setError('Esta persona ya aceptó seguir el servicio. Para cambiarla, avisa al equipo Baird.')
        return
      }
      setGuardando(true)
      try {
        await post({ quitar: true })
        setGuardado(null)
        onChange?.(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo quitar el receptor')
        setGuardando(false)
        return
      }
      setGuardando(false)
    }
    setNombre('')
    setTelefono('')
    setRelacion('')
    setModo('titular')
  }

  const guardar = async () => {
    setError(null)
    setAviso(null)
    const v = validarReceptor({ nombre, telefono, relacion }, clienteTelefono)
    if (!v.ok) {
      setError(v.error)
      return
    }
    setGuardando(true)
    try {
      const data = await post({ receptor: v.receptor })
      if (data.receptor) {
        setGuardado(data.receptor)
        onChange?.(data.receptor)
      }
      if (data.sin_cambios) {
        setAviso('Sin cambios: ya estaba registrado.')
      } else if (data.whatsapp_sent === true) {
        setAviso(`Le enviamos a ${v.receptor.nombre.split(' ')[0]} el WhatsApp para aceptar y seguir el servicio.`)
      } else if (data.whatsapp_sent === false) {
        setAviso(`Quedó registrado, pero el WhatsApp no salió (${data.whatsapp_error ?? 'error'}). El equipo Baird puede reenviarlo desde el admin.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const chipBase = 'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors'
  const chipOn = 'bg-blue-600 border-blue-600 text-white'
  const chipOff = 'bg-white border-gray-200 text-slate-700 hover:border-blue-300'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">¿Quién recibe el servicio?</h2>
          <p className="text-[11px] text-gray-500">Si no es quien reservó, regístralo y ambos siguen el servicio por WhatsApp.</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={elegirTitular}
            disabled={guardando}
            className={`${chipBase} ${modo === 'titular' ? chipOn : chipOff}`}
          >
            👤 {titularPrimerNombre}
          </button>
          <button
            type="button"
            onClick={() => { setModo('otra'); setError(null) }}
            disabled={guardando}
            className={`${chipBase} ${modo === 'otra' ? chipOn : chipOff}`}
          >
            🏠 Otra persona
          </button>
        </div>
      </div>

      {modo === 'otra' && (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Nombre de quien recibe *</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Marta Rodríguez"
                maxLength={80}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Celular (WhatsApp) *</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 shrink-0">+57</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="3XX XXX XXXX"
                  maxLength={14}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Relación con el titular <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {RELACIONES_RECEPTOR.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRelacion(prev => (prev === r.value ? '' : r.value))}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${relacion === r.value ? chipOn : chipOff}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {guardado && !haCambiado && (
            <div className={`rounded-lg px-3 py-2 text-xs ${guardado.acepto ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
              {guardado.acepto
                ? `✅ ${guardado.nombre} ya aceptó y recibe los avisos del servicio.`
                : `⏳ ${guardado.nombre} (+${guardado.telefono}${guardado.relacion ? `, ${labelRelacionReceptor(guardado.relacion)}` : ''}) recibió el WhatsApp y aún no acepta. Pídele que toque el botón del mensaje.`}
            </div>
          )}

          {(haCambiado || !guardado) && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : guardado ? 'Actualizar y reenviar aviso' : 'Guardar y enviar aviso por WhatsApp'}
            </button>
          )}
          <p className="text-[11px] text-gray-500">Baird le escribirá por WhatsApp a esa persona; ella acepta los términos desde su celular.</p>

          {aviso && <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{aviso}</p>}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}
