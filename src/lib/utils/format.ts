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
 * Normalizes a string for fuzzy matching: lowercases, strips accents/diacritics,
 * and collapses whitespace. E.g. "BOGOTÁ" → "bogota", "Medellín" → "medellin".
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Extrae el "token de ciudad" desde un campo que puede traer basura
 * concatenada (direcci\u00f3n, zona, depto, c\u00f3digo postal, etc.).
 *
 * Casos reales (vistos en BIT\u00c1CORA y data ingresada manualmente):
 *   "BOGOTA /CR 123 13B 47"   \u2192 "bogota"   (direcci\u00f3n tras `/`)
 *   "Bogot\u00e1 - Engativ\u00e1"        \u2192 "bogota"   (zona tras `-`)
 *   "Bogot\u00e1, Cundinamarca"     \u2192 "bogota"   (depto tras `,`)
 *   "Bogot\u00e1; D.C."             \u2192 "bogota"
 *   "Bogot\u00e1"                   \u2192 "bogota"   (caso normal, sin separadores)
 *
 * Splittea por `/`, `,`, `;`, `-` (separadores usuales cuando un humano pega
 * varios campos en uno solo). Devuelve el primer segmento normalizado.
 *
 * \u00dasala en lugar de `normalizeForMatch` cuando el campo viene de fuentes
 * inconsistentes (Excel BIT\u00c1CORA, formularios libres). El matching de
 * `notificarTecnicos` lo aplica a ambos lados.
 */
export function cityTokenForMatch(input: string): string {
  return normalizeForMatch(input).split(/[\/,;\-]/)[0].trim()
}
