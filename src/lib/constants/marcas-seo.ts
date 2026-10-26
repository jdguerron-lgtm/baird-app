/**
 * Landings por marca /servicios/[slug] (2026-10-25) — para la campaña
 * "marca" de Google Ads y la búsqueda orgánica "servicio técnico <marca>
 * Bogotá". Ver docs/mejoras-futuras/marketing/PLAN-ADS-BOGOTA-2026-11.md.
 *
 * Comparten la ruta con las landings por equipo (servicios-seo.ts): el slug
 * no debe repetirse entre las dos listas (lo verifica un test).
 *
 * ⚠️ Solo afirmaciones verdaderas sobre la relación con cada marca (las mismas
 * de la home):
 *   - MABE: Baird atiende las GARANTÍAS de productos MABE (la marca paga) y es
 *     distribuidor mayorista oficial de sus repuestos.
 *   - Whirlpool: distribuidor mayorista oficial de REPUESTOS. Baird NO es su
 *     servicio técnico oficial ni atiende su garantía → aviso visible y FAQ.
 * Nunca escribir "servicio técnico oficial" de una marca que no lo es: además
 * de engañoso, Google Ads rechaza anuncios y landings así.
 */

import type { TipoEquipo } from '@/types/solicitud'

export interface MarcaSeo {
  /** Slug público: /servicios/[slug] — no renombrar sin redirect */
  slug: string
  /** Nombre de la marca como se muestra */
  marca: string
  metaTitle: string
  metaDescription: string
  h1: string
  intro: string
  /** Relación de Baird con la marca, visible bajo el hero (transparencia). */
  aviso: string
  /** Bloque de garantía: solo para marcas cuya garantía atiende Baird. */
  garantia?: { titulo: string; texto: string }
  /** Equipos de la marca que se reparan, con su landing de equipo. */
  equipos: { equipo: TipoEquipo; nombre: string; slugServicio: string }[]
  fallas: { titulo: string; texto: string }[]
  faq: { q: string; a: string }[]
}

