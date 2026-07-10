-- ─────────────────────────────────────────────────────────────────────────────
-- Purga y fusión de estados — 22 → 18. 2026-07-09.
--
-- FUSIÓN: diagnostico_pendiente → asignada
--   Ambos significaban "técnico aceptó, visita pendiente"; la diferencia
--   garantía/particular ya la da el booleano es_garantia. procesarAceptacion
--   ahora escribe siempre 'asignada'.
--
-- PURGA de estados muertos (0 filas + ningún writer en el código):
--   pendiente                → legacy pre customer-first scheduling
--   cotizacion_aprobada      → procesarAprobacionCotizacion salta directo a
--                              en_proceso | esperando_repuesto; nunca se persistía
--   reagendamiento_pendiente → procesarReagendamientoCliente conserva el estado
--                              actual; solo existía una lectura defensiva
--
-- No requiere expand previo: 'asignada' ya estaba en el CHECK y el código
-- viejo maneja asignada en todos los paths de particular. Orden de aplicación:
--   1. UPDATE de filas diagnostico_pendiente → asignada (pre-deploy, seguro)
--   2. Deploy del código (escribe solo asignada)
--   3. ESTA migración completa: re-barre strays + CHECK a 18
--
-- solicitud_eventos NO se toca (audit append-only); ESTADO_LABELS/ESTILOS
-- mantienen aliases legacy para renderizar la historia.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Barrer strays (idempotente).
UPDATE solicitudes_servicio SET estado = 'asignada' WHERE estado = 'diagnostico_pendiente';
UPDATE solicitudes_servicio SET estado = 'asignada' WHERE estado = 'pendiente';

-- 2. CHECK con los 18 estados canónicos.
--    DEBE coincidir con ESTADOS_VALIDOS en src/lib/constants/estados.ts.
ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT solicitudes_servicio_estado_check;

ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_estado_check CHECK (estado IN (
    'pendiente_horario',
    'sin_agendar',
    'notificada',
    'asignada',
    'aprobacion_paso_pendiente',
    'pendiente_pricing',
    'cotizacion_enviada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'repuesto_recibido',
    'finalizado_sin_reparacion',
    'reparacion_rechazada',
    'no_show_cliente',
    'en_proceso',
    'confirmacion_pendiente',
    'completada',
    'cancelada',
    'en_disputa'
  ));
