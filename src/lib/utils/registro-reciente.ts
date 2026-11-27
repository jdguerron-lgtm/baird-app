/**
 * Candado de `POST /api/notificar-registro` (2026-11-25).
 *
 * El endpoint es público (lo llama `/registro` sin sesión) y dispara un
 * WhatsApp de bienvenida = costo. Solo tiene sentido justo después de crear
 * la fila del técnico, así que se acepta únicamente dentro de esta ventana.
 */
export const VENTANA_BIENVENIDA_REGISTRO_MIN = 15

/** true si `createdAt` cae dentro de los últimos `ventanaMin` minutos. */
export function registroEsReciente(
  createdAt: string | null | undefined,
  ahora: Date = new Date(),
  ventanaMin: number = VENTANA_BIENVENIDA_REGISTRO_MIN,
): boolean {
  if (!createdAt) return false
  const creado = new Date(createdAt).getTime()
  if (!Number.isFinite(creado)) return false
  const edadMs = ahora.getTime() - creado
  // Tolerancia de 1 min hacia el futuro por desfase de reloj entre BD y función.
  return edadMs >= -60_000 && edadMs <= ventanaMin * 60_000
}
