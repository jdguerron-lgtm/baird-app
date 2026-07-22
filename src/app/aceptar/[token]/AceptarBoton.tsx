'use client'

import { useState } from 'react'
import Image from 'next/image'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'
import { formatCOP } from '@/lib/utils/format'
import { parsearFechaVisita, fechaColombiaYMD, fechaColombiaMasDias } from '@/lib/utils/fecha-visita'

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
  horario_confirmado?: string | null
}

interface Props {
  token: string
  solicitud: SolicitudInfo
  tecnicoNombre: string
  yaAsignada: boolean
  modeloEquipo?: string | null
  esGarantia?: boolean
}

export default function AceptarBoton({ token, solicitud, tecnicoNombre, yaAsignada, modeloEquipo, esGarantia }: Props) {
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'ganado' | 'tomado'>(
    yaAsignada ? 'tomado' : 'idle'
  )
  const [errorHorario, setErrorHorario] = useState<string | null>(null)

  const horarioConfirmadoCliente = solicitud.horario_confirmado?.trim() || null

  // Horarios entre los que el técnico puede escoger: el ya confirmado por el
  // cliente + las opciones que propuso en el formulario (horario_visita_1/2),
  // sin duplicados. Opciones cuya fecha ya no es agendable (hoy o antes, TZ
  // Colombia) se descartan; texto libre no parseable se conserva (el server
  // también lo admite). Lazy init: el filtro lee el reloj una sola vez.
  const [opcionesHorario] = useState<string[]>(() => {
    const manana = fechaColombiaMasDias(1)
    const candidatos = [
      horarioConfirmadoCliente,
      solicitud.horario_visita_1?.trim(),
      solicitud.horario_visita_2?.trim(),
    ].filter((h): h is string => !!h)
    return [...new Set(candidatos)].filter(h => {
      if (h === horarioConfirmadoCliente) return true
      const fecha = parsearFechaVisita(h)
      if (!fecha) return true
      return fechaColombiaYMD(new Date(fecha)) >= manana
    })
  })
  const [horarioElegido, setHorarioElegido] = useState<string>(
    () => horarioConfirmadoCliente ?? opcionesHorario[0] ?? ''
  )

  const horarioCliente = horarioConfirmadoCliente || solicitud.horario_visita_1 || 'Por coordinar'

  const aceptar = async () => {
    setEstado('procesando')
    setErrorHorario(null)
    try {
      const res = await fetch('/api/whatsapp/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...(horarioElegido ? { horarioSeleccionado: horarioElegido } : {}),
        }),
      })
      const result = await res.json()
      if (result.ganado) {
        setEstado('ganado')
      } else if (result.reintentar) {
        // El horario elegido no pasó la validación de agenda — el servicio
        // sigue disponible: volver a idle para que escoja el otro horario.
        setErrorHorario(result.mensaje ?? 'Ese horario ya no está disponible. Elige el otro horario.')
        setEstado('idle')
      } else {
        setEstado('tomado')
      }
    } catch {
      setEstado('tomado')
    }
  }

  // En garantía MABE no hay pago fijo hasta el diagnóstico: la complejidad
  // y los bonos se conocen después. Mostramos el PAGO MÍNIMO garantizado
  // (Baja sin bonos sin recargo = $32.760) y aclaramos que puede ser mayor.
  // En particular `pago_tecnico` es el NETO que recibe el técnico (precio de
  // catálogo ÷ 1.3447 × 0.8, $35.000 fijo en diagnóstico, o el costo cotizado); lo mostramos tal cual.
  const pagoFormateado = esGarantia
    ? formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)
    : formatCOP(solicitud.pago_tecnico)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="relative w-36 h-10">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </div>
          <div className="flex items-center gap-2">
            {esGarantia && (
              <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded-full font-medium">Garantia</span>
            )}
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Nueva solicitud</span>
          </div>
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
              <div className="flex-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Equipo</p>
                <p className="font-semibold text-slate-900">{solicitud.tipo_equipo} — {solicitud.marca_equipo}</p>
                {modeloEquipo && (
                  <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-0.5 rounded inline-block">
                    {modeloEquipo}
                  </p>
                )}
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
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Zona</p>
                <p className="font-semibold text-slate-900">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</p>
                <p className="text-slate-500 text-sm">La direccion exacta se comparte al aceptar</p>
              </div>
            </div>

            {/* Schedule — selectable between the client's proposed options
                (2026-07-21). Read-only when only one option exists. */}
            {opcionesHorario.length > 1 && estado !== 'ganado' && estado !== 'tomado' ? (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700 uppercase tracking-wide mb-1 font-semibold">📅 Elige el horario de la visita</p>
                <p className="text-xs text-blue-700 mb-3">El cliente propuso estos horarios. Escoge el que puedas cumplir.</p>
                <div className="space-y-2">
                  {opcionesHorario.map(opcion => {
                    const seleccionado = opcion === horarioElegido
                    return (
                      <button
                        key={opcion}
                        type="button"
                        onClick={() => { setHorarioElegido(opcion); setErrorHorario(null) }}
                        className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-colors ${
                          seleccionado
                            ? 'border-blue-600 bg-white'
                            : 'border-blue-200 bg-blue-100/50 hover:border-blue-400'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            seleccionado ? 'border-blue-600' : 'border-blue-300'
                          }`}>
                            {seleccionado && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                          </span>
                          <span className="flex-1">
                            <span className={`block text-sm font-bold ${seleccionado ? 'text-blue-900' : 'text-blue-800'}`}>
                              {opcion}
                            </span>
                            {opcion === horarioConfirmadoCliente && (
                              <span className="text-[10px] font-semibold text-blue-600">Preferido por el cliente</span>
                            )}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-blue-700 mt-2">Si no puedes cumplir ninguno, no aceptes.</p>
              </div>
            ) : (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700 uppercase tracking-wide mb-1 font-semibold">📅 Horario confirmado por el cliente</p>
                <p className="text-base font-bold text-blue-900">{estado === 'ganado' ? (horarioElegido || horarioCliente) : horarioCliente}</p>
                {estado === 'idle' && (
                  <p className="text-xs text-blue-700 mt-1">El cliente ya seleccionó este horario. Si no puedes cumplirlo, no aceptes.</p>
                )}
              </div>
            )}

            {/* Payment highlight */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {esGarantia ? 'Tu pago mínimo garantizado' : 'Tu pago por este servicio'}
              </p>
              <p className="text-4xl font-bold text-green-700">
                {esGarantia && <span className="text-xl mr-1">desde</span>}
                ${pagoFormateado}
              </p>
              <p className="text-xs text-green-600 mt-1 font-medium">COP · Pago a través de Baird Service</p>
              {esGarantia && (
                <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                  El monto sube si la reparación requiere complejidad mayor + bonos por entrega a tiempo y satisfacción del cliente. <span className="font-semibold">Nunca es menor que este valor.</span>
                </p>
              )}
              <a
                href="/guia-pagos.html"
                target="_blank"
                rel="noopener"
                className="inline-block text-xs font-semibold text-green-700 underline mt-2"
              >
                ¿Cómo se calcula tu pago? Ver guía de pagos
              </a>
            </div>

          </div>

          {/* Action states */}
          {estado === 'idle' && (
            <>
              {errorHorario && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3">
                  <p className="text-sm text-amber-800 font-medium">⚠️ {errorHorario}</p>
                </div>
              )}
              <button
                onClick={aceptar}
                className="w-full font-bold py-4 px-6 rounded-xl text-base transition-all shadow-sm bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white"
              >
                Aceptar este servicio
              </button>
            </>
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
              {(horarioElegido || horarioCliente) && (
                <p className="text-sm font-semibold text-slate-800 mt-2">
                  📅 Visita: {horarioElegido || horarioCliente}
                </p>
              )}
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
