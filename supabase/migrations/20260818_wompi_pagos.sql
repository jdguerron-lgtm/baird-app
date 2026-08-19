-- ─────────────────────────────────────────────────────────────────
-- Recaudo con Wompi — tabla `pagos` + anticipo en solicitudes (2026-08-18)
-- ─────────────────────────────────────────────────────────────────
-- Cierra el gap #8 de la auditoría 2026-07-05: hasta hoy NO existía registro
-- en BD de qué solicitud quedó pagada (el anticipo se cobraba con un link fijo
-- a la tienda Shopify y la conciliación era manual por nombre/teléfono).
--
-- Wompi (Bancolombia) pasa a ser la pasarela única de la plataforma:
--   - Web Checkout firmado (SHA-256 de referencia+monto+moneda+secreto), con
--     el monto SIEMPRE tomado de la BD server-side.
--   - Confirmación por webhook `transaction.updated` (checksum verificado) y,
--     redundante, por consulta de la transacción en el redirect de vuelta.
--
-- Todo es ADITIVO: ninguna columna existente cambia de tipo ni de semántica.
-- Si esta migración no se aplica, /api/wompi/webhook y la página de pago
-- fallan al registrar (log de error) pero NINGÚN flujo previo se rompe.
--
-- 1. Tabla `pagos` — append-only, una fila por transacción Wompi.
-- 2. `solicitudes_servicio.anticipo_pagado_at` — denormalizado para que la
--    UI (admin/técnico/portal) sepa "ya pagó" sin join.
-- 3. Nuevo tipo 'pago_registrado' en solicitud_eventos (historial consolidado).

-- ── 1. Tabla pagos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id      UUID NOT NULL REFERENCES solicitudes_servicio(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,           -- 'anticipo' | 'saldo'
  estado            TEXT NOT NULL,           -- APPROVED | PENDING | DECLINED | VOIDED | ERROR
  monto             INTEGER NOT NULL,        -- COP (pesos, no centavos)
  moneda            TEXT NOT NULL DEFAULT 'COP',
  pasarela          TEXT NOT NULL DEFAULT 'wompi',
  referencia        TEXT NOT NULL,           -- "{tipo}-{solicitud_id}" — conciliación
  transaccion_id    TEXT,                    -- id de la transacción en Wompi
  metodo            TEXT,                    -- CARD | NEQUI | PSE | BANCOLOMBIA_TRANSFER…
  pagado_at         TIMESTAMPTZ,             -- finalized_at de Wompi (solo si APPROVED)
  raw               JSONB,                   -- payload crudo (auditoría/soporte)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotencia real del webhook: Wompi reintenta hasta 3 veces en 24h y el
-- redirect de vuelta puede confirmar la MISMA transacción en paralelo. El
-- índice único sobre la transacción hace que el segundo intento sea un
-- no-op (ON CONFLICT DO NOTHING) en vez de duplicar el pago.
CREATE UNIQUE INDEX IF NOT EXISTS pagos_transaccion_id_key
  ON pagos(transaccion_id) WHERE transaccion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_solicitud ON pagos(solicitud_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_referencia ON pagos(referencia);

COMMENT ON TABLE pagos IS
  'Append-only. Una fila por transacción de la pasarela (Wompi). Solo escribe el servidor (service_role) desde /api/wompi/webhook y la confirmación del redirect.';
COMMENT ON COLUMN pagos.monto IS 'COP en PESOS (Wompi maneja centavos: amount_in_cents / 100).';
COMMENT ON COLUMN pagos.referencia IS 'Formato "{tipo}-{solicitud_id}" — generado por src/lib/wompi.ts referenciaPago().';

-- RLS: la tabla nace cerrada. Solo service_role escribe/lee (el webhook y las
-- vistas admin corren server-side). Sin policy para anon: el anon key NO puede
-- leer ni escribir pagos, ni siquiera si alguien lo extrae del bundle.
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_pagos ON pagos;
CREATE POLICY service_role_all_pagos ON pagos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Denormalización en solicitudes_servicio ────────────────────
-- anticipo_pagado_at: NULL = sin pagar. Lo setea el registro del pago
-- aprobado del anticipo. Permite pintar "✅ Anticipo pagado" en admin,
-- portal del técnico y portal del cliente sin join contra `pagos`.
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS anticipo_pagado_at TIMESTAMPTZ;

COMMENT ON COLUMN solicitudes_servicio.anticipo_pagado_at IS
  'Momento en que se aprobó el anticipo (pasarela Wompi). NULL = pendiente de pago.';

CREATE INDEX IF NOT EXISTS idx_solicitudes_anticipo_pagado
  ON solicitudes_servicio(anticipo_pagado_at)
  WHERE anticipo_pagado_at IS NOT NULL;

-- ── 3. Evento 'pago_registrado' en el historial ───────────────────
-- OJO (mismo criterio que 20260811_comprobante_envio.sql): varias migraciones
-- recrean este MISMO constraint, así que esta lista debe ser el SUPERSET de
-- todas las anteriores — si no, la que corra de última borra tipos de la otra.
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
    'cliente_desbloqueado',
    'cambio_estado',
    'llamada_admin',
    'llamada_tecnico',
    'recordatorio_horario',
    'mensaje_cliente',
    'comprobante_envio',
    'pago_registrado'
  ));

-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'solicitud_eventos'::regclass AND contype = 'c';
--   → una fila con los 17 tipos.
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio' AND column_name = 'anticipo_pagado_at';
--   → una fila.
--
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'pagos';  → t
