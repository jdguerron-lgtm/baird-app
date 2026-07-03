'use client'

import { usePathname } from 'next/navigation'

/**
 * Botón flotante de soporte por WhatsApp.
 *
 * Aparece en TODAS las páginas públicas (esquina inferior derecha) y se oculta
 * en el panel admin (/admin/*). El mensaje pre-escrito se adapta según si la
 * página es de técnico (registro / portal técnico) o de cliente, para dar
 * contexto a quien atiende la bandeja.
 *
 * Número de soporte = línea dedicada de atención, DISTINTA del número de
 * WhatsApp Business que usan los flujos automáticos. Los mensajes llegan directo
 * a ese teléfono; no pasan por el webhook ni interfieren con la automatización.
 *
 * Para cambiar el número o el saludo: editar las constantes de abajo.
 */

// Dígitos con código de país, formato wa.me (sin +, espacios ni guiones).
const WHATSAPP_SOPORTE = '573153019192'

export default function BotonWhatsAppFlotante() {
  const pathname = usePathname() ?? ''

  // Panel interno: no mostrar el botón de soporte público.
  if (pathname.startsWith('/admin')) return null

  const esTecnico = pathname.startsWith('/registro') || pathname.startsWith('/tecnico')
  const mensaje = esTecnico
    ? 'Hola Baird Service, soy técnico y tengo una duda.'
    : 'Hola Baird Service, tengo una duda.'

  const href = `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(mensaje)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      title="¿Dudas? Escríbenos por WhatsApp"
      className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg shadow-black/20 transition-all duration-200 hover:bg-[#20bd5a] hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-6 h-6 flex-shrink-0"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.9 11.9 0 005.71 1.454h.006c6.585 0 11.946-5.359 11.949-11.895a11.86 11.86 0 00-3.481-8.458" />
      </svg>
      <span className="hidden sm:inline text-sm font-semibold whitespace-nowrap">
        ¿Dudas?
      </span>
    </a>
  )
}
