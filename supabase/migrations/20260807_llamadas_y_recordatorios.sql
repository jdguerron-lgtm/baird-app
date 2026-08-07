-- ─────────────────────────────────────────────────────────────────
-- Registro de llamadas del equipo + recordatorios de agendamiento ×3 (2026-08-07)
-- ─────────────────────────────────────────────────────────────────
-- 1. Tres tipos nuevos en solicitud_eventos:
--    - 'llamada_admin': llamada telefónica del equipo Baird al cliente,
--      registrada a mano desde /admin/solicitudes/[id] (endpoint
--      /api/admin/llamadas). payload = { origen: 'llamada_manual',
--      hora_llamada: ISO }. motivo = notas de la llamada.
--    - 'recordatorio_horario': cada envío de la plantilla
--      recordatorio_horario_v2 al cliente queda en el historial (lo inserta
--      el cron /api/cron/horario-recordatorio). payload = { intento, max }.
--    - 'llamada_tecnico': intención de llamada del técnico al cliente — botón
--      "Llamar" en la card del portal técnico (POST /api/tecnico/llamada-intento).
--      payload = { origen: 'portal_tecnico' }.
--
-- 2. Columna horario_recordatorio_count en solicitudes_servicio: garantía
--    recibe hasta 3 solicitudes de agendamiento (24h/48h/72h desde created_at)
--    si el cliente no ha fijado fecha; particular conserva 1 (comportamiento
--    previo). horario_recordatorio_at pasa a ser "último recordatorio".
--
-- Si esta migración NO se aplica antes del deploy: los INSERT de eventos
-- nuevos violan el CHECK y solo se loguea el error (best-effort); el cron
-- fallará al leer horario_recordatorio_count (columna inexistente) → aplicar
-- ANTES del deploy.

ALTER TABLE solicitud_eventos
  DROP CONSTRAINT IF EXISTS solicitud_eventos_tipo_check;
ALTER TABLE solicitud_eventos
  ADD CONSTRAINT solicitud_eventos_tipo_check
  CHECK (tipo IN (
    'cancelacion',
    'reagendamiento',
    'reagendamiento_confirmado',
    'cancelacion_revertida',
    'cambio_estado_admin',
    'nota_admin',
    'no_show_cliente',
    'alerta_visita',
    'cliente_bloqueado',
    'cliente_desbloqueado',
    'cambio_estado',
    'llamada_admin',
    'llamada_tecnico',
    'recordatorio_horario'
  ));

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS horario_recordatorio_count integer NOT NULL DEFAULT 0;

-- Backfill: solicitudes que ya recibieron el recordatorio único previo
UPDATE solicitudes_servicio
SET horario_recordatorio_count = 1
WHERE horario_recordatorio_at IS NOT NULL
  AND horario_recordatorio_count = 0;

-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'solicitud_eventos'::regclass AND contype = 'c';
--   → una fila con los 14 tipos.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio' AND column_name = 'horario_recordatorio_count';
