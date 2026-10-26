import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  COBERTURA_SEO,
  MARCAS_SEO,
  SERVICIOS_SEO,
  getServicioSeo,
  type ServicioSeo,
} from '@/lib/constants/servicios-seo'
import { MARCAS_LANDING, getMarcaSeo, type MarcaSeo } from '@/lib/constants/marcas-seo'
import { TIENDA_URL } from '@/lib/constants/tienda'
import { TARIFA_DIAGNOSTICO, TARIFAS_MANTENIMIENTO } from '@/types/solicitud'
import { formatCOP } from '@/lib/utils/format'
import {
  BotonesCta,
  CtaFinal,
  FAQ_COMUNES,
  LandingFooter,
  LandingNavbar,
  SeccionFaq,
  SeccionPasos,
} from '@/components/seo/LandingComun'

// Landing pages SEO estáticas: una por electrodoméstico (servicios-seo.ts) y
// una por marca (marcas-seo.ts, 2026-10-25). Precios leídos del catálogo
// canónico. Piezas comunes en src/components/seo/LandingComun.tsx.

// Dominio canónico fijo (ver nota en robots.ts): el canonical NUNCA debe
// apuntar al alias baird-app.vercel.app, y NEXT_PUBLIC_APP_URL puede serlo.
const BASE_URL = 'https://lineablanca.bairdservice.com'

export function generateStaticParams() {
  return [...SERVICIOS_SEO, ...MARCAS_LANDING].map(({ slug }) => ({ slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const pagina = getServicioSeo(slug) ?? getMarcaSeo(slug)
  if (!pagina) return {}
  const url = `${BASE_URL}/servicios/${pagina.slug}`
  return {
    title: pagina.metaTitle,
    description: pagina.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: pagina.metaTitle,
      description: pagina.metaDescription,
      url,
      siteName: 'Baird Service',
      locale: 'es_CO',
      type: 'website',
    },
  }
}

const PROVEEDOR_JSON_LD = {
  '@type': 'LocalBusiness',
  name: 'Baird Service',
  url: BASE_URL,
  areaServed: 'Bogotá y Sabana, Colombia',
}

function JsonLd({ datos }: { datos: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos) }} />
}

function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

export default async function LandingSeoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const servicio = getServicioSeo(slug)
  if (servicio) return <LandingServicio servicio={servicio} />
  const marca = getMarcaSeo(slug)
  if (marca) return <LandingMarca marca={marca} />
  notFound()
}

// ─── Landing por equipo ─────────────────────────────────────────────────────

