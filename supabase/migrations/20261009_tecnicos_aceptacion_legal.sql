-- ============================================================
-- 20261009_tecnicos_aceptacion_legal.sql
-- ------------------------------------------------------------
-- Prueba de aceptación legal de los técnicos (dictámenes CJI
-- 492185 / 492186 / 458593, jun-2026):
--
--  1. En /registro (electrónico): aceptación de Términos y
--     autorización de tratamiento de datos (Ley 1581 de 2012).
--  2. Contrato de prestación de servicios: se FIRMA EN FÍSICO.
--     El admin marca "contrato firmado" en /admin/tecnicos/[id]
--     al recibir el original; sin esa marca el panel no deja
--     verificar (habilitar) al técnico.
--
-- Técnicos ya verificados quedan con contrato_firmado = false:
-- el listado admin los marca para recoger su firma.
--
-- ⚠️ APLICAR ANTES de desplegar el código.
-- Aditiva e idempotente. Rollback: DROP COLUMN de las 8 columnas.
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS tyc_version               TEXT,
  ADD COLUMN IF NOT EXISTS tyc_aceptados_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS datos_version             TEXT,
  ADD COLUMN IF NOT EXISTS datos_autorizados_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contrato_firmado          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_firmado_version  TEXT,
  ADD COLUMN IF NOT EXISTS contrato_firmado_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contrato_registrado_por   TEXT;

COMMENT ON COLUMN public.tecnicos.tyc_version IS
  'Versión de /terminos aceptada en /registro (TYC_VERSION).';
COMMENT ON COLUMN public.tecnicos.datos_version IS
  'Versión de /politica-privacidad autorizada en /registro (PRIVACIDAD_VERSION), incl. datos sensibles.';
COMMENT ON COLUMN public.tecnicos.contrato_firmado IS
  'true = Baird recibió el contrato de prestación de servicios firmado en físico. Requisito para verificar (habilitar).';
COMMENT ON COLUMN public.tecnicos.contrato_firmado_version IS
  'Versión de /contrato-tecnico que firmó (CONTRATO_TECNICO_VERSION).';
COMMENT ON COLUMN public.tecnicos.contrato_firmado_at IS
  'Fecha de firma del contrato físico registrada por el admin.';
COMMENT ON COLUMN public.tecnicos.contrato_registrado_por IS
  'Email del admin que marcó el contrato como firmado.';

-- Refresca el cache de PostgREST para que /registro vea las columnas de inmediato.
NOTIFY pgrst, 'reload schema';
