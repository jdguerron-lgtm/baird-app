'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRolAdmin } from '@/components/admin/RolAdminContext'

/**
 * /admin/accesos — SOLO ADMIN (2026-10-13). Cuentas del panel (allowlist admin
 * + lectura) cruzadas con Supabase Auth, y botón para enviar el correo con el
 * link de un solo uso para que cada persona cree su propia contraseña. Si el
 * correo no sale (sin RESEND_API_KEY o SMTP restringido), el link se muestra
 * para copiarlo y mandarlo por WhatsApp.
 */
interface Cuenta {
  email: string
  rol: 'admin' | 'lectura'
  existe: boolean
  haIngresado: boolean
  ultimoLogin: string | null
  creadaEn: string | null
}

interface Resultado {
  email: string
  link?: string
  enviadoPorCorreo: boolean
  via?: string
  error?: string
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function AccesosPage() {
  const { soloLectura } = useRolAdmin()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [copiado, setCopiado] = useState(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const res = await fetch('/api/admin/accesos', { headers: { Authorization: `Bearer ${await token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setCuentas(data.cuentas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando cuentas')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const enviar = async (email: string) => {
    if (!confirm(`¿Enviar a ${email} el correo para crear su contraseña? Si ya tenía una, el link se la deja cambiar.`)) return
    setEnviando(email)
    setResultado(null)
    setCopiado(false)
    try {
      const res = await fetch('/api/admin/accesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setResultado({ email, ...data })
    } catch (e) {
      setResultado({ email, enviadoPorCorreo: false, error: e instanceof Error ? e.message : 'Error' })
    } finally {
      setEnviando(null)
    }
  }

  const copiar = async () => {
    if (!resultado?.link) return
    await navigator.clipboard.writeText(resultado.link)
    setCopiado(true)
  }

  if (soloLectura) return null

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900">Accesos al panel</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Quién puede entrar a <code className="text-xs bg-gray-100 px-1 rounded">/admin</code> y con qué rol. Las cuentas se
        crean sin contraseña: cada persona la fija desde el correo de acceso. Para agregar un email, súmalo a{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">ADMIN_EMAILS</code> o{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">LECTURA_EMAILS</code> y créalo con{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">scripts/crear-usuario-panel.mjs</code>.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Rol</th>
              <th className="text-left px-4 py-3">Cuenta</th>
              <th className="text-left px-4 py-3">Último ingreso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!cargando && cuentas.map((c) => (
              <tr key={c.email}>
                <td className="px-4 py-3 font-medium text-slate-900">{c.email}</td>
                <td className="px-4 py-3">
                  {c.rol === 'admin' ? (
                    <span className="text-xs font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">admin</span>
                  ) : (
                    <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">🔒 solo lectura</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {!c.existe ? (
                    <span className="text-red-600">No existe en Supabase Auth</span>
                  ) : c.haIngresado ? (
                    'Activa'
                  ) : (
                    <span className="text-amber-700">Creada, sin contraseña aún</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{fmt(c.ultimoLogin)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={!c.existe || enviando === c.email}
                    onClick={() => enviar(c.email)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {enviando === c.email ? 'Enviando…' : c.haIngresado ? '✉️ Reenviar link de clave' : '✉️ Enviar correo de acceso'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resultado && (
        <div className={`mt-4 rounded-xl border p-4 text-sm ${resultado.error && !resultado.link ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-900'}`}>
          {resultado.link ? (
            <>
              <p className="font-semibold">
                {resultado.enviadoPorCorreo
                  ? `✅ Correo enviado a ${resultado.email} (${resultado.via}).`
                  : `⚠️ Link generado pero el correo NO salió${resultado.error ? `: ${resultado.error}` : ''}. Mándalo por WhatsApp:`}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                El link es de un solo uso y vence en ~1 hora. Si lo compartes a mano, hazlo solo con la persona dueña del correo.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={resultado.link} className="flex-1 text-xs font-mono bg-white border border-gray-200 rounded-lg px-2 py-1.5" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={copiar} className="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800">
                  {copiado ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            </>
          ) : (
            <p>❌ {resultado.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
