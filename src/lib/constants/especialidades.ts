// Especialidades (categorías de equipo) en las que un técnico puede
// registrarse, y el puente tipo_equipo (solicitud) → especialidad.
//
// ÚNICA fuente de verdad de las etiquetas. /registro y /admin/tecnicos/[id]
// importan ESPECIALIDADES de aquí; si se renombra una etiqueta hay que
// migrar también las filas de `especialidades_tecnico` (el matching compara
// con normalizeForMatch, así que mayúsculas/tildes no importan, pero el
// texto sí).
//
// Shared between whatsapp.service.ts (server) and admin/registro pages (client).

export const ESPECIALIDADES = [
  'Lavadoras',
  'Neveras y Nevecones',
  'Hornos y Estufas',
  'Aires Acondicionados',
] as const

export type Especialidad = typeof ESPECIALIDADES[number]

/**
 * Qué cubre cada especialidad, para que el técnico sepa a qué se compromete
 * al marcarla y para que el admin vea el alcance en la ficha.
 * `gas` = la categoría incluye equipos que pueden funcionar a gas; el
 * técnico solo debería recibirlos si `tecnicos.cubre_gasodomesticos = true`
 * (hoy es declarativo; el gate en el matching es el siguiente paso).
 */
export const ESPECIALIDADES_INFO: Record<Especialidad, { icono: string; cubre: string; gas: boolean }> = {
  'Lavadoras': {
    icono: '🫧',
    cubre: 'Lavadoras, secadoras, lavasecadoras (2 en 1) y lavavajillas',
    gas: true, // secadoras a gas
  },
  'Neveras y Nevecones': {
    icono: '❄️',
    cubre: 'Neveras convencionales, no-frost, nevecones side by side y congeladores',
    gas: false,
  },
  'Hornos y Estufas': {
    icono: '🔥',
    cubre: 'Estufas y hornos a gas o eléctricos, cubiertas de inducción y campanas',
    gas: true,
  },
  'Aires Acondicionados': {
    icono: '💨',
    cubre: 'Minisplits, aires de ventana y portátiles residenciales',
    gas: false,
  },
}

// Mapping: tipo_equipo from solicitud → especialidad stored in especialidades_tecnico
// Registration form uses grouped labels; this bridges the gap.
export const TIPO_A_ESPECIALIDAD: Record<string, Especialidad> = {
  'Lavadora':           'Lavadoras',
  'Secadora':           'Lavadoras',
  'Lavadora Secadora':  'Lavadoras',  // combo 2-en-1 — comparte especialidad
  'Lavavajillas':       'Lavadoras',
  'Nevera':             'Neveras y Nevecones',
  'Nevecón':            'Neveras y Nevecones',
  'Horno':              'Hornos y Estufas',
  'Estufa':             'Hornos y Estufas',
  'Aire Acondicionado': 'Aires Acondicionados',
}

/**
 * Tipos de equipo que PUEDEN ser gasodomésticos (funcionar a gas natural o
 * GLP). Hoy la solicitud no pregunta gas vs eléctrico; esta lista sirve para
 * señalizar en admin y es la base del gate futuro en el matching.
 */
export const TIPOS_EQUIPO_POSIBLE_GAS = ['Estufa', 'Horno', 'Secadora', 'Lavadora Secadora'] as const

export function esPosibleGasodomestico(tipoEquipo: string | null | undefined): boolean {
  return !!tipoEquipo && (TIPOS_EQUIPO_POSIBLE_GAS as readonly string[]).includes(tipoEquipo)
}
