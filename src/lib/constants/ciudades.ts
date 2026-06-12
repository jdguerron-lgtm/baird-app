/**
 * Ciudades/municipios sugeridos para autocompletar campos de ciudad
 * (hoy: datalist de "Ciudades de cobertura" en /admin/tecnicos/[id]).
 *
 * NO es una lista cerrada: los campos siguen aceptando texto libre y el
 * matching de notificarTecnicos es por token normalizado (cityTokenForMatch:
 * case/acento-insensitive, primer segmento antes de `/`, `,`, `;`, `-`), así
 * que un valor fuera de esta lista matchea igual. La lista solo acelera la
 * captura y reduce typos.
 *
 * Orden: Bogotá + Sabana/Cundinamarca primero (zona principal de operación),
 * luego capitales. Mantener nombres con tildes (son los que se muestran).
 *
 * Relacionado: CENTROS_CIUDADES_CO en geocoding.service.ts (tokens sin tilde
 * para fallback de coordenadas) — si agregas una ciudad de operación nueva,
 * considera agregarla allá también para que el mapa admin tenga su centro.
 */
export const CIUDADES_SUGERIDAS: readonly string[] = [
  // Bogotá y Sabana / Cundinamarca
  'Bogotá',
  'Soacha',
  'Chía',
  'Cajicá',
  'Zipaquirá',
  'Cota',
  'Funza',
  'Mosquera',
  'Madrid',
  'Facatativá',
  'La Calera',
  'Sopó',
  'Tocancipá',
  'Sibaté',
  'Fusagasugá',
  'Girardot',
  'La Mesa',
  'El Colegio',
  'Anapoima',
  'Villeta',
  // Capitales / ciudades principales
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Cúcuta',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Santa Marta',
  'Ibagué',
  'Pasto',
  'Montería',
  'Villavicencio',
  'Neiva',
  'Armenia',
  'Sincelejo',
  'Soledad',
  'Tunja',
  'Popayán',
  'Valledupar',
]
