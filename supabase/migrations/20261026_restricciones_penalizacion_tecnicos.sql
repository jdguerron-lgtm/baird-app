-- ============================================================
-- 20261026_restricciones_penalizacion_tecnicos.sql
--
-- 1. Bloqueo manual por tipo de servicio (admin, /admin/tecnicos/[id]):
--      tecnicos.bloqueado_garantia    true → no recibe ofertas de garantía
--      tecnicos.bloqueado_particular  true → no recibe ofertas particulares
--                                     (posgarantía) ni sale en el selector
--                                     "técnico de preferencia" de /solicitar
--      tecnicos.bloqueo_nota          por qué (texto libre del admin)
--
-- 2. Penalización por incumplimiento de agenda (config en /admin/reparto):
--      config_reparto.penalizacion_activa      on/off
--      config_reparto.penalizacion_minutos     minutos de espera por incumplimiento (5)
--      config_reparto.penalizacion_dias        ventana hacia atrás (30)
--      config_reparto.penalizacion_max_minutos tope de espera (60)
--    Cada incumplimiento reciente = el técnico recibe la oferta N × 5 min
--    después que los demás.
--
-- 3. solicitudes_servicio.oferta_pendientes: técnicos retenidos por la
--    penalización y cuándo se les libera la oferta
--    ([{ "tecnico_id": uuid, "liberar_at": iso }]). Lo procesa el cron
--    /api/cron/oferta-escalonada (job pg_cron oferta-escalonada-1min, ya
--    existente) usando oferta_abierta_at como despertador.
--
-- Todo aditivo e idempotente. El código funciona sin esta migración: sin las
-- columnas no hay bloqueos ni penalización (comportamiento actual).
--
-- Rollback:
--   ALTER TABLE public.tecnicos DROP COLUMN IF EXISTS bloqueado_garantia,
--     DROP COLUMN IF EXISTS bloqueado_particular, DROP COLUMN IF EXISTS bloqueo_nota;
--   ALTER TABLE public.config_reparto DROP COLUMN IF EXISTS penalizacion_activa,
--     DROP COLUMN IF EXISTS penalizacion_minutos, DROP COLUMN IF EXISTS penalizacion_dias,
--     DROP COLUMN IF EXISTS penalizacion_max_minutos;
--   ALTER TABLE public.solicitudes_servicio DROP COLUMN IF EXISTS oferta_pendientes;
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS bloqueado_garantia   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueado_particular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueo_nota         text;

ALTER TABLE public.config_reparto
  ADD COLUMN IF NOT EXISTS penalizacion_activa      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS penalizacion_minutos     integer NOT NULL DEFAULT 5
    CHECK (penalizacion_minutos BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS penalizacion_dias        integer NOT NULL DEFAULT 30
    CHECK (penalizacion_dias BETWEEN 1 AND 180),
  ADD COLUMN IF NOT EXISTS penalizacion_max_minutos integer NOT NULL DEFAULT 60
    CHECK (penalizacion_max_minutos BETWEEN 1 AND 720);

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS oferta_pendientes jsonb;

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT bloqueado_garantia, bloqueado_particular, count(*) FROM public.tecnicos GROUP BY 1, 2;
--   SELECT penalizacion_activa, penalizacion_minutos, penalizacion_dias, penalizacion_max_minutos FROM public.config_reparto;
--   SELECT id, oferta_abierta_at, oferta_pendientes FROM public.solicitudes_servicio WHERE oferta_pendientes IS NOT NULL;
