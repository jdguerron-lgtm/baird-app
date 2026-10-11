-- 2026-10-11 — Programación en la BD: conciliación Wompi cada 5 min + auditoría diaria
--
-- Plan: docs/mejoras-futuras/pagos-aislamiento/README.md § 4.
--
-- Por qué desde Supabase y no desde Vercel: el proyecto está en plan Hobby,
-- que solo permite crons diarios. pg_cron + pg_net llaman a
-- GET /api/cron/wompi-conciliar cada 5 min con `Authorization: Bearer
-- <CRON_SECRET>`; el secreto vive en Vault (`cron_secret`, creado el
-- 2026-10-11) y NUNCA en este archivo. Mientras CRON_SECRET no esté en Vercel
-- el endpoint acepta sin auth (comportamiento previo, no peor que hoy).
--
-- Impacto: 288 invocaciones/día de una función que solo LEE (BD + Wompi) y
-- registra vía registrarPagoWompi (idempotente). pg_net es asíncrono: el job
-- encola la request y termina en milisegundos; la respuesta queda en
-- net._http_response (se purga sola).
--
-- Idempotente (cron.schedule reemplaza el job si ya existe con ese nombre).
-- Rollback:
--   SELECT cron.unschedule('wompi-conciliar-5min');
--   SELECT cron.unschedule('auditar-pagos-diario');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Conciliación contra Wompi cada 5 minutos.
SELECT cron.schedule(
  'wompi-conciliar-5min',
  '*/5 * * * *',
  $job$
  SELECT net.http_get(
    url     := 'https://lineablanca.bairdservice.com/api/cron/wompi-conciliar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'User-Agent', 'supabase-pg_cron'
    ),
    timeout_milliseconds := 55000
  );
  $job$
);

-- Auditoría ledger ↔ solicitud, una vez al día a las 03:15 UTC (22:15 Bogotá).
SELECT cron.schedule(
  'auditar-pagos-diario',
  '15 3 * * *',
  $job$ SELECT public.auditar_pagos(); $job$
);

-- Verificación:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--   SELECT jobname, status, return_message, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT id, status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 3;
