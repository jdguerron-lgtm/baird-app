/**
 * Lectura de los campos del diagnóstico dentro del JSONB `triaje_resultado`.
 *
 * ⚠️ `codigo_falla` se guarda como NUMBER (los códigos MABE son numéricos:
 * 1844, 13005) mientras que `descripcion_falla` y `complejidad_falla` son
 * strings. Un `typeof v === 'string'` deja el código en null para TODAS las
 * solicitudes — pasó en el portal de supervisores el 2026-08-06. Por eso esta
 * función coerciona números en vez de exigir string.
 */
export function campoFalla(triaje: unknown, campo: string): string | null {
  const v = (triaje as Record<string, unknown> | null)?.[campo]
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
