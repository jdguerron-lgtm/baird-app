import Image from 'next/image'
import { EMPRESA } from '@/lib/constants/legal'
import Link from 'next/link'
import MenuMovil from '@/components/MenuMovil'
import { EQUIPOS_HOME } from '@/lib/constants/equipos-home'
import { SERVICIOS_SEO } from '@/lib/constants/servicios-seo'
import {
  ANTICIPO_PORCENTAJE,
  CANCELACION_CUTOFF_HORAS,
  TARIFA_CAMBIO_FILTRO,
  TARIFA_DIAGNOSTICO,
  TARIFAS_MANTENIMIENTO,
} from '@/types/solicitud'
import { ABONO_REPUESTOS_PORCENTAJE } from '@/lib/constants/pagos'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { LOGO_EXTENSIONES, MARCAS_DISTRIBUIDOR } from '@/lib/constants/marcas-distribuidor'
import { formatCOP } from '@/lib/utils/format'

// Montos que ve el cliente en "¿Qué pagas y cuándo?" — salen de las mismas
// constantes que cobra /solicitar y /pago/*, así la home nunca queda
// desalineada con la tarifa real (docs/TARIFAS.md).
const COP = (n: number) => `$${formatCOP(n)}`

// Logo de cada marca distribuida: se usa si existe public/img/marcas/<slug>.<ext>
// (resuelto en el servidor en build/render; sin archivo → wordmark de texto).
function logoMarca(slug: string): string | null {
  for (const ext of LOGO_EXTENSIONES) {
    if (existsSync(path.join(process.cwd(), 'public', 'img', 'marcas', `${slug}.${ext}`))) {
      return `/img/marcas/${slug}.${ext}`
    }
  }
  return null
}
const MARCAS_CON_LOGO = MARCAS_DISTRIBUIDOR.map(m => ({ ...m, logo: logoMarca(m.slug) }))
const ANTICIPO_DIAGNOSTICO = Math.round(TARIFA_DIAGNOSTICO * ANTICIPO_PORCENTAJE)
const MANTENIMIENTO_MIN = Math.min(...Object.values(TARIFAS_MANTENIMIENTO))
const MANTENIMIENTO_MAX = Math.max(...Object.values(TARIFAS_MANTENIMIENTO))

// ── Imágenes propias de marca (generadas para Baird, servidas desde /public) ─
const IMAGES = {
  heroBackground: '/img/hero-cocina.webp',
  kitchenPanorama: '/img/cocina-panoramica.webp',
  technicianWork: '/img/tecnico-trabajo.webp',
  modernKitchen: '/img/cocina-equipos.webp',
  plumberSink: '/img/tecnico-puerta.webp',
  washingMachine: '/img/paso-describe.webp',
  minimalistKitchen: '/img/lavanderia-confianza.webp',
  repairMan: '/img/tecnico-whatsapp.webp',
}

