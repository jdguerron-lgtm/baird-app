/**
 * Autorización de los endpoints /api/cron/* (2026-10-11).
 *
 * Antes cada ruta hacía su propio guard y aceptaba el header
 * `x-vercel-cron: 1` como prueba de que venía de Vercel. Ese header lo puede
 * mandar cualquiera: con CRON_SECRET configurado el guard seguía siendo
 * esquivable, y dos de los crons envían WhatsApp a clientes.
 *
 * Regla única:
 *   - Con CRON_SECRET: solo `Authorization: Bearer <CRON_SECRET>`. Vercel Cron
 *     manda ese header solo cuando la env var existe (docs.vercel.com →
 *     Cron Jobs → "Securing cron jobs"), y el job pg_cron de Supabase lo manda
 *     leyéndolo de Vault (`cron_secret`).
 *   - Sin CRON_SECRET: abierto (comportamiento histórico), pero se loguea un
 *     warning en cada invocación para que no pase desapercibido.
 */
export function cronAutorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto) {
    console.warn(`[cron] CRON_SECRET no configurado — ${new URL(req.url).pathname} acepta sin autenticación`)
    return true
  }
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secreto}`
}
