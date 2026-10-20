-- ============================================================================
-- Códigos de descuento (2026-10-19)
--
-- El cliente PARTICULAR puede escribir un código en /solicitar. El descuento
-- se aplica SOLO en el ÚLTIMO pago (saldo final): el anticipo (50% del precio)
-- y el abono de repuestos (50% del saldo bruto) se cobran como siempre.
-- Reglas de negocio (decididas 2026-10-19):
--   - Porcentaje → sobre el TOTAL del servicio (diagnóstico + servicio +
--     repuestos, IVA incl.); el monto resultante se resta del saldo final.
--   - Valor fijo → se resta del saldo final.
--   - Baird asume el descuento: pago_tecnico / costo_tecnico NO cambian.
--   - Tope: nunca deja el saldo negativo (sin devoluciones).
--   - Garantía: no aplica (paga la marca); si llega un código se ignora.
--
-- En la solicitud se guarda un SNAPSHOT (código, tipo, valor) para que editar
-- o desactivar el código después NO cambie servicios ya reservados.
-- Los "usos" se cuentan desde solicitudes_servicio (sin contador que derive).
--
-- 100 % ADITIVA: tabla nueva + columnas nullable. Sin código el sistema se
-- comporta exactamente igual que antes.
--
-- ⚠️ Aplicar ANTES de desplegar el código: pagos.service.ts (CAMPOS_SOLICITUD_PAGO)
-- selecciona las columnas nuevas por nombre.
--
-- Rollback:
--   ALTER TABLE solicitudes_servicio
--     DROP COLUMN IF EXISTS codigo_descuento_id,
--     DROP COLUMN IF EXISTS descuento_codigo,
--     DROP COLUMN IF EXISTS descuento_tipo,
--     DROP COLUMN IF EXISTS descuento_valor;
--   DROP TABLE IF EXISTS codigos_descuento;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.codigos_descuento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        text NOT NULL UNIQUE
                CHECK (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo          text NOT NULL CHECK (tipo IN ('porcentaje', 'valor')),
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  descripcion   text,
  activo        boolean NOT NULL DEFAULT true,
  vigente_desde timestamptz,
  vigente_hasta timestamptz,
  max_usos      integer CHECK (max_usos IS NULL OR max_usos > 0),
  creado_por    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT codigos_descuento_porcentaje_max CHECK (tipo <> 'porcentaje' OR valor <= 100),
  CONSTRAINT codigos_descuento_vigencia CHECK (
    vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde
  )
);

COMMENT ON TABLE public.codigos_descuento IS
  'Códigos promocionales que el cliente particular escribe en /solicitar. Se aplican en el ÚLTIMO pago (saldo final). Admin: /admin/descuentos.';
COMMENT ON COLUMN public.codigos_descuento.tipo IS
  'porcentaje = % sobre el total del servicio (IVA incl.); valor = COP fijos. Siempre se restan del saldo final.';
COMMENT ON COLUMN public.codigos_descuento.max_usos IS
  'Tope de solicitudes (no canceladas) que pueden usar el código. NULL = ilimitado. Los usos se cuentan en solicitudes_servicio.';

-- RLS: tabla server-only (service_role). El formulario valida vía
-- GET /api/descuentos/validar (server) y el admin vía /api/admin/descuentos.
ALTER TABLE public.codigos_descuento ENABLE ROW LEVEL SECURITY;

-- Snapshot del descuento en la solicitud.
ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS codigo_descuento_id uuid REFERENCES public.codigos_descuento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_codigo text,
  ADD COLUMN IF NOT EXISTS descuento_tipo text CHECK (descuento_tipo IS NULL OR descuento_tipo IN ('porcentaje', 'valor')),
  ADD COLUMN IF NOT EXISTS descuento_valor numeric(12,2) CHECK (descuento_valor IS NULL OR descuento_valor > 0);

COMMENT ON COLUMN public.solicitudes_servicio.descuento_codigo IS
  'Snapshot del código aplicado al reservar (particular). El monto se calcula al cobrar el saldo final: descuentoClienteParaCobro() en src/lib/constants/pago-cliente.ts.';

CREATE INDEX IF NOT EXISTS idx_solicitudes_codigo_descuento
  ON public.solicitudes_servicio (codigo_descuento_id)
  WHERE codigo_descuento_id IS NOT NULL;

-- PostgREST: reconocer la tabla y las columnas de inmediato (evita PGRST204).
NOTIFY pgrst, 'reload schema';
