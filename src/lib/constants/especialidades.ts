// Mapping: tipo_equipo from solicitud → especialidad stored in especialidades_tecnico
// Registration form uses grouped labels; this bridges the gap.
// Shared between whatsapp.service.ts (server) and admin pages (client).
export const TIPO_A_ESPECIALIDAD: Record<string, string> = {
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
