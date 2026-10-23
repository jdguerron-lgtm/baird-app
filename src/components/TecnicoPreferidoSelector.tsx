'use client'

import { useEffect, useState } from 'react'
import type { TecnicoElegible } from '@/lib/services/tecnicos-elegibles.service'

interface Props {
  ciudad: string
  tipoEquipo: string
  /** id del técnico elegido o '' = sin preferencia */
  value: string
  onChange: (tecnicoId: string) => void
}

/**
 * Selector opcional de "técnico de preferencia" en /solicitar (2026-10-15).
 *
 * Consulta GET /api/tecnicos-disponibles con la ciudad + tipo de equipo que
 * el cliente ya escribió (debounce de 400 ms). Si no hay técnicos elegibles
 * para esa combinación, el bloque no se muestra.
 *
 * Desde 2026-10-22 el bloque arranca con el check "Sin preferencia de
 * técnico" MARCADO y las tarjetas de técnicos ocultas: la gran mayoría de
 * clientes no tiene técnico propio y el listado con fotos distraía en un
 * formulario ya largo (0 usos en 31 solicitudes desde el 16/10). Solo al
 * desmarcar el check se despliegan los técnicos; volver a marcarlo limpia la
 * elección ('' = oferta abierta a todos como siempre).
 *
 * Es solo UX: el guard real del id está en POST /api/solicitar
 * (resolverTecnicoPreferido) y en notificarTecnicos.
 */
export function TecnicoPreferidoSelector({ ciudad, tipoEquipo, value, onChange }: Props) {
  const [tecnicos, setTecnicos] = useState<TecnicoElegible[]>([])
  const [cargando, setCargando] = useState(false)
  // Check "Sin preferencia de técnico": marcado por defecto. Si llega un
  // value desde afuera (p.ej. preselección futura por enlace), se desmarca
  // solo para que el cliente vea a quién eligió.
  const [sinPreferencia, setSinPreferencia] = useState(true)

  const ciudadLimpia = ciudad.trim()

  useEffect(() => {
    if (ciudadLimpia.length < 3 || !tipoEquipo) {
      setTecnicos([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setCargando(true)
      try {
        const qs = new URLSearchParams({ ciudad: ciudadLimpia, tipo_equipo: tipoEquipo })
        const res = await fetch(`/api/tecnicos-disponibles?${qs.toString()}`, { signal: controller.signal })
        const body = await res.json().catch(() => ({}))
        setTecnicos(Array.isArray(body?.tecnicos) ? (body.tecnicos as TecnicoElegible[]) : [])
      } catch {
        if (!controller.signal.aborted) setTecnicos([])
      } finally {
        if (!controller.signal.aborted) setCargando(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [ciudadLimpia, tipoEquipo])

  // Si la lista cambió y el elegido ya no está (cambió ciudad o equipo),
  // volver a "sin preferencia" para no mandar un id que el servidor descartará.
  useEffect(() => {
    if (value && !cargando && tecnicos.length > 0 && !tecnicos.some(t => t.id === value)) {
      onChange('')
    }
    if (value && !cargando && tecnicos.length === 0 && ciudadLimpia.length >= 3) {
      onChange('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecnicos, cargando])

  // Un value no vacío siempre implica que el cliente SÍ tiene preferencia.
  useEffect(() => {
    if (value) setSinPreferencia(false)
  }, [value])

  if (tecnicos.length === 0) return null

  const elegido = tecnicos.find(t => t.id === value) ?? null

  const toggleSinPreferencia = (checked: boolean) => {
    setSinPreferencia(checked)
    if (checked && value) onChange('')
  }

  return (
    <div className={`rounded-xl border p-4 ${sinPreferencia ? 'border-gray-200 bg-white' : 'border-sky-200 bg-sky-50'}`}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={sinPreferencia}
          onChange={e => toggleSinPreferencia(e.target.checked)}
          className="mt-0.5 w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 shrink-0"
        />
        <span>
          <span className="block text-sm font-semibold text-gray-900">Sin preferencia de técnico</span>
          <span className="block text-xs text-gray-500">
            Tu solicitud llega a todos los técnicos verificados de tu zona y el primero en aceptar te atiende.
            Desmarca si ya conoces a uno de nuestros técnicos y prefieres que la reciba él primero.
          </span>
        </span>
      </label>

      {!sinPreferencia && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">
            Técnicos verificados que atienden {tipoEquipo.toLowerCase()} en {ciudadLimpia}:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tecnicos.map(t => {
              const activo = t.id === value
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange(activo ? '' : t.id)}
                  aria-pressed={activo}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                    activo ? 'border-sky-500 bg-white' : 'border-gray-200 bg-white hover:border-sky-300'
                  }`}
                >
                  {t.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.foto_url}
                      alt={t.nombre}
                      className="w-10 h-10 rounded-full object-cover shrink-0 bg-gray-100"
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold shrink-0" aria-hidden>
                      {t.nombre.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{t.nombre}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {t.especialidades.length > 0 ? t.especialidades.join(' · ') : 'Técnico verificado'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {elegido ? (
            <p className="text-xs text-sky-800 mt-3">
              ✅ Le enviaremos tu solicitud primero a <strong>{elegido.nombre}</strong>. Si no responde, nuestro equipo la
              abre a los demás técnicos.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-3">
              Elige uno. Si no eliges ninguno, la solicitud sale a todos como siempre.
            </p>
          )}
        </div>
      )}
      {cargando && <p className="text-[11px] text-gray-400 mt-2">Actualizando técnicos disponibles…</p>}
    </div>
  )
}
