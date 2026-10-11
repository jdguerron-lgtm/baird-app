-- 2026-10-11 — Resumen de recaudo online en solicitudes_servicio
--
-- Contexto: la tabla `pagos` está cerrada al anon/authenticated (solo
-- service_role), así que las páginas client-side (admin, portal del técnico)
-- solo veían `anticipo_pagado_at` / `saldo_pagado_at`: no sabían si el cliente
-- ya pagó el ABONO de repuestos ni cuánto lleva pagado. El label de "etapa de
-- pago" (src/lib/constants/pago-cliente.ts → etapaPagoCliente) necesita esos
-- datos en la fila de la solicitud.
--
-- Columnas (las mantiene SOLO pagos.service → registrarPagoWompi /
-- actualizarResumenPago, recalculando desde `pagos` — nunca a mano):
--   abono_pagado_at      primer abono de repuestos APPROVED (análogo a
--                        anticipo_pagado_at; guard de "notificar una vez").
--   monto_pagado_online  suma de pagos APPROVED (anticipo + abono + saldo).
--   ultimo_pago_at       pagado_at más reciente — para "pago recibido hace X".
--
-- Aditiva e idempotente. Rollback:
--   ALTER TABLE solicitudes_servicio
--     DROP COLUMN abono_pagado_at, DROP COLUMN monto_pagado_online, DROP COLUMN ultimo_pago_at;

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS abono_pagado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monto_pagado_online INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_pago_at TIMESTAMPTZ;

-- Backfill desde el ledger de pagos (solo APPROVED).
WITH resumen AS (
  SELECT
    solicitud_id,
    SUM(monto)::INTEGER                                   AS total,
    MAX(pagado_at)                                        AS ultimo,
    MIN(pagado_at) FILTER (WHERE tipo = 'abono')          AS primer_abono
  FROM pagos
  WHERE estado = 'APPROVED'
  GROUP BY solicitud_id
)
UPDATE solicitudes_servicio s
SET monto_pagado_online = r.total,
    ultimo_pago_at      = r.ultimo,
    abono_pagado_at     = COALESCE(s.abono_pagado_at, r.primer_abono)
FROM resumen r
WHERE r.solicitud_id = s.id;

NOTIFY pgrst, 'reload schema';

-- Verificación:
-- SELECT id, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online, ultimo_pago_at
--   FROM solicitudes_servicio WHERE monto_pagado_online > 0;
