-- HOTFIX: backfill de horario_token para solicitudes viejas.
--
-- Síntoma:
--   Al hacer click en "Reenviar selección de horario al cliente" en
--   /admin/solicitudes/[id], el endpoint devuelve "horario_token no
--   generado". El cliente nunca recibe la plantilla.
--
-- Causa raíz:
--   La migración 20260427_customer_first_scheduling.sql agregó la
--   columna horario_token UUID UNIQUE pero NO hizo backfill. Filas
--   creadas antes del 28-abr-2026, o vía la versión vieja de
--   /api/carga-masiva (anterior al commit 153684c del 8-may), tienen
--   horario_token = NULL.
--
-- Fix:
--   Genera un UUID para cada fila con horario_token NULL. Solo actúa
--   sobre filas en estados activos (no terminales) — las terminales
--   no necesitan poder reenviar.
--
-- Date: 2026-05-08

UPDATE solicitudes_servicio
   SET horario_token = gen_random_uuid()
 WHERE horario_token IS NULL
   AND estado NOT IN ('completada', 'cancelada', 'cancelada_cliente',
                      'cotizacion_rechazada', 'finalizado_sin_reparacion',
                      'en_disputa');

-- Refresh schema cache.
NOTIFY pgrst, 'reload schema';
