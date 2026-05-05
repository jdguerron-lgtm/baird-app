-- Verificación del siguiente paso por el cliente (post-diagnóstico, garantía)
-- Date: 2026-04-28

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS verificacion_paso_token uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS verificacion_paso_decision text,
  ADD COLUMN IF NOT EXISTS verificacion_paso_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificacion_paso_comentario text;

ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT IF EXISTS chk_verificacion_paso;
ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT chk_verificacion_paso
  CHECK (verificacion_paso_decision IS NULL OR verificacion_paso_decision IN ('aprobado', 'rechazado'));

-- Agregar 'verificacion_pendiente' al CHECK constraint de estado
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
    'cotizacion_enviada',
    'cotizacion_aprobada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'finalizado_sin_reparacion',
    'cancelada_cliente',
    'en_proceso',
    'en_verificacion',
    'completada',
    'cancelada',
    'en_disputa'
  ));

CREATE INDEX IF NOT EXISTS idx_solicitudes_verificacion_token
  ON solicitudes_servicio(verificacion_paso_token)
  WHERE verificacion_paso_token IS NOT NULL;
