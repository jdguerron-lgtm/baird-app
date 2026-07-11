import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  COBERTURA_SEO,
  MARCAS_SEO,
  SERVICIOS_SEO,
  getServicioSeo,
} from '@/lib/constants/servicios-seo'
import { TARIFA_DIAGNOSTICO, TARIFAS_MANTENIMIENTO } from '@/types/solicitud'
import { formatCOP } from '@/lib/utils/format'

// Landing pages SEO estáticas (una por electrodoméstico). Contenido en
// src/lib/constants/servicios-seo.ts; precios leídos del catálogo canónico.

// Dominio canónico fijo (ver nota en robots.ts): el canonical NUNCA debe
// apuntar al alias baird-app.vercel.app, y NEXT_PUBLIC_APP_URL puede serlo.
const BASE_URL = 'https://lineablanca.bairdservice.com'

export function generateStaticParams() {
  return SERVICIOS_SEO.map(({ slug }) => ({ slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const servicio = getServicioSeo(slug)
  if (!servicio) return {}
  return {
    title: servicio.metaTitle,
    description: servicio.metaDescription,
    alternates: { canonical: `${BASE_URL}/servicios/${servicio.slug}` },
    openGraph: {
      title: servicio.metaTitle,
      description: servicio.metaDescription,
      url: `${BASE_URL}/servicios/${servicio.slug}`,
      siteName: 'Baird Service',
      locale: 'es_CO',
      type: 'website',
    },
  }
}

const PASOS = [
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
    texto: 'Los técnicos de tu zona con la especialidad correcta reciben la solicitud por WhatsApp. El primero en aceptar queda asignado.',
  },
  {
    num: '03',
    emoji: '🏠',
    titulo: 'Diagnóstico y cotización en tu casa',
    texto: 'Recibes foto y documento del técnico antes de la visita. Diagnostica, te cotiza la reparación y tú decides si la apruebas.',
  },
]

const FAQ_COMUNES = [
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

export default async function ServicioSeoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const servicio = getServicioSeo(slug)
  if (!servicio) notFound()

  const tarifaMantenimiento = TARIFAS_MANTENIMIENTO[servicio.equipo]
  const faqCompleta = [...servicio.faq, ...FAQ_COMUNES]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqCompleta.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: servicio.h1,
    description: servicio.metaDescription,
    serviceType: `Reparación de ${servicio.plural}`,
    areaServed: COBERTURA_SEO.map((ciudad) => ({ '@type': 'City', name: ciudad })),
    provider: {
      '@type': 'LocalBusiness',
      name: 'Baird Service',
      url: 'https://lineablanca.bairdservice.com',
      areaServed: 'Bogotá y Sabana, Colombia',
    },
    offers: {
      '@type': 'Offer',
      name: 'Visita de diagnóstico a domicilio',
      price: TARIFA_DIAGNOSTICO,
      priceCurrency: 'COP',
    },
  }

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />

      {/* ── NAVBAR ─────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="relative w-52 h-14 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" priority />
          </Link>
          <Link href="/solicitar">
            <button className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow-md shadow-green-600/20 hover:shadow-green-600/40">
              Solicitar servicio
            </button>
          </Link>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="bg-slate-950 pt-32 pb-16 px-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-green-500 rounded-full opacity-[0.07] blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-green-400 font-semibold text-xs tracking-[0.15em] uppercase mb-4">
            {servicio.emoji} Servicio a domicilio · Bogotá y Sabana
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
            {servicio.h1}
          </h1>
          <p className="text-white/60 text-lg leading-relaxed mb-8">{servicio.intro}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/solicitar">
              <button className="w-full sm:w-auto bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-8 rounded-2xl text-base shadow-xl shadow-green-500/30 hover:-translate-y-0.5 transition-all duration-200">
                Solicitar técnico ahora →
              </button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-6 text-white/40 text-xs">
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Técnicos verificados con foto e ID</span>
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Cotización antes de reparar</span>
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Pago electrónico seguro</span>
          </div>
        </div>
      </section>

      {/* ── FALLAS COMUNES ─────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center">
            Fallas comunes de {servicio.plural} que reparamos
          </h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            ¿Reconoces alguna? Descríbela en el formulario y el técnico llega con contexto.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {servicio.fallas.map((falla, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 text-[15px] mb-1.5">{falla.titulo}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{falla.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRECIOS ────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center">
            Precios claros, sin sorpresas
          </h2>
          <p className="text-slate-500 text-center mb-10 max-w-xl mx-auto">
            Precios al consumidor con IVA incluido. La reparación se cotiza tras el diagnóstico y tú la apruebas antes de que el técnico intervenga el equipo.
          </p>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-bold text-slate-900">Visita de diagnóstico</p>
                <p className="text-slate-500 text-sm">El técnico revisa el equipo en tu casa e identifica la falla.</p>
              </div>
              <p className="font-black text-green-700 text-lg whitespace-nowrap">${formatCOP(TARIFA_DIAGNOSTICO)}</p>
            </div>
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-bold text-slate-900">Mantenimiento preventivo</p>
                <p className="text-slate-500 text-sm">Tarifa fija de catálogo para {servicio.plural}.</p>
              </div>
              <p className="font-black text-green-700 text-lg whitespace-nowrap">${formatCOP(tarifaMantenimiento)}</p>
            </div>
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-bold text-slate-900">Reparación</p>
                <p className="text-slate-500 text-sm">Cotización del técnico tras el diagnóstico. La apruebas o rechazas sin compromiso.</p>
              </div>
              <p className="font-bold text-slate-600 text-sm whitespace-nowrap">Según cotización</p>
            </div>
          </div>
          {servicio.notaPrecios && (
            <p className="text-slate-500 text-sm text-center mt-4">{servicio.notaPrecios}</p>
          )}
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ──────────────────────────────────────────── */}
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
            <Link href="/solicitar">
              <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                Solicitar un servicio ahora →
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── COBERTURA Y MARCAS ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-4">📍 Zonas de cobertura</h2>
            <p className="text-slate-500 text-sm mb-4">
              Atendemos Bogotá y municipios de la Sabana:
            </p>
            <div className="flex flex-wrap gap-2">
              {COBERTURA_SEO.map((ciudad) => (
                <span key={ciudad} className="bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-sm text-slate-700 font-medium">
                  {ciudad}
                </span>
              ))}
            </div>
            <p className="text-slate-400 text-xs mt-4">
              ¿Tu municipio no aparece? Envía la solicitud igual: si hay técnico verificado en tu zona, la recibe.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-4">🏷️ Marcas que atendemos</h2>
            <p className="text-slate-500 text-sm mb-4">
              Servicio multimarca para {servicio.plural}:
            </p>
            <div className="flex flex-wrap gap-2">
              {MARCAS_SEO.map((marca) => (
                <span key={marca} className="bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-sm text-slate-700 font-medium">
                  {marca}
                </span>
              ))}
            </div>
            <p className="text-slate-400 text-xs mt-4">Y más marcas de línea blanca disponibles en Colombia.</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-10 text-center">
            Preguntas frecuentes
          </h2>
          <div className="space-y-4">
            {faqCompleta.map(({ q, a }, i) => (
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

      {/* ── CTA FINAL ──────────────────────────────────────────────── */}
      <section className="bg-slate-950 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-4">
            Tu {servicio.plural.replace(/s$/, '')} en buenas manos
          </h2>
          <p className="text-white/50 mb-8">
            Solicita el servicio en 2 minutos. Un técnico verificado de tu zona lo toma por WhatsApp.
          </p>
          <Link href="/solicitar">
            <button className="bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-xl shadow-green-500/20 hover:-translate-y-0.5 transition-all duration-200">
              Solicitar servicio →
            </button>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-white/5 py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-white/40 text-sm font-semibold mb-3">Otros servicios en Bogotá y la Sabana:</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/40 mb-8">
            {SERVICIOS_SEO.filter((s) => s.slug !== servicio.slug).map((s) => (
              <Link key={s.slug} href={`/servicios/${s.slug}`} className="hover:text-white/70 transition-colors">
                Reparación de {s.plural}
              </Link>
            ))}
          </div>
          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/20 text-xs">© 2026 Baird Service S.A.S. — Colombia</p>
            <div className="flex gap-6 text-xs text-white/30">
              <Link href="/" className="hover:text-white/60 transition-colors">Inicio</Link>
              <Link href="/solicitar" className="hover:text-white/60 transition-colors">Solicitar servicio</Link>
              <Link href="/registro" className="hover:text-white/60 transition-colors">Soy técnico</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
