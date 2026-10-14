'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { tieneAccesoAdmin } from '@/lib/auth/adminEmails'

/**
 * /admin/establecer-clave — la persona fija su propia contraseña — 2026-10-13.
 *
 * Entra por dos caminos:
 *   1. Link propio (Resend o copiado por el admin): `?token_hash=…&type=recovery`
 *      → `verifyOtp({ token_hash })` abre sesión. No depende del Site URL de Supabase.
 *   2. Correo de Supabase (fallback): llega con `#access_token=…&type=recovery`;
 *      supabase-js lo consume solo y emite PASSWORD_RECOVERY / sesión.
 * Con sesión válida muestra el formulario y llama `updateUser({ password })`.
 * El layout admin exime esta ruta del guard (igual que /admin/login).
 */
const MIN_CLAVE = 10

function EstablecerClaveInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [estado, setEstado] = useState<'verificando' | 'listo' | 'invalido' | 'guardado'>('verificando')
  const [email, setEmail] = useState<string | null>(null)
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    const tokenHash = params.get('token_hash')
    const tipo = params.get('type')

    const resolver = async () => {
      if (tokenHash && (tipo === 'recovery' || tipo === 'magiclink' || tipo === 'invite')) {
        const { data, error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
        if (cancelado) return
        if (e || !data.session) {
          setEstado('invalido')
          return
        }
        // Limpiar el token de la URL (ya está consumido).
        window.history.replaceState(null, '', '/admin/establecer-clave')
        setEmail(data.session.user.email ?? null)
        setEstado('listo')
        return
      }
      // Camino 2: sesión ya abierta (hash consumido por supabase-js o sesión previa).
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelado) return
      if (session) {
        setEmail(session.user.email ?? null)
        setEstado('listo')
      } else {
        // Dar tiempo al evento PASSWORD_RECOVERY si venimos del hash.
        setTimeout(() => {
          if (!cancelado) setEstado((s) => (s === 'verificando' ? 'invalido' : s))
        }, 2500)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setEmail(session.user.email ?? null)
        setEstado('listo')
      }
    })

    resolver()
    return () => {
      cancelado = true
      subscription.unsubscribe()
    }
  }, [params])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (clave.length < MIN_CLAVE) return setError(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`)
    if (clave !== clave2) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    const { error: e2 } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (e2) return setError(e2.message === 'New password should be different from the old password.' ? 'La contraseña debe ser distinta a la anterior.' : `No se pudo guardar: ${e2.message}`)
    setEstado('guardado')
    // Solo entra al panel si el email está en alguna allowlist; si no, se cierra la sesión.
    if (tieneAccesoAdmin(email)) {
      setTimeout(() => router.replace('/admin'), 1200)
    } else {
      await supabase.auth.signOut()
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="text-xl font-bold text-slate-900 tracking-tight">baird</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">panel</span>
          </div>
          <p className="text-sm text-gray-500">Crear tu contraseña</p>
        </div>

        {estado === 'verificando' && (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-gray-500">
            <div className="animate-spin h-6 w-6 border-4 border-slate-300 border-t-slate-900 rounded-full" />
            Verificando tu link…
          </div>
        )}

        {estado === 'invalido' && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
              Este link ya se usó o venció. Pide uno nuevo con &quot;¿Olvidaste tu contraseña?&quot; en el inicio de sesión.
            </div>
            <Link href="/admin/login" className="block text-center text-sm font-semibold text-slate-900 underline">
              Ir al inicio de sesión
            </Link>
          </div>
        )}

        {estado === 'guardado' && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl p-3 text-center">
            ✅ Contraseña guardada. {tieneAccesoAdmin(email) ? 'Entrando al panel…' : 'Ya puedes iniciar sesión.'}
          </div>
        )}

        {estado === 'listo' && (
          <form onSubmit={guardar} className="space-y-4">
            {email && (
              <p className="text-xs text-gray-500 text-center">
                Cuenta: <span className="font-semibold text-gray-800">{email}</span>
              </p>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nueva contraseña</label>
              <input
                type="password"
                required
                minLength={MIN_CLAVE}
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder={`Mínimo ${MIN_CLAVE} caracteres`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Repetir contraseña</label>
              <input
                type="password"
                required
                minLength={MIN_CLAVE}
                autoComplete="new-password"
                value={clave2}
                onChange={(e) => setClave2(e.target.value)}
                className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder="••••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={guardando}
              className={`w-full py-3 px-4 rounded-xl text-sm font-bold text-white transition-all ${
                guardando ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.99]'
              }`}
            >
              {guardando ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function EstablecerClavePage() {
  return (
    <Suspense fallback={null}>
      <EstablecerClaveInner />
    </Suspense>
  )
}
