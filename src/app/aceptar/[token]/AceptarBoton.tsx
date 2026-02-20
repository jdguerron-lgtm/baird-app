'use client'

import { useState } from 'react'

interface SolicitudInfo {
  tipo_equipo: string
  marca_equipo: string
  novedades_equipo: string
  direccion: string
  zona_servicio: string
  ciudad_pueblo: string
  pago_tecnico: number
  horario_visita_1: string
  horario_visita_2: string
}

interface Props {
  token: string
  solicitud: SolicitudInfo
  tecnicoNombre: string
  yaAsignada: boolean
}

export default function AceptarBoton({ token, solicitud, tecnicoNombre, yaAsignada }: Props) {
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'ganado' | 'tomado'>(
    yaAsignada ? 'tomado' : 'idle'
  )

  const aceptar = async () => {
    setEstado('procesando')
    try {
      const res = await fetch('/api/whatsapp/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const result = await res.json()
      setEstado(result.ganado ? 'ganado' : 'tomado')
    } catch {
      setEstado('tomado')
    }
  }

  const pagoFormateado = new Intl.NumberFormat('es-CO').format(solicitud.pago_tecnico)

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔧</div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva solicitud</h1>
          <p className="text-sm text-gray-500 mt-1">Hola, {tecnicoNombre}</p>
        </div>

        {/* Detalles del servicio */}
        <div className="space-y-4 mb-8">

          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Equipo</p>
            <p className="font-semibold text-gray-900">{solicitud.tipo_equipo} — {solicitud.marca_equipo}</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Problema reportado</p>
            <p className="text-gray-700 text-sm leading-relaxed">
              {solicitud.novedades_equipo.substring(0, 200)}
              {solicitud.novedades_equipo.length > 200 ? '...' : ''}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ubicación del servicio</p>
            <p className="font-semibold text-gray-900">📍 {solicitud.direccion}</p>
            <p className="text-gray-600 text-sm">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Horarios propuestos por el cliente</p>
            <p className="text-sm">1️⃣ {solicitud.horario_visita_1}</p>
            <p className="text-sm mt-1">2️⃣ {solicitud.horario_visita_2}</p>
          </div>

          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tu pago por este servicio</p>
            <p className="text-4xl font-bold text-green-700">${pagoFormateado}</p>
            <p className="text-sm text-green-600 mt-1">COP</p>
          </div>
        </div>

        {/* Acciones */}
        {estado === 'idle' && (
          <button
            onClick={aceptar}
            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all shadow-lg"
          >
            ✅ Aceptar este servicio
          </button>
        )}

        {estado === 'procesando' && (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-gray-600 font-medium">Procesando...</p>
            </div>
          </div>
        )}

        {estado === 'ganado' && (
          <div className="bg-green-50 border-2 border-green-400 rounded-xl p-6 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-2xl font-bold text-green-700">¡Servicio asignado!</p>
            <p className="text-gray-600 mt-2">
              Recibirás los datos completos del cliente por WhatsApp ahora mismo.
            </p>
          </div>
        )}

        {estado === 'tomado' && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-center">
            <div className="text-5xl mb-3">⚡</div>
            <p className="text-2xl font-bold text-red-700">Ya fue tomado</p>
            <p className="text-gray-600 mt-2">
              Otro técnico aceptó este servicio primero. ¡Sigue atento a nuevas solicitudes!
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Baird Service — Plataforma de técnicos verificados
        </p>
      </div>
    </div>
  )
}
