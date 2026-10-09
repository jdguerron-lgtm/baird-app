/**
 * Datos legales de Baird Service S.A.S. — fuente única para /terminos,
 * /politica-privacidad, /contrato-tecnico, el footer y los formularios.
 *
 * Al cambiar el TEXTO de una política, sube su versión: la versión aceptada
 * queda persistida (solicitudes_servicio.tyc_version / tecnicos.contrato_version).
 */
export const EMPRESA = {
  razonSocial: 'Baird Service S.A.S.',
  nit: '830.024.646-2',
  domicilio: 'Carrera 80C # 24D-74, Barrio Modelia, Bogotá D.C., Colombia',
  telefono: '+57 314 241 1888',
  whatsappSoporte: '+57 313 495 1164',
  emailPqrs: 'servicioalcliente@bairdservice.com',
  emailDatos: 'soporte@bairdservice.com',
  sitio: 'https://lineablanca.bairdservice.com',
} as const

/** Contrato de prestación de servicios para técnicos (/contrato-tecnico). */
export const CONTRATO_TECNICO_VERSION = '2026.10.09'
export const CONTRATO_TECNICO_FECHA = '9 de octubre de 2026'

/** Política de privacidad y tratamiento de datos (/politica-privacidad). */
export const PRIVACIDAD_VERSION = '2026.10.09'
export const PRIVACIDAD_FECHA = '9 de octubre de 2026'

/** Fecha visible de la versión vigente de /terminos (la versión es TYC_VERSION). */
export const TYC_FECHA = '9 de octubre de 2026'
