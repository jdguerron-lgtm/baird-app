-- ─────────────────────────────────────────────────────────────────
-- Historial de cambios de estado (2026-06-12)
-- ─────────────────────────────────────────────────────────────────
-- Nuevo tipo de evento 'cambio_estado' en solicitud_eventos: TODA transición
-- de estado del flujo (no solo las manuales del admin) queda registrada con
-- el actor que la disparó ('cliente' | 'tecnico' | 'admin' | 'sistema').
--
-- Quién inserta: notificarCambioEstado() en whatsapp.service.ts — el choke
-- point por el que ya pasan todos los "transition owners" (ver
-- docs/ARQUITECTURA.md). El actor se infiere del par estado_previo →
-- estado_nuevo (cada transición tiene un único endpoint dueño, gateado a un
-- solo rol). Los call-sites que YA insertan su propio evento (cancelacion,
-- reagendamiento, reagendamiento_confirmado, cambio_estado_admin) pasan
-- registrarEvento:false para no duplicar filas.
--
-- Quién lee: sección "Historial de estados" en /admin/solicitudes/[id].
--
-- Si esta migración NO se aplica antes del deploy: el INSERT viola el CHECK
-- y solo se loguea el error (logEvento es best-effort) — las transiciones y
-- los WhatsApp NO se rompen; simplemente el historial no se llena.
--
-- Fix incluido: 20260506 creó el constraint con nombre `chk_evento_tipo` y
-- 20260510 intentó reemplazarlo dropeando `solicitud_eventos_tipo_check`
-- (nombre que no existía aún) — con lo cual en una BD que aplicó ambas
-- migraciones quedaron DOS constraints activos y el viejo (6 tipos) seguía
-- rechazando los tipos nuevos de no-show. Acá dropeamos ambos nombres y
-- dejamos uno solo canónico con la lista completa.

ALTER TABLE solicitud_eventos
  DROP CONSTRAINT IF EXISTS chk_evento_tipo;
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
    'cambio_estado'
  ));

-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'solicitud_eventos'::regclass AND contype = 'c';
--   → debe devolver UNA sola fila (solicitud_eventos_tipo_check) con los 11 tipos.
