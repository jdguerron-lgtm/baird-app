-- 20260609_tecnicos_ciudades_cobertura.sql
-- Multi-ciudad por técnico.
--
-- Hasta ahora un técnico tenía UNA sola `ciudad_pueblo` (string) y el matching
-- de `notificarTecnicos` (src/lib/services/whatsapp.service.ts) solo comparaba
-- esa una. Ahora un mismo técnico puede cubrir VARIAS ciudades/pueblos
-- (p.ej. Soacha, Pasto, La Mesa, El Colegio).
--
-- `ciudades_cobertura` es la lista AUTORITATIVA de ciudades que atiende el
-- técnico (la usa el matching). `ciudad_pueblo` se conserva como ciudad
-- base/principal: se sigue mostrando en mensajes WhatsApp y es el default del
-- registro. El backfill copia la ciudad base como primer (y único) elemento de
-- cobertura para los técnicos existentes; admin agrega más desde
-- /admin/tecnicos/[id].
--
-- Idempotente. Aplicar a mano en el SQL Editor de Supabase (no usamos CLI).

ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS ciudades_cobertura text[] NOT NULL DEFAULT '{}';

-- Backfill: técnicos existentes arrancan cubriendo su ciudad base.
UPDATE tecnicos
SET ciudades_cobertura = ARRAY[ciudad_pueblo]
WHERE (ciudades_cobertura IS NULL OR ciudades_cobertura = '{}')
  AND ciudad_pueblo IS NOT NULL
  AND btrim(ciudad_pueblo) <> '';

-- Verificación:
--   SELECT nombre_completo, ciudad_pueblo, ciudades_cobertura
--   FROM tecnicos ORDER BY created_at DESC;
