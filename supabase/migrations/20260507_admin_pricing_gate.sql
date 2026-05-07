-- Admin pricing gate: el técnico ya no fija precio ni tiempo del repuesto.
-- Tras el diagnóstico, las solicitudes que requieren cotización o tiempo de
-- entrega quedan en estado `pendiente_pricing` hasta que un admin de Baird
-- complete la información. Solo entonces se notifica al cliente.
--
-- Date: 2026-05-07

ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT IF EXISTS solicitudes_servicio_estado_check;
ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_estado_check
  CHECK (estado IN (
    'pendiente',
    'pendiente_horario',
    'sin_agendar',
    'notificada',
    'asignada',
    'diagnostico_pendiente',
    'verificacion_pendiente',
    'pendiente_pricing',
    'cotizacion_enviada',
    'cotizacion_aprobada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'reagendamiento_pendiente',
    'finalizado_sin_reparacion',
    'cancelada_cliente',
    'en_proceso',
    'en_verificacion',
    'completada',
    'cancelada',
    'en_disputa'
  ));

-- repuestos_pendientes ahora puede tener costo y tiempo_estimado nulos
-- mientras admin no los haya fijado.
ALTER TABLE repuestos_pendientes
  ALTER COLUMN tiempo_estimado DROP NOT NULL;

-- (costo ya admite NULL/0 en el schema original.)

-- Índice para listado admin de pricing pendiente
CREATE INDEX IF NOT EXISTS idx_solicitudes_pendiente_pricing
  ON solicitudes_servicio(created_at DESC)
  WHERE estado = 'pendiente_pricing';
