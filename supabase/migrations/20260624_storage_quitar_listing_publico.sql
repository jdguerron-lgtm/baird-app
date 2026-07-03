-- 20260624_storage_quitar_listing_publico.sql
--
-- Cierra la ENUMERACIÓN de archivos (listing) en los 3 buckets públicos.
-- Hallazgo del Supabase security advisor (lint 0025_public_bucket_allows_listing):
-- cada bucket público tenía una policy SELECT amplia sobre storage.objects que
-- permite a cualquiera LISTAR todos los archivos del bucket (no solo acceder a un
-- objeto por su URL). En `tecnicos-documentos` eso significa poder enumerar TODAS
-- las cédulas de los técnicos (PII).
--
-- Por qué es seguro quitarlas:
--  - Las lecturas de la app son por URL PÚBLICA (getPublicUrl → /object/public/…),
--    que NO pasa por RLS: el bucket public=true sirve el objeto directo. Quitar la
--    policy SELECT no afecta esas lecturas (verificado con scripts/verify-flows.mjs,
--    que lee evidencias-servicio vía getPublicUrl + fetch → sigue HTTP 200).
--  - Los uploads usan policies INSERT SEPARADAS (… _1 / "allow public insert …"),
--    que quedan intactas → subir evidencia / foto / documento sigue funcionando.
--  - Solo se cierra el endpoint authenticated/list (.list() / .download()), que la
--    app NO usa (cero ocurrencias de storage .list() en src/).
--
-- Reversible: recrear las policies con
--   create policy "allow public select evidencias" on storage.objects
--     for select to public using (bucket_id = 'evidencias-servicio');
--   create policy " allow public uploads 1tinn4i_0" on storage.objects
--     for select to public using (bucket_id = 'tecnicos-documentos');
--   create policy "allow public uploads 49yfss_0" on storage.objects
--     for select to public using (bucket_id = 'tecnicos-fotos');
--
-- NOTA: el fix completo de PII para `tecnicos-documentos` (cédulas) es migrar el
-- bucket a privado + signed URLs (backlog H2 en docs/SEGURIDAD.md). Esto es una
-- mitigación parcial estricta: deja de poder listarse, pero un objeto sigue siendo
-- accesible por quien tenga su URL exacta hasta que se hagan signed URLs.

drop policy if exists "allow public select evidencias" on storage.objects;
drop policy if exists " allow public uploads 1tinn4i_0" on storage.objects;
drop policy if exists "allow public uploads 49yfss_0" on storage.objects;
