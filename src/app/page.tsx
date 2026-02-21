import Image from 'next/image'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════
// ✏️  CONTENIDO EDITABLE
// Cambia aquí todos los textos, números y listas de la landing page.
// No necesitas tocar el JSX para actualizaciones de contenido.
// ═══════════════════════════════════════════════════════════════════
const CONTENIDO = {

  // ── Hero principal ──────────────────────────────────────────────
  hero: {
    titulo: 'Tu técnico de confianza,\nen tu puerta hoy mismo',
    subtitulo:
      'Conectamos clientes con técnicos certificados en Colombia. Describe el problema, un técnico acepta por WhatsApp y coordinas la visita en minutos.',
    ctaCliente: 'Solicitar servicio ahora',
    ctaTecnico: 'Únete como técnico',
    badgeTexto: '✅ Solo técnicos verificados por Baird',
  },

  // ── Barra de estadísticas ────────────────────────────────────────
  stats: [
    { numero: '8', label: 'Tipos de equipos cubiertos' },
    { numero: '100%', label: 'Técnicos verificados con foto e ID' },
    { numero: 'WhatsApp', label: 'Canal directo con tu técnico' },
  ],

  // ── Sección ¿Cómo funciona? (clientes) ─────────────────────────
  comoFunciona: {
    titulo: '¿Cómo funciona para el cliente?',
    subtitulo: 'De la solicitud al técnico en tu puerta — sin llamadas, sin esperas.',
    pasos: [
      {
        numero: '01',
        titulo: 'Describe tu problema',
        descripcion:
          'Ingresa el tipo de equipo, la falla, tu dirección, dos horarios disponibles y el valor que ofreces al técnico.',
        emoji: '📝',
      },
      {
        numero: '02',
        titulo: 'Un técnico acepta por WhatsApp',
        descripcion:
          'Los técnicos de tu zona reciben la oferta. El primero en aceptar es asignado. Recibes su foto, nombre y número de documento por WhatsApp.',
        emoji: '📲',
      },
      {
        numero: '03',
        titulo: 'Técnico verificado a tu puerta',
        descripcion:
          'Tu técnico llega al horario acordado. Identidad verificada por Baird Service. Tú ya sabías quién venía antes de abrir la puerta.',
        emoji: '🏠',
      },
    ],
  },

  // ── Beneficios para el cliente ──────────────────────────────────
  beneficiosCliente: {
    titulo: 'Todo lo que necesitas, sin complicaciones',
    subtitulo: 'Pensado para que confíes desde el primer momento.',
    items: [
      {
        emoji: '🛡️',
        titulo: 'Técnicos 100% verificados',
        descripcion:
          'Foto, número de documento y especialidades confirmadas por Baird antes de que lleguen a tu casa.',
      },
      {
        emoji: '💰',
        titulo: 'Tú defines el precio',
        descripcion:
          'Propones el valor del servicio. El técnico decide si acepta o no. Sin sorpresas al final.',
      },
      {
        emoji: '📲',
        titulo: 'Todo por WhatsApp',
        descripcion:
          'Sin apps que descargar. La coordinación, la confirmación y los datos del técnico llegan directo a tu WhatsApp.',
      },
      {
        emoji: '⚡',
        titulo: 'Respuesta rápida',
        descripcion:
          'El primer técnico disponible en tu zona acepta en minutos. No esperas horas por una llamada que nunca llega.',
      },
      {
        emoji: '📋',
        titulo: 'Garantía de servicio',
        descripcion:
          'Soporte para solicitudes de garantía de marca. Ingresa el número de serie y lo manejamos por ti.',
      },
      {
        emoji: '🧰',
        titulo: '8 tipos de equipos',
        descripcion:
          'Lavadoras, neveras, hornos, estufas, aires acondicionados, secadoras, lavavajillas y nevecones.',
      },
    ],
  },

  // ── Sección para técnicos ───────────────────────────────────────
  tecnico: {
    titulo: '¿Eres técnico de electrodomésticos?',
    subtitulo: 'Recibe solicitudes de servicio directamente en tu WhatsApp, sin intermediarios y sin pagar comisiones.',
    beneficios: [
      {
        emoji: '📬',
        titulo: 'Solicitudes en tu zona',
        descripcion: 'Filtramos por ciudad y especialidad. Solo recibes trabajos para los que eres experto.',
      },
      {
        emoji: '💸',
        titulo: 'Ves cuánto pagan antes de aceptar',
        descripcion: 'El cliente define el pago. Tú ves el monto, la dirección y el diagnóstico antes de decidir.',
      },
      {
        emoji: '🚀',
        titulo: 'El primero que acepta, gana',
        descripcion: 'Sin subastas, sin esperas. Toca "Aceptar" en el link que te llega y el trabajo es tuyo.',
      },
      {
        emoji: '📵',
        titulo: 'Sin apps adicionales',
        descripcion: 'Todo ocurre en WhatsApp, que ya tienes en tu teléfono. Cero fricción para empezar.',
      },
    ],
    cta: 'Registrarme como técnico →',
  },

  // ── Trust signals ───────────────────────────────────────────────
  confianza: {
    titulo: '¿Por qué confiar en Baird Service?',
    items: [
      {
        emoji: '🪪',
        titulo: 'Identidad verificada',
        descripcion:
          'Cada técnico sube su foto de perfil y foto de su documento de identidad. El cliente recibe ambas por WhatsApp al confirmarse el servicio.',
      },
      {
        emoji: '🔒',
        titulo: 'Pago acordado de antemano',
        descripcion:
          'El valor del servicio se establece antes de que el técnico llegue. No hay regateos ni cobros extra sorpresa.',
      },
      {
        emoji: '🎯',
        titulo: 'Especialistas, no generalistas',
        descripcion:
          'Cada técnico declara y verifica sus especialidades. Tu nevera la repara alguien que sabe de neveras.',
      },
    ],
  },

  // ── Equipos cubiertos ───────────────────────────────────────────
  equipos: [
    { emoji: '🫧', nombre: 'Lavadora' },
    { emoji: '🧊', nombre: 'Nevera' },
    { emoji: '🧊', nombre: 'Nevecón' },
    { emoji: '🔥', nombre: 'Horno' },
    { emoji: '🍳', nombre: 'Estufa' },
    { emoji: '❄️', nombre: 'Aire Acondicionado' },
    { emoji: '💨', nombre: 'Secadora' },
    { emoji: '🫗', nombre: 'Lavavajillas' },
  ],

  // ── CTA final ───────────────────────────────────────────────────
  ctaFinal: {
    titulo: '¿Listo para empezar?',
    subtitulo: 'Elige cómo quieres usar Baird Service.',
    ctaCliente: 'Solicitar servicio →',
    ctaTecnico: 'Registrarme como técnico →',
  },

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    copyright: '© 2025 Baird Service — Marketplace de Servicios Técnicos en Colombia',
    tagline: 'Técnicos verificados · Coordinación por WhatsApp · Sin apps adicionales',
  },
}
// ═══════════════════════════════════════════════════════════════════
// Fin del contenido editable
// ═══════════════════════════════════════════════════════════════════