function LandingServicio({ servicio }: { servicio: ServicioSeo }) {
  const tarifaMantenimiento = TARIFAS_MANTENIMIENTO[servicio.equipo]
  const faqCompleta = [...servicio.faq, ...FAQ_COMUNES]
  const mensajeWhatsApp = `Hola Baird Service, necesito un técnico para mi ${servicio.singular} en Bogotá.`

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: servicio.h1,
    description: servicio.metaDescription,
    serviceType: `Reparación de ${servicio.plural}`,
    areaServed: COBERTURA_SEO.map((ciudad) => ({ '@type': 'City', name: ciudad })),
    provider: PROVEEDOR_JSON_LD,
    offers: {
      '@type': 'Offer',
      name: 'Visita de diagnóstico a domicilio',
      price: TARIFA_DIAGNOSTICO,
      priceCurrency: 'COP',
    },
  }

  return (
    <main className="min-h-screen bg-white">
      <JsonLd datos={faqJsonLd(faqCompleta)} />
      <JsonLd datos={serviceJsonLd} />
      <LandingNavbar />

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
          <BotonesCta mensajeWhatsApp={mensajeWhatsApp} ubicacion="landing_hero" />
          <div className="flex flex-wrap items-center gap-4 mt-6 text-white/50 text-xs">
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Técnicos verificados con foto e ID</span>
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Cotización antes de reparar</span>
            <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Pago electrónico seguro</span>
          </div>
        </div>
      </section>

      {/* ── FALLAS COMUNES ─────────────────────────────────────────── */}
      <SeccionFallas titulo={`Fallas comunes de ${servicio.plural} que reparamos`} fallas={servicio.fallas} />

      {/* ── PRECIOS ────────────────────────────────────────────────── */}
      <SeccionPrecios
        mantenimiento={{ texto: `Tarifa fija de catálogo para ${servicio.plural}.`, valor: tarifaMantenimiento }}
        nota={servicio.notaPrecios}
        fondo
      />

      <SeccionPasos />

      {/* ── COBERTURA Y MARCAS ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <Cobertura />
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-4">🏷️ Marcas que atendemos</h2>
            <p className="text-slate-500 text-sm mb-4">
              Servicio multimarca para {servicio.plural}:
            </p>
            <div className="flex flex-wrap gap-2">
              {MARCAS_SEO.map((nombre) => {
                const landing = MARCAS_LANDING.find((m) => m.marca.toLowerCase() === nombre.toLowerCase())
                const clase = 'bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-sm text-slate-700 font-medium'
                return landing ? (
                  <Link key={nombre} href={`/servicios/${landing.slug}`} className={`${clase} hover:border-green-400 hover:text-green-700 transition-colors`}>
                    {nombre} →
                  </Link>
                ) : (
                  <span key={nombre} className={clase}>{nombre}</span>
                )
              })}
            </div>
            <p className="text-slate-500 text-xs mt-4">Y más marcas de línea blanca disponibles en Colombia.</p>
          </div>
        </div>
      </section>

      <SeccionFaq items={faqCompleta} />
      <CtaFinal titulo={`Tu ${servicio.singular} en buenas manos`} mensajeWhatsApp={mensajeWhatsApp} />
      <LandingFooter slugActual={servicio.slug} />
    </main>
  )
}

// ─── Landing por marca ──────────────────────────────────────────────────────

function LandingMarca({ marca }: { marca: MarcaSeo }) {
  const faqCompleta = [...marca.faq, ...FAQ_COMUNES]
  const mensajeWhatsApp = `Hola Baird Service, necesito un técnico para mi equipo ${marca.marca} en Bogotá.`
  const mantenimientoDesde = Math.min(...marca.equipos.map(({ equipo }) => TARIFAS_MANTENIMIENTO[equipo]))

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: marca.h1,
    description: marca.metaDescription,
    serviceType: `Reparación de electrodomésticos ${marca.marca}`,
    brand: { '@type': 'Brand', name: marca.marca },
    areaServed: COBERTURA_SEO.map((ciudad) => ({ '@type': 'City', name: ciudad })),
    provider: PROVEEDOR_JSON_LD,
    offers: {
      '@type': 'Offer',
      name: 'Visita de diagnóstico a domicilio',
      price: TARIFA_DIAGNOSTICO,
      priceCurrency: 'COP',
    },
  }

  return (
    <main className="min-h-screen bg-white">
      <JsonLd datos={faqJsonLd(faqCompleta)} />
      <JsonLd datos={serviceJsonLd} />
      <LandingNavbar />

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="bg-slate-950 pt-32 pb-16 px-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-green-500 rounded-full opacity-[0.07] blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-green-400 font-semibold text-xs tracking-[0.15em] uppercase mb-4">
            🏷️ {marca.marca} · Servicio a domicilio · Bogotá y Sabana
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
            {marca.h1}
          </h1>
          <p className="text-white/60 text-lg leading-relaxed mb-8">{marca.intro}</p>
          <BotonesCta mensajeWhatsApp={mensajeWhatsApp} ubicacion="landing_hero" />
          <p className="text-white/50 text-xs mt-6 max-w-2xl">{marca.aviso}</p>
        </div>
      </section>

      {/* ── GARANTÍA (solo marcas cuya garantía atiende Baird) ─────── */}
      {marca.garantia && (
        <section className="px-4 -mt-6 relative z-10">
          <div className="max-w-3xl mx-auto bg-emerald-600 text-white rounded-2xl p-6 shadow-lg">
            <h2 className="font-bold text-lg mb-1">🛡️ {marca.garantia.titulo}</h2>
            <p className="text-emerald-50 text-sm leading-relaxed">{marca.garantia.texto}</p>
          </div>
        </section>
      )}

      {/* ── EQUIPOS ────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center">
            Equipos {marca.marca} que reparamos
          </h2>
          <p className="text-slate-500 text-center mb-10 max-w-xl mx-auto">
            A domicilio en Bogotá y la Sabana. Entra a cada equipo para ver sus fallas típicas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {marca.equipos.map((e) => (
              <Link
                key={e.equipo}
                href={`/servicios/${e.slugServicio}`}
                className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-green-300 hover:bg-white transition-colors"
              >
                <span className="font-bold text-slate-900">{e.nombre}</span>
                <span className="text-green-600 font-bold">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SeccionFallas titulo={`Fallas frecuentes en equipos ${marca.marca}`} fallas={marca.fallas} fondo />

      <SeccionPrecios
        mantenimiento={{ texto: `Tarifa fija de catálogo según el equipo ${marca.marca}.`, valor: mantenimientoDesde, desde: true }}
      />

      {/* ── REPUESTOS ORIGINALES ───────────────────────────────────── */}
      <section className="px-4 pb-4">
        <div className="max-w-3xl mx-auto text-center bg-slate-50 border border-slate-100 rounded-2xl p-6">
          <h2 className="font-black text-slate-900 text-lg mb-2">Repuestos originales {marca.marca}</h2>
          <p className="text-slate-500 text-sm mb-4">
            Somos distribuidores mayoristas oficiales de repuestos {marca.marca}: el técnico trabaja con piezas originales.
          </p>
          <a
            href={TIENDA_URL}
            target="_blank"
            rel="noopener"
            className="inline-block text-green-700 font-bold text-sm hover:underline"
          >
            Ver repuestos en la tienda →
          </a>
        </div>
      </section>

      <SeccionPasos />

      <section className="py-16 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <Cobertura />
        </div>
      </section>

      <SeccionFaq items={faqCompleta} />
      <CtaFinal titulo={`Tu equipo ${marca.marca} en buenas manos`} mensajeWhatsApp={mensajeWhatsApp} />
      <LandingFooter slugActual={marca.slug} />
    </main>
  )
}

