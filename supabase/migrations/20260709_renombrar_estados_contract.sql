-- ─────────────────────────────────────────────────────────────────────────────
-- Renombre de estados confusos — PASO 2 de 2 (CONTRACT). 2026-07-09.
--
-- ⚠️ Aplicar SOLO después de verificar que el deploy con los nombres nuevos
-- está vivo en producción (el código viejo escribía los valores legacy).
-- Ver 20260709_renombrar_estados_expand.sql para el contexto del renombre.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Barrer strays que el código viejo haya escrito durante la ventana de deploy.
UPDATE solicitudes_servicio SET estado = 'aprobacion_paso_pendiente' WHERE estado = 'verificacion_pendiente';
UPDATE solicitudes_servicio SET estado = 'confirmacion_pendiente'    WHERE estado = 'en_verificacion';
UPDATE solicitudes_servicio SET estado = 'reparacion_rechazada'      WHERE estado = 'cancelada_cliente';

-- 2. Cerrar el CHECK solo a los nombres nuevos (22 estados canónicos).
--    DEBE coincidir con ESTADOS_VALIDOS en src/lib/constants/estados.ts.
ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT solicitudes_servicio_estado_check;

ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_estado_check CHECK (estado IN (
    'pendiente',
    'pendiente_horario',
    'sin_agendar',
    'notificada',
    'asignada',
    'diagnostico_pendiente',
    'aprobacion_paso_pendiente',
    'pendiente_pricing',
    'cotizacion_enviada',
    'cotizacion_aprobada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'repuesto_recibido',
    'reagendamiento_pendiente',
    'finalizado_sin_reparacion',
    'reparacion_rechazada',
    'no_show_cliente',
    'en_proceso',
    'confirmacion_pendiente',
    'completada',
    'cancelada',
    'en_disputa'
  ));
