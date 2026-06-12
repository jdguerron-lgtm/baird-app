'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
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
  horario_visita_1: string
  horario_visita_2: string
  horario_confirmado: string | null
  horario_confirmado_at: string | null
  estado: string | null
  es_garantia: boolean
  cliente_token: string | null
}

interface Props {
  token: string
  solicitud: SolicitudData
  yaConfirmado: boolean
  expirado: boolean
  // true cuando ya se agendó una vez pero la fecha pasó y nadie tomó el
  // servicio (estado 'notificada' sin técnico): se reabre el formulario por
  // este mismo link para que el cliente elija nueva fecha.
  reagendarVencido: boolean
}

function formatFechaLarga(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Mínimo agendable: mañana (nunca el mismo día). Máximo: 2 semanas.
// Se calcula sobre el día calendario en TZ Colombia para no correrse un día
// por la noche (toISOString sobre hora local devolvía el día UTC siguiente).
function fechaMinima(): string {
  return fechaColombiaMasDias(1)
}

function fechaMaxima(): string {
  return fechaColombiaMasDias(14)
}

export default function HorarioSelector({ token, solicitud, yaConfirmado, expirado, reagendarVencido }: Props) {
  // Modo: 'sugerencia' (clic en una de las 2 opciones del formulario) | 'custom' (fecha + franja libre)
  const [modo, setModo] = useState<'sugerencia' | 'custom'>('custom')
  const [opcionSugerida, setOpcionSugerida] = useState<1 | 2 | null>(null)
  const [fechaCustom, setFechaCustom] = useState('')
  const [franjaCustom, setFranjaCustom] = useState('')
  const [aceptaTyc, setAceptaTyc] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'success' | 'error' | null>(null)
  const [mensajeError, setMensajeError] = useState('')
  const [warning, setWarning] = useState<string | null>(null)

  // Franjas sin cupo para la fecha elegida (máx MAX_RESERVAS_POR_FRANJA por
  // slot). La UI las desactiva; el guard real está en /api/confirmar-horario.
  const franjasLlenas = useFranjasLlenas(fechaCustom)

  const equipo = `${solicitud.tipo_equipo} ${solicitud.marca_equipo}`
  const cliente = solicitud.cliente_nombre.split(' ')[0]

  const horarioFinal = useMemo(() => {
    if (modo === 'sugerencia') {
      if (opcionSugerida === 1) return solicitud.horario_visita_1
      if (opcionSugerida === 2) return solicitud.horario_visita_2
      return ''
    }
    // Si la franja elegida se llenó (p.ej. cambió la fecha), no hay horario
    // válido — el botón de confirmar queda deshabilitado sin setState extra.
    if (fechaCustom && franjaCustom && !franjasLlenas.includes(franjaCustom)) {
      return `${formatFechaLarga(fechaCustom)} · ${franjaCustom}`
    }
    return ''
  }, [modo, opcionSugerida, fechaCustom, franjaCustom, franjasLlenas, solicitud.horario_visita_1, solicitud.horario_visita_2])

  if (expirado) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitud expirada</h1>
          <p className="text-gray-600 mb-6">
            No recibimos tu confirmación a tiempo. La solicitud quedó como &quot;Sin agendar&quot;.
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

  // Pantalla "ya confirmado" — salvo en modo reagendar-vencido, donde se
  // reabre el formulario abajo para elegir nueva fecha.
  if ((yaConfirmado && !reagendarVencido) || resultado === 'success') {
    const horarioSeleccionado = resultado === 'success' ? horarioFinal : solicitud.horario_confirmado

    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Horario confirmado</h1>
            <p className="text-gray-600 mb-2">Hola {cliente}, agendamos tu servicio para:</p>
            <p className="text-lg font-semibold text-gray-900 mb-6">🕐 {horarioSeleccionado}</p>
            {warning ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 text-left">
                <p className="font-semibold mb-1">⚠️ Buscando alternativas</p>
                <p>{warning}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Estamos buscando un técnico verificado en {solicitud.ciudad_pueblo}.
                Te avisaremos por WhatsApp cuando uno acepte tu servicio. 🔧
              </p>
            )}
          </div>
          <GestionarServicioLink clienteToken={solicitud.cliente_token} />
        </div>
      </main>
    )
  }

  async function confirmar() {
    if (!horarioFinal) return setMensajeError('Selecciona fecha y franja horaria primero')
    if (!aceptaTyc) return setMensajeError('Debes aceptar los Términos y Condiciones')

    setEnviando(true)
    setMensajeError('')

    try {
      const res = await fetch('/api/confirmar-horario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, horario: horarioFinal }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error confirmando horario')
      }

      if (typeof data?.warning === 'string' && data.warning) {
        setWarning(data.warning)
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
        {reagendarVencido && (
          <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-5 mb-4">
            <h2 className="font-bold text-amber-900 mb-1">⏰ Tu fecha anterior ya pasó</h2>
            <p className="text-sm text-amber-900">
              {solicitud.horario_confirmado
                ? <>Habías agendado para <strong>{solicitud.horario_confirmado}</strong>, pero esa fecha ya pasó y aún no asignamos un técnico. </>
                : <>La fecha que habías agendado ya pasó y aún no asignamos un técnico. </>}
              Elige una nueva fecha y volveremos a buscar técnicos verificados para ti.
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow-lg mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Hola {cliente} 👋</h1>
          <p className="text-gray-600 mb-1">{reagendarVencido ? 'Elige una nueva fecha para tu servicio:' : 'Confirma el horario para tu servicio:'}</p>
          <p className="text-lg font-semibold text-gray-900">🔧 {equipo}</p>
          <p className="text-sm text-gray-500">{solicitud.zona_servicio}, {solicitud.ciudad_pueblo}</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Elige fecha y franja horaria:</h2>

          {/* En reagendar-vencido ocultamos las sugerencias originales: son las
              franjas que el cliente propuso al crear la solicitud y ya pasaron. */}
          {!reagendarVencido && (solicitud.horario_visita_1 || solicitud.horario_visita_2) && (
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                Sugerencias rápidas
              </p>
              {solicitud.horario_visita_1 && (
                <button
                  type="button"
                  onClick={() => { setModo('sugerencia'); setOpcionSugerida(1) }}
                  className={`w-full mb-2 p-3 rounded-xl border-2 text-left transition ${
                    modo === 'sugerencia' && opcionSugerida === 1
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">🕐 {solicitud.horario_visita_1}</span>
                    {modo === 'sugerencia' && opcionSugerida === 1 && <span className="text-blue-600">✓</span>}
                  </div>
                </button>
              )}
              {solicitud.horario_visita_2 && (
                <button
                  type="button"
                  onClick={() => { setModo('sugerencia'); setOpcionSugerida(2) }}
                  className={`w-full p-3 rounded-xl border-2 text-left transition ${
                    modo === 'sugerencia' && opcionSugerida === 2
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">🕑 {solicitud.horario_visita_2}</span>
                    {modo === 'sugerencia' && opcionSugerida === 2 && <span className="text-blue-600">✓</span>}
                  </div>
                </button>
              )}
            </div>
          )}

          <div onClick={() => setModo('custom')}>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
              Elige tu propia fecha y hora
            </p>

            <label className="block mb-3">
              <span className="block text-sm text-gray-700 mb-1">📅 Fecha</span>
              <input
                type="date"
                value={fechaCustom}
                min={fechaMinima()}
                max={fechaMaxima()}
                onChange={(e) => { setModo('custom'); setFechaCustom(e.target.value) }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
              {fechaCustom && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatFechaLarga(fechaCustom)}
                </p>
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
                      onClick={() => { setModo('custom'); setFranjaCustom(f.value) }}
                      className={`p-3 rounded-xl border-2 text-left transition ${
                        llena
                          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                          : modo === 'custom' && franjaCustom === f.value
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
          </div>

          {horarioFinal && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-900">Tu horario:</p>
              <p className="text-sm font-bold text-emerald-900">✅ {horarioFinal}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-5 mb-4">
          <h3 className="font-bold text-amber-900 mb-3">🔒 Antes de agendar — lee con atención</h3>

          <div className="space-y-3 text-sm text-amber-900">
            <div>
              <div className="font-semibold mb-1">✅ Lo que garantizamos</div>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
                <li>Técnico verificado, identificado y con experiencia</li>
                <li>Cobertura de garantía sobre el trabajo realizado</li>
                <li>Soporte ante cualquier inconveniente vía nuestra plataforma</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold mb-1">⚠️ Condiciones indispensables</div>
              <ol className="list-decimal pl-5 space-y-1 text-amber-800">
                <li><strong>NINGÚN pago</strong> se realiza directamente al técnico ni en efectivo. Todo se factura a través de Baird Service.</li>
                <li>Tras el diagnóstico, la <strong>siguiente acción</strong> debe ser verificada y aceptada por ti dentro de la plataforma (vía WhatsApp).</li>
                <li>Si el técnico realiza el servicio sin tu confirmación en plataforma:
                  <ul className="list-disc pl-5 mt-1">
                    <li>Estará incumpliendo los Términos y Condiciones</li>
                    <li>Será expulsado y su cuenta bloqueada permanentemente</li>
                    <li>El trabajo NO tendrá cobertura de garantía</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div className="pt-2 border-t border-amber-200">
              <Link href="/terminos" target="_blank" className="text-amber-900 underline font-semibold">
                📋 Lee los Términos y Condiciones completos →
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={aceptaTyc}
              onChange={(e) => setAceptaTyc(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              He leído y acepto los <Link href="/terminos" target="_blank" className="text-blue-600 underline">Términos y Condiciones</Link> y la <Link href="/politica-privacidad" target="_blank" className="text-blue-600 underline">Política de Privacidad</Link>.
            </span>
          </label>

          {mensajeError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{mensajeError}</div>
          )}

          <button
            type="button"
            onClick={confirmar}
            disabled={!horarioFinal || !aceptaTyc || enviando}
            className="w-full rounded-xl bg-blue-600 px-6 py-4 font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {enviando ? 'Confirmando...' : '✅ Confirmar horario y agendar'}
          </button>
        </div>

        <GestionarServicioLink clienteToken={solicitud.cliente_token} />
      </div>
    </main>
  )
}