const CONTENIDO = {
  hero: {
    badge: '✦ Solo técnicos verificados por Baird',
    titulo: 'Tu técnico de confianza,\nen tu puerta hoy mismo',
    subtitulo:
      'Cuéntanos qué falla, mira el precio antes de pedir y un técnico verificado llega a tu casa. Todo por WhatsApp: sin llamadas, sin efectivo, sin sorpresas.',
    ctaCliente: 'Solicitar servicio',
    ctaPagos: '¿Qué pagas y cuándo?',
    ctaTecnico: 'Quiero hacer parte del equipo',
  },
  stats: [
    { numero: '8', label: 'Tipos de equipos cubiertos' },
    { numero: '100%', label: 'Técnicos con foto e ID verificados' },
    { numero: '0', label: 'Pagos en efectivo: todo en línea a Baird Service' },
  ],
  comoFunciona: {
    overline: 'Paso a paso',
    titulo: '¿Cómo funciona para ti?',
    subtitulo: 'De la solicitud al equipo funcionando — sin apps, sin llamadas y sabiendo siempre cuánto pagas.',
    pasos: [
      {
        num: '01',
        emoji: '📝',
        titulo: 'Describe el problema y ve el precio',
        texto: 'Ingresa el equipo, la falla, tu dirección y dos horarios. Antes de enviar ves el valor del servicio con IVA incluido. Aún no pagas nada.',
        img: IMAGES.washingMachine,
      },
      {
        num: '02',
        emoji: '📲',
        titulo: 'Un técnico verificado acepta',
        texto: 'Te avisamos por WhatsApp quién va y a qué hora. Para reservar la cita pagas un anticipo del 50% en línea, a Baird Service.',
        img: IMAGES.repairMan,
      },
      {
        num: '03',
        emoji: '🪪',
        titulo: 'Recibes su carnet digital',
        texto: 'Foto, nombre y número de cédula llegan a tu WhatsApp. Al abrir la puerta, lo comparas con su documento físico.',
        img: IMAGES.plumberSink,
      },
      {
        num: '04',
        emoji: '✅',
        titulo: 'Apruebas la cotización y pagas al final',
        texto: 'Tras el diagnóstico recibes la cotización por WhatsApp. Tú decides. Al terminar confirmas que quedó bien y pagas el saldo en línea.',
        img: IMAGES.technicianWork,
      },
    ],
  },
  // Momentos de pago del servicio PARTICULAR (el cliente paga a Baird).
  // Montos derivados de las constantes de tarifas (ver arriba).
  pagos: {
    overline: 'Transparencia total',
    titulo: '¿Qué pagas y cuándo?',
    subtitulo:
      'Así funciona el pago de un servicio particular (fuera de garantía). Siempre a Baird Service, siempre en línea, nunca en efectivo al técnico.',
    momentos: [
      {
        paso: '1',
        cuando: 'Al solicitar',
        monto: '$0',
        titulo: 'Ves el precio, no pagas nada',
        texto: `Diagnóstico o reparación: ${COP(TARIFA_DIAGNOSTICO)} IVA incluido. Mantenimiento preventivo: entre ${COP(MANTENIMIENTO_MIN)} y ${COP(MANTENIMIENTO_MAX)} según el equipo. Cambio de filtro: ${COP(TARIFA_CAMBIO_FILTRO)} con el filtro incluido.`,
      },
      {
        paso: '2',
        cuando: 'Cuando un técnico acepta',
        monto: `${Math.round(ANTICIPO_PORCENTAJE * 100)}%`,
        titulo: 'Anticipo para reservar la cita',
        texto: `Recibes un link de pago seguro (Wompi) por WhatsApp. En un diagnóstico son ${COP(ANTICIPO_DIAGNOSTICO)}. Puedes cancelar o reagendar sin costo hasta ${CANCELACION_CUTOFF_HORAS} horas antes de la visita.`,
      },
      {
        paso: '3',
        cuando: 'Después del diagnóstico',
        monto: 'Tú decides',
        titulo: 'Cotización por WhatsApp',
        texto: `El técnico revisa el equipo y te llega una cotización con el total (diagnóstico + reparación, IVA incluido). Si apruebas y hay repuestos, abonas el ${Math.round(ABONO_REPUESTOS_PORCENTAJE * 100)}% del saldo antes de que los compre. Si no apruebas, solo pagas el diagnóstico.`,
      },
      {
        paso: '4',
        cuando: 'Al terminar',
        monto: 'Saldo',
        titulo: 'Confirmas y pagas lo que falta',
        texto: 'Confirmas por WhatsApp que el equipo quedó funcionando y pagas el saldo restante con otro link seguro. Recibes factura de Baird Service. El técnico nunca te cobra en sitio.',
      },
    ],
    garantia: {
      titulo: '¿Tu equipo está en garantía?',
      texto: 'Servicio particular: todas las marcas. Garantía: por ahora únicamente de productos MABE — pagas $0, la marca cubre el servicio y le paga a Baird Service; solo necesitas el número de orden o serie de tu equipo. Si tu equipo de otra marca está en garantía, contáctate con la marca.',
    },
  },
  // Los equipos viven en EQUIPOS_HOME (src/lib/constants/equipos-home.ts):
  // llevan icono propio y el slug de su landing SEO, validado contra
  // SERVICIOS_SEO para que ninguna tarjeta apunte a un 404.
  beneficios: [
    {
      icon: '🛡️',
      titulo: 'Técnicos 100% verificados',
      texto: 'Foto, documento de identidad y especialidades confirmadas por Baird. Recibes su carnet digital antes de la visita.',
    },
    {
      icon: '💰',
      titulo: 'Precio claro desde el inicio',
      texto: 'Ves el valor con IVA antes de pedir y apruebas cualquier reparación antes de que se haga. Pagas en línea a Baird Service, nunca en efectivo.',
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
      titulo: 'Todas las marcas · Garantía MABE',
      texto: 'Reparamos todas las marcas como servicio particular. En garantía, por ahora solo productos MABE: ingresa el número de orden o serie y lo gestionamos con la marca sin costo para ti.',
    },
    {
      icon: '🎯',
      titulo: 'Especialistas, no generalistas',
      texto: 'Tu nevera la repara alguien que sabe de neveras. Cada técnico declara y verifica sus especialidades.',
    },
  ],
  // La home está enfocada al CLIENTE (2026-10-10): la captación de técnicos
  // queda en un banner compacto + /registro, no en una sección protagonista.
  tecnico: {
    overline: 'Para técnicos',
    titulo: '¿Eres técnico de electrodomésticos?',
    subtitulo: 'Recibe trabajos en tu zona directo en WhatsApp. Ves el pago y la dirección antes de aceptar; Baird Service te paga.',
    cta: 'Quiero hacer parte del equipo',
  },
  confianza: [
    { emoji: '🏅', titulo: 'Calidad certificada ISO 9001', texto: 'Somos una empresa certificada en gestión de calidad bajo la norma internacional ISO 9001.' },
    { emoji: '🪪', titulo: 'Carnet digital del técnico', texto: 'Recibes por WhatsApp y en tu portal el carnet con foto, nombre y número de cédula para cotejar en la puerta. La foto de su documento nunca se comparte.' },
    { emoji: '🔒', titulo: 'Pago seguro a Baird Service', texto: 'El pago se realiza directamente a la empresa por medios electrónicos. No se acepta efectivo.' },
    { emoji: '🤝', titulo: 'Compromiso de calidad', texto: 'Solo técnicos que cumplen los estándares de Baird pueden recibir solicitudes.' },
  ],
  footer: {
    copyright: '© 2026 Baird Service S.A.S. — Colombia',
    tagline: 'Empresa certificada ISO 9001 · Técnicos verificados · Todo por WhatsApp',
    // Verificados en bairdservice.com el 2026-08-05. Razón social y NIT
    // (Ley 1480 art. 50) se muestran desde src/lib/constants/legal.ts.
    direccion: 'Cra 80C # 24D-74, Bogotá, Colombia',
    telefono: '+57 314 241 1888',
    telefonoTel: '+573142411888',
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

            {/* Lo que ve el CLIENTE (2026-10-10): solicitud → técnico con
                carnet digital → anticipo. Antes mostraba el lado del técnico. */}
            {/* Mensaje 1: solicitud recibida */}
            <div className="max-w-[88%]">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold text-[#075E54] mb-1.5">Baird Service</p>
                <p className="text-[11px] text-gray-800 leading-relaxed">
                  ✅ <span className="font-semibold">Solicitud recibida</span>
                  <br />📋 Lavadora Samsung · Diagnóstico
                  <br /><span className="text-[10px] text-gray-500">🗓 Lun 24 Feb, 8am–12pm</span>
                </p>
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[12px] font-black text-green-700">💰 {COP(TARIFA_DIAGNOSTICO)} IVA incl.</p>
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-1">10:23 AM ✓✓</p>
              </div>
            </div>

            {/* Mensaje 2: técnico asignado + carnet */}
            <div className="max-w-[88%] mt-3">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">CR</div>
                  <div className="leading-tight">
                    <p className="text-[11px] font-semibold text-gray-800">Carlos R.</p>
                    <p className="text-[9px] text-emerald-700 font-semibold">✓ Verificado · CC ••123.456</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  🪪 Carnet digital de tu técnico. Al llegar, pídele su cédula y confirma que el número coincida.
                </p>
                <p className="text-[10px] text-gray-400 text-right mt-1">10:41 AM ✓✓</p>
              </div>
              <div className="bg-white rounded-xl rounded-tl-sm mt-0.5 shadow-sm overflow-hidden">
                <div className="border-t border-gray-100 py-2 text-center">
                  <span className="text-[11px] text-[#00a884] font-semibold">👉 Ver mi servicio</span>
                </div>
              </div>
            </div>

            {/* Mensaje 3: anticipo */}
            <div className="max-w-[88%] mt-3">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <p className="text-[11px] text-gray-800 leading-relaxed">
                  💳 <span className="font-semibold">Reserva tu cita</span>
                  <br />
                  <span className="text-[10px] text-gray-500">
                    Anticipo {Math.round(ANTICIPO_PORCENTAJE * 100)}%: <span className="font-semibold text-gray-700">{COP(ANTICIPO_DIAGNOSTICO)}</span> · pago seguro en línea
                  </span>
                </p>
                <p className="text-[10px] text-gray-400 text-right mt-1">10:41 AM ✓✓</p>
              </div>
              <div className="bg-white rounded-xl rounded-tl-sm mt-0.5 shadow-sm overflow-hidden">
                <div className="border-t border-gray-100 py-2 text-center">
                  <span className="text-[11px] text-[#00a884] font-semibold">👉 Pagar anticipo</span>
                </div>
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          {/* En móvil el logo baja a w-40: a w-52 se comía la mitad de un
              viewport de 390px y empujaba el CTA a dos líneas. */}
          <Link href="/" className="relative w-40 sm:w-52 h-12 sm:h-14 block shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="(max-width: 640px) 160px, 208px" className="object-contain object-left" priority />
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
            <Link href="/#como-funciona" className="hover:text-slate-900 transition-colors">Cómo funciona</Link>
            <Link href="/#equipos" className="hover:text-slate-900 transition-colors">Equipos</Link>
            <Link href="/registro" className="hover:text-slate-900 transition-colors">Quiero hacer parte del equipo</Link>
          </nav>

          {/* CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cross-promo: tienda. Botón secundario (ghost outline) para que no
                compita con la CTA primaria verde. External link → target=_blank
                con rel noopener noreferrer. Oculto en mobile para no atestar
                el header — ahí la sirve <MenuMovil />, igual que el nav. */}
            <a
              href="https://tienda.bairdservice.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 py-2 px-3.5 rounded-xl transition-all"
              aria-label="Visitar nuestra tienda online (abre en pestaña nueva)"
            >
              🛒 Nuestra tienda
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17L17 7M7 7h10v10" />
              </svg>
            </a>

            <Link href="/solicitar">
              <button className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold py-2.5 px-4 sm:px-5 rounded-xl text-sm transition-all shadow-md shadow-green-600/20 hover:shadow-green-600/40 whitespace-nowrap">
                Solicitar servicio
              </button>
            </Link>

            <MenuMovil />
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen bg-slate-950 flex flex-col justify-center px-4 pt-24 pb-16 overflow-hidden">

        {/* Hero background image */}
        <div className="absolute inset-0 z-0">
          <Image
            src={IMAGES.heroBackground}
            alt=""
            fill
            className="object-cover opacity-30"
            priority
            sizes="100vw"
          />
          {/* La máscara sube hacia abajo para que el texto del hero mantenga
              contraste AA sobre la foto sin volver a taparla por completo. */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/[0.72] via-slate-950/[0.55] to-slate-950/[0.96]" />
        </div>

        {/* Orbes de fondo */}
        <div className="absolute top-0 left-0 w-[700px] h-[700px] bg-green-500 rounded-full opacity-[0.07] blur-[140px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-600 rounded-full opacity-[0.10] blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-900 rounded-full opacity-10 blur-[100px] pointer-events-none" />

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
                <Link href="/#pagos" className="w-full sm:w-auto">
                  <button className="w-full bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 text-white font-semibold py-4 px-8 rounded-2xl text-base transition-all duration-200 hover:-translate-y-0.5">
                    {CONTENIDO.hero.ctaPagos}
                  </button>
                </Link>
              </div>

              {/* Trust micro-signals */}
              <div className="flex items-center gap-4 mt-8 text-white/70 text-xs">
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Certificados ISO 9001</span>
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Precio antes de pedir</span>
                <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Pago seguro a Baird Service</span>
              </div>
            </div>

            {/* Variante `b` del experimento del hero: foto de un técnico real
                en el hueco que deja el mockup de WhatsApp por debajo de lg.
                Solo se muestra —y solo se descarga la imagen— si el script de
                asignación puso data-hero="b" en el <html>. Ver
                src/lib/analytics/experimentoHero.ts */}
            {/* h-36 y no más: a h-48 el CTA primario se salía del fold en un
                viewport de 390x844, que es justo lo que el test no debe
                cambiar — si mueve el botón, mide layout y no la foto. */}
            <div className="hero-variante-b lg:!hidden -order-1 w-full -mb-2">
              <div className="relative h-36 sm:h-48 rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/40 bg-slate-900">
                <div className="hero-tecnico-foto absolute inset-0" aria-hidden="true" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
                <p className="absolute bottom-4 left-4 right-4 text-white text-sm font-semibold leading-snug">
                  Recibes su carnet digital por WhatsApp antes de que toque tu puerta.
                </p>
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

      {/* ── IMAGE BREAK: Kitchen panorama ─────────────────────────── */}
      <section className="relative h-64 sm:h-80 lg:h-96 overflow-hidden">
        <Image
          src={IMAGES.kitchenPanorama}
          alt="Cocina de un hogar colombiano, luminosa y ordenada, con nevera, estufa y lavadora"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-green-700/30 to-slate-900/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white text-2xl sm:text-3xl lg:text-4xl font-black text-center drop-shadow-lg px-4">
            Electrodomesticos que funcionan. Tecnicos que responden.
          </p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Línea conectora (solo cuando los 4 pasos van en una fila) */}
            <div className="hidden lg:block absolute top-20 left-[calc(12.5%+1rem)] right-[calc(12.5%+1rem)] h-px bg-gradient-to-r from-transparent via-green-300 to-transparent" />

            {CONTENIDO.comoFunciona.pasos.map((p, i) => (
              <div key={i} className="relative flex flex-col items-center text-center group">
                {/* Step image */}
                <div className="relative w-full h-40 rounded-2xl overflow-hidden mb-5 shadow-md">
                  <Image
                    src={p.img}
                    alt={p.titulo}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  {/* Número overlay */}
                  <div className="absolute bottom-3 left-3 w-12 h-12 bg-green-500/90 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center shadow-lg">
                    <span className="text-lg leading-none">{p.emoji}</span>
                    <span className="text-white/80 text-[9px] font-black tracking-widest">{p.num}</span>
                  </div>
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

      {/* ── QUÉ PAGAS Y CUÁNDO (servicio particular) ────────────────── */}
      <section id="pagos" className="py-24 px-4 bg-slate-50 scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-white border border-green-100 rounded-full px-4 py-1.5 mb-4">
              {CONTENIDO.pagos.overline}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              {CONTENIDO.pagos.titulo}
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              {CONTENIDO.pagos.subtitulo}
            </p>
          </div>

          <ol className="relative grid grid-cols-1 md:grid-cols-2 gap-5">
            {CONTENIDO.pagos.momentos.map((m) => (
              <li
                key={m.paso}
                className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-300 flex gap-5"
              >
                <div className="shrink-0 flex flex-col items-center">
                  <span className="w-11 h-11 rounded-xl bg-slate-900 text-white font-black text-lg flex items-center justify-center shadow-md">
                    {m.paso}
                  </span>
                  <span className="mt-2 text-[11px] font-bold text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-1 whitespace-nowrap">
                    {m.monto}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">{m.cuando}</p>
                  <h3 className="font-bold text-slate-900 text-[17px] mb-1.5">{m.titulo}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{m.texto}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-emerald-600 text-white rounded-2xl p-6 flex gap-4 items-start shadow-md">
              <span className="text-3xl leading-none">📋</span>
              <div>
                <h3 className="font-bold text-lg mb-1">{CONTENIDO.pagos.garantia.titulo}</h3>
                <p className="text-emerald-50 text-sm leading-relaxed">{CONTENIDO.pagos.garantia.texto}</p>
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">Regla de oro</p>
              <p className="text-slate-700 text-sm leading-relaxed">
                <span className="font-bold text-slate-900">Nunca pagues en efectivo ni directo al técnico.</span>{' '}
                Todo pago va a Baird Service por link seguro; así tu servicio queda respaldado y con factura.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/solicitar">
              <button className="bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-10 rounded-2xl text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                Pedir mi diagnóstico →
              </button>
            </Link>
            <p className="text-xs text-slate-400 mt-3">
              Precios con IVA incluido. Detalle completo en los{' '}
              <Link href="/terminos" className="underline hover:text-slate-600">Términos y Condiciones</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* ── EQUIPOS CUBIERTOS ───────────────────────────────────────── */}
      <section id="equipos" className="relative bg-slate-50 py-16 px-4 overflow-hidden">
        {/* Subtle background image */}
        <div className="absolute inset-0 z-0">
          <Image
            src={IMAGES.minimalistKitchen}
            alt=""
            fill
            className="object-cover opacity-[0.04]"
            sizes="100vw"
          />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-white border border-green-100 rounded-full px-4 py-1.5 mb-4">
            Línea blanca completa
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-10">
            Reparamos los equipos que usas cada día
          </h2>
          {/* Cada tarjeta enlaza a su landing SEO: es la única ruta de entrada
              a /servicios/[slug] desde el cuerpo de la home, además del footer. */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {EQUIPOS_HOME.map((eq) => (
              <Link
                key={eq.nombre}
                href={`/servicios/${eq.slug}`}
                aria-label={`Reparación de ${eq.nombre.toLowerCase()} en Bogotá`}
                className="bg-white rounded-2xl py-4 px-2 flex flex-col items-center gap-2 shadow-sm border border-slate-100 hover:border-green-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
              >
                <eq.Icon className="w-7 h-7 text-slate-700 group-hover:text-green-600 group-hover:scale-110 transition-all duration-200" />
                <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900 text-center leading-tight">
                  {eq.nombre}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── DISTRIBUIDORES MAYORISTAS OFICIALES ─────────────────────── */}
      <section id="marcas" className="py-16 px-4 bg-white border-y border-slate-100">
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block text-green-600 font-semibold text-xs tracking-[0.15em] uppercase bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mb-4">
            Repuestos 100% originales
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3">
            Distribuidores mayoristas oficiales
          </h2>
          <p className="text-slate-500 text-base max-w-2xl mx-auto mb-10">
            Somos distribuidores mayoristas oficiales de MABE, Whirlpool, Maytag, KitchenAid y Affresh.
            Los repuestos que instala tu técnico son originales y con respaldo de la marca.
          </p>

          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {MARCAS_CON_LOGO.map((m) => (
              <li
                key={m.slug}
                className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-5 flex flex-col items-center justify-center gap-2 hover:border-green-200 hover:shadow-sm transition-all duration-200"
              >
                <div className="relative h-12 w-full flex items-center justify-center">
                  {m.logo ? (
                    <Image
                      src={m.logo}
                      alt={`Logo ${m.nombre}`}
                      fill
                      sizes="(max-width: 640px) 40vw, 160px"
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-xl font-black tracking-tight text-slate-800">{m.nombre}</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 leading-tight">{m.nota}</span>
              </li>
            ))}
          </ul>

          <a
            href="https://tienda.bairdservice.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-8 text-sm font-semibold text-green-700 hover:text-green-800 underline underline-offset-4"
          >
            Ver repuestos originales en nuestra tienda ↗
          </a>
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

      {/* ── IMAGE BREAK: Technician at work ────────────────────────── */}
      <section className="relative h-56 sm:h-72 lg:h-80 overflow-hidden">
        <Image
          src={IMAGES.technicianWork}
          alt="Técnico de Baird Service reparando el motor de una lavadora en un hogar de Bogotá"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/70 via-slate-900/40 to-slate-900/70" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-2">Tecnicos verificados</p>
            <p className="text-white text-xl sm:text-2xl lg:text-3xl font-black drop-shadow-lg">
              Profesionales que saben lo que hacen
            </p>
          </div>
        </div>
      </section>

      {/* ── IMAGE BREAK: Modern kitchen ──────────────────────────── */}
      <section className="relative h-48 sm:h-64 overflow-hidden">
        <Image
          src={IMAGES.modernKitchen}
          alt="Cocina moderna con electrodomésticos de acero inoxidable"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-slate-950/30" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {CONTENIDO.confianza.map((c, i) => (
              <div key={i} className="text-center group">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-50 to-green-50 border border-slate-100 rounded-3xl flex items-center justify-center text-3xl shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                  {c.emoji}
                </div>
                {/* min-h de dos líneas: el título de ISO 9001 envuelve y los
                    demás no, y sin esto los párrafos arrancan a distinta
                    altura en cada tarjeta de la fila. */}
                <h3 className="font-bold text-slate-900 text-lg mb-3 lg:min-h-[3.5rem] flex items-center justify-center">{c.titulo}</h3>
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
            ¿Tu electrodoméstico falló?
          </h2>
          <p className="text-white/50 text-lg mb-10 max-w-lg mx-auto">
            Pide tu diagnóstico ahora. Precio claro, técnico verificado y pago seguro en línea.
          </p>

          <Link href="/solicitar" className="inline-block">
            <button className="bg-green-500 hover:bg-green-400 active:bg-green-600 text-white font-bold py-4 px-12 rounded-2xl text-lg shadow-xl shadow-green-500/30 hover:shadow-green-500/50 hover:-translate-y-0.5 transition-all duration-200">
              Solicitar servicio →
            </button>
          </Link>

          {/* Captación de técnicos: banner compacto (la home es para el cliente). */}
          <div className="mt-16 max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-center gap-4 text-left">
            <span className="text-3xl leading-none">🔧</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-300 mb-0.5">{CONTENIDO.tecnico.overline}</p>
              <p className="text-white font-bold text-[15px] leading-snug">{CONTENIDO.tecnico.titulo}</p>
              <p className="text-white/50 text-sm leading-relaxed mt-1">{CONTENIDO.tecnico.subtitulo}</p>
            </div>
            <Link href="/registro" className="shrink-0">
              <span className="inline-block bg-blue-500 hover:bg-blue-400 text-white font-semibold py-2.5 px-5 rounded-xl text-sm transition-colors">
                {CONTENIDO.tecnico.cta} →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-white/5 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Links SEO a las landing pages por servicio (/servicios/[slug]) */}
          <div className="mb-10 pb-8 border-b border-white/5">
            <p className="text-white/70 text-sm font-semibold mb-3">Servicios en Bogotá y la Sabana:</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              {SERVICIOS_SEO.map((s) => (
                <Link key={s.slug} href={`/servicios/${s.slug}`} className="hover:text-white transition-colors">
                  Reparación de {s.plural}
                </Link>
              ))}
              <Link href="/servicios" className="text-green-400 hover:text-green-300 transition-colors">
                Ver todos →
              </Link>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
            {/* Logo */}
            <div className="flex flex-col items-center md:items-start gap-3">
              <div className="relative w-52 h-14">
                <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="208px" className="object-contain object-left" />
              </div>
              <p className="text-white/70 text-xs">{CONTENIDO.footer.tagline}</p>

              {/* Identificación del proveedor. El Estatuto del Consumidor
                  (Ley 1480 de 2011, art. 50) la exige visible en comercio
                  electrónico. Dirección y teléfono verificados en
                  bairdservice.com; razón social y NIT desde src/lib/constants/legal.ts (2026-10-09). */}
              <address className="not-italic text-white/60 text-xs leading-relaxed text-center md:text-left">
                {EMPRESA.razonSocial} · NIT {EMPRESA.nit}
                <br />
                {CONTENIDO.footer.direccion}
                <br />
                <a href={`tel:${CONTENIDO.footer.telefonoTel}`} className="hover:text-white transition-colors">
                  {CONTENIDO.footer.telefono}
                </a>
              </address>
            </div>

            {/* Links */}
            <div className="flex flex-col gap-3 items-center md:items-end text-sm text-white/70">
              <div className="flex flex-wrap gap-x-8 gap-y-3 justify-center md:justify-end">
                <Link href="/solicitar" className="hover:text-white transition-colors">Solicitar servicio</Link>
                <Link href="/registro" className="hover:text-white transition-colors">Quiero hacer parte del equipo</Link>
                <Link href="/#como-funciona" className="hover:text-white transition-colors">Cómo funciona</Link>
                <a
                  href="https://tienda.bairdservice.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Nuestra tienda ↗
                </a>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center md:justify-end text-xs text-white/60">
                <Link href="/terminos" className="hover:text-white transition-colors">Términos y condiciones</Link>
                <Link href="/politica-privacidad" className="hover:text-white transition-colors">Política de privacidad</Link>
                <Link href="/contrato-tecnico" className="hover:text-white transition-colors">Contrato para técnicos</Link>
                <Link href="/eliminacion-datos" className="hover:text-white transition-colors">Eliminación de datos</Link>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/5 text-center">
            <p className="text-white/50 text-xs">{CONTENIDO.footer.copyright}</p>
          </div>
        </div>
      </footer>

    </main>
  )
}
