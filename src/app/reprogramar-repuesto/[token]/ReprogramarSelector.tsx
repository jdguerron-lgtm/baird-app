'use client'

import { useState, useMemo } from 'react'
import GestionarServicioLink from '@/components/ui/GestionarServicioLink'
import { fechaColombiaMasDias } from '@/lib/utils/fecha-visita'
import { FRANJAS_HORARIO } from '@/lib/constants/franjas'
import { useFranjasLlenas } from '@/hooks/useFranjasLlenas'

interface SolicitudData {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  ciudad_pueblo: string
  zona_servicio: string
  estado: string | null
  cliente_token: string | null
}

interface Props {
  token: string
  solicitud: SolicitudData
  tecnicoNombre: string
  yaReprogramado: boolean
}

function formatFechaLarga(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Mínimo agendable: mañana (nunca el mismo día). Máximo: 2 semanas.
// Día calendario en TZ Colombia — mismo fix que HorarioSelector: toISOString()
// sobre hora local devolvía el día UTC siguiente por la noche.
function fechaMinima(): string {
  return fechaColombiaMasDias(1)
}

function fechaMaxima(): string {
  return fechaColombiaMasDias(14)
}

export default function ReprogramarSelector({ token, solicitud, tecnicoNombre, yaReprogramado }: Props) {
  const [fecha, setFecha] = useState('')
  const [franja, setFranja] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'success' | 'error' | null>(null)
  const [mensajeError, setMensajeError] = useState('')

  // Franjas sin cupo para la fecha elegida — la UI las desactiva; el guard
  // real está en /api/reprogramar-repuesto (validarHorarioAgendable).
  const franjasLlenas = useFranjasLlenas(fecha)

  const equipo = `${solicitud.tipo_equipo} ${solicitud.marca_equipo}`
  const cliente = solicitud.cliente_nombre.split(' ')[0]

  const horarioFinal = useMemo(() => {
    if (fecha && franja && !franjasLlenas.includes(franja)) {
      return `${formatFechaLarga(fecha)} · ${franja}`
    }
    return ''
  }, [fecha, franja, franjasLlenas])

  // Ya reprogramado (estado avanzó más allá de repuesto_recibido) y aún no
  // acabamos de confirmar en esta sesión.
  if (yaReprogramado && resultado !== 'success') {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ya tienes una fecha agendada</h1>
            <p className="text-gray-600">
              Hola {cliente}, este enlace ya fue usado. {tecnicoNombre} coordinará la visita de
              tu {equipo} contigo. Si necesitas cambiar algo, escríbenos por WhatsApp.
            </p>
          </div>
          <GestionarServicioLink clienteToken={solicitud.cliente_token} />
        </div>
      </main>
    )
  }

  if (resultado === 'success') {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="text-5xl mb-4">🗓️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Fecha registrada</h1>
            <p className="text-gray-600 mb-2">Hola {cliente}, anotamos tu fecha tentativa para:</p>
            <p className="text-lg font-semibold text-gray-900 mb-6">🕐 {horarioFinal}</p>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 text-left">
              <p className="font-semibold mb-1">⚠️ Fecha tentativa</p>
              <p>
                {tecnicoNombre} revisará su disponibilidad y coordinará contigo la confirmación
                final de la visita para tu {equipo}. Te contactará por WhatsApp.
              </p>
            </div>
          </div>
          <GestionarServicioLink clienteToken={solicitud.cliente_token} />
        </div>
      </main>
    )
  }

  async function confirmar() {
    if (!horarioFinal) return setMensajeError('Selecciona fecha y franja horaria primero')

    setEnviando(true)
    setMensajeError('')

    try {
      const res = await fetch('/api/reprogramar-repuesto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, horario: horarioFinal }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error reprogramando la visita')
      }

      setResultado('success')
    } catch (err) {
      setResultado('error')
      setMensajeError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl bg-white p-6 shadow-lg mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">¡Tu repuesto llegó, {cliente}! 🎉</h1>
          <p className="text-gray-600 mb-1">
            Ya podemos retomar la reparación de tu equipo. Elige una nueva fecha para la visita:
          </p>
          <p className="text-lg font-semibold text-gray-900">🔧 {equipo}</p>
          <p className="text-sm text-gray-500">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</p>
        </div>

        {/* Aviso destacado: fecha tentativa, sujeta a disponibilidad del técnico */}
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-5 mb-4">
          <h2 className="font-bold text-amber-900 mb-1">⚠️ La fecha que elijas es tentativa</h2>
          <p className="text-sm text-amber-900">
            {tecnicoNombre}, el técnico que lleva tu proceso, confirmará la visita según su
            disponibilidad. Coordinará contigo por WhatsApp la fecha y hora definitivas.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Elige fecha y franja horaria:</h2>

          <label className="block mb-3">
            <span className="block text-sm text-gray-700 mb-1">📅 Fecha</span>
            <input
              type="date"
              value={fecha}
              min={fechaMinima()}
              max={fechaMaxima()}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
            {fecha && (
              <p className="text-xs text-gray-500 mt-1">{formatFechaLarga(fecha)}</p>
            )}
          </label>

          <label className="block">
            <span className="block text-sm text-gray-700 mb-2">🕒 Franja horaria</span>
            <div className="grid grid-cols-2 gap-2">
              {FRANJAS_HORARIO.map(f => {
                const llena = franjasLlenas.includes(f.value)
                return (
                  <button
                    key={f.value}
                    type="button"
                    disabled={llena}
                    onClick={() => setFranja(f.value)}
                    className={`p-3 rounded-xl border-2 text-left transition ${
                      llena
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                        : franja === f.value
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg">{f.icon}</div>
                    <div className="text-xs font-medium text-gray-900">{f.label}</div>
                    {llena && <div className="text-[10px] font-semibold text-red-500 mt-0.5">Franja llena — elige otra</div>}
                  </button>
                )
              })}
            </div>
          </label>

          {horarioFinal && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-900">Tu fecha tentativa:</p>
              <p className="text-sm font-bold text-emerald-900">🗓️ {horarioFinal}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          {mensajeError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{mensajeError}</div>
          )}

          <button
            type="button"
            onClick={confirmar}
            disabled={!horarioFinal || enviando}
            className="w-full rounded-xl bg-blue-600 px-6 py-4 font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {enviando ? 'Enviando...' : '🗓️ Proponer esta fecha'}
          </button>
        </div>

        <GestionarServicioLink clienteToken={solicitud.cliente_token} />
      </div>
    </main>
  )
}
