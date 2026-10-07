/**
 * Shared formatting utilities.
 * Safe for both client and server (no Node.js-only imports).
 */

const copFormatter = new Intl.NumberFormat('es-CO')

export function formatCOP(valor: number | null | undefined): string {
  return copFormatter.format(valor ?? 0)
}

/**
 * Escapes special LIKE/ILIKE pattern characters (%, _, \).
 * Always use this before interpolating user input into .ilike() queries.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

/**
 * Pipeline de normalización para matching (ciudad, especialidad, marca).
 * Mismo criterio en TODA la app: el motor `notificarTecnicos`, el panel de
 * diagnóstico del admin, el alcance de supervisores por marca, etc.
 *
 *   1. NFD + strip de diacríticos  → "Bogotá" → "Bogota", "Ñ" → "N"
 *   2. minúsculas                   → "BOGOTA" → "bogota"
 *   3. caracteres especiales → " "  → "D.C." → "d c ", "Hornos/Estufas" → "hornos estufas"
 *      (solo sobreviven a-z, 0-9 y espacios)
 *   4. colapsar whitespace + trim   → "  bogota   d c " → "bogota d c"
 *
 * Ejemplos: "  BOGOTÁ  " → "bogota" · "Neveras y Nevecones!" → "neveras y nevecones"
 */
export function normalizeForMatch(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrae el "token de ciudad" desde un campo que puede traer basura
 * concatenada (dirección, zona, depto, código postal, etc.) y lo pasa por
 * el pipeline `normalizeForMatch`.
 *
 * Casos reales (vistos en BITÁCORA y data ingresada manualmente):
 *   "BOGOTA /CR 123 13B 47"   → "bogota"   (dirección tras `/`)
 *   "Bogotá - Engativá"        → "bogota"   (zona tras `-`)
 *   "Bogotá, Cundinamarca"     → "bogota"   (depto tras `,`)
 *   "Bogotá; D.C."             → "bogota"
 *   "Bogotá D.C." / "BOGOTA DC" → "bogota"   (D.C. = misma ciudad)
 *   "(Bogotá)"                 → "bogota"   (caracteres especiales fuera)
 *   "Bogotá"                   → "bogota"   (caso normal, sin separadores)
 *
 * Primero splittea por `/`, `,`, `;`, `-` (separadores usuales cuando un
 * humano pega varios campos en uno solo) y se queda con el primer segmento;
 * DESPUÉS normaliza (el orden importa: la normalización borra esos
 * separadores).
 *
 * Úsala en lugar de `normalizeForMatch` cuando el campo viene de fuentes
 * inconsistentes (Excel BITÁCORA, formularios libres). El matching de
 * `notificarTecnicos` y el panel de diagnóstico del admin la aplican a
 * ambos lados.
 */
export function cityTokenForMatch(input: string): string {
  const primerSegmento = (input ?? '').split(/[\/,;\-]/)[0]
  const norm = normalizeForMatch(primerSegmento)
  // "Bogotá D.C." / "Bogotá DC" / "Bogotá Distrito Capital" son la MISMA
  // ciudad que "Bogotá" (confirmado por el negocio 2026-10-07). Tras el
  // pipeline quedan como "bogota d c", "bogota dc", "bogota distrito capital":
  // se recorta el sufijo para que también sean iguales en comparaciones exactas.
  return norm.replace(/\s+(d\s?c|distrito\s+capital)$/, '')
}
