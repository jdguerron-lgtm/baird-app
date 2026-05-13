-- ============================================================================
-- Normalización defensiva de teléfonos
-- ============================================================================
--
-- Problema: tecnicos.whatsapp y solicitudes_servicio.cliente_telefono pueden
-- venir con formatos inconsistentes:
--   - Con "+57" prefijado: "+573134951164"
--   - Con espacios: "+57 313 495 1164"
--   - Con guiones: "313-495-1164"
--   - Con formato pipe legacy: "57|3134951164"
--   - Sin código país: "3134951164"
--   - Mezclado: "+57|3134951164" (poco probable pero posible)
--
-- Aunque phoneToDigits() en código TS sanitiza al enviar, los datos quedan
-- inconsistentes y son frágiles a edge cases del SDK Meta o futuros cambios.
--
-- Solución (defense in depth):
--  1. Función PostgreSQL normalizar_telefono_co() que limpia el valor a
--     dígitos puros con prefijo 57 garantizado.
--  2. Trigger BEFORE INSERT OR UPDATE en ambas columnas — toda escritura
--     futura se normaliza automáticamente.
--  3. UPDATE one-shot que normaliza los datos existentes.
--
-- Idempotente: se puede correr varias veces sin efecto adicional.
-- ============================================================================

-- ─── 1. Función de normalización ───
CREATE OR REPLACE FUNCTION normalizar_telefono_co(valor text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digitos text;
BEGIN
  -- Si es NULL o vacío, retorna NULL (no fuerces un teléfono)
  IF valor IS NULL OR length(trim(valor)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Strip todo lo que no es dígito (elimina +, espacios, guiones, paréntesis, pipe)
  digitos := regexp_replace(valor, '[^0-9]', '', 'g');

  -- Si quedaron 0 dígitos, devolvemos NULL (no había nada que normalizar)
  IF length(digitos) = 0 THEN
    RETURN NULL;
  END IF;

  -- Ya tiene código país 57 + 10 dígitos móvil = 12 dígitos
  IF length(digitos) = 12 AND substring(digitos, 1, 2) = '57' THEN
    RETURN digitos;
  END IF;

  -- 10 dígitos empezando con 3 (móvil colombiano sin código país) → prepend 57
  IF length(digitos) = 10 AND substring(digitos, 1, 1) = '3' THEN
    RETURN '57' || digitos;
  END IF;

  -- Cualquier otro caso (extranjero, fijos, números cortos): retornar
  -- los dígitos tal cual quedaron. NO forzamos prefijo 57 ciegamente
  -- porque podría romper números válidos de otros países (US: 1XXX...,
  -- MX: 52XXX...). El código TS sigue siendo la primera línea de defensa
  -- con isValidPhone.
  RETURN digitos;
END;
$$;

COMMENT ON FUNCTION normalizar_telefono_co(text) IS
  'Normaliza teléfonos a dígitos puros con prefijo 57 garantizado para móviles colombianos. Strip de +, espacios, guiones, pipe. Otros países pasan tal cual.';

-- ─── 2. Triggers de auto-normalización ───

-- Trigger para tecnicos.whatsapp
CREATE OR REPLACE FUNCTION trigger_normalizar_whatsapp_tecnico()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.whatsapp := normalizar_telefono_co(NEW.whatsapp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalizar_whatsapp_tecnico ON tecnicos;
CREATE TRIGGER normalizar_whatsapp_tecnico
  BEFORE INSERT OR UPDATE OF whatsapp ON tecnicos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalizar_whatsapp_tecnico();

-- Trigger para solicitudes_servicio.cliente_telefono
CREATE OR REPLACE FUNCTION trigger_normalizar_telefono_cliente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cliente_telefono := normalizar_telefono_co(NEW.cliente_telefono);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalizar_telefono_cliente ON solicitudes_servicio;
CREATE TRIGGER normalizar_telefono_cliente
  BEFORE INSERT OR UPDATE OF cliente_telefono ON solicitudes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalizar_telefono_cliente();

-- ─── 3. Backfill: normalizar datos existentes ───

-- tecnicos.whatsapp: aplica la función a todas las filas
UPDATE tecnicos
SET whatsapp = normalizar_telefono_co(whatsapp)
WHERE whatsapp IS NOT NULL
  AND whatsapp <> normalizar_telefono_co(whatsapp);

-- solicitudes_servicio.cliente_telefono: idem
UPDATE solicitudes_servicio
SET cliente_telefono = normalizar_telefono_co(cliente_telefono)
WHERE cliente_telefono IS NOT NULL
  AND cliente_telefono <> normalizar_telefono_co(cliente_telefono);

-- ─── 4. Verificación post-migración ───
--
-- Después de aplicar, correr estas queries en el SQL editor para auditar:
--
--   SELECT id, nombre_completo, whatsapp
--   FROM tecnicos
--   WHERE whatsapp IS NOT NULL
--     AND (whatsapp !~ '^57[0-9]{10}$' AND length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) >= 10);
--   -- Debería devolver 0 filas. Si hay alguna, son números no-colombianos válidos.
--
--   SELECT count(*), substring(whatsapp, 1, 2) AS prefijo
--   FROM tecnicos
--   WHERE whatsapp IS NOT NULL
--   GROUP BY prefijo;
--   -- Debería mostrar 57 dominante. Otros prefijos = números extranjeros.
--
--   SELECT count(*), substring(cliente_telefono, 1, 2) AS prefijo
--   FROM solicitudes_servicio
--   WHERE cliente_telefono IS NOT NULL
--   GROUP BY prefijo;

-- ─── 5. Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';
