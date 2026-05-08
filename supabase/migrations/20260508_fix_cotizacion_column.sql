-- HOTFIX: agregar columna `cotizacion` JSONB faltante en solicitudes_servicio.
--
-- Síntoma en producción:
--   POST /api/diagnostico (flujo no-garantía) falla con:
--   "Could not find the 'cotizacion' column of 'solicitudes_servicio' in the schema cache"
--
-- Causa raíz:
--   El flujo particular (no garantía) y el admin pricing gate (v1 2026-05-07)
--   escriben/leen la columna `cotizacion` (JSONB) en solicitudes_servicio,
--   pero ninguna migración previa la creó. Existía solo en el código y en la
--   documentación de CLAUDE.md.
--
-- Fix:
--   1. ADD COLUMN IF NOT EXISTS — idempotente, seguro de re-ejecutar.
--   2. NOTIFY pgrst — fuerza a PostgREST a recargar el schema cache de
--      Supabase para que el cliente JS reconozca la nueva columna sin esperar
--      al refresco automático.
--
-- Date: 2026-05-08

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS cotizacion JSONB;

-- Índice parcial para listados que filtran por cotizaciones pendientes /
-- enviadas. Solo indexa filas con cotizacion IS NOT NULL para mantenerse
-- pequeño.
CREATE INDEX IF NOT EXISTS idx_solicitudes_cotizacion_estado
  ON solicitudes_servicio(estado)
  WHERE cotizacion IS NOT NULL;

-- Refresca el schema cache de PostgREST (Supabase) para que las llamadas
-- desde el cliente reconozcan la columna inmediatamente.
NOTIFY pgrst, 'reload schema';
