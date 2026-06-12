-- Dapta — segunda línea de voz IA (llamadas automatizadas)
--
-- Doc canónico: docs/DAPTA.md, docs/MAQUINA-DE-ESTADOS.md, docs/FLOWS.md.
-- Date: 2026-06-02
--
-- Contexto: WhatsApp es la 1ª línea de coordinación con el cliente. Cuando el
-- cliente no responde (no agenda, no confirma el cierre, no aprueba cotización,
-- no reprograma tras recibir repuesto), un cron dispara una llamada de voz vía
-- Dapta como 2ª línea. Dapta NUNCA toca Supabase directo: Baird dispara con
-- variables dinámicas, el agente conversa, y al colgar Dapta hace POST a
-- /api/dapta/webhook con un resultado estructurado que NUESTRO webhook escribe
-- reusando la función dueña de cada transición (transiciones.service.ts).
--
-- Cambios:
--   1. Tabla nueva `llamadas`: una fila por intento de llamada (auditoría +
--      idempotencia del webhook por dapta_call_id).
--   2. Columnas en `solicitudes_servicio`: llamada_intentos, ultima_llamada_at
--      (cerrojo de cooldown anti-doble-disparo), requiere_confirmacion_llamada.
--
-- NO se tocan el CHECK de `estado` ni el enum `solicitud_eventos.tipo`: la 2ª
-- línea reusa las transiciones existentes, no agrega estados nuevos.
--
-- IDEMPOTENTE: usa IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────
-- 1. Tabla llamadas
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  proposito text NOT NULL,               -- 'agendar' | 'cierre' | 'cotizacion' | 'repuesto' | 'presencia'
  proveedor text NOT NULL DEFAULT 'dapta',
  dapta_call_id text,                    -- id de la llamada en Dapta; NULL hasta que el POST de disparo responde
  estado_llamada text NOT NULL DEFAULT 'iniciando',
  intento int NOT NULL DEFAULT 1,
  resultado jsonb,                       -- payload estructurado del webhook (variable_snapshots / custom_analysis_data)
  transcript text,                       -- transcripción de la llamada (si Dapta la provee)
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT llamadas_proposito_chk
    CHECK (proposito IN ('agendar', 'cierre', 'cotizacion', 'repuesto', 'presencia')),
  CONSTRAINT llamadas_estado_chk
    CHECK (estado_llamada IN ('iniciando', 'en_curso', 'sin_respuesta', 'procesando', 'procesado', 'error'))
);

COMMENT ON TABLE llamadas IS
  'Una fila por intento de llamada de la 2ª línea de voz (Dapta). Auditoría + idempotencia del webhook por dapta_call_id. Ver docs/DAPTA.md.';
COMMENT ON COLUMN llamadas.proposito IS
  'agendar (pendiente_horario), cierre (en_verificacion), cotizacion (cotizacion_enviada), repuesto (repuesto_recibido), presencia (T-24h/T-2h).';
COMMENT ON COLUMN llamadas.dapta_call_id IS
  'Identificador de la llamada en Dapta. NULL hasta que el POST de disparo a la Public Route URL responde. UNIQUE parcial → garantiza idempotencia del webhook.';
COMMENT ON COLUMN llamadas.estado_llamada IS
  'iniciando → en_curso → (sin_respuesta | procesando → procesado) | error. El webhook avanza a procesando/procesado de forma atómica.';
COMMENT ON COLUMN llamadas.resultado IS
  'Resultado estructurado que Dapta devuelve al colgar (variable_snapshots / custom_analysis_data). PII potencial — ver docs/SEGURIDAD.md.';

-- Idempotencia del webhook: un dapta_call_id no puede procesarse dos veces.
-- Parcial (WHERE NOT NULL) porque las filas recién insertadas aún no tienen id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_llamadas_dapta_call_id
  ON llamadas(dapta_call_id)
  WHERE dapta_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llamadas_solicitud
  ON llamadas(solicitud_id);

CREATE INDEX IF NOT EXISTS idx_llamadas_estado
  ON llamadas(estado_llamada);

-- ─────────────────────────────────────────────────────────────────
-- 2. RLS — patrón `supervisores` (entidad server-side vía anon key).
--    La app solo usa la anon key (no hay service_role configurado): el cron,
--    dapta.service y el webhook leen/escriben con anon. La autorización real
--    de los endpoints admin la impone verificarAdmin. El webhook se protege
--    con verificación de firma (DAPTA_WEBHOOK_SECRET), no con RLS.
--    NOTA PII: `transcript`/`resultado` pueden contener datos del cliente;
--    endurecer RLS es parte del backlog de docs/SEGURIDAD.md.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE llamadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llamadas_anon_select ON llamadas;
CREATE POLICY llamadas_anon_select ON llamadas
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS llamadas_anon_insert ON llamadas;
CREATE POLICY llamadas_anon_insert ON llamadas
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS llamadas_anon_update ON llamadas;
CREATE POLICY llamadas_anon_update ON llamadas
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS llamadas_anon_delete ON llamadas;
CREATE POLICY llamadas_anon_delete ON llamadas
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS llamadas_service_role_all ON llamadas;
CREATE POLICY llamadas_service_role_all ON llamadas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. Columnas de control de la 2ª línea en solicitudes_servicio
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS llamada_intentos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_llamada_at timestamptz,
  ADD COLUMN IF NOT EXISTS requiere_confirmacion_llamada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN solicitudes_servicio.llamada_intentos IS
  'Nº de llamadas de la 2ª línea (Dapta) disparadas para esta solicitud. Tope: DAPTA_MAX_INTENTOS.';
COMMENT ON COLUMN solicitudes_servicio.ultima_llamada_at IS
  'Marca de tiempo del último disparo de llamada. Cerrojo de cooldown atómico anti-doble-disparo (UPDATE condicional en dapta.service.iniciarLlamada).';
COMMENT ON COLUMN solicitudes_servicio.requiere_confirmacion_llamada IS
  'Flag de seguimiento para verificación de presencia (T-24h/T-2h) cuando el cliente no confirma por WhatsApp. Fase 3.';

-- Selección de candidatos por el cron (solicitudes con pocos intentos / silenciosas)
CREATE INDEX IF NOT EXISTS idx_solicitudes_ultima_llamada
  ON solicitudes_servicio(ultima_llamada_at);

-- ─────────────────────────────────────────────────────────────────
-- 4. Refrescar PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
