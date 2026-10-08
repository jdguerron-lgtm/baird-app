-- ============================================================
-- 20261008_tecnicos_gasodomesticos_certificaciones.sql
-- ------------------------------------------------------------
-- Gasodomésticos + certificaciones del técnico.
--
-- 1. `cubre_gasodomesticos BOOLEAN` — el técnico declara en /registro (o en
--    su portal, /tecnico/{token}/perfil) si atiende equipos a gas (estufas,
--    hornos, calentadores, secadoras a gas). Nullable a propósito: NULL =
--    "no informado" para los registros previos a esta pregunta (26 técnicos
--    al 2026-10-08). El formulario nuevo siempre manda true/false. El admin
--    puede fijarlo desde /admin/tecnicos/[id].
--
-- 2. `certificaciones JSONB` — mapa { <certificacion_id>: { estado, entidad,
--    numero, vence, nota, actualizado_en, actualizado_por } } que el admin
--    diligencia MANUALMENTE en la ficha. Catálogo de ids y estados en
--    src/lib/constants/certificaciones.ts (competencia_gas, conte,
--    manejo_refrigerantes, …). El técnico solo puede dejarlas en
--    "declarada"; verificada/rechazada/no_aplica son exclusivas del admin.
--    Ver docs/CERTIFICACIONES.md.
--
-- 3. `perfil_actualizado_at TIMESTAMPTZ` — última vez que el técnico completó
--    su perfil desde el portal (para saber a quién re-pedírselo).
--
-- Hoy NADA del matching lee estas columnas (siguiente paso: exigir
-- `competencia_gas` verificada para notificar gasodomésticos).
--
-- Aditiva e idempotente. Rollback:
--   ALTER TABLE public.tecnicos
--     DROP COLUMN cubre_gasodomesticos, DROP COLUMN certificaciones, DROP COLUMN perfil_actualizado_at;
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS cubre_gasodomesticos BOOLEAN,
  ADD COLUMN IF NOT EXISTS certificaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS perfil_actualizado_at TIMESTAMPTZ;

-- El código espera un objeto (mapa por id), nunca un array.
ALTER TABLE public.tecnicos DROP CONSTRAINT IF EXISTS check_certificaciones_objeto;
ALTER TABLE public.tecnicos
  ADD CONSTRAINT check_certificaciones_objeto CHECK (jsonb_typeof(certificaciones) = 'object');

COMMENT ON COLUMN public.tecnicos.cubre_gasodomesticos IS
  'Declarado por el técnico (/registro o portal): atiende artefactos a gas (estufas, hornos, calentadores, secadoras a gas). NULL = no informado (registros previos a 2026-10-08). Intervenir gas exige certificado de competencia laboral (Res. 90902/2013) → ver certificaciones.competencia_gas.';

COMMENT ON COLUMN public.tecnicos.certificaciones IS
  'Mapa { certificacion_id: { estado, entidad, numero, vence(YYYY-MM-DD), nota, actualizado_en, actualizado_por } }. Ids y estados en src/lib/constants/certificaciones.ts. El admin verifica manualmente en /admin/tecnicos/[id]; /registro y el portal del técnico solo siembran "declarada".';

COMMENT ON COLUMN public.tecnicos.perfil_actualizado_at IS
  'Última vez que el técnico guardó su perfil desde /tecnico/{token}/perfil. NULL = nunca lo ha completado desde el portal.';

-- Refresco del schema cache de PostgREST para que los INSERT desde /registro
-- con las columnas nuevas se reconozcan de inmediato (evita PGRST204, ver
-- 20260701_reload_cotizacion_schema_cache.sql).
NOTIFY pgrst, 'reload schema';
