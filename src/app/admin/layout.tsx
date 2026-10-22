'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { obtenerRolAdmin, type RolAdmin } from '@/lib/auth/adminEmails'
import { instalarGuardSoloLectura } from '@/lib/auth/soloLectura'
import { RolAdminProvider } from '@/components/admin/RolAdminContext'
import BuscadorGlobal from '@/components/admin/BuscadorGlobal'

/**
 * Rutas que NO existen para el rol lectura (logística): son herramientas que
 * solo sirven para escribir. Se ocultan del menú y, si se navega a mano, se
 * redirige al dashboard. El resto del panel se ve igual que para un admin.
 */
const RUTAS_SOLO_ADMIN = ['/admin/carga-masiva', '/admin/test', '/admin/accesos', '/admin/finanzas', '/admin/pagos-tecnicos']

/** Páginas sin shell ni guard de sesión: login y "crear contraseña" (gestionan su propia sesión). */
const RUTAS_SIN_SHELL = ['/admin/login', '/admin/establecer-clave']

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<{ rol: RolAdmin; email: string | null } | null>(null)

  const sinShell = RUTAS_SIN_SHELL.some((r) => pathname.startsWith(r))

  useEffect(() => {
    // /admin/establecer-clave abre sesión con un token de un solo uso y fija la
    // clave; no debe pasar por este guard (lo mandaría al login a mitad del flujo).
    // (La página se renderiza sin shell más abajo, así que `cargando` no importa aquí.)
    if (pathname.startsWith('/admin/establecer-clave')) return
    // Una sesión sirve para el shell admin solo si su email está en alguna de
    // las dos allowlists (admin o lectura). Un usuario logueado pero fuera de
    // ambas (p.ej. una cuenta de Supabase creada por signup) se desloguea y se
    // manda al login — si no, vería el shell y sus queries client-side (anon
    // key, RLS off) devolverían datos.
    const rolDe = (session: { user?: { email?: string } } | null) =>
      session ? obtenerRolAdmin(session.user?.email) : null

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const rol = rolDe(session)

      if (session && !rol) {
        await supabase.auth.signOut()
        if (pathname !== '/admin/login') router.replace('/admin/login')
        setSesion(null)
        setCargando(false)
        return
      }

      if (!session && pathname !== '/admin/login') {
        router.replace('/admin/login')
        return
      }

      if (session && pathname === '/admin/login') {
        router.replace('/admin')
        return
      }

      setSesion(rol ? { rol, email: session?.user?.email ?? null } : null)
      setCargando(false)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const rol = rolDe(session)
      if (!rol && pathname !== '/admin/login') {
        router.replace('/admin/login')
      }
      setSesion(rol ? { rol, email: session?.user?.email ?? null } : null)
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  const soloLectura = sesion?.rol === 'lectura'

  // Rol lectura: guard global que corta en el navegador cualquier request
  // mutante (API propia y writes directos a Supabase). Se desinstala al salir.
  useEffect(() => {
    if (!soloLectura) return
    return instalarGuardSoloLectura()
  }, [soloLectura])

  // Rol lectura: las herramientas de solo-escritura no existen para él.
  useEffect(() => {
    if (soloLectura && RUTAS_SOLO_ADMIN.some((r) => pathname.startsWith(r))) {
      router.replace('/admin')
    }
  }, [soloLectura, pathname, router])

  // Login y establecer-clave — sin sidebar ni guard
  if (sinShell) {
    return <>{children}</>
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (!sesion) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/solicitudes', label: 'Solicitudes', icon: '📋' },
    { href: '/admin/incumplidos', label: 'Incumplidos', icon: '⏰' },
    { href: '/admin/mapa', label: 'Mapa', icon: '🗺️' },
    { href: '/admin/cotizaciones-pendientes', label: 'Pricing pendiente', icon: '💵' },
    { href: '/admin/tecnicos', label: 'Técnicos', icon: '🔧' },
    { href: '/admin/supervisores', label: 'Supervisores', icon: '👥' },
    { href: '/admin/repuestos', label: 'Repuestos', icon: '📦' },
    { href: '/admin/gps-alertas', label: 'Alertas GPS', icon: '🚨' },
    { href: '/admin/errores', label: 'Errores conexión', icon: '📡' },
    { href: '/admin/carga-masiva', label: 'Carga Masiva', icon: '📁' },
    { href: '/admin/descuentos', label: 'Descuentos', icon: '🏷️' },
    { href: '/admin/liquidaciones', label: 'Liquidaciones', icon: '💰' },
    { href: '/admin/pagos-tecnicos', label: 'Pagos técnicos', icon: '💸' },
    { href: '/admin/finanzas', label: 'Finanzas', icon: '📈' },
    { href: '/admin/garantias', label: 'Garantías', icon: '🛡️' },
    { href: '/admin/test', label: 'Testing', icon: '🧪' },
    { href: '/admin/accesos', label: 'Accesos', icon: '🔑' },
  ].filter(({ href }) => !soloLectura || !RUTAS_SOLO_ADMIN.includes(href))

  return (
    <RolAdminProvider value={{ rol: sesion.rol, email: sesion.email, soloLectura }}>
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0 fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/admin" className="relative w-36 h-10 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="144px" className="object-contain object-left" />
          </Link>
          {soloLectura ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 uppercase tracking-widest mt-1">
              🔒 logística · solo lectura
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1 block">admin</span>
          )}
        </div>

        {/* Buscador global: clientes, casos, órdenes de garantía, técnicos */}
        <BuscadorGlobal />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100">
          {sesion.email && (
            <p className="px-3 pb-2 text-[11px] text-slate-400 truncate" title={sesion.email}>
              {sesion.email}
            </p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors w-full"
          >
            <span className="text-base">🚪</span>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56">
        {soloLectura && (
          <div className="sticky top-0 z-20 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium px-6 py-2 flex items-center gap-2">
            <span>🔒</span>
            <span>
              <strong>Modo solo lectura.</strong> Puedes consultar todos los casos, pagos y repuestos. La única acción habilitada es marcar la <strong>facturación</strong> de cada servicio completado (bloque 🧾 en la ficha).
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
    </RolAdminProvider>
  )
}
