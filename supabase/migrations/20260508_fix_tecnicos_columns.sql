-- HOTFIX: agregar columnas faltantes en tabla `tecnicos`.
--
-- Síntoma:
--   POST en /registro (alta de técnico) falla con un error análogo al de
--   `cotizacion` ("Could not find the 'X' column of 'tecnicos'..."). Las
--   columnas se escriben en `src/app/registro/page.tsx:107-120` y se leen
--   por `notificarRegistroTecnico` (whatsapp.service.ts) y el panel admin
--   (`/admin/tecnicos/[id]`).
--
-- Causa raíz:
--   Mismo patrón que el bug de `cotizacion`: las columnas existen en código
--   pero ninguna migración del repo las creó. El schema base de `tecnicos`
--   nunca fue versionado en `supabase/migrations/`.
--
-- Columnas afectadas:
--   - `acepta_garantias` BOOLEAN — flag opt-in del técnico para flujo
--     garantía. Default true para preservar comportamiento histórico (los
--     formularios de registro vienen con el checkbox marcado).
--   - `especialidad_principal` TEXT — especialidad declarada como primaria
--     por el técnico. Se usa en el WhatsApp de bienvenida y en el panel
--     admin. La fuente de verdad para matching sigue siendo la tabla
--     junction `especialidades_tecnico`; este campo es informativo.
--
-- Backfill:
--   Para técnicos ya existentes (registrados antes del hotfix vía caminos
--   alternos), poblar `especialidad_principal` desde la junction.
--
-- Date: 2026-05-08

ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS acepta_garantias BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS especialidad_principal TEXT;

-- Backfill: si la fila tiene especialidades en la junction y el campo está
-- NULL, copiar la primera especialidad encontrada como principal.
UPDATE tecnicos t
SET especialidad_principal = (
  SELECT especialidad
  FROM especialidades_tecnico
  WHERE tecnico_id = t.id
  ORDER BY especialidad
  LIMIT 1
)
WHERE t.especialidad_principal IS NULL
  AND EXISTS (
    SELECT 1 FROM especialidades_tecnico WHERE tecnico_id = t.id
  );

-- Refresca el schema cache de PostgREST (Supabase) para que el cliente JS
-- reconozca las columnas inmediatamente, sin esperar al refresh automático.
NOTIFY pgrst, 'reload schema';
