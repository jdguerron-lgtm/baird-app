-- Kit de staging — huella del schema por categoría (md5 + conteo). SOLO LECTURA.
-- Correr en prod y en staging: si cada fila coincide, la estructura es idéntica.
-- Si una categoría difiere, 02-inventario-schema.sql da el detalle línea a línea.
-- Las funciones se comparan con los finales de línea y espacios al final de línea normalizados
-- (algunas nacieron con CRLF en prod; el comportamiento no cambia).
with
t as (select c.relname || ' rls=' || c.relrowsecurity as x from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
col as (select table_name || '.' || column_name || ' ' || data_type || ' ' || udt_name || ' null=' || is_nullable || ' def=' || coalesce(column_default, '-') || ' id=' || is_identity as x from information_schema.columns where table_schema = 'public'),
con as (select conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid) as x from pg_constraint where connamespace = 'public'::regnamespace and contype in ('p','u','c','f','x')),
idx as (select indexdef as x from pg_indexes where schemaname = 'public'),
pol as (select schemaname || '.' || tablename || '.' || policyname || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(qual, '-') || ' ' || coalesce(with_check, '-') as x from pg_policies where schemaname in ('public', 'storage')),
trg as (select pg_get_triggerdef(g.oid) as x from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal),
fn as (select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || regexp_replace(regexp_replace(pg_get_functiondef(p.oid), E'\r', '', 'g'), E'[ \t]+\n', E'\n', 'g') as x from pg_proc p where p.pronamespace = 'public'::regnamespace),
gr as (select p.proname || ' anon=' || has_function_privilege('anon', p.oid, 'execute') || ' auth=' || has_function_privilege('authenticated', p.oid, 'execute') || ' sr=' || has_function_privilege('service_role', p.oid, 'execute') as x from pg_proc p where p.pronamespace = 'public'::regnamespace),
bk as (select id || ' public=' || public || ' limit=' || coalesce(file_size_limit::text, '-') || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '-') as x from storage.buckets),
cm as (select c.relname || ' ' || obj_description(c.oid, 'pg_class') as x from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and obj_description(c.oid, 'pg_class') is not null),
ext as (select extname as x from pg_extension where extname in ('pg_cron', 'pg_net', 'pgcrypto', 'uuid-ossp'))
select 'tablas' as categoria, count(*) as n, md5(string_agg(x, '|' order by x)) as huella from t
union all select 'columnas', count(*), md5(string_agg(x, '|' order by x)) from col
union all select 'constraints', count(*), md5(string_agg(x, '|' order by x)) from con
union all select 'indices', count(*), md5(string_agg(x, '|' order by x)) from idx
union all select 'policies', count(*), md5(string_agg(x, '|' order by x)) from pol
union all select 'triggers', count(*), md5(string_agg(x, '|' order by x)) from trg
union all select 'funciones', count(*), md5(string_agg(x, '|' order by x)) from fn
union all select 'permisos_funciones', count(*), md5(string_agg(x, '|' order by x)) from gr
union all select 'buckets', count(*), md5(string_agg(x, '|' order by x)) from bk
union all select 'comentarios', count(*), md5(string_agg(x, '|' order by x)) from cm
union all select 'extensiones', count(*), md5(string_agg(x, '|' order by x)) from ext
order by 1;
