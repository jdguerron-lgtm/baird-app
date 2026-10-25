-- Kit de staging — buckets y policies de Storage, copia fiel de PRODUCCIÓN al 2026-10-24
-- (extraídas de storage.buckets y pg_policies con el MCP, solo lectura).
--
-- Correr SOLO en baird-staging, después del schema público. Idempotente.
-- pg_dump --schema=public no incluye nada de esto.

-- ── Buckets ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias-servicio', 'evidencias-servicio', true,  null,     null),
  ('tecnicos-fotos',      'tecnicos-fotos',      true,  null,     null),
  ('tecnicos-documentos', 'tecnicos-documentos', true,  null,     null),
  ('tecnicos-contratos',  'tecnicos-contratos',  false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies sobre storage.objects (mismos nombres que en prod) ───────────
-- Subidas públicas (anon + authenticated) por bucket, sin listado público
-- (el listado se cerró en prod el 2026-06-24).
drop policy if exists " allow public uploads 1tinn4i_1" on storage.objects;
create policy " allow public uploads 1tinn4i_1" on storage.objects
  for insert to public with check (bucket_id = 'tecnicos-documentos');

drop policy if exists "allow public uploads 49yfss_1" on storage.objects;
create policy "allow public uploads 49yfss_1" on storage.objects
  for insert to public with check (bucket_id = 'tecnicos-fotos');

drop policy if exists "allow public insert evidencias" on storage.objects;
create policy "allow public insert evidencias" on storage.objects
  for insert to public with check (bucket_id = 'evidencias-servicio');

drop policy if exists "allow public update evidencias" on storage.objects;
create policy "allow public update evidencias" on storage.objects
  for update to public using (bucket_id = 'evidencias-servicio');

-- Contratos: privado, solo authenticated (admin), lectura por signed URL.
drop policy if exists "contratos admin select" on storage.objects;
create policy "contratos admin select" on storage.objects
  for select to authenticated using (bucket_id = 'tecnicos-contratos');

drop policy if exists "contratos admin insert" on storage.objects;
create policy "contratos admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'tecnicos-contratos');

drop policy if exists "contratos admin update" on storage.objects;
create policy "contratos admin update" on storage.objects
  for update to authenticated using (bucket_id = 'tecnicos-contratos') with check (bucket_id = 'tecnicos-contratos');

drop policy if exists "contratos admin delete" on storage.objects;
create policy "contratos admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'tecnicos-contratos');

-- ── Verificación ──────────────────────────────────────────────────────────
-- select id, public, file_size_limit from storage.buckets order by id;            -- 4 filas
-- select policyname, cmd, roles from pg_policies where schemaname='storage' order by 1;  -- 8 filas
