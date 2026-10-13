-- ============================================================================
-- Receptor del servicio (2026-10-13)
--
-- Persona distinta del titular que recibe al técnico en el domicilio y que,
-- tras aceptar los T&C y la política de privacidad desde su WhatsApp, sigue
-- el flujo EN PARALELO con el titular (recibe los mismos avisos post-
-- diagnóstico, puede aprobar pasos/cotización y pagar).
--
-- El técnico la registra al COMENZAR el diagnóstico (o al completar un
-- servicio de tarifa fija que no pasa por diagnóstico) desde su portal.
--
-- 100 % ADITIVA: columnas nullable + trigger nuevo. Con receptor NULL el
-- sistema se comporta exactamente igual que antes.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS normalizar_telefono_receptor ON solicitudes_servicio;
--   DROP FUNCTION IF EXISTS trigger_normalizar_telefono_receptor();
--   ALTER TABLE solicitudes_servicio
--     DROP COLUMN IF EXISTS receptor_nombre,
--     DROP COLUMN IF EXISTS receptor_telefono,
--     DROP COLUMN IF EXISTS receptor_relacion,
--     DROP COLUMN IF EXISTS receptor_token,
--     DROP COLUMN IF EXISTS receptor_registrado_at,
--     DROP COLUMN IF EXISTS receptor_acepto_at,
--     DROP COLUMN IF EXISTS receptor_tyc_version;
-- ============================================================================

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS receptor_nombre        text,
  ADD COLUMN IF NOT EXISTS receptor_telefono      text,
  ADD COLUMN IF NOT EXISTS receptor_relacion      text,
  -- Token del link de aceptación (/receptor/{token}). Se genera al registrar.
  ADD COLUMN IF NOT EXISTS receptor_token         uuid,
  ADD COLUMN IF NOT EXISTS receptor_registrado_at timestamptz,
  -- NULL hasta que el receptor acepte desde /receptor/{token}. Solo con
  -- valor se le espejan los WhatsApp del titular (consentimiento Ley 1581).
  ADD COLUMN IF NOT EXISTS receptor_acepto_at     timestamptz,
  ADD COLUMN IF NOT EXISTS receptor_tyc_version   text;

-- Relación con el titular: lista cerrada (misma que RELACIONES_RECEPTOR en
-- src/lib/utils/receptor.ts — mantener en sync).
ALTER TABLE public.solicitudes_servicio
  DROP CONSTRAINT IF EXISTS solicitudes_servicio_receptor_relacion_check;
ALTER TABLE public.solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_receptor_relacion_check
  CHECK (receptor_relacion IS NULL OR receptor_relacion IN (
    'familiar',
    'empleado_hogar',
    'administracion',
    'arrendatario',
    'otro'
  ));

COMMENT ON COLUMN public.solicitudes_servicio.receptor_nombre IS
  'Persona que recibe al técnico cuando no es el titular (registrada por el técnico al iniciar el diagnóstico).';
COMMENT ON COLUMN public.solicitudes_servicio.receptor_telefono IS
  'WhatsApp del receptor, dígitos con 57 (trigger normalizar_telefono_receptor). Nunca igual a cliente_telefono.';
COMMENT ON COLUMN public.solicitudes_servicio.receptor_acepto_at IS
  'Momento en que el receptor aceptó T&C + privacidad desde /receptor/{token}. Mientras sea NULL no recibe avisos.';

-- Normalización del teléfono del receptor: MISMA función normalizar_telefono_co()
-- de 20260513_normalizar_telefonos.sql. Trigger propio (no se toca el del
-- titular) para que el cambio sea aditivo.
CREATE OR REPLACE FUNCTION public.trigger_normalizar_telefono_receptor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.receptor_telefono IS NOT NULL THEN
    NEW.receptor_telefono := normalizar_telefono_co(NEW.receptor_telefono);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalizar_telefono_receptor ON public.solicitudes_servicio;
CREATE TRIGGER normalizar_telefono_receptor
  BEFORE INSERT OR UPDATE OF receptor_telefono ON public.solicitudes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_normalizar_telefono_receptor();

-- Lookup por token del link de aceptación.
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_servicio_receptor_token_idx
  ON public.solicitudes_servicio (receptor_token)
  WHERE receptor_token IS NOT NULL;

-- Verificación:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio' AND column_name LIKE 'receptor_%';
--   -- 7 filas
