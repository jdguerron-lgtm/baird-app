-- ============================================================
-- Migración: campos de WhatsApp y pago en solicitudes_servicio
-- + tabla notificaciones_whatsapp
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Nuevos campos en solicitudes_servicio
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS pago_tecnico       INTEGER,
  ADD COLUMN IF NOT EXISTS horario_visita_1   TEXT,
  ADD COLUMN IF NOT EXISTS horario_visita_2   TEXT,
  ADD COLUMN IF NOT EXISTS triaje_resultado   JSONB,
  ADD COLUMN IF NOT EXISTS notificados_at     TIMESTAMPTZ;

-- 2. Comentarios descriptivos
COMMENT ON COLUMN solicitudes_servicio.pago_tecnico     IS 'Monto en COP que recibirá el técnico por el servicio (definido por el cliente al crear la solicitud)';
COMMENT ON COLUMN solicitudes_servicio.horario_visita_1 IS 'Primera franja horaria preferida por el cliente para la visita del técnico';
COMMENT ON COLUMN solicitudes_servicio.horario_visita_2 IS 'Segunda franja horaria preferida por el cliente para la visita del técnico';
COMMENT ON COLUMN solicitudes_servicio.triaje_resultado IS 'JSON con el resultado del análisis IA (posible_falla, costo_estimado, urgencia, etc.) — reservado para cuando se reactive IA';
COMMENT ON COLUMN solicitudes_servicio.notificados_at   IS 'Timestamp de cuando se enviaron los mensajes de WhatsApp a los técnicos';

-- 3. Tabla de notificaciones WhatsApp (log de ofertas enviadas a técnicos)
CREATE TABLE IF NOT EXISTS notificaciones_whatsapp (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   UUID        NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  tecnico_id     UUID        NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  token          TEXT        NOT NULL UNIQUE,  -- Token único para el link de aceptación /aceptar/{token}
  estado         TEXT        NOT NULL DEFAULT 'enviado'
                             CHECK (estado IN ('enviado', 'aceptado', 'expirado', 'invalidado', 'error')),
  enviado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondido_at  TIMESTAMPTZ
);

COMMENT ON TABLE notificaciones_whatsapp IS 'Registro de mensajes WhatsApp enviados a técnicos por cada solicitud. El token es el link único de aceptación.';
COMMENT ON COLUMN notificaciones_whatsapp.token IS 'UUID único generado al enviar. Se incluye en la URL /aceptar/{token} que recibe el técnico.';
COMMENT ON COLUMN notificaciones_whatsapp.estado IS 'enviado=esperando respuesta | aceptado=este técnico ganó | invalidado=otro técnico ganó primero | error=falló el envío';

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_notif_wa_solicitud  ON notificaciones_whatsapp(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_notif_wa_tecnico    ON notificaciones_whatsapp(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_notif_wa_token      ON notificaciones_whatsapp(token);
CREATE INDEX IF NOT EXISTS idx_notif_wa_estado     ON notificaciones_whatsapp(estado);

-- 5. (Opcional) RLS básica para notificaciones — ajustar según política de auth
-- ALTER TABLE notificaciones_whatsapp ENABLE ROW LEVEL SECURITY;
