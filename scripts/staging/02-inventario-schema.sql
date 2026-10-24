-- Kit de staging — inventario del schema en formato estable para diff prod ↔ staging.
-- Solo lectura. Correr en los dos proyectos y comparar las salidas línea a línea.
-- Cubre: tablas y RLS, columnas (tipo, nulabilidad, default), constraints, índices,
-- policies, triggers, funciones (firma + security + search_path), buckets.

with t as (
  select 'tabla' as tipo,
         c.relname as objeto,
         'rls=' || c.relrowsecurity::text as detalle
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
), col as (
  select 'columna',
         table_name || '.' || column_name,
         data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '-')
  from information_schema.columns
  where table_schema = 'public'
), con as (
  select 'constraint',
         conrelid::regclass::text || '.' || conname,
         pg_get_constraintdef(oid)
  from pg_constraint
  where connamespace = 'public'::regnamespace
), idx as (
  select 'indice', tablename || '.' || indexname, indexdef
  from pg_indexes where schemaname = 'public'
), pol as (
  select 'policy',
         schemaname || '.' || tablename || '.' || policyname,
         cmd || ' roles=' || roles::text || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-')
  from pg_policies where schemaname in ('public', 'storage')
), trg as (
  select 'trigger',
         event_object_table || '.' || trigger_name,
         action_timing || ' ' || string_agg(event_manipulation, ',' order by event_manipulation) || ' → ' || action_statement
  from information_schema.triggers
  where trigger_schema = 'public'
  group by event_object_table, trigger_name, action_timing, action_statement
), fn as (
  select 'funcion',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'secdef=' || p.prosecdef::text || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
         || ' md5=' || md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
), bk as (
  select 'bucket', id, 'public=' || public::text || ' limit=' || coalesce(file_size_limit::text, '-')
  from storage.buckets
), ext as (
  select 'extension', extname, extversion from pg_extension
)
select tipo, objeto, detalle from (
  select * from t union all select * from col union all select * from con union all
  select * from idx union all select * from pol union all select * from trg union all
  select * from fn union all select * from bk union all select * from ext
) x
order by tipo, objeto, detalle;
