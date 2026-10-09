-- ============================================================
-- 20261009_tecnicos_contrato_archivo.sql
-- ------------------------------------------------------------
-- Copia escaneada del contrato de prestación de servicios firmado
-- en físico (complementa 20261009_tecnicos_aceptacion_legal.sql).
--
--  1. Columnas en tecnicos: ruta del archivo dentro del bucket y
--     fecha de subida. Se guarda la RUTA (no una URL pública): el
--     admin lee con createSignedUrl() (TTL corto).
--  2. Bucket PRIVADO `tecnicos-contratos` (PDF/JPG/PNG, 10 MB).
--     A diferencia de tecnicos-documentos, nace cerrado: ningún
--     acceso anon. Solo el rol `authenticated` (el admin logueado;
--     el self-signup de Supabase Auth está apagado) puede subir,
--     leer, reemplazar y borrar.
--
-- Aditiva e idempotente. Rollback:
--   drop policy if exists "contratos admin select" on storage.objects;
--   drop policy if exists "contratos admin insert" on storage.objects;
--   drop policy if exists "contratos admin update" on storage.objects;
--   drop policy if exists "contratos admin delete" on storage.objects;
--   delete from storage.objects where bucket_id = 'tecnicos-contratos';
--   delete from storage.buckets where id = 'tecnicos-contratos';
--   alter table public.tecnicos drop column contrato_archivo_path,
--     drop column contrato_archivo_subido_at;
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS contrato_archivo_path       TEXT,
  ADD COLUMN IF NOT EXISTS contrato_archivo_subido_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.tecnicos.contrato_archivo_path IS
  'Ruta en el bucket privado tecnicos-contratos del contrato firmado y escaneado (PDF/JPG/PNG). Leer con signed URL.';
COMMENT ON COLUMN public.tecnicos.contrato_archivo_subido_at IS
  'Fecha en que el admin subió la copia escaneada del contrato.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tecnicos-contratos',
  'tecnicos-contratos',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "contratos admin select" ON storage.objects;
CREATE POLICY "contratos admin select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tecnicos-contratos');

DROP POLICY IF EXISTS "contratos admin insert" ON storage.objects;
CREATE POLICY "contratos admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tecnicos-contratos');

DROP POLICY IF EXISTS "contratos admin update" ON storage.objects;
CREATE POLICY "contratos admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tecnicos-contratos')
  WITH CHECK (bucket_id = 'tecnicos-contratos');

DROP POLICY IF EXISTS "contratos admin delete" ON storage.objects;
CREATE POLICY "contratos admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tecnicos-contratos');

NOTIFY pgrst, 'reload schema';
