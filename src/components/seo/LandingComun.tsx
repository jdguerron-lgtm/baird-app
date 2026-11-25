import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SERVICIOS_SEO } from '@/lib/constants/servicios-seo'
import { MARCAS_LANDING } from '@/lib/constants/marcas-seo'
import { urlWhatsAppAtencion } from '@/lib/constants/contacto'

/**
 * Piezas compartidas por las landings SEO /servicios/[slug] (por equipo y por
 * marca). Server Components: los clics se miden con el listener delegado de
 * AnaliticaCliente (`cta_click` a /solicitar, `whatsapp_click` a wa.me) y la
 * ubicación sale de `data-rastreo`.
 */

export const PASOS = [
  {
    num: '01',
    emoji: '📝',
    titulo: 'Cuéntanos qué pasa',
    texto: 'Describe la falla, tu dirección y dos horarios en los que puedas recibir al técnico.',
  },
  {
    num: '02',
    emoji: '📲',
    titulo: 'Un técnico verificado acepta',
    texto: 'Los técnicos de tu zona con la especialidad correcta reciben la solicitud por WhatsApp. El primero en aceptar queda asignado y solo entonces pagas el anticipo del 50 % con un link seguro. Al solicitar no pagas nada.',
  },
  {
    num: '03',
    emoji: '🏠',
    titulo: 'Diagnóstico y cotización en tu casa',
    texto: 'Recibes foto y documento del técnico antes de la visita. Diagnostica, te cotiza la reparación y tú decides si la apruebas.',
  },
]

export const FAQ_COMUNES = [
  {
    q: '¿Cómo sé que el técnico es de confianza?',
    a: 'Todos los técnicos de Baird Service pasan verificación de identidad: foto, documento y especialidades confirmadas. Antes de la visita recibes por WhatsApp la foto y el nombre de quien va a tu casa.',
  },
  {
    q: '¿Cómo se paga el servicio?',
    a: 'El pago se hace a Baird Service por medios electrónicos (nunca en efectivo al técnico). El precio queda acordado antes de la visita o al aprobar la cotización, sin sorpresas.',
  },
  {
    q: '¿Qué pasa si no apruebo la cotización de la reparación?',
    a: 'Solo pagas la visita de diagnóstico. La cotización no tiene compromiso: puedes rechazarla y el proceso termina ahí.',
  },
]

function IconoWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.9 11.9 0 005.71 1.454h.006c6.585 0 11.946-5.359 11.949-11.895a11.86 11.86 0 00-3.481-8.458" />
    </svg>
  )
}

export function LandingNavbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="relative w-52 h-14 block">
          <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="208px" className="object-contain object-left" priority />
        </Link>
        <Link
          href="/solicitar"
          data-rastreo="landing_navbar"
          className="whitespace-nowrap bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow-md shadow-green-600/20 hover:shadow-green-600/40"
        >
          Solicitar servicio
        </Link>
      </div>
    </header>
  )
}

/**
 * CTA doble: formulario (principal) + WhatsApp (para quien prefiere escribir).
 * `ubicacion` va en data-rastreo para distinguir hero y CTA final en GA4.
 */
export function BotonesCta({
  mensajeWhatsApp,
  ubicacion,
  textoSolicitar = 'Solicitar técnico ahora →',
  centrado = false,
}: {
  mensajeWhatsApp: string
  ubicacion: string
  textoSolicitar?: string
  centrado?: boolean
}) {
  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${centrado ? 'sm:justify-center' : ''}`}>
      <Link
        href="/solicitar"
        data-rastreo={ubicacion}
        className="text-center bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-8 rounded-2xl text-base shadow-xl shadow-green-500/30 hover:-translate-y-0.5 transition-all duration-200"
      >
        {textoSolicitar}
      </Link>
      <a
        href={urlWhatsAppAtencion(mensajeWhatsApp)}
        target="_blank"
        rel="noopener noreferrer"
        data-rastreo={ubicacion}
        className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold py-4 px-8 rounded-2xl text-base transition-all duration-200"
      >
        <IconoWhatsApp className="w-5 h-5 text-[#25D366]" />
        Escríbenos por WhatsApp
      </a>
    </div>
  )
}

export function SeccionPasos() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-12 text-center">
          Así funciona el servicio
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PASOS.map((paso) => (
            <div key={paso.num} className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-green-50 border border-green-100 rounded-2xl flex flex-col items-center justify-center">
                <span className="text-xl leading-none">{paso.emoji}</span>
                <span className="text-green-700/60 text-[9px] font-black tracking-widest">{paso.num}</span>
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{paso.titulo}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{paso.texto}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link
            href="/solicitar"
            data-rastreo="landing_pasos"
            className="inline-block bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            Solicitar un servicio ahora →
          </Link>
        </div>
      </div>
    </section>
  )
}

export function SeccionFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-10 text-center">
          Preguntas frecuentes
        </h2>
        <div className="space-y-4">
          {items.map(({ q, a }, i) => (
            <details key={i} className="group bg-slate-50 border border-slate-100 rounded-2xl p-5 open:bg-white open:shadow-sm">
              <summary className="font-bold text-slate-900 cursor-pointer list-none flex items-center justify-between gap-3">
                {q}
                <span className="text-green-600 group-open:rotate-45 transition-transform text-xl leading-none flex-shrink-0">+</span>
              </summary>
              <p className="text-slate-500 text-sm leading-relaxed mt-3">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaFinal({ titulo, mensajeWhatsApp }: { titulo: ReactNode; mensajeWhatsApp: string }) {
  return (
    <section className="bg-slate-950 py-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-4">{titulo}</h2>
        <p className="text-white/50 mb-8">
          Solicita el servicio en 2 minutos o escríbenos por WhatsApp. Un técnico verificado de tu zona lo toma.
        </p>
        <BotonesCta mensajeWhatsApp={mensajeWhatsApp} ubicacion="landing_final" textoSolicitar="Solicitar servicio →" centrado />
      </div>
    </section>
  )
}

/** Footer con enlaces internos a todas las landings (equipo y marca) y al hub. */
export function LandingFooter({ slugActual }: { slugActual: string }) {
  return (
    <footer className="bg-slate-950 border-t border-white/5 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <p className="text-white/60 text-sm font-semibold mb-3">Otros servicios en Bogotá y la Sabana:</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60 mb-4">
          {SERVICIOS_SEO.filter((s) => s.slug !== slugActual).map((s) => (
            <Link key={s.slug} href={`/servicios/${s.slug}`} className="hover:text-white transition-colors">
              Reparación de {s.plural}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60 mb-8">
          {MARCAS_LANDING.filter((m) => m.slug !== slugActual).map((m) => (
            <Link key={m.slug} href={`/servicios/${m.slug}`} className="hover:text-white transition-colors">
              Equipos {m.marca}
            </Link>
          ))}
          <Link href="/servicios" className="hover:text-white transition-colors">
            Todos los servicios
          </Link>
        </div>
        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/50 text-xs">© 2026 Baird Service S.A.S. — Colombia</p>
          <div className="flex gap-6 text-xs text-white/60">
            <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
            <Link href="/solicitar" className="hover:text-white transition-colors">Solicitar servicio</Link>
            <Link href="/registro" className="hover:text-white transition-colors">Quiero hacer parte del equipo</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
