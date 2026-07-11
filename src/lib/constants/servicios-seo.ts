/**
 * Contenido de las landing pages SEO públicas /servicios/[slug].
 *
 * Cada entrada genera una página estática indexable (ver
 * src/app/servicios/[slug]/page.tsx) orientada a búsquedas locales tipo
 * "reparación de neveras Bogotá". Los precios NO se escriben aquí: se leen
 * de las constantes canónicas (TARIFA_DIAGNOSTICO, TARIFAS_MANTENIMIENTO)
 * para que un cambio de tarifa se refleje solo en las páginas.
 *
 * Al agregar/quitar una entrada, el sitemap se actualiza solo (sitemap.ts
 * importa SERVICIOS_SEO). Los slugs son URLs públicas: no renombrar sin
 * redirect.
 */

import type { TipoEquipo } from '@/types/solicitud'

export interface ServicioSeo {
  /** Slug público: /servicios/[slug] — no renombrar sin redirect */
  slug: string
  /** Clave del catálogo de tarifas (TARIFAS_MANTENIMIENTO) */
  equipo: TipoEquipo
  emoji: string
  /** Nombre plural para títulos: "neveras" */
  plural: string
  /** <title> — máx ~60 chars */
  metaTitle: string
  /** meta description — máx ~155 chars */
  metaDescription: string
  /** H1 de la página */
  h1: string
  /** Párrafo de introducción (texto único por página) */
  intro: string
  /** Fallas comunes del equipo (contenido único, responde la búsqueda) */
  fallas: { titulo: string; texto: string }[]
  /** Preguntas frecuentes propias del equipo (además de las comunes) */
  faq: { q: string; a: string }[]
  /** Nota extra opcional bajo la tabla de precios (p.ej. cambio de filtro) */
  notaPrecios?: string
}

/** Ciudades mostradas en la sección de cobertura (zona principal de operación). */
export const COBERTURA_SEO: readonly string[] = [
  'Bogotá',
  'Soacha',
  'Chía',
  'Cajicá',
  'Zipaquirá',
  'Cota',
  'Funza',
  'Mosquera',
  'Madrid',
  'La Calera',
]

/** Marcas atendidas en servicios particulares (multimarca). */
export const MARCAS_SEO: readonly string[] = [
  'Mabe',
  'Samsung',
  'LG',
  'Whirlpool',
  'Electrolux',
  'Haceb',
  'Challenger',
  'Abba',
  'Frigidaire',
  'General Electric',
]

