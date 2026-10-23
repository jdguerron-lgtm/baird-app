import { cityTokenForMatch } from '@/lib/utils/format'

/**
 * Códigos DANE (departamento + municipio) de las ciudades de operación —
 * los exige Siigo en `address.city` al crear un tercero. Mismo listado que
 * CIUDADES_SUGERIDAS (ciudades.ts); la clave es el token normalizado
 * (`cityTokenForMatch`) para tolerar tildes, "D.C." y basura concatenada.
 */
const DANE: Record<string, string> = {
  bogota: '11001',
  soacha: '25754',
  chia: '25175',
  cajica: '25126',
  zipaquira: '25899',
  cota: '25214',
  funza: '25286',
  mosquera: '25473',
  madrid: '25430',
  facatativa: '25269',
  'la calera': '25377',
  sopo: '25758',
  tocancipa: '25817',
  sibate: '25740',
  fusagasuga: '25290',
  girardot: '25307',
  'la mesa': '25386',
  'el colegio': '25245',
  anapoima: '25035',
  villeta: '25875',
  medellin: '05001',
  cali: '76001',
  barranquilla: '08001',
  cartagena: '13001',
  cucuta: '54001',
  bucaramanga: '68001',
  pereira: '66001',
  manizales: '17001',
  'santa marta': '47001',
  ibague: '73001',
  pasto: '52001',
  monteria: '23001',
  villavicencio: '50001',
  neiva: '41001',
  armenia: '63001',
  sincelejo: '70001',
  soledad: '08758',
  tunja: '15001',
  popayan: '19001',
  valledupar: '20001',
}

export interface CiudadDane {
  country_code: 'Co'
  state_code: string
  city_code: string
  /** false cuando la ciudad no está en el mapa y se usó Bogotá por defecto. */
  exacta: boolean
}

/** Ciudad en el formato de Siigo. Desconocida → Bogotá (`exacta: false`) para no bloquear el alta. */
export function ciudadDane(ciudad: string | null | undefined): CiudadDane {
  const token = cityTokenForMatch(ciudad ?? '')
  const code = DANE[token] ?? (token.startsWith('bogota') ? DANE.bogota : undefined)
  if (!code) return { country_code: 'Co', state_code: '11', city_code: '11001', exacta: false }
  return { country_code: 'Co', state_code: code.slice(0, 2), city_code: code, exacta: true }
}
