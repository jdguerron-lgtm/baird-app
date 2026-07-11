-- Código de acceso OTP para el portal de supervisores
--
-- Doc canónico: docs/SEGURIDAD.md § Portal de supervisores.
-- Date: 2026-07-09
--
-- Contexto: el portal /supervisor/{portal_token} (migración 20260706) se accede
-- por link mágico enviado desde el admin. Este cambio agrega una ENTRADA DE
-- AUTOSERVICIO en /supervisor: el supervisor ingresa su número de WhatsApp, el
-- sistema verifica que exista un supervisor ACTIVO con ese número y le envía un
-- código de 6 dígitos por WhatsApp (plantilla supervisor_codigo_v1, categoría
-- AUTHENTICATION). Al verificar el código, el server le entrega su link
-- /supervisor/{portal_token} — el portal_token sigue siendo la credencial.
--
-- Seguridad del OTP:
--   - Solo se guarda el HASH sha256(`${supervisor_id}:${codigo}`), nunca el
--     código en claro (el anon key puede leer la tabla — RLS con policies
--     laxas — así que un código en claro sería filtrable).
--   - Expira a los 10 minutos (codigo_acceso_expira_at).
--   - Máximo 5 intentos de verificación (codigo_acceso_intentos); al agotarse
--     el código se invalida y hay que pedir uno nuevo.
--   - Cooldown de reenvío de 60s (codigo_acceso_enviado_at) + rate limit por
--     IP en middleware (/api/supervisor/enviar-codigo, /api/supervisor/verificar-codigo).
--
-- IDEMPOTENTE: IF NOT EXISTS.

ALTER TABLE supervisores
  ADD COLUMN IF NOT EXISTS codigo_acceso_hash text,
  ADD COLUMN IF NOT EXISTS codigo_acceso_expira_at timestamptz,
  ADD COLUMN IF NOT EXISTS codigo_acceso_intentos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_acceso_enviado_at timestamptz;

COMMENT ON COLUMN supervisores.codigo_acceso_hash IS
  'sha256(supervisor_id + ":" + codigo) del OTP vigente para entrar por /supervisor. NULL = sin código pendiente. Nunca guardar el código en claro.';
COMMENT ON COLUMN supervisores.codigo_acceso_expira_at IS
  'Expiración del OTP (10 min desde el envío). Pasada esta hora el código es inválido.';
COMMENT ON COLUMN supervisores.codigo_acceso_intentos IS
  'Intentos fallidos de verificación del OTP vigente. Al llegar a 5 el código se invalida.';
COMMENT ON COLUMN supervisores.codigo_acceso_enviado_at IS
  'Último envío del OTP por WhatsApp. Cooldown de reenvío de 60s.';

-- Refrescar PostgREST schema cache
NOTIFY pgrst, 'reload schema';
