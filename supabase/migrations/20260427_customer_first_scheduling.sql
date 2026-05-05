-- Customer-first scheduling + post-diagnosis branching + GPS tracking + technician oath
-- Date: 2026-04-27

-- ─────────────────────────────────────────
-- 1. solicitudes_servicio: nuevos campos
-- ─────────────────────────────────────────

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS horario_token uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS horario_confirmado text,
  ADD COLUMN IF NOT EXISTS horario_confirmado_at timestamptz,
  ADD COLUMN IF NOT EXISTS horario_recordatorio_at timestamptz,
  ADD COLUMN IF NOT EXISTS siguiente_paso text,
  ADD COLUMN IF NOT EXISTS siguiente_paso_detalle text,
  ADD COLUMN IF NOT EXISTS siguiente_paso_at timestamptz,
  ADD COLUMN IF NOT EXISTS tyc_aceptados_at timestamptz,
  ADD COLUMN IF NOT EXISTS tyc_version text;

-- siguiente_paso solo acepta los 4 valores definidos
ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT IF EXISTS chk_siguiente_paso;
ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT chk_siguiente_paso
  CHECK (siguiente_paso IS NULL OR siguiente_paso IN ('reparar', 'esperar_repuesto', 'no_reparable', 'negativa_cliente'));

-- Si la columna estado tiene CHECK constraint, hay que actualizarla con los nuevos estados
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

CREATE INDEX IF NOT EXISTS idx_solicitudes_horario_token
  ON solicitudes_servicio(horario_token)
  WHERE horario_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_pendiente_horario
  ON solicitudes_servicio(created_at)
  WHERE estado = 'pendiente_horario';

-- ─────────────────────────────────────────
-- 2. evidencias_servicio: oath + GPS
-- ─────────────────────────────────────────

ALTER TABLE evidencias_servicio
  ADD COLUMN IF NOT EXISTS oath_firma text,
  ADD COLUMN IF NOT EXISTS oath_firmado_at timestamptz,
  ADD COLUMN IF NOT EXISTS gps_diagnostico_lat numeric,
  ADD COLUMN IF NOT EXISTS gps_diagnostico_lng numeric,
  ADD COLUMN IF NOT EXISTS gps_completado_lat numeric,
  ADD COLUMN IF NOT EXISTS gps_completado_lng numeric,
  ADD COLUMN IF NOT EXISTS gps_post_visita_lat numeric,
  ADD COLUMN IF NOT EXISTS gps_post_visita_lng numeric,
  ADD COLUMN IF NOT EXISTS gps_post_visita_at timestamptz,
  ADD COLUMN IF NOT EXISTS gps_flagged boolean DEFAULT false;

-- ─────────────────────────────────────────
-- 3. repuestos_pendientes: tabla nueva
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repuestos_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  sku text NOT NULL,
  descripcion text NOT NULL,
  costo numeric DEFAULT 0,
  tiempo_estimado text,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recibido', 'cancelado')),
  solicitado_at timestamptz DEFAULT now(),
  recibido_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_repuestos_solicitud ON repuestos_pendientes(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_repuestos_estado ON repuestos_pendientes(estado);

ALTER TABLE repuestos_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_repuestos" ON repuestos_pendientes;
CREATE POLICY "service_role_all_repuestos" ON repuestos_pendientes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_repuestos" ON repuestos_pendientes;
CREATE POLICY "anon_read_repuestos" ON repuestos_pendientes
  FOR SELECT USING (true);

-- ─────────────────────────────────────────
-- 4. gps_pings: tabla nueva (auditoría completa)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gps_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  tecnico_id uuid REFERENCES tecnicos(id),
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  fase text NOT NULL CHECK (fase IN ('llegada', 'diagnostico', 'completado', 'post_visita')),
  capturado_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_solicitud ON gps_pings(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_gps_tecnico ON gps_pings(tecnico_id, capturado_at);

ALTER TABLE gps_pings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_gps" ON gps_pings;
CREATE POLICY "service_role_all_gps" ON gps_pings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_insert_gps" ON gps_pings;
CREATE POLICY "anon_insert_gps" ON gps_pings
  FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────
-- 5. Backfill: nada que hacer — registros existentes mantienen 'pendiente'
--    El nuevo flujo aplica solo a solicitudes creadas tras la migración.
-- ─────────────────────────────────────────
