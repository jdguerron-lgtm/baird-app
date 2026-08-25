-- ============================================================
-- 20260824_tecnicos_arl.sql
-- ------------------------------------------------------------
-- Agrega `tiene_arl` a `tecnicos`: el formulario de registro
-- (/registro) ahora pregunta si el técnico está afiliado a una
-- ARL (riesgos laborales). Requisito para poder ingresar a
-- ciertos conjuntos/empresas y para el marco de contratistas
-- independientes (ver CLAUDE.md § Legal Framework).
--
-- Nullable a propósito: NULL = "no informado" para los técnicos
-- registrados antes de esta pregunta. El formulario nuevo
-- siempre manda true/false.
--
-- Aditiva e idempotente. Rollback: ALTER TABLE public.tecnicos DROP COLUMN tiene_arl;
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS tiene_arl BOOLEAN;

COMMENT ON COLUMN public.tecnicos.tiene_arl IS
  'Afiliación vigente a ARL (riesgos laborales) declarada por el técnico en /registro. NULL = no informado (registros previos a 2026-08-24).';

-- Fuerza el refresco del schema cache de PostgREST para que los INSERT desde
-- /registro que incluyen `tiene_arl` en el payload se reconozcan de inmediato
-- (evita el PGRST204 documentado en 20260701_reload_cotizacion_schema_cache.sql).
NOTIFY pgrst, 'reload schema';
