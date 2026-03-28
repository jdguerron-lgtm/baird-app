-- =============================================
-- Migration: Portal del técnico + Evidencias de servicio
-- Date: 2026-03-27
-- =============================================

-- 1. Agregar portal_token a tecnicos (acceso sin login al portal)
ALTER TABLE tecnicos
ADD COLUMN IF NOT EXISTS portal_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Generar tokens para técnicos existentes que no tengan
UPDATE tecnicos SET portal_token = gen_random_uuid() WHERE portal_token IS NULL;

-- 2. Crear tabla de evidencias de servicio
CREATE TABLE IF NOT EXISTS evidencias_servicio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitud_id UUID NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  fotos TEXT[] DEFAULT '{}',
  checklist JSONB NOT NULL DEFAULT '{}',
  firma_url TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  completado_at TIMESTAMPTZ DEFAULT NOW(),
  confirmacion_token UUID DEFAULT gen_random_uuid() UNIQUE,
  confirmado_at TIMESTAMPTZ,
  confirmado BOOLEAN,
  cliente_comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_evidencias_solicitud ON evidencias_servicio(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_tecnico ON evidencias_servicio(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_confirmacion ON evidencias_servicio(confirmacion_token);
CREATE INDEX IF NOT EXISTS idx_tecnicos_portal ON tecnicos(portal_token);

-- 3. Crear bucket de storage para evidencias (ejecutar en Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('evidencias-servicio', 'evidencias-servicio', true);

-- 4. Actualizar enum de estados si es necesario (depende de si usas CHECK constraint)
-- Si tienes un CHECK constraint en solicitudes_servicio.estado, actualízalo:
-- ALTER TABLE solicitudes_servicio DROP CONSTRAINT IF EXISTS solicitudes_servicio_estado_check;
-- ALTER TABLE solicitudes_servicio ADD CONSTRAINT solicitudes_servicio_estado_check
--   CHECK (estado IN ('pendiente', 'notificada', 'asignada', 'en_proceso', 'en_verificacion', 'completada', 'cancelada', 'en_disputa'));