export const MARCAS_LANDING: readonly MarcaSeo[] = [
  {
    slug: 'servicio-tecnico-mabe-bogota',
    marca: 'Mabe',
    metaTitle: 'Servicio Técnico Mabe a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Reparación de neveras, lavadoras, estufas y hornos Mabe a domicilio en Bogotá. Atendemos la garantía MABE sin costo y el servicio particular.',
    h1: 'Servicio técnico Mabe a domicilio en Bogotá',
    intro:
      'Tu nevera, lavadora o estufa Mabe falló y necesitas a alguien de confianza. Baird Service atiende las garantías de productos MABE y repara equipos Mabe fuera de garantía con técnicos verificados que van a tu casa en Bogotá o la Sabana. Diagnóstico con precio fijo, cotización antes de reparar y repuestos originales.',
    aviso:
      'Baird Service atiende las garantías de productos MABE y es distribuidor mayorista oficial de repuestos MABE.',
    garantia: {
      titulo: '¿Tu equipo Mabe está en garantía?',
      texto:
        'Si tu producto MABE está dentro de la garantía, el servicio no tiene costo para ti: la marca lo cubre. En el formulario activa "Esta es una solicitud de garantía de marca" e ingresa el número de orden o de serie del equipo; nosotros lo gestionamos con MABE.',
    },
    equipos: [
      { equipo: 'Nevera', nombre: 'Neveras y nevecones Mabe', slugServicio: 'reparacion-neveras-bogota' },
      { equipo: 'Lavadora', nombre: 'Lavadoras Mabe', slugServicio: 'reparacion-lavadoras-bogota' },
      { equipo: 'Secadora', nombre: 'Secadoras Mabe', slugServicio: 'reparacion-secadoras-bogota' },
      { equipo: 'Estufa', nombre: 'Estufas Mabe', slugServicio: 'reparacion-estufas-bogota' },
      { equipo: 'Horno', nombre: 'Hornos Mabe', slugServicio: 'reparacion-hornos-bogota' },
    ],
    fallas: [
      { titulo: 'Nevera Mabe que no enfría', texto: 'Fugas de refrigerante, ventilador del evaporador o falla del sistema no-frost (resistencia, bimetal o tarjeta). Se confirma en el diagnóstico.' },
      { titulo: 'Lavadora Mabe que no centrifuga o no desagua', texto: 'Bomba de desagüe, transmisión, correa o tarjeta de control. Es la consulta más frecuente en lavadoras.' },
      { titulo: 'Estufa Mabe con quemadores que no encienden', texto: 'Bujías sucias, módulo de encendido o inyectores tapados. Reparación usualmente rápida con el repuesto correcto.' },
      { titulo: 'Código de error en el panel', texto: 'Los equipos electrónicos Mabe muestran códigos de falla. El técnico los interpreta con la información de servicio del modelo antes de cambiar piezas.' },
      { titulo: 'Horno Mabe que no calienta', texto: 'Resistencia, termocupla o válvula de seguridad (a gas). El diagnóstico define el repuesto exacto.' },
      { titulo: 'Ruidos o vibraciones nuevas', texto: 'Rodamientos, amortiguadores o ventiladores desgastados. Atenderlo a tiempo evita daños mayores.' },
    ],
    faq: [
      {
        q: '¿Atienden la garantía de mi producto Mabe?',
        a: 'Sí. Baird Service atiende garantías de productos MABE: si tu equipo está en garantía, el servicio no tiene costo para ti. Solo necesitas el número de orden o de serie del equipo.',
      },
      {
        q: '¿Usan repuestos originales Mabe?',
        a: 'Sí. Baird Service es distribuidor mayorista oficial de repuestos MABE, así que el técnico instala repuestos originales.',
      },
      {
        q: '¿Y si mi Mabe ya no está en garantía?',
        a: 'Lo atendemos como servicio particular: visita de diagnóstico con precio fijo y cotización de la reparación que tú apruebas o rechazas sin compromiso.',
      },
    ],
  },
  {
    slug: 'servicio-tecnico-whirlpool-bogota',
    marca: 'Whirlpool',
    metaTitle: 'Reparación Whirlpool a Domicilio en Bogotá | Baird Service',
    metaDescription:
      'Técnicos verificados reparan tu lavadora, secadora o nevera Whirlpool a domicilio en Bogotá. Repuestos originales, diagnóstico con precio fijo y pago seguro.',
    h1: 'Reparación de lavadoras, secadoras y neveras Whirlpool en Bogotá',
    intro:
      'Tu lavadora Whirlpool no centrifuga, la secadora no calienta o la nevera dejó de enfriar. Un técnico verificado por Baird Service va a tu casa en Bogotá o la Sabana, diagnostica la falla y te cotiza la reparación antes de tocar el equipo, con repuestos originales Whirlpool. Todo se coordina por WhatsApp.',
    aviso:
      'Baird Service es una red independiente de técnicos verificados y distribuidor mayorista oficial de repuestos Whirlpool. No somos el servicio técnico oficial de Whirlpool ni atendemos su garantía.',
    equipos: [
      { equipo: 'Lavadora', nombre: 'Lavadoras Whirlpool (carga superior y frontal)', slugServicio: 'reparacion-lavadoras-bogota' },
      { equipo: 'Secadora', nombre: 'Secadoras Whirlpool', slugServicio: 'reparacion-secadoras-bogota' },
      { equipo: 'Nevera', nombre: 'Neveras y nevecones Whirlpool', slugServicio: 'reparacion-neveras-bogota' },
    ],
    fallas: [
      { titulo: 'Lavadora Whirlpool que no centrifuga', texto: 'En carga superior suele ser la transmisión, el clutch o la correa; en carga frontal, el motor, la tarjeta o los rodamientos.' },
      { titulo: 'Ruido fuerte al centrifugar', texto: 'Rodamientos (balineras), amortiguadores o suspensión. Repararlo pronto evita que se dañe la tina.' },
      { titulo: 'No desagua o queda con agua', texto: 'Bomba de desagüe obstruida o dañada, o manguera tapada. Reparación usualmente rápida.' },
      { titulo: 'Secadora Whirlpool que no calienta', texto: 'Resistencia, termofusible o, en secadoras a gas, el quemador. La falla más común en secadoras.' },
      { titulo: 'Nevera Whirlpool que no enfría', texto: 'Refrigerante, compresor, ventilador o sistema de deshielo. Requiere diagnóstico presencial.' },
      { titulo: 'Código de error o panel sin respuesta', texto: 'Tarjeta de control, sensores o cableado. El técnico revisa el código antes de proponer el repuesto.' },
    ],
    faq: [
      {
        q: '¿Son el servicio técnico oficial de Whirlpool?',
        a: 'No. Baird Service es una red independiente de técnicos verificados y distribuidor mayorista oficial de repuestos Whirlpool. Reparamos equipos Whirlpool como servicio particular, con precio acordado antes de reparar.',
      },
      {
        q: 'Mi Whirlpool está en garantía, ¿lo atienden?',
        a: 'La garantía la cubre directamente Whirlpool: contáctalos primero. Si tu equipo ya salió de garantía, lo atendemos como servicio particular.',
      },
      {
        q: '¿Usan repuestos originales Whirlpool?',
        a: 'Sí. Como distribuidores mayoristas oficiales de repuestos Whirlpool, el técnico trabaja con repuestos originales.',
      },
    ],
  },
]

export function getMarcaSeo(slug: string): MarcaSeo | undefined {
  return MARCAS_LANDING.find((m) => m.slug === slug)
}
