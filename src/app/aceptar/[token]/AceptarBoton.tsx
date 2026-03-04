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
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-slate-900 tracking-tight">baird</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">service</span>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Nueva solicitud</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 max-w-md w-full">

          {/* Greeting */}
          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-1">Hola, {tecnicoNombre} 👋</p>
            <h1 className="text-2xl font-bold text-slate-900">Tienes una solicitud</h1>
            <p className="text-sm text-gray-500 mt-1">Revisa los detalles y acepta si te interesa</p>
          </div>

          {/* Service details */}
          <div className="space-y-3 mb-6">

            <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-4">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Equipo</p>
                <p className="font-semibold text-slate-900">{solicitud.tipo_equipo} — {solicitud.marca_equipo}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Problema reportado</p>
              <p className="text-slate-700 text-sm leading-relaxed">
                {solicitud.novedades_equipo.substring(0, 200)}
                {solicitud.novedades_equipo.length > 200 ? '...' : ''}
              </p>
            </div>

            <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-4">
              <span className="text-2xl">📍</span>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Ubicación</p>
                <p className="font-semibold text-slate-900">{solicitud.direccion}</p>
                <p className="text-slate-500 text-sm">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Horarios propuestos</p>
              <div className="space-y-1.5">
                <p className="text-sm text-slate-700">1️⃣ {solicitud.horario_visita_1}</p>
                <p className="text-sm text-slate-700">2️⃣ {solicitud.horario_visita_2}</p>
              </div>
            </div>

            {/* Payment highlight */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tu pago por este servicio</p>
              <p className="text-4xl font-bold text-green-700">${pagoFormateado}</p>
              <p className="text-xs text-green-600 mt-1 font-medium">COP · Pago a través de Baird Service</p>
            </div>

          </div>

          {/* Action states */}
          {estado === 'idle' && (
            <button
              onClick={aceptar}
              className="w-full bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-sm"
            >
              ✅ Aceptar este servicio
            </button>
          )}

          {estado === 'procesando' && (
            <div className="flex items-center justify-center gap-3 py-4">
              <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-gray-600 font-medium">Procesando...</p>
            </div>
          )}

          {estado === 'ganado' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-xl font-bold text-green-700">¡Servicio asignado!</p>
              <p className="text-gray-500 text-sm mt-2">
                Recibirás los datos completos del cliente por WhatsApp ahora mismo.
              </p>
            </div>
          )}

          {estado === 'tomado' && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
              <div className="text-5xl mb-3">⚡</div>
              <p className="text-xl font-bold text-orange-700">Ya fue tomado</p>
              <p className="text-gray-500 text-sm mt-2">
                Otro técnico aceptó primero. ¡Sigue atento a nuevas solicitudes!
              </p>
            </div>
          )}

          <p className="text-center text-xs text-gray-300 mt-6">
            Baird Service S.A.S — Red de técnicos verificados
          </p>
        </div>
      </div>
    </div>
  )
}