// ─── Secciones comunes a los dos tipos ──────────────────────────────────────

function SeccionFallas({
  titulo,
  fallas,
  fondo = false,
}: {
  titulo: string
  fallas: { titulo: string; texto: string }[]
  fondo?: boolean
}) {
  return (
    <section className={`py-20 px-4 ${fondo ? 'bg-slate-50' : ''}`}>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center">{titulo}</h2>
        <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
          ¿Reconoces alguna? Descríbela en el formulario y el técnico llega con contexto.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fallas.map((falla, i) => (
            <div key={i} className={`${fondo ? 'bg-white' : 'bg-slate-50'} border border-slate-100 rounded-2xl p-5`}>
              <h3 className="font-bold text-slate-900 text-[15px] mb-1.5">{falla.titulo}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{falla.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SeccionPrecios({
  mantenimiento,
  nota,
  fondo = false,
}: {
  mantenimiento: { texto: string; valor: number; desde?: boolean }
  nota?: string
  fondo?: boolean
}) {
  return (
    <section className={`py-20 px-4 ${fondo ? 'bg-slate-50' : ''}`}>
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
              <p className="text-slate-500 text-sm">{mantenimiento.texto}</p>
            </div>
            <p className="font-black text-green-700 text-lg whitespace-nowrap">
              {mantenimiento.desde ? <span className="text-sm font-semibold text-slate-500">desde </span> : null}
              ${formatCOP(mantenimiento.valor)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-bold text-slate-900">Reparación</p>
              <p className="text-slate-500 text-sm">Cotización del técnico tras el diagnóstico. La apruebas o rechazas sin compromiso.</p>
            </div>
            <p className="font-bold text-slate-600 text-sm whitespace-nowrap">Según cotización</p>
          </div>
        </div>
        {nota && <p className="text-slate-500 text-sm text-center mt-4">{nota}</p>}
      </div>
    </section>
  )
}

function Cobertura() {
  return (
    <div>
      <h2 className="text-xl font-black text-slate-900 mb-4">📍 Zonas de cobertura</h2>
      <p className="text-slate-500 text-sm mb-4">Atendemos Bogotá y municipios de la Sabana:</p>
      <div className="flex flex-wrap gap-2">
        {COBERTURA_SEO.map((ciudad) => (
          <span key={ciudad} className="bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-sm text-slate-700 font-medium">
            {ciudad}
          </span>
        ))}
      </div>
      <p className="text-slate-500 text-xs mt-4">
        ¿Tu municipio no aparece? Envía la solicitud igual: si hay técnico verificado en tu zona, la recibe.
      </p>
    </div>
  )
}
