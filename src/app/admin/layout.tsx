'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [cargando, setCargando] = useState(true)
  const [autenticado, setAutenticado] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session && pathname !== '/admin/login') {
        router.replace('/admin/login')
        return
      }

      if (session && pathname === '/admin/login') {
        router.replace('/admin')
        return
      }

      setAutenticado(!!session)
      setCargando(false)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/admin/login') {
        router.replace('/admin/login')
      }
      setAutenticado(!!session)
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  // Login page — no sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (!autenticado) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/solicitudes', label: 'Solicitudes', icon: '📋' },
    { href: '/admin/tecnicos', label: 'Técnicos', icon: '🔧' },
    { href: '/admin/carga-masiva', label: 'Carga Masiva', icon: '📁' },
    { href: '/admin/garantias', label: 'Garantías', icon: '🛡️' },
    { href: '/admin/test', label: 'Testing', icon: '🧪' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0 fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/admin" className="relative w-28 h-8 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </Link>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1 block">admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
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
        {children}
      </main>
    </div>
  )
}
