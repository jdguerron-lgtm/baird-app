'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { PhoneIcon } from '@/components/icons'

/**
 * Entrada de autoservicio al portal de supervisores (solo lectura).
 *
 * Paso 1: el supervisor ingresa su número de WhatsApp → POST
 *         /api/supervisor/enviar-codigo verifica que exista un supervisor
 *         ACTIVO con ese número y le envía un OTP de 6 dígitos por WhatsApp.
 * Paso 2: ingresa el código → POST /api/supervisor/verificar-codigo → si es
 *         válido, redirige a su portal /supervisor/{portal_token} (la misma
 *         vista limitada del link mágico que envía el admin).
 *
 * Todos los errores del server (número no asociado, acceso desactivado,
 * código incorrecto/expirado, demasiados intentos, cooldown, fallo WhatsApp)
 * llegan como { error } y se muestran tal cual.
 */
const REENVIO_SEGUNDOS = 60

export default function SupervisorAccesoPage() {
  const router = useRouter()

  const [paso, setPaso] = useState<'telefono' | 'codigo'>('telefono')
  const [telefono, setTelefono] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Cuenta regresiva para habilitar "Reenviar código"
  const [reenvioEn, setReenvioEn] = useState(0)

  useEffect(() => {
    if (reenvioEn <= 0) return
    const t = setInterval(() => setReenvioEn(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [reenvioEn])

  async function enviarCodigo() {
    setCargando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/supervisor/enviar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No pudimos enviar el código. Intenta de nuevo.')
        return
      }
      setNombre(typeof data.nombre === 'string' ? data.nombre : '')
      setCodigo('')
      setPaso('codigo')
      setReenvioEn(REENVIO_SEGUNDOS)
      setAviso('Código enviado por WhatsApp. Revisa tus mensajes.')
    } catch {
      setError('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function verificarCodigo() {
    if (!/^\d{6}$/.test(codigo)) {
      setError('El código debe tener exactamente 6 dígitos.')
      return
    }
    setCargando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/supervisor/verificar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, codigo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No pudimos verificar el código. Intenta de nuevo.')
        return
      }
      setAviso('¡Código correcto! Entrando a tu panel...')
      router.push(data.url)
    } catch {
      setError('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="flex justify-center mb-6">
          <Link href="/" className="relative w-36 h-10 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain" priority />
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">🛡️</div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de supervisión</h1>
            <p className="text-sm text-gray-500 mt-1">
              {paso === 'telefono'
                ? 'Ingresa tu número de WhatsApp registrado y te enviaremos un código de acceso.'
                : `Hola${nombre ? ` ${nombre}` : ''} 👋 — te enviamos un código de 6 dígitos por WhatsApp. Vence en 10 minutos.`}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              ⚠️ {error}
            </div>
          )}
          {aviso && !error && (
            <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              ✅ {aviso}
            </div>
          )}

          {paso === 'telefono' ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!cargando) enviarCodigo() }}
              className="space-y-4"
            >
              <PhoneInput
                label="Tu WhatsApp de supervisor"
                name="telefono"
                value={telefono}
                onChange={setTelefono}
                icon={<PhoneIcon className="w-5 h-5 mr-2 text-blue-600" />}
                required
              />
              <button
                type="submit"
                disabled={cargando || !telefono}
                className="w-full rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {cargando ? 'Verificando número...' : '📲 Enviarme el código'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Solo números registrados como supervisores de Baird Service pueden entrar.
              </p>
            </form>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!cargando) verificarCodigo() }}
              className="space-y-4"
            >
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">Código de 6 dígitos</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="••••••"
                  autoFocus
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold focus:outline-none focus:border-blue-500"
                />
              </label>
              <button
                type="submit"
                disabled={cargando || codigo.length !== 6}
                className="w-full rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {cargando ? 'Verificando...' : '✅ Verificar y entrar'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => { setPaso('telefono'); setError(null); setAviso(null); setCodigo('') }}
                  className="text-gray-500 underline hover:text-gray-700"
                >
                  Cambiar número
                </button>
                <button
                  type="button"
                  disabled={reenvioEn > 0 || cargando}
                  onClick={enviarCodigo}
                  className="text-blue-600 underline hover:text-blue-800 disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {reenvioEn > 0 ? `Reenviar código (${reenvioEn}s)` : 'Reenviar código'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          ¿Problemas para entrar? Escríbenos por el WhatsApp de Baird Service.
        </p>
      </div>
    </main>
  )
}
