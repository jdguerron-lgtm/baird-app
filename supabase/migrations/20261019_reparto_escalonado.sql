-- 2026-10-19 — Reparto escalonado de ofertas a técnicos
--
-- Problema: la oferta es "el primero que acepte gana" y un técnico se quedaba
-- con casi todo. Ahora, en la primera oferta, los técnicos con menos de
-- `max_servicios_semana` servicios aceptados en 7 días la reciben primero; si
-- en `minutos_ventaja` minutos nadie acepta, se abre al resto.
-- Código: src/lib/services/reparto.service.ts + notificarTecnicos.
-- Panel: /admin/reparto.
--
-- Idempotente. Rollback:
--   SELECT cron.unschedule('oferta-escalonada-1min');
--   ALTER TABLE public.solicitudes_servicio DROP COLUMN IF EXISTS oferta_abierta_at;
--   DROP TABLE IF EXISTS public.config_reparto;

-- 1. Configuración (una sola fila, id = 1).
CREATE TABLE IF NOT EXISTS public.config_reparto (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo               boolean  NOT NULL DEFAULT true,
  minutos_ventaja      integer  NOT NULL DEFAULT 10 CHECK (minutos_ventaja BETWEEN 1 AND 120),
  max_servicios_semana integer  NOT NULL DEFAULT 3  CHECK (max_servicios_semana BETWEEN 1 AND 50),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text
);

INSERT INTO public.config_reparto (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Solo service_role (server-side). Sin policies = cerrada al anon.
ALTER TABLE public.config_reparto ENABLE ROW LEVEL SECURITY;

-- 2. Cuándo se abre la oferta al resto de técnicos (NULL = nada pendiente).
ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS oferta_abierta_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_solicitudes_oferta_abierta_at
  ON public.solicitudes_servicio (oferta_abierta_at)
  WHERE oferta_abierta_at IS NOT NULL;

-- 3. Job cada minuto que abre las ofertas vencidas (mismo patrón que
--    wompi-conciliar-5min: el secreto sale de Vault, nunca de este archivo).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'oferta-escalonada-1min',
  '* * * * *',
  $job$
  SELECT net.http_get(
    url     := 'https://lineablanca.bairdservice.com/api/cron/oferta-escalonada',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'User-Agent', 'supabase-pg_cron'
    ),
    timeout_milliseconds := 55000
  );
  $job$
);

-- Verificación:
--   SELECT * FROM public.config_reparto;
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'oferta-escalonada-1min';
--   SELECT id, oferta_abierta_at FROM public.solicitudes_servicio WHERE oferta_abierta_at IS NOT NULL;
