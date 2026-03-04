import Image from 'next/image'
import Link from 'next/link'

const CONTENIDO = {
  hero: {
    badge: '✦ Solo técnicos verificados por Baird',
    titulo: 'Tu técnico de confianza,\nen tu puerta hoy mismo',
    subtitulo:
      'Describe el problema, el técnico recibe la oferta por WhatsApp y coordinas la visita en minutos. Sin llamadas, sin esperas.',
    ctaCliente: 'Solicitar servicio',
    ctaTecnico: 'Soy técnico',
  },
  stats: [
    { numero: '8', label: 'Tipos de equipos cubiertos' },
    { numero: '100%', label: 'Técnicos con foto e ID verificados' },
    { numero: '<15 min', label: 'Tiempo promedio de asignación' },
  ],
  comoFunciona: {
    overline: 'Simple y rápido',
    titulo: '¿Cómo funciona?',
    subtitulo: 'De la solicitud al técnico en tu puerta — sin apps, sin llamadas.',
    pasos: [
      {
        num: '01',
        emoji: '📝',
        titulo: 'Describe el problema',
        texto: 'Ingresa el equipo, la falla, tu dirección, dos horarios disponibles y el valor que ofreces al técnico.',
      },
      {
        num: '02',
        emoji: '📲',
        titulo: 'Un técnico acepta por WhatsApp',
        texto: 'Los técnicos verificados de tu zona reciben la oferta. El primero en aceptar es asignado al instante.',
      },
      {
        num: '03',
        emoji: '🏠',
        titulo: 'Técnico verificado en tu puerta',
        texto: 'Recibes por WhatsApp la foto, nombre y documento del técnico antes de que llegue. Tú sabías quién venía.',
      },
    ],
  },
  equipos: [
    { emoji: '🫧', nombre: 'Lavadora' },
    { emoji: '🧊', nombre: 'Nevera' },
    { emoji: '🧊', nombre: 'Nevecón' },
    { emoji: '🔥', nombre: 'Horno' },
    { emoji: '🍳', nombre: 'Estufa' },
    { emoji: '❄️', nombre: 'A/C' },
    { emoji: '💨', nombre: 'Secadora' },
    { emoji: '🫗', nombre: 'Lavavajillas' },
  ],
  beneficios: [
    {
      icon: '🛡️',
      titulo: 'Técnicos 100% verificados',
      texto: 'Foto, documento de identidad y especialidades confirmadas por Baird antes de atender servicios.',
    },
    {
      icon: '💰',
      titulo: 'Tú propones el precio',
      texto: 'El valor del servicio lo defines tú. El técnico lo ve antes de aceptar. Sin sorpresas al final.',
    },
    {
      icon: '📲',
      titulo: 'Todo por WhatsApp',
      texto: 'Sin apps que descargar. Confirmación, datos del técnico y coordinación llegan a tu WhatsApp.',
    },
    {
      icon: '⚡',
      titulo: 'Respuesta en minutos',
      texto: 'El primer técnico disponible en tu zona acepta rápido. No esperas horas por una llamada.',
    },
    {
      icon: '📋',
      titulo: 'Soporte para garantías',
      texto: 'Servicio en garantía de marca? Ingresa el número de serie y lo gestionamos directamente.',
    },
    {
      icon: '🎯',
      titulo: 'Especialistas, no generalistas',
      texto: 'Tu nevera la repara alguien que sabe de neveras. Cada técnico declara y verifica sus especialidades.',
    },
  ],
  tecnico: {
    overline: 'Para técnicos',
    titulo: '¿Eres técnico de electrodomésticos?',
    subtitulo: 'Recibe trabajos directo en tu WhatsApp. Ves el pago y la dirección antes de aceptar.',
    beneficios: [
      { emoji: '📬', titulo: 'Trabajos en tu zona', texto: 'Filtramos por ciudad y especialidad. Solo recibes lo que sabes hacer.' },
      { emoji: '💸', titulo: 'Ves el pago antes de aceptar', texto: 'El cliente define el valor. Tú decides si vale la pena antes de comprometerte.' },
      { emoji: '🚀', titulo: 'El primero que acepta, gana', texto: 'Sin subastas ni esperas. Toca el link que llega a tu WhatsApp y el trabajo es tuyo.' },
      { emoji: '📵', titulo: 'Sin apps adicionales', texto: 'Todo en WhatsApp. Cero fricción para empezar a recibir clientes.' },
    ],
    cta: 'Registrarme como técnico',
  },
  confianza: [
    { emoji: '🪪', titulo: 'Identidad verificada', texto: 'El cliente recibe la foto y el documento del técnico por WhatsApp al confirmarse el servicio.' },
    { emoji: '🔒', titulo: 'Pago acordado antes de la visita', texto: 'El valor del servicio se establece antes de que el técnico llegue. No hay cobros sorpresa.' },
    { emoji: '🤝', titulo: 'Compromiso de calidad', texto: 'Solo técnicos que cumplen los estándares de Baird pueden recibir solicitudes.' },
  ],
  footer: {
    copyright: '© 2026 Baird Service S.A.S. — Colombia',
    tagline: 'Técnicos verificados · WhatsApp · Sin apps adicionales',
  },
}

