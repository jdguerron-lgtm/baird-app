-- Customer self-service: cancellation + rescheduling from WhatsApp
-- Date: 2026-05-06

-- ─────────────────────────────────────────
-- 1. solicitudes_servicio: cliente_token + cancellation/reschedule fields
-- ─────────────────────────────────────────

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS cliente_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por text,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text,
  ADD COLUMN IF NOT EXISTS cancelado_tarde boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reagendamientos_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_reagendado_at timestamptz;

ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT IF EXISTS chk_cancelado_por;
ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT chk_cancelado_por
  CHECK (cancelado_por IS NULL OR cancelado_por IN ('cliente', 'tecnico', 'admin', 'sistema'));

-- Backfill cliente_token for existing rows (DEFAULT only applies on INSERT)
UPDATE solicitudes_servicio
   SET cliente_token = gen_random_uuid()
 WHERE cliente_token IS NULL;

-- Add 'reagendamiento_pendiente' to estado constraint (preserves all prior states)
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
    'reagendamiento_pendiente',
    'finalizado_sin_reparacion',
    'cancelada_cliente',
    'en_proceso',
    'en_verificacion',
    'completada',
    'cancelada',
    'en_disputa'
  ));

CREATE INDEX IF NOT EXISTS idx_solicitudes_cliente_token
  ON solicitudes_servicio(cliente_token)
  WHERE cliente_token IS NOT NULL;

-- ─────────────────────────────────────────
-- 2. solicitud_eventos: append-only audit log
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitud_eventos (
  id bigserial PRIMARY KEY,
  solicitud_id uuid NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  estado_previo text,
  estado_nuevo text,
  actor text,
  motivo text,
  payload jsonb DEFAULT '{}'::jsonb,
  ocurrido_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE solicitud_eventos
  DROP CONSTRAINT IF EXISTS chk_evento_tipo;
ALTER TABLE solicitud_eventos
  ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN (
    'cancelacion',
    'reagendamiento',
    'reagendamiento_confirmado',
    'cancelacion_revertida',
    'cambio_estado_admin',
    'nota_admin'
  ));

CREATE INDEX IF NOT EXISTS idx_eventos_solicitud
  ON solicitud_eventos(solicitud_id, ocurrido_at DESC);

ALTER TABLE solicitud_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_eventos" ON solicitud_eventos;
CREATE POLICY "service_role_all_eventos" ON solicitud_eventos
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Customers reach this through anon key from API routes; allow read+insert for anon
DROP POLICY IF EXISTS "anon_read_eventos" ON solicitud_eventos;
CREATE POLICY "anon_read_eventos" ON solicitud_eventos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_eventos" ON solicitud_eventos;
CREATE POLICY "anon_insert_eventos" ON solicitud_eventos
  FOR INSERT WITH CHECK (true);
