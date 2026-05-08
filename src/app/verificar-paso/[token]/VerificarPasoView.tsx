'use client'

import { useState } from 'react'
import Link from 'next/link'
import GestionarServicioLink from '@/components/ui/GestionarServicioLink'

interface Props {
  token: string
  cliente: string
  equipo: string
  tecnico: string
  diagnostico: string
  siguientePaso: string
  accion: string
  repuestoSku: string | null
  repuestoDescripcion: string | null
  yaResuelto: boolean
  decisionPrevia: 'aprobado' | 'rechazado' | null
  clienteToken?: string | null
}

const ICONOS: Record<string, string> = {
  reparar: '🔧',
  esperar_repuesto: '📦',
  no_reparable: '⚠️',
  negativa_cliente: '🚫',
}

const TITULOS: Record<string, string> = {
  reparar: 'Proceder con la reparación',
  esperar_repuesto: 'Esperar repuesto',
  no_reparable: 'Equipo no reparable',
  negativa_cliente: 'Cierre por decisión del cliente',
}

export default function VerificarPasoView({
  token, cliente, equipo, tecnico, diagnostico,
  siguientePaso, accion, repuestoSku, repuestoDescripcion,
  yaResuelto, decisionPrevia, clienteToken,
}: Props) {
  const [mostrandoRechazo, setMostrandoRechazo] = useState(false)
  const [comentarioRechazo, setComentarioRechazo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'aprobado' | 'rechazado' | null>(null)
  const [error, setError] = useState('')

  const nombreCliente = cliente.split(' ')[0]
  const icono = ICONOS[siguientePaso] ?? '📋'
  const titulo = TITULOS[siguientePaso] ?? 'Siguiente paso'

  if (yaResuelto || resultado) {
    const dec = resultado ?? decisionPrevia
    const aprobado = dec === 'aprobado'
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="text-5xl mb-4">{aprobado ? '✅' : '⚠️'}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {aprobado ? 'Aprobado' : 'Rechazado'}
            </h1>
            <p className="text-gray-600">
              {aprobado
                ? `Aprobaste la acción "${titulo.toLowerCase()}". El técnico fue notificado y procederá según lo acordado.`
                : 'Registramos tu rechazo. La solicitud quedó en disputa — el equipo de Baird Service se pondrá en contacto contigo pronto.'}
            </p>
          </div>
          <GestionarServicioLink clienteToken={clienteToken} />
        </div>
      </main>
    )
  }

  async function decidir(decision: 'aprobado' | 'rechazado') {
    if (decision === 'rechazado' && !comentarioRechazo.trim()) {
      setError('Por favor cuéntanos brevemente por qué rechazas')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/verificar-paso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          decision,
          comentario: decision === 'rechazado' ? comentarioRechazo.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error procesando')
      setResultado(decision)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Hola {nombreCliente} 👋</h1>
          <p className="text-gray-600 text-sm">
            El técnico <strong>{tecnico}</strong> terminó el diagnóstico de tu <strong>{equipo}</strong>.
            Necesitamos tu confirmación antes de continuar.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <h2 className="text-xs uppercase tracking-wide font-bold text-gray-500 mb-2">Diagnóstico técnico</h2>
          <p className="text-gray-800 leading-relaxed">{diagnostico || 'Sin descripción'}</p>
        </div>

        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-6 shadow-lg">
          <h2 className="text-xs uppercase tracking-wide font-bold text-blue-700 mb-2">Acción propuesta</h2>
          <div className="flex items-start gap-3">
            <span className="text-3xl">{icono}</span>
            <div>
              <p className="font-bold text-blue-900 mb-1">{titulo}</p>
              <p className="text-blue-800 text-sm leading-relaxed">{accion}</p>
              {repuestoSku && (
                <div className="mt-3 bg-white rounded-lg p-3 border border-blue-200">
                  <p className="text-xs font-bold text-blue-700 mb-1">Detalle del repuesto</p>
                  <p className="text-sm text-blue-900 font-mono">SKU: {repuestoSku}</p>
                  <p className="text-sm text-blue-900">{repuestoDescripcion}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-5 text-sm text-amber-900">
          <p className="font-bold mb-2">⚠️ Recordatorio importante</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>El técnico SOLO puede ejecutar lo que apruebes aquí.</li>
            <li>No realices pagos directos al técnico bajo ninguna circunstancia.</li>
            <li>
              Si rechazas, el servicio queda en disputa y el equipo de Baird Service intervendrá.
            </li>
          </ul>
          <Link href="/terminos" target="_blank" className="block mt-2 text-amber-900 underline text-xs">
            Términos y Condiciones →
          </Link>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow-lg space-y-3">
          {!mostrandoRechazo ? (
            <>
              <button
                type="button"
                onClick={() => decidir('aprobado')}
                disabled={enviando}
                className="w-full rounded-xl bg-emerald-600 px-6 py-4 font-bold text-white shadow-md hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {enviando ? 'Procesando...' : `✅ Aprobar — ${titulo}`}
              </button>
              <button
                type="button"
                onClick={() => setMostrandoRechazo(true)}
                disabled={enviando}
                className="w-full rounded-xl border-2 border-red-300 bg-white px-6 py-3 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed"
              >
                🚫 No estoy de acuerdo
              </button>
            </>
          ) : (
            <>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Cuéntanos por qué rechazas:</span>
                <textarea
                  value={comentarioRechazo}
                  onChange={(e) => setComentarioRechazo(e.target.value)}
                  placeholder="Ej: el técnico no me explicó bien, prefiero una segunda opinión..."
                  rows={3}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-500 resize-none"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMostrandoRechazo(false); setComentarioRechazo(''); setError('') }}
                  disabled={enviando}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => decidir('rechazado')}
                  disabled={enviando || !comentarioRechazo.trim()}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {enviando ? 'Enviando...' : 'Confirmar rechazo'}
                </button>
              </div>
            </>
          )}
        </div>

        <GestionarServicioLink clienteToken={clienteToken} />
      </div>
    </main>
  )
}
