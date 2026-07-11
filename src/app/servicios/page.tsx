import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SERVICIOS_SEO } from '@/lib/constants/servicios-seo'

// Índice público de las landing pages SEO /servicios/[slug].

// Dominio canónico fijo (ver nota en robots.ts): el canonical NUNCA debe
// apuntar al alias baird-app.vercel.app, y NEXT_PUBLIC_APP_URL puede serlo.
const BASE_URL = 'https://lineablanca.bairdservice.com'

export const metadata: Metadata = {
  title: 'Reparación de Electrodomésticos a Domicilio en Bogotá | Baird Service',
  description:
    'Reparación a domicilio de neveras, lavadoras, secadoras, estufas, hornos, lavavajillas y aires acondicionados en Bogotá y la Sabana. Técnicos verificados.',
  alternates: { canonical: `${BASE_URL}/servicios` },
  openGraph: {
    title: 'Reparación de Electrodomésticos a Domicilio en Bogotá | Baird Service',
    description:
      'Reparación a domicilio de neveras, lavadoras, secadoras, estufas, hornos, lavavajillas y aires acondicionados en Bogotá y la Sabana. Técnicos verificados.',
    url: `${BASE_URL}/servicios`,
    siteName: 'Baird Service',
    locale: 'es_CO',
    type: 'website',
  },
}

export default function ServiciosIndexPage() {
  return (
    <main className="min-h-screen bg-white">
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
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
            Reparación de electrodomésticos a domicilio en Bogotá
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mx-auto">
            Técnicos verificados con foto y documento, cotización antes de reparar y coordinación
            completa por WhatsApp. Elige tu equipo:
          </p>
        </div>
      </section>

      {/* ── GRID DE SERVICIOS ──────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SERVICIOS_SEO.map((s) => (
            <Link
              key={s.slug}
              href={`/servicios/${s.slug}`}
              className="group bg-slate-50 hover:bg-white border border-slate-100 hover:border-green-200 hover:shadow-md rounded-2xl p-6 transition-all duration-200 hover:-translate-y-0.5"
            >
              <span className="text-3xl block mb-3 group-hover:scale-110 transition-transform origin-left">{s.emoji}</span>
              <h2 className="font-bold text-slate-900 mb-1.5">{s.h1}</h2>
              <p className="text-slate-500 text-sm leading-relaxed line-clamp-2">{s.metaDescription}</p>
              <span className="inline-block mt-3 text-green-700 text-sm font-semibold">Ver servicio →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="bg-slate-950 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-4">¿Listo para solicitar?</h2>
          <p className="text-white/50 mb-8">Describe la falla y un técnico verificado de tu zona la toma por WhatsApp.</p>
          <Link href="/solicitar">
            <button className="bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-xl shadow-green-500/20 hover:-translate-y-0.5 transition-all duration-200">
              Solicitar servicio →
            </button>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-white/5 py-10 px-4">
        <div className="max-w-4xl mx-auto pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/20 text-xs">© 2026 Baird Service S.A.S. — Colombia</p>
          <div className="flex gap-6 text-xs text-white/30">
            <Link href="/" className="hover:text-white/60 transition-colors">Inicio</Link>
            <Link href="/solicitar" className="hover:text-white/60 transition-colors">Solicitar servicio</Link>
            <Link href="/registro" className="hover:text-white/60 transition-colors">Soy técnico</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