export const SERVICIOS_SEO: readonly ServicioSeo[] = [
  {
    slug: 'reparacion-neveras-bogota',
    equipo: 'Nevera',
    emoji: '🧊',
    plural: 'neveras',
    metaTitle: 'Reparación de Neveras a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Técnicos verificados reparan tu nevera o nevecón a domicilio en Bogotá y la Sabana. Diagnóstico con precio fijo, coordinación por WhatsApp y pago seguro.',
    h1: 'Reparación de neveras a domicilio en Bogotá',
    intro:
      'Una nevera dañada no da espera: los alimentos se pierden en horas. Con Baird Service un técnico verificado —con foto y documento confirmados— llega a tu casa en Bogotá o la Sabana, diagnostica la falla y te cotiza la reparación antes de tocar el equipo. Todo se coordina por WhatsApp y el pago se hace a Baird Service por medios electrónicos, nunca en efectivo.',
    fallas: [
      { titulo: 'No enfría o enfría poco', texto: 'La causa más común: fugas de gas refrigerante, compresor desgastado o daño en el termostato. Requiere diagnóstico presencial para confirmar.' },
      { titulo: 'Congela los alimentos en la parte de abajo', texto: 'Suele ser el damper o el termostato que no regula la temperatura entre compartimentos.' },
      { titulo: 'Hace escarcha o hielo excesivo', texto: 'Falla típica del sistema no-frost: resistencia de deshielo, bimetal o tarjeta electrónica.' },
      { titulo: 'Gotea agua por dentro o por fuera', texto: 'Drenaje tapado o mangueras desconectadas. Es de las reparaciones más rápidas si se atiende a tiempo.' },
      { titulo: 'Hace ruido excesivo o vibra', texto: 'Ventilador interno, soportes del compresor o nivelación. El ruido nuevo y repentino amerita revisión pronta.' },
      { titulo: 'No prende', texto: 'Desde el enchufe o el fusible hasta la tarjeta principal. El diagnóstico determina si conviene reparar.' },
    ],
    faq: [
      {
        q: '¿Reparan nevecones (side by side)?',
        a: 'Sí. Los técnicos de la especialidad Neveras y Nevecones atienden neveras convencionales, no-frost y nevecones side by side de todas las marcas principales.',
      },
      {
        q: '¿Cuánto cuesta la reparación de una nevera?',
        a: 'Depende de la falla y el repuesto. La visita de diagnóstico tiene precio fijo; con el equipo revisado, el técnico te envía una cotización de la reparación y tú decides si la apruebas. Sin sorpresas.',
      },
      {
        q: '¿Hacen cambio de filtro de agua?',
        a: 'Sí, es un servicio de precio fijo todo incluido: filtro nuevo, mano de obra e IVA. Lo pides igual que cualquier servicio en el formulario.',
      },
    ],
    notaPrecios: 'El cambio de filtro de agua para neveras tiene precio fijo todo incluido (filtro + instalación + IVA).',
  },
  {
    slug: 'reparacion-lavadoras-bogota',
    equipo: 'Lavadora',
    emoji: '🫧',
    plural: 'lavadoras',
    metaTitle: 'Reparación de Lavadoras a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Reparación de lavadoras a domicilio en Bogotá y la Sabana con técnicos verificados. Diagnóstico con precio fijo, cotización antes de reparar y pago seguro.',
    h1: 'Reparación de lavadoras a domicilio en Bogotá',
    intro:
      'Tu lavadora no centrifuga, no desagua o quedó a mitad de ciclo. En vez de cargarla hasta un taller, un técnico verificado por Baird Service va a tu casa en Bogotá o la Sabana, la revisa y te cotiza la reparación antes de intervenirla. Coordinación 100% por WhatsApp y pago electrónico seguro a Baird Service.',
    fallas: [
      { titulo: 'No centrifuga o no exprime', texto: 'Correa desgastada, freno del motor, capacitor o tarjeta de control. Es la falla más consultada en lavadoras.' },
      { titulo: 'No desagua', texto: 'Bomba de agua obstruida o dañada, o manguera de desagüe tapada. Reparación usualmente rápida.' },
      { titulo: 'Hace ruido fuerte al centrifugar', texto: 'Rodamientos (balineras) desgastados o amortiguadores vencidos. Atenderlo a tiempo evita daños en la transmisión.' },
      { titulo: 'No llena o llena sin parar', texto: 'Válvula de entrada de agua o presostato (sensor de nivel) averiado.' },
      { titulo: 'Queda a mitad de ciclo', texto: 'Tarjeta electrónica, timer o cableado. El diagnóstico determina si el repuesto justifica la reparación.' },
      { titulo: 'Bota agua por debajo', texto: 'Sellos, mangueras internas o la tina. Requiere revisión presencial para ubicar la fuga.' },
    ],
    faq: [
      {
        q: '¿Reparan lavadoras carga frontal y carga superior?',
        a: 'Sí, ambas, además de lavasecadoras (combo 2 en 1) y secadoras. Los técnicos de la especialidad Lavadoras cubren todo el grupo.',
      },
      {
        q: '¿Vale la pena reparar o comprar una nueva?',
        a: 'El técnico te lo dice de frente en el diagnóstico: si el costo del repuesto se acerca al valor de una lavadora nueva, te lo advierte antes de que gastes de más. Tú apruebas o rechazas la cotización sin compromiso.',
      },
      {
        q: '¿Atienden lavadoras de todas las marcas?',
        a: 'Sí: Samsung, LG, Mabe, Whirlpool, Electrolux, Haceb, Challenger y más. Para servicios particulares la plataforma es multimarca.',
      },
    ],
  },
  {
    slug: 'reparacion-secadoras-bogota',
    equipo: 'Secadora',
    emoji: '💨',
    plural: 'secadoras',
    metaTitle: 'Reparación de Secadoras a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Técnicos verificados reparan tu secadora a domicilio en Bogotá y la Sabana. Diagnóstico con precio fijo, cotización transparente y coordinación por WhatsApp.',
    h1: 'Reparación de secadoras a domicilio en Bogotá',
    intro:
      'Una secadora que no calienta o no gira convierte la lavada en un problema de días. Un técnico verificado por Baird Service va a tu casa en Bogotá o la Sabana, encuentra la falla y te cotiza la reparación para que decidas con el precio en la mano. Todo por WhatsApp, con pago electrónico a Baird Service.',
    fallas: [
      { titulo: 'No calienta', texto: 'Resistencia quemada (eléctricas), fallas del quemador (a gas) o termofusible abierto. La falla más común en secadoras.' },
      { titulo: 'No gira el tambor', texto: 'Correa reventada, motor o rodillo de soporte. Se confirma en minutos durante el diagnóstico.' },
      { titulo: 'Se apaga antes de terminar', texto: 'Sensor de humedad, termostato de seguridad o sobrecalentamiento por ducto obstruido.' },
      { titulo: 'Ruido o golpeteo al girar', texto: 'Rodillos, poleas tensoras o soportes desgastados.' },
      { titulo: 'Seca muy lento', texto: 'Ducto de ventilación tapado con motas: reduce el flujo de aire y dispara el consumo de energía. Mantenimiento preventivo lo evita.' },
      { titulo: 'No prende', texto: 'Interruptor de puerta, fusible térmico o tarjeta de control.' },
    ],
    faq: [
      {
        q: '¿Reparan secadoras a gas y eléctricas?',
        a: 'Sí, ambas. Indica el tipo y la marca en el formulario para que el técnico llegue preparado.',
      },
      {
        q: '¿El mantenimiento de secadora vale la pena?',
        a: 'Sí: la limpieza del ducto y del sensor de humedad reduce tiempos de secado, baja el consumo de energía y previene el sobrecalentamiento, que es la principal causa de daños.',
      },
    ],
  },
  {
    slug: 'reparacion-estufas-bogota',
    equipo: 'Estufa',
    emoji: '🍳',
    plural: 'estufas',
    metaTitle: 'Reparación de Estufas a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Reparación de estufas a gas y eléctricas a domicilio en Bogotá y la Sabana. Técnicos verificados, diagnóstico con precio fijo y pago electrónico seguro.',
    h1: 'Reparación de estufas a domicilio en Bogotá',
    intro:
      'Quemadores que no encienden, llama amarilla o perillas que no responden: fallas de estufa que un técnico verificado por Baird Service resuelve a domicilio en Bogotá y la Sabana. Diagnóstico presencial, cotización antes de reparar y coordinación completa por WhatsApp.',
    fallas: [
      { titulo: 'Un quemador no enciende', texto: 'Inyector tapado, bujía de encendido sucia o válvula de la perilla. Reparación usualmente el mismo día del diagnóstico.' },
      { titulo: 'Llama amarilla o débil', texto: 'Mezcla aire-gas descalibrada o inyectores sucios. Además de cocinar mal, mancha las ollas y puede indicar combustión incompleta.' },
      { titulo: 'El encendido eléctrico no chispea', texto: 'Módulo de encendido, bujías o cableado húmedo.' },
      { titulo: 'Olor a gas', texto: 'Requiere revisión urgente de mangueras, acoples y válvulas. Cierra el registro y ventila mientras llega el técnico.' },
      { titulo: 'Vitrocerámica o inducción no calienta', texto: 'Zona de cocción, tarjeta de potencia o sensor. El diagnóstico define si el repuesto está disponible.' },
      { titulo: 'Perillas duras o sueltas', texto: 'Válvulas resecas o vástagos partidos. Cambio sencillo con el repuesto correcto.' },
    ],
    faq: [
      {
        q: '¿Atienden estufas a gas natural y propano (pipeta)?',
        a: 'Sí, ambas, y también estufas eléctricas, vitrocerámicas y de inducción. Indica el tipo en el formulario.',
      },
      {
        q: '¿Hacen conversión de gas propano a natural?',
        a: 'Descríbelo en el formulario como parte del problema: el técnico confirma en el diagnóstico si tu modelo admite la conversión y te la cotiza.',
      },
    ],
  },
  {
    slug: 'reparacion-hornos-bogota',
    equipo: 'Horno',
    emoji: '🔥',
    plural: 'hornos',
    metaTitle: 'Reparación de Hornos a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Técnicos verificados reparan tu horno a gas o eléctrico a domicilio en Bogotá y la Sabana. Diagnóstico con precio fijo y cotización antes de reparar.',
    h1: 'Reparación de hornos a domicilio en Bogotá',
    intro:
      'Un horno que no calienta parejo o no mantiene la temperatura arruina cualquier receta. Un técnico verificado por Baird Service lo revisa en tu casa en Bogotá o la Sabana, identifica la falla y te cotiza la reparación antes de intervenir. Coordinación por WhatsApp y pago electrónico a Baird Service.',
    fallas: [
      { titulo: 'No calienta', texto: 'Resistencia quemada (eléctricos), termocupla o válvula de seguridad (a gas). La falla más frecuente en hornos.' },
      { titulo: 'No mantiene la temperatura', texto: 'Termostato descalibrado o sensor de temperatura averiado: el horno sube y baja sin control.' },
      { titulo: 'Hornea disparejo', texto: 'Resistencia inferior o superior parcialmente dañada, o ventilador de convección detenido.' },
      { titulo: 'La puerta no sella', texto: 'Empaque vencido o bisagras flojas: el calor se escapa y el consumo sube.' },
      { titulo: 'El grill no funciona', texto: 'Resistencia del grill o selector de funciones.' },
      { titulo: 'Display o perillas sin respuesta', texto: 'Tarjeta de control o panel táctil. El diagnóstico define si el repuesto justifica la reparación.' },
    ],
    faq: [
      {
        q: '¿Reparan hornos empotrados?',
        a: 'Sí, empotrados y de piso, a gas y eléctricos, de todas las marcas principales.',
      },
      {
        q: '¿También arreglan hornos microondas?',
        a: 'El foco de la especialidad es hornos convencionales (gas y eléctricos). Si tu caso es un microondas, descríbelo en el formulario y validamos si hay técnico disponible para tu zona.',
      },
    ],
  },
  {
    slug: 'reparacion-lavavajillas-bogota',
    equipo: 'Lavavajillas',
    emoji: '🫗',
    plural: 'lavavajillas',
    metaTitle: 'Reparación de Lavavajillas a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Reparación de lavavajillas a domicilio en Bogotá y la Sabana. Técnicos verificados, diagnóstico con precio fijo, cotización clara y pago electrónico.',
    h1: 'Reparación de lavavajillas a domicilio en Bogotá',
    intro:
      'El lavavajillas deja la loza sucia, no desagua o bota agua: fallas que un técnico verificado por Baird Service diagnostica en tu casa en Bogotá o la Sabana y te cotiza antes de reparar. Sin llevar el equipo a ningún taller, con coordinación por WhatsApp y pago electrónico seguro.',
    fallas: [
      { titulo: 'Deja la loza sucia u opaca', texto: 'Aspersores tapados, filtro saturado o dosificador de detergente averiado. A veces basta un mantenimiento a fondo.' },
      { titulo: 'No desagua', texto: 'Bomba de desagüe o manguera obstruida. De las reparaciones más comunes y rápidas.' },
      { titulo: 'Bota agua por debajo', texto: 'Empaque de puerta, mangueras o sello de la bomba. Atenderlo rápido evita daños en pisos y muebles.' },
      { titulo: 'No calienta el agua', texto: 'Resistencia o termostato: sin agua caliente el lavado pierde casi toda su efectividad.' },
      { titulo: 'No inicia el ciclo', texto: 'Microswitch de la puerta, panel de control o tarjeta electrónica.' },
      { titulo: 'Olores o residuos', texto: 'Filtros y trampas saturadas. Mantenimiento preventivo recomendado cada 6-12 meses.' },
    ],
    faq: [
      {
        q: '¿Reparan lavavajillas empotrados?',
        a: 'Sí, empotrados y portátiles de todas las marcas principales. Indica el modelo en el formulario si lo tienes a mano.',
      },
      {
        q: '¿Hacen instalación de lavavajillas?',
        a: 'Descríbelo en el formulario: los técnicos de la especialidad también cotizan instalaciones y conexiones hidráulicas del equipo.',
      },
    ],
  },
  {
    slug: 'reparacion-aires-acondicionados-bogota',
    equipo: 'Aire Acondicionado',
    emoji: '❄️',
    plural: 'aires acondicionados',
    metaTitle: 'Reparación de Aires Acondicionados en Bogotá | Baird Service',
    metaDescription:
      'Reparación y mantenimiento de aires acondicionados a domicilio en Bogotá y la Sabana. Técnicos verificados, diagnóstico con precio fijo y pago seguro.',
    h1: 'Reparación de aires acondicionados en Bogotá',
    intro:
      'Un aire acondicionado que no enfría o gotea necesita revisión profesional: manipular gas refrigerante sin equipo adecuado daña el compresor. Un técnico verificado por Baird Service lo diagnostica a domicilio en Bogotá o la Sabana y te cotiza la reparación antes de intervenir. Coordinación por WhatsApp y pago electrónico a Baird Service.',
    fallas: [
      { titulo: 'No enfría o enfría poco', texto: 'Falta de gas refrigerante por fuga, filtros saturados o compresor desgastado. El diagnóstico con manómetro lo confirma.' },
      { titulo: 'Gotea agua la unidad interior', texto: 'Drenaje tapado o bandeja de condensado desnivelada. De las fallas más comunes en minisplits.' },
      { titulo: 'Hace ruido o vibra', texto: 'Ventilador, turbina desbalanceada o soportes flojos en la unidad exterior.' },
      { titulo: 'Se congela la tubería o el evaporador', texto: 'Flujo de aire restringido (filtros sucios) o carga de gas incorrecta.' },
      { titulo: 'No responde al control', texto: 'Sensor receptor, control remoto o tarjeta de la unidad interior.' },
      { titulo: 'Olores al encender', texto: 'Hongos y bacterias en el evaporador: se resuelve con lavado y desinfección (mantenimiento).' },
    ],
    faq: [
      {
        q: '¿Hacen mantenimiento preventivo de minisplits?',
        a: 'Sí, con tarifa fija de catálogo: lavado de unidades, desinfección del evaporador, limpieza de filtros y revisión general.',
      },
      {
        q: '¿Atienden aires de ventana y centrales?',
        a: 'La especialidad cubre principalmente minisplits y aires de ventana residenciales. Para equipos centrales o comerciales, descríbelo en el formulario y validamos disponibilidad de técnico.',
      },
    ],
  },
]

export function getServicioSeo(slug: string): ServicioSeo | undefined {
  return SERVICIOS_SEO.find((s) => s.slug === slug)
}
