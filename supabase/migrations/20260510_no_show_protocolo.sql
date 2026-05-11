-- Protocolo de no-show + columnas para tarifas MABE v2
--
-- Doc canónico: docs/TARIFAS.md + docs/PROTOCOLO-VISITA.md.
-- Date: 2026-05-10
--
-- Cambios:
--   1. Estado terminal `no_show_cliente` agregado al CHECK constraint.
--   2. Columnas en `evidencias_servicio`: evidencia_no_show JSONB.
--   3. Columnas en `solicitudes_servicio` para auditoría del cálculo de tarifa
--      MABE: cumple_ta, cumple_encuesta, dias_solucion_efectivos,
--      pago_tecnico_total, margen_baird, recargo_weekend_aplicado.
--   4. Tabla nueva `cliente_historial` para tracking de no-shows recurrentes.
--
-- IDEMPOTENTE: usa IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.

-- ─────────────────────────────────────────────────────────────────
-- 1. Estado no_show_cliente en CHECK constraint
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
-- 2. evidencias_servicio.evidencia_no_show
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE evidencias_servicio
  ADD COLUMN IF NOT EXISTS evidencia_no_show jsonb;

COMMENT ON COLUMN evidencias_servicio.evidencia_no_show IS
  'JSONB con: selfie_url, inmueble_url, timbrazos[], llamadas[], wa_intentos[], pings_no_show[], notas_tecnico, marcado_at. Persistido cuando el técnico cierra el servicio como no_show_cliente.';

-- ─────────────────────────────────────────────────────────────────
-- 3. Columnas de auditoría en solicitudes_servicio
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS cumple_ta boolean,
  ADD COLUMN IF NOT EXISTS cumple_encuesta boolean,
  ADD COLUMN IF NOT EXISTS dias_solucion_efectivos numeric(5,2),
  ADD COLUMN IF NOT EXISTS pago_tecnico_total integer,
  ADD COLUMN IF NOT EXISTS margen_baird integer,
  ADD COLUMN IF NOT EXISTS recargo_weekend_aplicado integer;

COMMENT ON COLUMN solicitudes_servicio.cumple_ta IS
  'true si diagnosticado_at − horario_confirmado_at ≤ 24h. Computado al diagnosticar.';
COMMENT ON COLUMN solicitudes_servicio.cumple_encuesta IS
  'true si el cliente contestó la encuesta de satisfacción tras el cierre. NULL hasta que se cierre el servicio.';
COMMENT ON COLUMN solicitudes_servicio.dias_solucion_efectivos IS
  'Días entre creación y completada, descontando esperando_repuesto. Decimal porque la tabla MABE usa rangos 0–1 / 1.1–2 / 2.1–3.';
COMMENT ON COLUMN solicitudes_servicio.pago_tecnico_total IS
  'Pago final al técnico en COP, computado al cerrar (78% base + 100% bono + 100% weekend para garantía; costo_tecnico para particular).';
COMMENT ON COLUMN solicitudes_servicio.margen_baird IS
  'Margen Baird en COP, computado (22% base MABE; 10% sobre subtotal_con_iva en particular).';
COMMENT ON COLUMN solicitudes_servicio.recargo_weekend_aplicado IS
  '0 si no aplica; 5000/6000/7000 si horario cae sábado/domingo (Tipo D MABE).';

-- ─────────────────────────────────────────────────────────────────
-- 4. Tabla cliente_historial — tracking de no-shows recurrentes
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cliente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text,
  telefono text,
  nombre_ultimo_visto text,
  no_shows_count integer DEFAULT 0 NOT NULL,
  cancelaciones_tarde_count integer DEFAULT 0 NOT NULL,
  servicios_completados_count integer DEFAULT 0 NOT NULL,
  bloqueado boolean DEFAULT false NOT NULL,
  bloqueado_motivo text,
  bloqueado_at timestamptz,
  requiere_confirmacion_llamada boolean DEFAULT false NOT NULL,
  ultimo_evento_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cliente_historial_lookup_chk
    CHECK (documento IS NOT NULL OR telefono IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cliente_historial_documento
  ON cliente_historial(documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_historial_telefono
  ON cliente_historial(telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_historial_bloqueado
  ON cliente_historial(bloqueado) WHERE bloqueado = true;

COMMENT ON TABLE cliente_historial IS
  'Tracking de comportamiento del cliente: no-shows, cancelaciones tardías, servicios completados. Lookup por documento (preferido) o teléfono (fallback). Ver docs/PROTOCOLO-VISITA.md.';

-- RLS: tabla service-role-only (admin endpoint la mantiene; sin acceso anon)
ALTER TABLE cliente_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cliente_historial_service_role_all ON cliente_historial;
CREATE POLICY cliente_historial_service_role_all
  ON cliente_historial
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. solicitud_eventos: agregar tipos no_show + visita
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE solicitud_eventos
  DROP CONSTRAINT IF EXISTS solicitud_eventos_tipo_check;
ALTER TABLE solicitud_eventos
  ADD CONSTRAINT solicitud_eventos_tipo_check
  CHECK (tipo IN (
    'cancelacion',
    'reagendamiento',
    'reagendamiento_confirmado',
    'cancelacion_revertida',
    'cambio_estado_admin',
    'nota_admin',
    'no_show_cliente',
    'alerta_visita',
    'cliente_bloqueado',
    'cliente_desbloqueado'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 6. Índice para listado admin de no-shows
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_solicitudes_no_show
  ON solicitudes_servicio(created_at DESC)
  WHERE estado = 'no_show_cliente';

-- ─────────────────────────────────────────────────────────────────
-- 7. Refrescar PostgREST schema cache (para que las columnas nuevas
--    se reconozcan sin esperar al refresh automático)
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
