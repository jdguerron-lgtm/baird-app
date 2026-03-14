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