export default function Home() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">

      {/* ─── HERO ─────────────────────────────────────────────────────
          ✏️ Editar texto: CONTENIDO.hero
          ✏️ Editar colores del fondo: clases bg-* en el div principal
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 pt-8 pb-24 overflow-hidden">

        {/* Decoración de fondo — manchas de color vibrantes */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-green-500 rounded-full opacity-20 blur-[120px] -translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-600 rounded-full opacity-25 blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-80 h-80 bg-emerald-400 rounded-full opacity-10 blur-3xl translate-x-1/2 pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-indigo-600 rounded-full opacity-15 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">

          {/* Logo — contenedor con fondo translúcido para máxima visibilidad */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl px-10 py-5 mb-8 shadow-2xl">
            <div className="relative w-72 h-24">
              <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)]" priority />
            </div>
          </div>

          {/* Badge de confianza */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-8">
            <span className="text-sm text-white/90 font-medium">{CONTENIDO.hero.badgeTexto}</span>
          </div>

          {/* Headline principal */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6 tracking-tight">
            {CONTENIDO.hero.titulo.split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i === 1 ? (
                  <span className="bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    {line}
                  </span>
                ) : line}
              </span>
            ))}
          </h1>

          {/* Subtítulo */}
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mb-12 leading-relaxed">
            {CONTENIDO.hero.subtitulo}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/solicitar">
              <button className="w-full sm:w-auto bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-10 rounded-2xl text-lg shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-105 transition-all duration-200">
                {CONTENIDO.hero.ctaCliente}
              </button>
            </Link>
            <Link href="/registro">
              <button className="w-full sm:w-auto bg-white/10 backdrop-blur-sm hover:bg-white/20 border border-white/30 hover:border-white/50 text-white font-bold py-4 px-10 rounded-2xl text-lg transition-all duration-200 hover:scale-105">
                {CONTENIDO.hero.ctaTecnico}
              </button>
            </Link>
          </div>

          {/* Indicador de scroll */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
            <span className="text-white text-xs tracking-widest uppercase">Conoce más</span>
            <svg className="w-5 h-5 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ────────────────────────────────────────────────
          ✏️ Editar números y labels: CONTENIDO.stats
      ──────────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-green-600 to-green-700 py-10 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {CONTENIDO.stats.map((stat, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-4xl font-black text-white">{stat.numero}</span>
              <span className="text-green-100 text-sm mt-1 font-medium">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CÓMO FUNCIONA ────────────────────────────────────────────
          ✏️ Editar pasos: CONTENIDO.comoFunciona.pasos
          ✏️ Editar título: CONTENIDO.comoFunciona.titulo
      ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-green-600 font-semibold text-sm tracking-widest uppercase">Simple y rápido</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3 mb-4">
              {CONTENIDO.comoFunciona.titulo}
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              {CONTENIDO.comoFunciona.subtitulo}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Línea conectora — solo desktop */}
            <div className="hidden md:block absolute top-16 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-green-200 via-green-400 to-green-200 z-0" />

            {CONTENIDO.comoFunciona.pasos.map((paso, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-green-200 rotate-3 hover:rotate-0 transition-transform duration-300">
                  {paso.emoji}
                </div>
                <div className="bg-green-50 text-green-600 font-black text-xs px-3 py-1 rounded-full mb-3 tracking-widest">
                  PASO {paso.numero}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{paso.titulo}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{paso.descripcion}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/solicitar">
              <button className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200">
                {CONTENIDO.hero.ctaCliente}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── EQUIPOS CUBIERTOS ────────────────────────────────────────
          ✏️ Editar equipos: CONTENIDO.equipos
      ──────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-green-600 font-semibold text-sm tracking-widest uppercase">Línea blanca completa</span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3 mb-10">
            Reparamos los equipos que usas cada día
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {CONTENIDO.equipos.map((eq, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm border border-gray-100 hover:border-green-200 hover:shadow-md transition-all duration-200 group">
                <span className="text-3xl group-hover:scale-110 transition-transform duration-200">{eq.emoji}</span>
                <span className="text-sm font-semibold text-slate-700">{eq.nombre}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BENEFICIOS PARA EL CLIENTE ───────────────────────────────
          ✏️ Editar beneficios: CONTENIDO.beneficiosCliente.items
          ✏️ Editar título: CONTENIDO.beneficiosCliente.titulo
      ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-green-600 font-semibold text-sm tracking-widest uppercase">Para clientes</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3 mb-4">
              {CONTENIDO.beneficiosCliente.titulo}
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              {CONTENIDO.beneficiosCliente.subtitulo}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CONTENIDO.beneficiosCliente.items.map((item, i) => (
              <div
                key={i}
                className="group bg-slate-50 hover:bg-gradient-to-br hover:from-green-50 hover:to-blue-50 border border-gray-100 hover:border-green-200 rounded-2xl p-6 transition-all duration-300 hover:shadow-md"
              >
                <div className="text-3xl mb-4">{item.emoji}</div>
                <h3 className="font-bold text-slate-900 mb-2 text-lg">{item.titulo}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECCIÓN TÉCNICOS ─────────────────────────────────────────
          ✏️ Editar texto: CONTENIDO.tecnico
          ✏️ Editar fondo: clases bg-* en el section
      ──────────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-blue-400 font-semibold text-sm tracking-widest uppercase">Para técnicos</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mt-3 mb-4">
              {CONTENIDO.tecnico.titulo}
            </h2>
            <p className="text-white/60 text-lg max-w-xl mx-auto">
              {CONTENIDO.tecnico.subtitulo}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            {CONTENIDO.tecnico.beneficios.map((item, i) => (
              <div
                key={i}
                className="bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-400/40 hover:bg-white/10 rounded-2xl p-6 transition-all duration-300"
              >
                <div className="text-3xl mb-4">{item.emoji}</div>
                <h3 className="font-bold text-white mb-2 text-lg">{item.titulo}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{item.descripcion}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/registro">
              <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-lg shadow-blue-500/30 hover:scale-105 transition-all duration-200">
                {CONTENIDO.tecnico.cta}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── CONFIANZA / TRUST SIGNALS ────────────────────────────────
          ✏️ Editar items de confianza: CONTENIDO.confianza.items
      ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-green-600 font-semibold text-sm tracking-widest uppercase">Seguridad primero</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">
              {CONTENIDO.confianza.titulo}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {CONTENIDO.confianza.items.map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-100 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm">
                  {item.emoji}
                </div>
                <h3 className="font-bold text-slate-900 text-xl mb-3">{item.titulo}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ────────────────────────────────────────────────
          ✏️ Editar texto: CONTENIDO.ctaFinal
          ✏️ Editar degradado del fondo: clases from-* to-* en el section
      ──────────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-green-600 via-green-700 to-blue-700 py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            {CONTENIDO.ctaFinal.titulo}
          </h2>
          <p className="text-white/80 text-lg mb-12 max-w-xl mx-auto">
            {CONTENIDO.ctaFinal.subtitulo}
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center">

            {/* Card Cliente */}
            <Link href="/solicitar" className="group">
              <div className="bg-white rounded-3xl p-8 shadow-2xl hover:scale-105 transition-all duration-300 text-left max-w-xs mx-auto">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center text-2xl mb-5 shadow-md group-hover:scale-110 transition-transform duration-300">
                  🏠
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Soy cliente</h3>
                <p className="text-gray-500 text-sm mb-6">Necesito reparar mi electrodoméstico</p>
                <span className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3 px-6 rounded-xl text-sm inline-block shadow-md group-hover:shadow-green-300/50 group-hover:shadow-lg transition-all">
                  {CONTENIDO.ctaFinal.ctaCliente}
                </span>
              </div>
            </Link>

            {/* Card Técnico */}
            <Link href="/registro" className="group">
              <div className="bg-white rounded-3xl p-8 shadow-2xl hover:scale-105 transition-all duration-300 text-left max-w-xs mx-auto">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-2xl mb-5 shadow-md group-hover:scale-110 transition-transform duration-300">
                  🔧
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Soy técnico</h3>
                <p className="text-gray-500 text-sm mb-6">Quiero recibir solicitudes en mi zona</p>
                <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-3 px-6 rounded-xl text-sm inline-block shadow-md group-hover:shadow-blue-300/50 group-hover:shadow-lg transition-all">
                  {CONTENIDO.ctaFinal.ctaTecnico}
                </span>
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────
          ✏️ Editar texto: CONTENIDO.footer
      ──────────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 py-10 px-4">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="relative w-48 h-16 opacity-90">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain" />
          </div>
          <p className="text-white/40 text-sm text-center">{CONTENIDO.footer.tagline}</p>
          <p className="text-white/30 text-xs text-center">{CONTENIDO.footer.copyright}</p>
        </div>
      </footer>

    </main>
  )
}
