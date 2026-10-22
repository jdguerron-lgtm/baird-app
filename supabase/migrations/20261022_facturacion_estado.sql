-- 2026-10-22 — Seguimiento de facturación (facturada / no facturada) por servicio
--
-- Qué: 5 columnas en `solicitudes_servicio` para saber qué servicio completado
-- ya tiene factura de venta emitida en Siigo (la facturación sigue siendo
-- manual asistida: contabilidad captura la FV a partir del export de
-- /admin/liquidaciones y luego marca el servicio desde la ficha admin).
--
--   facturacion_estado  'pendiente' (default) | 'facturada' | 'no_aplica'
--   factura_numero      número de la FV en Siigo (p. ej. FV-2-1524); obligatorio
--                       cuando facturacion_estado = 'facturada'
--   facturada_at        cuándo se marcó
--   facturada_por       email del admin / rol lectura que la marcó
--   facturacion_nota    nota libre (p. ej. "va en la FV consolidada de MABE")
--
-- Lo escribe SOLO `POST /api/admin/facturacion-estado` (service_role), que
-- también deja el evento `nota_admin` con payload.origen='facturacion_estado'
-- en `solicitud_eventos` (antes/después). Lo leen la ficha y la lista de
-- /admin/solicitudes (chip "🧾 Sin facturar", selector Facturación), el KPI
-- del dashboard y los exports de /api/admin/liquidaciones (columna
-- "Facturación" + fila en "Datos faltantes"). Ver docs/FACTURACION.md
-- § "Seguimiento facturado / no facturado".
--
-- Si NO se aplica antes del deploy: las lecturas client-side (lista, ficha,
-- KPI) fallan al seleccionar la columna (42703) y el endpoint responde 500.
-- Aplicar ANTES de desplegar el código.
--
-- Aditiva e idempotente. Rollback:
--   DROP INDEX IF EXISTS public.idx_solicitudes_facturacion_pendiente;
--   ALTER TABLE public.solicitudes_servicio
--     DROP COLUMN IF EXISTS facturacion_estado,
--     DROP COLUMN IF EXISTS factura_numero,
--     DROP COLUMN IF EXISTS facturada_at,
--     DROP COLUMN IF EXISTS facturada_por,
--     DROP COLUMN IF EXISTS facturacion_nota;

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS facturacion_estado TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS factura_numero     TEXT,
  ADD COLUMN IF NOT EXISTS facturada_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS facturada_por      TEXT,
  ADD COLUMN IF NOT EXISTS facturacion_nota   TEXT;

-- CHECK de lista cerrada (DROP + ADD para que el archivo sea re-ejecutable).
ALTER TABLE public.solicitudes_servicio
  DROP CONSTRAINT IF EXISTS solicitudes_servicio_facturacion_estado_check;
ALTER TABLE public.solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_facturacion_estado_check
  CHECK (facturacion_estado IN ('pendiente', 'facturada', 'no_aplica'));

-- Índice parcial: la consulta operativa es "completadas sin facturar" (chip
-- de la lista, KPI del dashboard y fila de "Datos faltantes" del export).
CREATE INDEX IF NOT EXISTS idx_solicitudes_facturacion_pendiente
  ON public.solicitudes_servicio (estado, facturacion_estado)
  WHERE estado = 'completada' AND facturacion_estado = 'pendiente';

COMMENT ON COLUMN public.solicitudes_servicio.facturacion_estado IS
  'Seguimiento de facturación (2026-10-22): pendiente (default) | facturada | no_aplica. Solo aplica a servicios completada; lo escribe POST /api/admin/facturacion-estado.';
COMMENT ON COLUMN public.solicitudes_servicio.factura_numero IS
  'Número de la factura de venta en Siigo (p. ej. FV-2-1524). Obligatorio cuando facturacion_estado = facturada.';
COMMENT ON COLUMN public.solicitudes_servicio.facturada_por IS
  'Email del usuario del panel (admin o rol lectura/logística) que cambió el estado de facturación por última vez.';

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio' AND column_name LIKE 'factura%';   -- 5 filas
--   SELECT conname FROM pg_constraint WHERE conname = 'solicitudes_servicio_facturacion_estado_check';
--   SELECT indexname FROM pg_indexes WHERE indexname = 'idx_solicitudes_facturacion_pendiente';
--   SELECT count(*) FROM solicitudes_servicio WHERE estado = 'completada' AND facturacion_estado = 'pendiente';
