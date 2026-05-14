-- ============================================================================
-- Tracking de TA (Tiempo de Atención) — columnas dedicadas
-- ============================================================================
--
-- El cálculo de bonos MABE Tipo D depende de:
--   1. cumple_ta = (diagnosticado_at − horario_confirmado_at) ≤ 24h
--   2. dias_solucion = created_at → completada (sin esperando_repuesto)
--   3. cumple_encuesta (llega tras cierre)
--
-- Hasta ahora `diagnosticado_at` solo vivía dentro del JSONB
-- `triaje_resultado`. Buscar por JSONB es lento y no se puede indexar
-- eficientemente. Promovemos a columna dedicada para filtros admin
-- (técnicos que tardan, cumple_ta=false, etc.).
--
-- IDEMPOTENTE — se puede correr varias veces sin efecto adicional.
-- ============================================================================

-- ─── 1. Columnas nuevas ───
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS diagnosticado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cumple_ta boolean;

COMMENT ON COLUMN solicitudes_servicio.diagnosticado_at IS
  'Timestamp del diagnóstico técnico. Punto de partida para "días de solución" (2026-05-13).';
COMMENT ON COLUMN solicitudes_servicio.cumple_ta IS
  'true si diagnosticado_at − horario_confirmado_at ≤ 24h. Computado en /api/diagnostico.';

-- ─── 2. Índice para filtros admin por TA ───
CREATE INDEX IF NOT EXISTS idx_solicitudes_cumple_ta ON solicitudes_servicio(cumple_ta) WHERE cumple_ta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitudes_diagnosticado_at ON solicitudes_servicio(diagnosticado_at) WHERE diagnosticado_at IS NOT NULL;

-- ─── 3. Backfill desde triaje_resultado JSONB ───
-- Para solicitudes que ya tienen diagnosticado_at dentro de triaje_resultado,
-- copiar al nuevo campo dedicado. Conservar el JSONB intacto.
UPDATE solicitudes_servicio
SET diagnosticado_at = (triaje_resultado->>'diagnosticado_at')::timestamptz
WHERE diagnosticado_at IS NULL
  AND triaje_resultado IS NOT NULL
  AND triaje_resultado->>'diagnosticado_at' IS NOT NULL;

-- Computar cumple_ta para las filas con ambos timestamps disponibles
UPDATE solicitudes_servicio
SET cumple_ta = (
  EXTRACT(EPOCH FROM (diagnosticado_at - horario_confirmado_at)) / 3600 <= 24
)
WHERE cumple_ta IS NULL
  AND diagnosticado_at IS NOT NULL
  AND horario_confirmado_at IS NOT NULL;

-- ─── 4. Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';
