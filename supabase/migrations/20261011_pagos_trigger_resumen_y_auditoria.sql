-- 2026-10-11 — Ledger de pagos: resumen por trigger, CHECKs y auditoría
--
-- Plan: docs/mejoras-futuras/pagos-aislamiento/README.md §§ 3–4.
--
-- 1. Trigger en `pagos` que recalcula `solicitudes_servicio.monto_pagado_online`
--    y `ultimo_pago_at` desde el ledger. Así el resumen es correcto sin
--    importar QUIÉN insertó (webhook, redirect, cron, botón admin, SQL manual).
--    NO toca `anticipo_pagado_at` / `abono_pagado_at` / `saldo_pagado_at`: esas
--    columnas son el guard de "avisar una sola vez" de pagos.service
--    (`UPDATE … IS NULL`); si la BD las llenara, la app creería que ya
--    notificó y nadie recibiría el WhatsApp.
--    `actualizarResumenPago()` en la app hace lo mismo y se deja como está
--    (idempotente; quitarla sería un cambio de código innecesario).
-- 2. CHECKs del ledger: `transaccion_id NOT NULL` (la idempotencia depende del
--    índice único parcial sobre esa columna), `tipo` en el catálogo y formato
--    de `referencia` como NOT VALID (las 2 filas históricas registradas a mano
--    desde la tienda Shopify llevan referencia de Conexa; las nuevas deben ser
--    `{tipo}-{uuid}`).
-- 3. `auditar_pagos()`: cruza ledger ↔ resumen/guards y deja un evento
--    `pago_registrado` ⚠️ (requiere_intervencion_admin) por cada solicitud
--    incoherente, sin repetir el mismo aviso en 24 h. Pensada para pg_cron
--    diario; también se puede llamar a mano: `select * from auditar_pagos();`
--
-- Aditiva e idempotente. Rollback:
--   DROP TRIGGER IF EXISTS pagos_resumen_aiud ON pagos;
--   DROP FUNCTION IF EXISTS trg_pagos_resumen();
--   DROP FUNCTION IF EXISTS recalcular_resumen_pago(uuid);
--   DROP FUNCTION IF EXISTS auditar_pagos();
--   ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_tipo_check,
--                     DROP CONSTRAINT IF EXISTS pagos_referencia_formato_check,
--                     ALTER COLUMN transaccion_id DROP NOT NULL;

-- ── 1. Resumen por trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_resumen_pago(p_solicitud uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE solicitudes_servicio s SET
    monto_pagado_online = COALESCE((
      SELECT SUM(monto)::integer FROM pagos
      WHERE solicitud_id = p_solicitud AND estado = 'APPROVED'), 0),
    ultimo_pago_at = (
      SELECT MAX(pagado_at) FROM pagos
      WHERE solicitud_id = p_solicitud AND estado = 'APPROVED')
  WHERE s.id = p_solicitud;
$$;

CREATE OR REPLACE FUNCTION public.trg_pagos_resumen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalcular_resumen_pago(COALESCE(NEW.solicitud_id, OLD.solicitud_id));
  IF TG_OP = 'UPDATE' AND NEW.solicitud_id IS DISTINCT FROM OLD.solicitud_id THEN
    PERFORM recalcular_resumen_pago(OLD.solicitud_id);
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS pagos_resumen_aiud ON public.pagos;
CREATE TRIGGER pagos_resumen_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pagos_resumen();

-- ── 2. CHECKs del ledger ───────────────────────────────────────────────
ALTER TABLE public.pagos ALTER COLUMN transaccion_id SET NOT NULL;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_tipo_check;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_tipo_check
  CHECK (tipo IN ('anticipo', 'abono', 'saldo'));

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_referencia_formato_check;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_referencia_formato_check
  CHECK (referencia ~ '^(anticipo|abono|saldo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  NOT VALID;

-- ── 3. Auditoría ledger ↔ solicitud ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auditar_pagos()
RETURNS TABLE (solicitud_id uuid, problema text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ledger AS (
    SELECT p.solicitud_id AS sid,
           SUM(p.monto)::integer AS suma,
           bool_or(p.tipo = 'anticipo') AS tiene_anticipo,
           bool_or(p.tipo = 'abono')    AS tiene_abono,
           bool_or(p.tipo = 'saldo')    AS tiene_saldo
    FROM pagos p WHERE p.estado = 'APPROVED'
    GROUP BY p.solicitud_id
  ),
  cruce AS (
    SELECT s.id,
      CASE
        WHEN s.monto_pagado_online <> COALESCE(l.suma, 0)
          THEN format('monto_pagado_online=%s pero el ledger suma %s', s.monto_pagado_online, COALESCE(l.suma, 0))
        WHEN (s.anticipo_pagado_at IS NULL) AND COALESCE(l.tiene_anticipo, false)
          THEN 'hay anticipo APPROVED en pagos pero anticipo_pagado_at está vacío (¿no se avisó al cliente?)'
        WHEN (s.anticipo_pagado_at IS NOT NULL) AND NOT COALESCE(l.tiene_anticipo, false)
          THEN 'anticipo_pagado_at marcado sin fila APPROVED de anticipo en pagos'
        WHEN (s.abono_pagado_at IS NULL) AND COALESCE(l.tiene_abono, false)
          THEN 'hay abono APPROVED en pagos pero abono_pagado_at está vacío'
        WHEN (s.abono_pagado_at IS NOT NULL) AND NOT COALESCE(l.tiene_abono, false)
          THEN 'abono_pagado_at marcado sin fila APPROVED de abono en pagos'
        WHEN (s.saldo_pagado_at IS NULL) AND COALESCE(l.tiene_saldo, false)
          THEN 'hay saldo APPROVED en pagos pero saldo_pagado_at está vacío'
        WHEN (s.saldo_pagado_at IS NOT NULL) AND NOT COALESCE(l.tiene_saldo, false)
          THEN 'saldo_pagado_at marcado sin fila APPROVED de saldo en pagos'
      END AS problema,
      s.estado
    FROM solicitudes_servicio s
    LEFT JOIN ledger l ON l.sid = s.id
    WHERE s.monto_pagado_online > 0 OR l.sid IS NOT NULL
       OR s.anticipo_pagado_at IS NOT NULL OR s.abono_pagado_at IS NOT NULL OR s.saldo_pagado_at IS NOT NULL
  ),
  incoherentes AS (
    SELECT c.id, c.problema, c.estado FROM cruce c WHERE c.problema IS NOT NULL
  ),
  avisadas AS (
    INSERT INTO solicitud_eventos (solicitud_id, tipo, estado_previo, estado_nuevo, actor, motivo, payload)
    SELECT i.id, 'pago_registrado', i.estado, i.estado, 'sistema',
           '⚠️ Auditoría de pagos: ' || i.problema || ' — revisar manualmente',
           jsonb_build_object('auditoria', true, 'requiere_intervencion_admin', true, 'pasarela', 'wompi')
    FROM incoherentes i
    WHERE NOT EXISTS (
      SELECT 1 FROM solicitud_eventos e
      WHERE e.solicitud_id = i.id AND e.tipo = 'pago_registrado'
        AND (e.payload->>'auditoria') = 'true'
        AND e.ocurrido_at > now() - interval '24 hours'
    )
    RETURNING solicitud_eventos.solicitud_id
  )
  SELECT i.id, i.problema FROM incoherentes i;
END
$$;

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT * FROM auditar_pagos();                -- 0 filas = coherente
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'pagos'::regclass AND NOT tgisinternal;