// ── Componente: Mockup de WhatsApp ──────────────────────────────────────────
function WhatsAppMockup() {
  return (
    <div className="relative flex justify-center">
      {/* Halo de fondo */}
      <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-75 pointer-events-none" />

      {/* Marco del teléfono */}
      <div className="relative w-64 bg-slate-800 rounded-[2.8rem] p-[10px] shadow-2xl shadow-black/60 border border-slate-700/60 ring-1 ring-white/5">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-800 rounded-b-2xl z-10" />

        {/* Pantalla */}
        <div className="bg-[#ECE5DD] rounded-[2.2rem] overflow-hidden min-h-[480px] flex flex-col">

          {/* Header WhatsApp */}
          <div className="bg-[#075E54] pt-8 pb-3 px-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-black shadow-inner">
              BS
            </div>
            <div>
              <p className="text-white text-[13px] font-semibold leading-tight">Baird Service</p>
              <p className="text-green-200 text-[11px]">en línea</p>
            </div>
          </div>

          {/* Fondo con patrón sutil */}
          <div className="flex-1 p-3 space-y-2" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23000\' fill-opacity=\'.03\'/%3E%3C/g%3E%3C/svg%3E")' }}>

            {/* Mensaje entrante */}
            <div className="max-w-[88%]">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold text-[#075E54] mb-1.5">Baird Service</p>
                <p className="text-[11px] text-gray-800 leading-relaxed">
                  🔧 <span className="font-semibold">Nueva solicitud</span>
                  <br />📋 Lavadora Samsung
                  <br />🛠 Rodamiento desgastado
                  <br />📍 Chapinero, Bogotá
                  <br /><span className="text-[10px] text-gray-500">🗓 Lun 24 Feb, 8am–12pm</span>
                </p>
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[13px] font-black text-green-700">💰 $180.000 COP</p>
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-1">10:23 AM ✓✓</p>
              </div>
              {/* Botón de acción */}
              <div className="bg-white rounded-xl rounded-tl-sm mt-0.5 shadow-sm overflow-hidden">
                <div className="border-t border-gray-100 py-2 text-center">
                  <span className="text-[11px] text-[#00a884] font-semibold">👉 Ver y Aceptar</span>
                </div>
              </div>
            </div>

            {/* Respuesta del técnico */}
            <div className="flex justify-end mt-3">
              <div className="bg-[#DCF8C6] rounded-xl rounded-tr-sm px-3 py-2 shadow-sm max-w-[65%]">
                <p className="text-[12px] font-semibold text-gray-800">ACEPTO ✅</p>
                <p className="text-[10px] text-gray-400 text-right mt-0.5">10:24 AM ✓✓</p>
              </div>
            </div>

            {/* Mensaje de confirmación */}
            <div className="max-w-[88%]">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <p className="text-[11px] text-gray-800 leading-relaxed">
                  ✅ <span className="font-semibold text-green-700">¡Servicio asignado!</span>
                  <br />
                  <span className="text-[10px] text-gray-500">
                    Tu técnico Carlos R. está confirmado.<br />
                    WhatsApp: +57 312 *** ***
                  </span>
                </p>
                <p className="text-[10px] text-gray-400 text-right mt-1">10:24 AM ✓✓</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">

      {/* ── NAVBAR ──────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="relative w-36 h-10 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" priority />
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-6 text-sm text-white/60">
            <Link href="/#como-funciona" className="hover:text-white transition-colors">Cómo funciona</Link>
            <Link href="/#equipos" className="hover:text-white transition-colors">Equipos</Link>
            <Link href="/registro" className="hover:text-white transition-colors">Soy técnico</Link>
          </nav>

          {/* CTA */}
          <Link href="/solicitar">
            <button className="bg-green-500 hover:bg-green-400 active:bg-green-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/40">
              Solicitar servicio
            </button>
          </Link>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen bg-slate-950 flex flex-col justify-center px-4 pt-24 pb-16 overflow-hidden">

        {/* Orbes de fondo */}
        <div className="absolute top-0 left-0 w-[700px] h-[700px] bg-green-500 rounded-full opacity-[0.07] blur-[140px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-600 rounded-full opacity-[0.10] blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-900 rounded-full opacity-20 blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Texto */}
            <div className="flex flex-col items-start text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-8">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/80 text-sm font-medium">{CONTENIDO.hero.badge}</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] mb-6 tracking-tight">
                {CONTENIDO.hero.titulo.split('\n').map((line, i) => (
                  <span key={i} className="block">
                    {i === 1
                      ? <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent">{line}</span>
                      : line
                    }
                  </span>
                ))}
              </h1>

              <p className="text-lg text-white/60 leading-relaxed mb-10 max-w-lg">
                {CONTENIDO.hero.subtitulo}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link href="/solicitar" className="w-full sm:w-auto">
                  <button className="w-full bg-green-500 hover:bg-green-400 active:bg-green-600 text-white font-bold py-4 px-8 rounded-2xl text-base shadow-xl shadow-green-500/30 hover:shadow-green-500/50 hover:-translate-y-0.5 transition-all duration-200">
                    {CONTENIDO.hero.ctaCliente} →
                  </button>
                </Link>
                <Link href="/registro" className="w-full sm:w-auto">
                  <button className="w-full bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 text-white font-semibold py-4 px-8 rounded-2xl text-base transition-all duration-200 hover:-translate-y-0.5">
                    {CONTENIDO.hero.ctaTecnico}
                  </button>
                </Link>
              </div>

              {/* Trust micro-signals */}
              <div className="flex items-center gap-4 mt-8 text-white/40 text-xs">
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Gratis para clientes</span>
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Sin registro previo</span>
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Pago al técnico directamente</span>
              </div>
            </div>

            {/* Mockup WhatsApp */}
            <div className="hidden lg:flex justify-center items-center">
              <WhatsAppMockup />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-30">
          <span className="text-white text-[10px] tracking-[0.2em] uppercase">scroll</span>
          <svg className="w-4 h-4 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-green-600 to-green-700 py-10 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-px bg-green-500/30 rounded-2xl overflow-hidden">
          {CONTENIDO.stats.map((s, i) => (
            <div key={i} className="bg-green-600/60 backdrop-blur-sm flex flex-col items-center py-7 px-6 text-center">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">{s.numero}</span>
              <span className="text-green-100/80 text-sm mt-1.5 font-medium leading-snug">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ───────────────────────────────────────────── */}
      <section id="como-funciona" className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mb-4">
              {CONTENIDO.comoFunciona.overline}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              {CONTENIDO.comoFunciona.titulo}
            </h2>
            <p className="text-slate-500 text-lg max-w-lg mx-auto">
              {CONTENIDO.comoFunciona.subtitulo}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Línea conectora */}
            <div className="hidden md:block absolute top-10 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-gradient-to-r from-transparent via-green-300 to-transparent" />

            {CONTENIDO.comoFunciona.pasos.map((p, i) => (
              <div key={i} className="relative flex flex-col items-center text-center group">
                {/* Número */}
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex flex-col items-center justify-center mb-6 shadow-lg shadow-green-200 group-hover:-translate-y-1 transition-transform duration-300 relative z-10">
                  <span className="text-2xl leading-none">{p.emoji}</span>
                  <span className="text-green-100/80 text-[10px] font-black tracking-widest mt-1">{p.num}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{p.titulo}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{p.texto}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link href="/solicitar">
              <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                Solicitar un servicio ahora →
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── EQUIPOS CUBIERTOS ───────────────────────────────────────── */}
      <section id="equipos" className="bg-slate-50 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-white border border-green-100 rounded-full px-4 py-1.5 mb-4">
            Línea blanca completa
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-10">
            Reparamos los equipos que usas cada día
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {CONTENIDO.equipos.map((eq, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl py-4 px-2 flex flex-col items-center gap-2 shadow-sm border border-slate-100 hover:border-green-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group cursor-default"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform duration-200">{eq.emoji}</span>
                <span className="text-[11px] font-semibold text-slate-600 text-center leading-tight">{eq.nombre}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFICIOS ──────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mb-4">
              Para clientes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Todo lo que necesitas, sin complicaciones
            </h2>
            <p className="text-slate-500 text-lg max-w-lg mx-auto">
              Pensado para que confíes desde el primer momento.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CONTENIDO.beneficios.map((b, i) => (
              <div
                key={i}
                className="group bg-slate-50 hover:bg-white border border-slate-100 hover:border-green-200 hover:shadow-md rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5"
              >
                <div className="w-11 h-11 bg-white group-hover:bg-green-50 border border-slate-100 group-hover:border-green-200 rounded-xl flex items-center justify-center text-xl mb-4 shadow-sm transition-all duration-300">
                  {b.icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5 text-[15px]">{b.titulo}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{b.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN TÉCNICOS ────────────────────────────────────────── */}
      <section className="bg-slate-950 py-24 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600 rounded-full opacity-[0.06] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-600 rounded-full opacity-[0.08] blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-blue-400 font-semibold text-xs tracking-[0.15em] uppercase bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-4">
              {CONTENIDO.tecnico.overline}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              {CONTENIDO.tecnico.titulo}
            </h2>
            <p className="text-white/50 text-lg max-w-lg mx-auto">
              {CONTENIDO.tecnico.subtitulo}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {CONTENIDO.tecnico.beneficios.map((b, i) => (
              <div
                key={i}
                className="flex gap-4 bg-white/5 hover:bg-white/8 border border-white/8 hover:border-blue-400/30 rounded-2xl p-5 transition-all duration-200 group"
              >
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-blue-500/10 transition-colors">
                  {b.emoji}
                </div>
                <div>
                  <h3 className="font-bold text-white text-[15px] mb-1">{b.titulo}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{b.texto}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/registro">
              <button className="bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-200">
                {CONTENIDO.tecnico.cta} →
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONFIANZA ───────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mb-4">
              Seguridad primero
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900">
              ¿Por qué confiar en Baird Service?
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {CONTENIDO.confianza.map((c, i) => (
              <div key={i} className="text-center group">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-50 to-green-50 border border-slate-100 rounded-3xl flex items-center justify-center text-3xl shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                  {c.emoji}
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-3">{c.titulo}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{c.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(74,222,128,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            ¿Listo para empezar?
          </h2>
          <p className="text-white/50 text-lg mb-14 max-w-lg mx-auto">
            Elige cómo quieres usar Baird Service.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center items-stretch">
            {/* Card cliente */}
            <Link href="/solicitar" className="group flex-1 max-w-xs mx-auto sm:mx-0">
              <div className="h-full bg-white rounded-3xl p-8 text-left shadow-2xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center text-2xl mb-5 shadow-lg shadow-green-200 group-hover:scale-110 transition-transform duration-300">
                  🏠
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-1">Soy cliente</h3>
                <p className="text-slate-500 text-sm mb-6">Necesito reparar mi electrodoméstico</p>
                <span className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm inline-block shadow-md">
                  Solicitar servicio →
                </span>
              </div>
            </Link>

            {/* Divisor */}
            <div className="flex sm:flex-col items-center justify-center gap-2 text-white/20 text-sm font-light">
              <div className="flex-1 sm:w-px h-px sm:h-16 bg-white/10" />
              o
              <div className="flex-1 sm:w-px h-px sm:h-16 bg-white/10" />
            </div>

            {/* Card técnico */}
            <Link href="/registro" className="group flex-1 max-w-xs mx-auto sm:mx-0">
              <div className="h-full bg-white rounded-3xl p-8 text-left shadow-2xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center text-2xl mb-5 shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform duration-300">
                  🔧
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-1">Soy técnico</h3>
                <p className="text-slate-500 text-sm mb-6">Quiero recibir trabajos en mi zona</p>
                <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm inline-block shadow-md">
                  Registrarme →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-white/5 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
            {/* Logo */}
            <div className="flex flex-col items-center md:items-start gap-3">
              <div className="relative w-36 h-10">
                <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
              </div>
              <p className="text-white/30 text-xs">{CONTENIDO.footer.tagline}</p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 justify-center md:justify-end text-sm text-white/40">
              <Link href="/solicitar" className="hover:text-white/70 transition-colors">Solicitar servicio</Link>
              <Link href="/registro" className="hover:text-white/70 transition-colors">Registrarse como técnico</Link>
              <Link href="/#como-funciona" className="hover:text-white/70 transition-colors">Cómo funciona</Link>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/5 text-center">
            <p className="text-white/20 text-xs">{CONTENIDO.footer.copyright}</p>
          </div>
        </div>
      </footer>

    </main>
  )
}
