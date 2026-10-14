'use client'

import { useState } from 'react'
import Link from 'next/link'
import GestionarServicioLink from '@/components/ui/GestionarServicioLink'

interface Props {
  token: string
  receptor: string
  titular: string
  equipo: string
  esGarantia: boolean
  tecnico: string
  /** "Lo acompaña Juan Pérez (auxiliar)" o '' (equipo que visita, 2026-10-13). */
  acompanantes?: string
  aceptoAt: string | null
  clienteToken: string | null
}

function fechaLegible(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function ReceptorView({ token, receptor, titular, equipo, esGarantia, tecnico, acompanantes = '', aceptoAt, clienteToken }: Props) {
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState<string | null>(aceptoAt)
  const [error, setError] = useState('')

  const nombre = receptor.split(' ')[0]

  const aceptar = async () => {
    if (!acepta || enviando) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/receptor/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la aceptación')
      setListo(data.acepto_at ?? new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Listo, {nombre}!</h1>
            <p className="text-gray-600 mb-4">
              Desde ahora recibirás por WhatsApp los avisos del servicio de <strong>{equipo}</strong>
              {' '}a nombre de <strong>{titular}</strong>, en paralelo con el titular. Podrás aprobar los pasos del
              servicio y pagar si hace falta.
            </p>
            <p className="text-xs text-gray-400">Aceptaste el {fechaLegible(listo)}.</p>
            <GestionarServicioLink clienteToken={clienteToken} variant="inline" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">Baird Service</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Hola {nombre} 👋</h1>
          <p className="text-gray-700 mb-4">
            <strong>{titular}</strong> te designó como la persona que recibe al técnico <strong>{tecnico}</strong> para
            el servicio de <strong>{equipo}</strong>{esGarantia ? ' (garantía)' : ''}.
            {acompanantes && <> {acompanantes}, también verificado por Baird.</>}
          </p>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900 mb-5 space-y-1">
            <p className="font-semibold">Si aceptas, por este WhatsApp vas a recibir:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>El diagnóstico del técnico y el siguiente paso del servicio.</li>
              <li>La cotización o los avisos de repuestos, según el caso.</li>
              <li>Los links de pago y la confirmación final del servicio.</li>
            </ul>
            <p className="pt-1">
              Lo mismo que recibe {titular.split(' ')[0]}: cualquiera de los dos puede aprobar y pagar.
              Nunca pagues en efectivo al técnico.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={acepta}
              onChange={e => setAcepta(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              He leído y acepto los{' '}
              <Link href="/terminos" target="_blank" className="text-blue-600 underline">Términos y Condiciones</Link>
              {' '}y la{' '}
              <Link href="/politica-privacidad" target="_blank" className="text-blue-600 underline">Política de Privacidad</Link>
              {' '}de Baird Service, y autorizo que me escriban por WhatsApp sobre este servicio.
            </span>
          </label>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="button"
            onClick={aceptar}
            disabled={!acepta || enviando}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enviando ? 'Registrando…' : 'Aceptar y seguir el servicio'}
          </button>
          <p className="mt-3 text-xs text-gray-400 text-center">
            Si no aceptas, no recibirás más mensajes y el servicio sigue solo con {titular.split(' ')[0]}.
          </p>
        </div>
      </div>
    </main>
  )
}
