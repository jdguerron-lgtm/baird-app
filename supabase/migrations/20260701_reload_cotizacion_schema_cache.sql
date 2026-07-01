-- HOTFIX (recurrencia): forzar recarga del schema cache de PostgREST para la
-- columna `cotizacion` de solicitudes_servicio.
--
-- Síntoma reportado (2026-07-01):
--   Al registrar un diagnóstico (flujo no-garantía) el POST /api/diagnostico
--   falla con:
--     "Could not find the 'cotizacion' column of 'solicitudes_servicio'
--      in the schema cache"
--
-- Diagnóstico real:
--   La columna `cotizacion JSONB` YA EXISTE en producción (la creó
--   `20260508_fix_cotizacion_column.sql`, aplicada). Verificado el 2026-07-01
--   consultando el REST API con el anon key: SELECT id,cotizacion → HTTP 200
--   con datos reales.
--
--   El error NO es una columna faltante: es el **schema cache de PostgREST**
--   que quedó desactualizado. PostgREST cachea el schema y lo reconstruye al
--   recibir `NOTIFY pgrst, 'reload schema'` o periódicamente. Cuando se corre
--   cualquier DDL (p.ej. la migración de storage `20260624`), existe una
--   ventana en la que un write que incluye `cotizacion` en el payload es
--   rechazado con PGRST204 hasta que el cache se refresca. Se autocura, pero
--   mientras dura rompe el diagnóstico particular.
--
-- Fix:
--   1. Re-asertar la columna IF NOT EXISTS (cinturón y tirantes; no-op si ya
--      existe, que es el caso en prod).
--   2. NOTIFY pgrst, 'reload schema' — fuerza a PostgREST a reconstruir el
--      cache de inmediato en vez de esperar el refresco automático.
--
--   Correr esta migración en el SQL Editor de Supabase resuelve el error al
--   instante si vuelve a aparecer. 100% idempotente y sin backfill.
--
-- Date: 2026-07-01

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS cotizacion JSONB;

-- Fuerza el refresco del schema cache de PostgREST (Supabase) para que los
-- writes con `cotizacion` se reconozcan de inmediato.
NOTIFY pgrst, 'reload schema';
