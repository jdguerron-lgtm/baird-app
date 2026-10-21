-- 2026-10-20 — Resumen diario de movimientos a supervisores: bitácora de envíos
--
-- Qué: tabla `supervisor_resumenes`, una fila por supervisor y corte (17:00
-- Colombia) con el canal por el que salió el resumen (texto libre, plantilla
-- de fallback, filtrado por BAIRD_TEST_PHONE_WHITELIST, error o dry-run), los
-- conteos y el texto enviado. La usa GET /api/cron/resumen-movimientos para:
--   1. Idempotencia: si ya hay una fila texto|plantilla para (supervisor,
--      corte), no reenvía (Vercel Cron puede reintentar; `?force=1` la ignora).
--   2. Auditoría: qué recibió cada supervisor y cuándo (no hay solicitud
--      asociada, así que no encaja en solicitud_eventos ni en
--      notificaciones_whatsapp — ambas atadas a una solicitud).
--
-- Si NO se aplica antes del deploy: el cron sigue armando y enviando los
-- resúmenes (la lectura/escritura de esta tabla es best-effort y se loguea),
-- pero pierde la idempotencia entre reintentos del mismo corte.
--
-- RLS habilitada sin policies: solo service_role (patrón de
-- `liquidaciones_tecnico`, `agenda_tecnico_bloqueos`). Aditiva e idempotente.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.supervisor_resumenes;

CREATE TABLE IF NOT EXISTS public.supervisor_resumenes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id  uuid        NOT NULL REFERENCES public.supervisores(id) ON DELETE CASCADE,
  corte_at       timestamptz NOT NULL,                 -- fin de la ventana (17:00 CO)
  desde_at       timestamptz NOT NULL,                 -- inicio de la ventana (corte anterior)
  movimientos    integer     NOT NULL DEFAULT 0,
  servicios      integer     NOT NULL DEFAULT 0,
  canal          text        NOT NULL,
  partes         integer     NOT NULL DEFAULT 1,       -- mensajes de texto en que se partió
  error          text,
  texto          text,
  enviado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisor_resumenes_canal_chk
    CHECK (canal IN ('texto', 'plantilla', 'filtrado', 'error', 'dry'))
);

COMMENT ON TABLE public.supervisor_resumenes IS
  'Bitácora del resumen diario de movimientos enviado a cada supervisor (GET /api/cron/resumen-movimientos, 17:00 CO). canal: texto = texto libre WhatsApp; plantilla = fallback supervisor_resumen_diario_v1 (ventana 24h cerrada); filtrado = BAIRD_TEST_PHONE_WHITELIST; error = ningún canal llegó; dry = corrida sin envío.';

CREATE INDEX IF NOT EXISTS idx_supervisor_resumenes_sup_corte
  ON public.supervisor_resumenes (supervisor_id, corte_at DESC);

ALTER TABLE public.supervisor_resumenes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.supervisor_resumenes'::regclass;  -- true
--   SELECT supervisor_id, corte_at, canal, movimientos, servicios, partes, error
--   FROM supervisor_resumenes ORDER BY enviado_at DESC LIMIT 10;
