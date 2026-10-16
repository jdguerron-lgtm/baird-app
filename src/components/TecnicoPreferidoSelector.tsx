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
 * el cliente ya escribió (debounce de 400 ms) y muestra tarjetas con foto y
 * nombre corto. Siempre existe la opción "Sin preferencia" (default): la
 * oferta sale abierta a todos como hasta ahora. Si no hay técnicos
 * elegibles para esa combinación, el bloque no se muestra.
 *
 * Es solo UX: el guard real del id está en POST /api/solicitar
 * (resolverTecnicoPreferido) y en notificarTecnicos.
 */
export function TecnicoPreferidoSelector({ ciudad, tipoEquipo, value, onChange }: Props) {
  const [tecnicos, setTecnicos] = useState<TecnicoElegible[]>([])
  const [cargando, setCargando] = useState(false)

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

  if (tecnicos.length === 0) return null

  const elegido = tecnicos.find(t => t.id === value) ?? null

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
      <p className="font-semibold text-sm text-gray-900">
        ¿Prefieres un técnico en particular? <span className="font-normal text-gray-500">(opcional)</span>
      </p>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Estos técnicos verificados atienden {tipoEquipo.toLowerCase()} en {ciudadLimpia}. Si eliges uno, le
        enviamos tu solicitud primero a él; si no elige ninguno, la reciben todos y el primero en aceptar te atiende.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          aria-pressed={!value}
          className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
            !value ? 'border-sky-500 bg-white' : 'border-gray-200 bg-white hover:border-sky-300'
          }`}
        >
          <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0" aria-hidden>
            👥
          </span>
          <span>
            <span className="block text-sm font-semibold text-gray-900">Sin preferencia</span>
            <span className="block text-xs text-gray-500">El primero disponible</span>
          </span>
        </button>

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

      {elegido && (
        <p className="text-xs text-sky-800 mt-3">
          ✅ Le enviaremos tu solicitud primero a <strong>{elegido.nombre}</strong>. Si no responde, nuestro equipo la
          abre a los demás técnicos.
        </p>
      )}
      {cargando && <p className="text-[11px] text-gray-400 mt-2">Actualizando técnicos disponibles…</p>}
    </div>
  )
}
