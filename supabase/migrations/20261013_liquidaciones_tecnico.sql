-- ============================================================
-- 20261013_liquidaciones_tecnico.sql
-- ------------------------------------------------------------
-- Liquidación de pagos a técnicos (cuentas por pagar de Baird).
--
-- Hasta hoy la plataforma solo exportaba a Excel cuánto se le debe a
-- cada técnico (/admin/liquidaciones) sin registrar QUÉ servicios ya
-- se pagaron. Este par de tablas lo persiste:
--
--   liquidaciones_tecnico        cabecera: técnico, total, estado
--                                (pendiente → pagada | anulada), referencia
--                                del giro, quién la creó / pagó.
--   liquidaciones_tecnico_items  un renglón por servicio completado que
--                                entra en la liquidación, con el monto
--                                consolidado al momento de liquidar
--                                (snapshot: si después cambia la tarifa,
--                                lo pagado queda documentado).
--
-- Un servicio solo puede estar en UNA liquidación viva (índice único por
-- solicitud_id). Al anular una liquidación se borran sus items (quedan
-- listados en `anulada_detalle`) y los servicios vuelven a "por pagar".
--
-- Solo la toca el server con service_role (/api/admin/liquidaciones-tecnicos,
-- liquidacion-tecnicos.service). Nace con RLS habilitado y SIN policies
-- anon, igual que `pagos` / `agenda_tecnico_bloqueos`.
--
-- Aditiva e idempotente. Rollback:
--   drop table if exists public.liquidaciones_tecnico_items;
--   drop table if exists public.liquidaciones_tecnico;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.liquidaciones_tecnico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id       UUID NOT NULL REFERENCES public.tecnicos(id) ON DELETE RESTRICT,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  servicios        INTEGER NOT NULL DEFAULT 0 CHECK (servicios >= 0),
  total            INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  nota             TEXT CHECK (nota IS NULL OR char_length(nota) <= 500),
  referencia_pago  TEXT CHECK (referencia_pago IS NULL OR char_length(referencia_pago) <= 120),
  pagada_at        TIMESTAMPTZ,
  anulada_at       TIMESTAMPTZ,
  anulada_detalle  JSONB,
  creada_por       TEXT,
  pagada_por       TEXT,
  anulada_por      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.liquidaciones_tecnico IS
  'Cabecera de cada liquidación (pago) de Baird a un técnico por servicios completados.';
COMMENT ON COLUMN public.liquidaciones_tecnico.estado IS
  'pendiente = creada, por girar · pagada = giro hecho (referencia_pago/pagada_at) · anulada = items liberados.';
COMMENT ON COLUMN public.liquidaciones_tecnico.total IS
  'Suma de liquidaciones_tecnico_items.monto al crear (COP, sin retenciones).';
COMMENT ON COLUMN public.liquidaciones_tecnico.anulada_detalle IS
  'Al anular: { solicitud_ids: [...] } de los items borrados, para trazabilidad.';

CREATE TABLE IF NOT EXISTS public.liquidaciones_tecnico_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id   UUID NOT NULL REFERENCES public.liquidaciones_tecnico(id) ON DELETE CASCADE,
  solicitud_id     UUID NOT NULL REFERENCES public.solicitudes_servicio(id) ON DELETE RESTRICT,
  tecnico_id       UUID NOT NULL REFERENCES public.tecnicos(id) ON DELETE RESTRICT,
  es_garantia      BOOLEAN NOT NULL,
  monto            INTEGER NOT NULL CHECK (monto >= 0),
  fecha_cierre     TIMESTAMPTZ,
  detalle          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.liquidaciones_tecnico_items IS
  'Servicios incluidos en cada liquidación con el pago consolidado al técnico (snapshot).';
COMMENT ON COLUMN public.liquidaciones_tecnico_items.detalle IS
  'Snapshot del cálculo: garantía { complejidad, dias, encuesta, ta, estimado } / particular { origen }.';

-- Un servicio no puede estar en dos liquidaciones vivas (anular borra items).
CREATE UNIQUE INDEX IF NOT EXISTS uq_liquidaciones_tecnico_items_solicitud
  ON public.liquidaciones_tecnico_items (solicitud_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_tecnico_tecnico
  ON public.liquidaciones_tecnico (tecnico_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_tecnico_items_liq
  ON public.liquidaciones_tecnico_items (liquidacion_id);

ALTER TABLE public.liquidaciones_tecnico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_tecnico_items ENABLE ROW LEVEL SECURITY;
-- Sin policies: anon/authenticated no ven ni escriben nada; service_role bypassa.

NOTIFY pgrst, 'reload schema';
