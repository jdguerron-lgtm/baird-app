-- Supervisores (notificaciones WhatsApp) + estado repuesto_recibido
--
-- Doc canónico: docs/MAQUINA-DE-ESTADOS.md, docs/SUPABASE.md, docs/FLOWS.md.
-- Date: 2026-05-29
--
-- Cambios:
--   1. Tabla nueva `supervisores`: destinatarios internos de notificaciones
--      WhatsApp en cada cambio de estado. Configurables por ámbito
--      (todos/garantia/particular), marca y subconjunto de estados.
--   2. Estado `repuesto_recibido` agregado al CHECK constraint (22 estados).
--      Cuando el repuesto llega, la solicitud pasa esperando_repuesto →
--      repuesto_recibido; el cliente reprograma fecha (tentativa) y recién
--      ahí pasa a en_proceso.
--   3. Columnas en `solicitudes_servicio`: reprogramacion_token (uuid),
--      repuesto_recibido_at (timestamptz).
--
-- IDEMPOTENTE: usa IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────
-- 1. Tabla supervisores
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supervisores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  whatsapp text NOT NULL,               -- dígitos con país (ej: 573134951164); normalizado por trigger
  activo boolean NOT NULL DEFAULT true,
  ambito text NOT NULL DEFAULT 'todos',  -- 'todos' | 'garantia' | 'particular'
  marca text,                            -- filtro de marca (NULL = todas). Se compara normalizado en la app.
  estados text[],                        -- subconjunto de estados a notificar (NULL/vacío = todos los cambios)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisores_ambito_chk
    CHECK (ambito IN ('todos', 'garantia', 'particular'))
);

COMMENT ON TABLE supervisores IS
  'Destinatarios internos de notificaciones WhatsApp en cada cambio de estado de solicitudes. Filtrables por ámbito (todos/garantia/particular), marca y subconjunto de estados. Ver docs/FLOWS.md § Supervisores.';
COMMENT ON COLUMN supervisores.whatsapp IS
  'Dígitos con país (ej: 573134951164). Normalizado por trigger normalizar_whatsapp_supervisor → normalizar_telefono_co().';
COMMENT ON COLUMN supervisores.ambito IS
  'todos = garantía + particular; garantia = solo es_garantia=true; particular = solo es_garantia=false.';
COMMENT ON COLUMN supervisores.marca IS
  'Filtro de marca. NULL = todas las marcas. Se compara con normalizeForMatch() en la app, no en SQL.';
COMMENT ON COLUMN supervisores.estados IS
  'Subconjunto de estados (text[]) a notificar. NULL o vacío = notificar todos los cambios de estado.';

CREATE INDEX IF NOT EXISTS idx_supervisores_activo
  ON supervisores(activo) WHERE activo = true;

-- ─────────────────────────────────────────────────────────────────
-- 2. RLS — patrón `tecnicos` (entidad administrada por admin vía anon key)
--    La app solo usa la anon key (no hay service_role configurado), por lo
--    que el CRUD admin y el helper notificarCambioEstado leen/escriben con
--    anon. La autorización real la impone verificarAdmin en /api/admin/*.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE supervisores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisores_anon_select ON supervisores;
CREATE POLICY supervisores_anon_select ON supervisores
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS supervisores_anon_insert ON supervisores;
CREATE POLICY supervisores_anon_insert ON supervisores
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS supervisores_anon_update ON supervisores;
CREATE POLICY supervisores_anon_update ON supervisores
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS supervisores_anon_delete ON supervisores;
CREATE POLICY supervisores_anon_delete ON supervisores
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS supervisores_service_role_all ON supervisores;
CREATE POLICY supervisores_service_role_all ON supervisores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. Trigger de normalización de teléfono (reusa normalizar_telefono_co)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_normalizar_whatsapp_supervisor()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.whatsapp := normalizar_telefono_co(NEW.whatsapp);
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS normalizar_whatsapp_supervisor ON supervisores;
CREATE TRIGGER normalizar_whatsapp_supervisor
  BEFORE INSERT OR UPDATE OF whatsapp ON supervisores
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalizar_whatsapp_supervisor();

-- ─────────────────────────────────────────────────────────────────
-- 4. Estado repuesto_recibido en CHECK constraint (22 estados)
-- ─────────────────────────────────────────────────────────────────
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
    'repuesto_recibido',
    'reagendamiento_pendiente',
    'finalizado_sin_reparacion',
    'cancelada_cliente',
    'no_show_cliente',
    'en_proceso',
    'en_verificacion',
    'completada',
    'cancelada',
    'en_disputa'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 5. Columnas de reprogramación tras llegada de repuesto
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS reprogramacion_token uuid,
  ADD COLUMN IF NOT EXISTS repuesto_recibido_at timestamptz;

COMMENT ON COLUMN solicitudes_servicio.reprogramacion_token IS
  'Token UUID para la página pública /reprogramar-repuesto/[token]. Se genera al pasar a repuesto_recibido; permite al cliente elegir nueva fecha (tentativa) de visita.';
COMMENT ON COLUMN solicitudes_servicio.repuesto_recibido_at IS
  'Marca de tiempo cuando el último repuesto pendiente fue recibido y la solicitud pasó a repuesto_recibido.';

-- Lookup por token (página pública de reprogramación)
CREATE INDEX IF NOT EXISTS idx_solicitudes_reprogramacion_token
  ON solicitudes_servicio(reprogramacion_token)
  WHERE reprogramacion_token IS NOT NULL;

-- Listado admin de solicitudes con repuesto recién llegado pendiente de reprogramar
CREATE INDEX IF NOT EXISTS idx_solicitudes_repuesto_recibido
  ON solicitudes_servicio(repuesto_recibido_at DESC)
  WHERE estado = 'repuesto_recibido';

-- ─────────────────────────────────────────────────────────────────
-- 6. Refrescar PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
