'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import DetalleClienteOrdenes, { cargarDetalleCliente } from '@/components/admin/DetalleClienteOrdenes'

/**
 * Aviso en la ficha de solicitud (2026-10-28): si el mismo teléfono tiene otra
 * orden abierta del mismo equipo, o con el mismo número de orden, lo dice
 * arriba y deja ver / cancelar el duplicado sin salir de la ficha. Si no hay
 * nada, no pinta nada (ni siquiera mientras carga).
 */
export default function AvisoDuplicadosCliente({
  solicitudId,
  telefono,
  onCambio,
}: {
  solicitudId: string
  telefono: string | null | undefined
  onCambio?: () => void
}) {
  const [duplicados, setDuplicados] = useState(0)
  const [otrasActivas, setOtrasActivas] = useState(0)
  const [abierto, setAbierto] = useState(false)

  const revisar = useCallback(async () => {
    if (!telefono) return
    try {
      const d = await cargarDetalleCliente(telefono)
      const propia = d.solicitudes.find((s) => s.id === solicitudId)
      setDuplicados(propia?.posibles_duplicados.length ?? 0)
      setOtrasActivas(Math.max((d.cliente?.activas ?? 0) - 1, 0))
    } catch {
      // El aviso es auxiliar: si falla, la ficha sigue igual.
    }
  }, [solicitudId, telefono])

  useEffect(() => {
    // Fetch al montar; los setState ocurren tras el await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    revisar()
  }, [revisar])

  if (!telefono || duplicados === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-amber-900">
          🔁 <b>Posible duplicado:</b> este cliente tiene {duplicados === 1 ? 'otra orden' : `${duplicados} órdenes`} del mismo equipo o
          con el mismo número de orden{otrasActivas > 0 ? ` (${otrasActivas} ${otrasActivas === 1 ? 'abierta' : 'abiertas'} además de esta)` : ''}. Revisa antes de
          agendar o reasignar, para no confundir al cliente ni al técnico.
        </p>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="text-xs font-medium text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 bg-white hover:bg-amber-100"
          >
            {abierto ? 'Ocultar órdenes' : 'Ver órdenes del cliente'}
          </button>
          <Link
            href={`/admin/clientes?telefono=${encodeURIComponent(telefono)}`}
            className="text-xs font-medium text-amber-900 underline px-1 py-1"
          >
            Ir a Clientes
          </Link>
        </div>
      </div>
      {abierto && (
        <div className="mt-3">
          <DetalleClienteOrdenes
            telefono={telefono}
            resaltarId={solicitudId}
            onCambio={() => {
              revisar()
              onCambio?.()
            }}
          />
        </div>
      )}
    </div>
  )
}
