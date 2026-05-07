'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'

interface Solicitud {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  ciudad_pueblo: string
  zona_servicio: string
  horario_visita_1: string
  horario_visita_2: string
  horario_confirmado: string | null
  horario_confirmado_at: string | null
  estado: string
  es_garantia: boolean
  tecnico_asignado_id: string | null
  reagendamientos_count: number | null
}

interface TecnicoInfo {
  nombre_completo: string
  foto_perfil_url: string | null
  foto_documento_url: string | null
  tipo_documento: string | null
  numero_documento: string | null
}

interface Props {
  token: string
  solicitud: Solicitud
  tecnico: TecnicoInfo | null
  cancelable: boolean
  reagendable: boolean
  reagendamientosRestantes: number
}

const FRANJAS = [
  { value: '8am-12pm', label: 'Mañana (8am - 12pm)', icon: '🌅' },
  { value: '12pm-3pm', label: 'Mediodía (12pm - 3pm)', icon: '☀️' },
  { value: '3pm-6pm', label: 'Tarde (3pm - 6pm)', icon: '🌤️' },
  { value: '6pm-8pm', label: 'Noche (6pm - 8pm)', icon: '🌆' },
]

function formatFechaLarga(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fechaMinima(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function fechaMaxima(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

type Modo = 'menu' | 'cancelar' | 'reagendar' | 'cancelado_ok' | 'reagendado_ok'

export default function ServicioPortal({
  token,
  solicitud,
  tecnico,
  cancelable,
  reagendable,
  reagendamientosRestantes,
}: Props) {
  const [modo, setModo] = useState<Modo>('menu')
  const [motivoCancel, setMotivoCancel] = useState('')
  const [fechaCustom, setFechaCustom] = useState('')
  const [franjaCustom, setFranjaCustom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const equipo = `${solicitud.tipo_equipo} ${solicitud.marca_equipo}`
  const cliente = solicitud.cliente_nombre.split(' ')[0]

  const horarioFinal = useMemo(() => {
    if (fechaCustom && franjaCustom) {
      return `${formatFechaLarga(fechaCustom)} · ${franjaCustom}`
    }
    return ''
  }, [fechaCustom, franjaCustom])

  async function cancelar() {
    if (!motivoCancel.trim()) {
      setError('Por favor cuéntanos brevemente por qué cancelas.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/solicitud/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, motivo: motivoCancel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo cancelar el servicio.')
        return
      }
      setModo('cancelado_ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  async function reagendar() {
    if (!horarioFinal) {
      setError('Selecciona fecha y franja horaria primero.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/solicitud/reagendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, horario: horarioFinal }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo reagendar el servicio.')
        return
      }
      setModo('reagendado_ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  if (modo === 'cancelado_ok') {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Servicio cancelado</h1>
          <p className="text-gray-600 mb-6">
            Recibimos tu cancelación. Te enviamos confirmación por WhatsApp.
          </p>
          <Link
            href="/solicitar"
            className="inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Crear nueva solicitud
          </Link>
        </div>
      </main>
    )
  }

  if (modo === 'reagendado_ok') {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="text-5xl mb-4">📅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Horario actualizado</h1>
          <p className="text-gray-600 mb-2">Nuevo horario:</p>
          <p className="text-lg font-semibold text-gray-900 mb-6">🕐 {horarioFinal}</p>
          <p className="text-sm text-gray-500">
            Te avisaremos por WhatsApp cualquier novedad. 🔧
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Hola {cliente} 👋</h1>
              <p className="text-sm text-gray-500">Tu servicio en Baird Service</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${ESTADO_ESTILOS[solicitud.estado] ?? 'bg-gray-100 text-gray-600'}`}>
              {ESTADO_LABELS[solicitud.estado] ?? solicitud.estado}
            </span>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Equipo</dt>
              <dd className="font-medium text-gray-900">🔧 {equipo}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Ubicación</dt>
              <dd className="text-gray-900">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</dd>
            </div>
            {solicitud.horario_confirmado && (
              <div>
                <dt className="text-xs text-gray-500">Horario confirmado</dt>
                <dd className="font-medium text-gray-900">🕐 {solicitud.horario_confirmado}</dd>
              </div>
            )}
            {tecnico?.nombre_completo && (
              <div>
                <dt className="text-xs text-gray-500">Técnico asignado</dt>
                <dd className="font-medium text-gray-900">👨‍🔧 {tecnico.nombre_completo}</dd>
              </div>
            )}
          </dl>
        </div>

        {tecnico && (tecnico.foto_perfil_url || tecnico.foto_documento_url) && (
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="font-semibold text-gray-900 mb-1">Verificación del técnico</h2>
            <p className="text-xs text-gray-500 mb-4">
              Confirma estos datos cuando llegue para que estés seguro/a de que es la persona correcta.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {tecnico.foto_perfil_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">📷 Foto de perfil</p>
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <Image
                      src={tecnico.foto_perfil_url}
                      alt={`Foto de ${tecnico.nombre_completo}`}
                      fill
                      sizes="(max-width: 480px) 50vw, 200px"
                      className="object-cover"
                    />
                  </div>
                </div>
              )}
              {tecnico.foto_documento_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">
                    🪪 {tecnico.tipo_documento ?? 'Documento'}
                  </p>
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <Image
                      src={tecnico.foto_documento_url}
                      alt="Documento de identidad del técnico"
                      fill
                      sizes="(max-width: 480px) 50vw, 200px"
                      className="object-cover"
                    />
                  </div>
                  {tecnico.numero_documento && (
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      N°: {tecnico.numero_documento}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {modo === 'menu' && (
          <div className="rounded-2xl bg-white p-6 shadow-lg space-y-3">
            <h2 className="font-semibold text-gray-900 mb-1">¿Qué necesitas hacer?</h2>

            {reagendable && (
              <button
                type="button"
                onClick={() => setModo('reagendar')}
                className="w-full p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 transition text-left"
              >
                <div className="font-semibold text-blue-900">📅 Reagendar mi servicio</div>
                <div className="text-xs text-blue-700">
                  Te quedan {reagendamientosRestantes} reagendamiento{reagendamientosRestantes === 1 ? '' : 's'}
                </div>
              </button>
            )}

            {cancelable && (
              <button
                type="button"
                onClick={() => setModo('cancelar')}
                className="w-full p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:border-red-400 transition text-left"
              >
                <div className="font-semibold text-red-900">❌ Cancelar servicio</div>
                <div className="text-xs text-red-700">
                  {solicitud.tecnico_asignado_id
                    ? 'Tu técnico ya está asignado — puede aplicar visita-en-falso si cancelas tarde'
                    : 'Aún no asignamos técnico, cancelación libre'}
                </div>
              </button>
            )}

            {!cancelable && !reagendable && (
              <div className="text-sm text-gray-500 p-4 rounded-xl border border-gray-200 bg-gray-50">
                En este momento no puedes modificar la solicitud desde aquí. Si necesitas ayuda, contáctanos por WhatsApp respondiendo cualquier mensaje previo.
              </div>
            )}
          </div>
        )}

        {modo === 'cancelar' && (
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="font-bold text-gray-900 mb-3">Cancelar servicio</h2>
            <p className="text-sm text-gray-600 mb-4">
              Cuéntanos brevemente por qué necesitas cancelar. Tu mensaje nos ayuda a mejorar.
            </p>
            <textarea
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
              placeholder="Motivo de la cancelación..."
              rows={3}
              maxLength={500}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 mb-4"
            />
            {error && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setModo('menu'); setError(''); setMotivoCancel('') }}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={enviando || !motivoCancel.trim()}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {enviando ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        )}

        {modo === 'reagendar' && (
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="font-bold text-gray-900 mb-3">Reagendar servicio</h2>
            <p className="text-sm text-gray-600 mb-4">
              Elige nueva fecha y franja horaria. {solicitud.tecnico_asignado_id ? 'Avisaremos al técnico asignado del cambio.' : 'Te avisaremos cuando un técnico acepte.'}
            </p>

            <label className="block mb-3">
              <span className="block text-sm text-gray-700 mb-1">📅 Fecha</span>
              <input
                type="date"
                value={fechaCustom}
                min={fechaMinima()}
                max={fechaMaxima()}
                onChange={(e) => setFechaCustom(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
              {fechaCustom && (
                <p className="text-xs text-gray-500 mt-1">{formatFechaLarga(fechaCustom)}</p>
              )}
            </label>

            <label className="block mb-4">
              <span className="block text-sm text-gray-700 mb-2">🕒 Franja horaria</span>
              <div className="grid grid-cols-2 gap-2">
                {FRANJAS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFranjaCustom(f.value)}
                    className={`p-3 rounded-xl border-2 text-left transition ${
                      franjaCustom === f.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg">{f.icon}</div>
                    <div className="text-xs font-medium text-gray-900">{f.label}</div>
                  </button>
                ))}
              </div>
            </label>

            {horarioFinal && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-900">Tu nuevo horario:</p>
                <p className="text-sm font-bold text-emerald-900">✅ {horarioFinal}</p>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setModo('menu'); setError(''); setFechaCustom(''); setFranjaCustom('') }}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={reagendar}
                disabled={enviando || !horarioFinal}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {enviando ? 'Reagendando...' : 'Confirmar nuevo horario'}
              </button>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pt-2">
          ¿Necesitas ayuda? Contáctanos por WhatsApp respondiendo cualquier mensaje previo.
        </div>
      </div>
    </main>
  )
}
