-- Tracking de errores de conexión/red reportados por los clientes browser.
-- Permite detectar patrones de timeouts, regiones afectadas, tipos de red
-- (4G vs WiFi), y URLs problemáticas. Se llena vía POST /api/log-error
-- desde el cliente cuando una página falla todos sus retries o cuando
-- el handler de retry detecta un fallo individual.
--
-- Append-only — nunca se borra desde la app. Para limpieza, agregar cron:
--   DELETE FROM connection_errors WHERE created_at < now() - INTERVAL '90 days';

CREATE TABLE IF NOT EXISTS connection_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Qué falló
  url text NOT NULL,
  error_type text NOT NULL CHECK (error_type IN (
    'query_retry',      -- una query individual reintentó (puede haber tenido éxito luego)
    'query_failed',     -- todos los reintentos agotados, usuario ve error
    'page_load_error',  -- la página falló al cargar y mostró pantalla de error
    'fetch_failed',     -- error de fetch genérico desde el cliente
    'unknown'
  )),
  error_message text,
  attempt_number int,   -- número de intento que falló (1, 2, 3) — null si N/A

  -- Contexto del cliente
  user_agent text,

  -- Network Information API (lo que el browser reporta sobre su red)
  network_effective_type text,  -- '2g', '3g', '4g', 'slow-2g'
  network_downlink numeric,     -- Mbps estimado
  network_rtt int,              -- round-trip time estimado (ms)
  online boolean,               -- navigator.onLine al momento del error

  -- Contexto de negocio
  actor text CHECK (actor IN ('tecnico', 'cliente', 'admin', 'desconocido')),
  ip text                       -- IP del cliente (cabecera x-forwarded-for, truncada)
);

-- Índices para queries del admin (filtros típicos)
CREATE INDEX IF NOT EXISTS idx_connection_errors_created_at
  ON connection_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_errors_url
  ON connection_errors(url);
CREATE INDEX IF NOT EXISTS idx_connection_errors_actor_created
  ON connection_errors(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_errors_error_type
  ON connection_errors(error_type);

-- RLS: misma postura que gps_pings y solicitud_eventos (append-only telemetría)
ALTER TABLE connection_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_insert_errors" ON connection_errors;
CREATE POLICY "anyone_can_insert_errors" ON connection_errors
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anyone_can_read_errors" ON connection_errors;
CREATE POLICY "anyone_can_read_errors" ON connection_errors
  FOR SELECT TO anon, authenticated USING (true);

-- Refrescar el cache de schema de PostgREST para que la tabla esté disponible
-- sin esperar el reload automático
NOTIFY pgrst, 'reload schema';
