-- ============================================================
-- Recordatorios del ciclo de repuesto + entrega por supervisor (2026-08-25)
--
-- 1. Tipo nuevo en solicitud_eventos:
--    - 'recordatorio_repuesto': cada re-aviso que dispara el cron
--      /api/cron/repuesto-recordatorio queda en el historial.
--      payload = { etapa: 'esperando_repuesto'|'repuesto_en_camino', intento, max }.
--      · etapa esperando_repuesto → re-envía supervisor_repuesto_garantia_v1
--        a los supervisores con visibilidad (solo garantía).
--      · etapa repuesto_en_camino → re-envía repuesto_en_camino_cliente_v1
--        al cliente que aún no agenda la visita de finalización.
--
-- 2. Columnas de tracking en solicitudes_servicio (mismo patrón que
--    horario_recordatorio_count/at de la migración 20260807):
--    - repuesto_recordatorio_count: intentos enviados en la etapa actual.
--    - repuesto_recordatorio_at: último recordatorio enviado.
--    El cron distingue etapas SIN resetear el contador en las transiciones:
--    si repuesto_recordatorio_at es anterior al inicio de la etapa
--    (guia_envio_at para repuesto_en_camino), el contador efectivo es 0.
--
-- Si esta migración no se aplica: el endpoint /api/supervisor/repuesto-entregado
-- y el resto del flujo siguen funcionando (no usan estas columnas); solo el
-- cron /api/cron/repuesto-recordatorio falla al leer las columnas → aplicar
-- antes de activar el cron en vercel.json.
-- ============================================================

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
    'recordatorio_horario',
    'mensaje_cliente',
    'comprobante_envio',
    'pago_registrado',
    'recordatorio_repuesto'
  ));

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS repuesto_recordatorio_count integer NOT NULL DEFAULT 0;
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS repuesto_recordatorio_at timestamptz;

-- ============================================================
-- Verificación:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'solicitud_eventos_tipo_check';
--   → una fila con los 18 tipos (los 17 vigentes en prod a 2026-08-25 —
--     incluye mensaje_cliente/comprobante_envio/pago_registrado, que no
--     estaban en el CHECK de 20260807 — + recordatorio_repuesto).
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio'
--     AND column_name LIKE 'repuesto_recordatorio%';
--   → repuesto_recordatorio_count, repuesto_recordatorio_at.
-- ============================================================
