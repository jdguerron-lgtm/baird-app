'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { tieneAccesoAdmin } from '@/lib/auth/adminEmails'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [modoRecuperar, setModoRecuperar] = useState(false)
  const [aviso, setAviso] = useState('')

  // "¿Olvidaste tu contraseña?" / primer ingreso: pide el correo con el link
  // de un solo uso para crear la clave. Respuesta siempre genérica (server).
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const res = await fetch('/api/auth/recuperar-clave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar el correo')
      setAviso('Si el correo tiene acceso al panel, en unos minutos recibirás un link para crear tu contraseña. Revisa también spam.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo')
    } finally {
      setCargando(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Credenciales incorrectas')
      setCargando(false)
      return
    }

    // Autenticado ≠ autorizado: solo los emails de las allowlists (admin o
    // lectura/logística) entran. Una cuenta de Supabase válida pero fuera de
    // ambas listas no debe quedar con sesión.
    if (!tieneAccesoAdmin(data.user?.email)) {
      await supabase.auth.signOut()
      setError('Esta cuenta no tiene acceso al panel')
      setCargando(false)
      return
    }

    router.push('/admin')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="text-xl font-bold text-slate-900 tracking-tight">baird</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">admin</span>
          </div>
          <p className="text-sm text-gray-500">Panel de administración</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
            {error}
          </div>
        )}

        {aviso && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl p-3 mb-6">
            {aviso}
          </div>
        )}

        <form onSubmit={modoRecuperar ? handleRecuperar : handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="admin@bairdservice.com"
            />
          </div>
          {!modoRecuperar && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          )}
          <button
            type="submit"
            disabled={cargando}
            className={`w-full py-3 px-4 rounded-xl text-sm font-bold text-white transition-all ${
              cargando
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.99]'
            }`}
          >
            {cargando ? (modoRecuperar ? 'Enviando...' : 'Ingresando...') : modoRecuperar ? 'Enviarme el link' : 'Ingresar'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setModoRecuperar((v) => !v); setError(''); setAviso('') }}
          className="mt-5 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          {modoRecuperar ? '← Volver a iniciar sesión' : '¿Olvidaste tu contraseña o es tu primer ingreso?'}
        </button>
      </div>
    </div>
  )
}
