-- ─────────────────────────────────────────────────────────────────
-- Cobro del SALDO por Wompi (2026-08-19)
-- ─────────────────────────────────────────────────────────────────
-- Completa el ciclo de recaudo online iniciado en 20260818_wompi_pagos.sql:
-- tras aprobar la cotización, el cliente recibe el link /pago/saldo/{token}
-- (plantilla pago_saldo_cliente_v1) con el saldo = total cotizado − anticipos
-- APPROVED acreditados. El pago en sitio (QR Bre-B) sigue disponible como
-- alternativa — este cobro NO bloquea ninguna transición de estado.
--
-- saldo_pagado_at espejo de anticipo_pagado_at: NULL = pendiente. Lo marca
-- registrarPagoWompi (pagos.service) al aprobar una transacción `saldo-…`,
-- con guard IS NULL para notificar una sola vez.

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS saldo_pagado_at TIMESTAMPTZ;

COMMENT ON COLUMN solicitudes_servicio.saldo_pagado_at IS
  'Momento en que se aprobó el pago del SALDO vía Wompi. NULL = pendiente (o pagado en sitio).';

-- Verificación:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='solicitudes_servicio' AND column_name='saldo_pagado_at';  → 1 fila
