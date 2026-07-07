-- Portal de supervisores (acceso de solo lectura por link mágico)
--
-- Doc canónico: docs/SEGURIDAD.md, docs/MAQUINA-DE-ESTADOS.md.
-- Date: 2026-07-06
--
-- Contexto: los supervisores ya reciben avisos WhatsApp por cambio de estado
-- (migración 20260529). Este cambio les da además un portal web de SOLO LECTURA
-- donde ven, con la misma vista del admin pero sin poder editar, únicamente las
-- solicitudes dentro de su alcance (ambito + marca). El alcance se impone
-- SIEMPRE en el servidor (/api/supervisor/*), nunca en el cliente: el anon key
-- ve toda la tabla, así que filtrar en el browser sería seguridad-teatro.
--
-- Modelo de acceso: link mágico tipo /supervisor/{portal_token}. El portal_token
-- es un UUID v4 (122 bits) — mismo patrón que tecnicos.portal_token. Se envía por
-- WhatsApp (plantilla supervisor_acceso_v1). No rota salvo regeneración manual.
--
-- IDEMPOTENTE: IF NOT EXISTS.

-- ─────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en supervisores
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE supervisores
  ADD COLUMN IF NOT EXISTS portal_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS acceso_enviado_at timestamptz;

COMMENT ON COLUMN supervisores.portal_token IS
  'Secret de acceso al portal de solo lectura /supervisor/[token]. UUID v4 (122 bits). Se envía por WhatsApp (supervisor_acceso_v1). Mismo modelo que tecnicos.portal_token.';
COMMENT ON COLUMN supervisores.acceso_enviado_at IS
  'Marca de tiempo del último envío del link de acceso por WhatsApp (o copia manual desde el admin).';

-- Lookup por token (resolución del supervisor en cada request del portal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisores_portal_token
  ON supervisores(portal_token);

-- ─────────────────────────────────────────────────────────────────
-- 2. Backfill defensivo: filas viejas que hubieran quedado con NULL
--    (el DEFAULT cubre las nuevas; esto cubre cualquier fila previa).
-- ─────────────────────────────────────────────────────────────────
UPDATE supervisores
  SET portal_token = gen_random_uuid()
  WHERE portal_token IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. Refrescar PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
