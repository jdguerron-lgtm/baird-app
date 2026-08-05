'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

/**
 * Menú de navegación para móvil (<640px).
 *
 * Existe porque el nav del header y el link a la tienda están en `hidden sm:*`:
 * por debajo de 640px desaparecían los tres links y la tienda quedaba
 * inalcanzable — el footer tampoco la enlazaba. Este menú es la única ruta de
 * acceso a esas secciones desde un teléfono, que es de donde llega la mayoría
 * del tráfico de Google Ads.
 */

const LINKS = [
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#equipos', label: 'Equipos' },
  { href: '/registro', label: 'Soy técnico' },
]

export default function MenuMovil() {
  const [abierto, setAbierto] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)

  // Escape cierra y devuelve el foco al botón, y mientras está abierto se
  // bloquea el scroll del body para que el panel no se desplace por debajo.
  useEffect(() => {
    if (!abierto) return

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        botonRef.current?.focus()
      }
    }

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', alPresionar)

    return () => {
      document.body.style.overflow = overflowPrevio
      document.removeEventListener('keydown', alPresionar)
    }
  }, [abierto])

  return (
    <div className="sm:hidden">
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
        className="flex items-center justify-center w-11 h-11 -mr-1 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          {abierto ? (
            <>
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </>
          ) : (
            <>
              <path d="M3 6h18" />
              <path d="M3 12h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {abierto && (
        <>
          <div
            className="fixed inset-0 top-16 bg-slate-950/40 z-40"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <nav
            id="menu-movil"
            className="fixed left-0 right-0 top-16 z-50 bg-white border-b border-gray-200 shadow-xl px-4 py-3"
          >
            <ul className="flex flex-col">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setAbierto(false)}
                    className="block py-3.5 text-base font-medium text-slate-700 hover:text-slate-900 border-b border-slate-100"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://tienda.bairdservice.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAbierto(false)}
                  className="flex items-center gap-2 py-3.5 text-base font-medium text-slate-700 hover:text-slate-900"
                >
                  🛒 Nuestra tienda
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 17L17 7M7 7h10v10" />
                  </svg>
                  <span className="sr-only">(abre en pestaña nueva)</span>
                </a>
              </li>
            </ul>
          </nav>
        </>
      )}
    </div>
  )
}
