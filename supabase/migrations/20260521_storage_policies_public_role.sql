-- ============================================================================
-- Storage RLS: ampliar policies de `{anon}` a `public`
-- ============================================================================
--
-- ⚠️  ESTE ARCHIVO NO SE PUEDE CORRER EN EL SQL EDITOR DE SUPABASE.
--
--    `storage.objects` pertenece al rol `supabase_storage_admin`. El rol
--    `postgres` (con el que corre el SQL Editor) NO puede `ALTER POLICY` sobre
--    esa tabla ni `SET ROLE supabase_storage_admin`. Verificado 2026-05-21:
--        ERROR 42501: permission denied to set role "supabase_storage_admin"
--
--    APLICAR VÍA: Dashboard de Supabase → Storage → Policies. Para cada policy
--    de abajo, editarla y dejar "Target roles" vacío (= public / todos los
--    roles). Si el editor no deja cambiar los roles en sitio, borrar la policy
--    y recrearla con el mismo nombre, operación y expresión, target roles vacío.
--
--    El SQL de abajo queda como especificación canónica del estado deseado.
--
-- ─── BUG QUE RESUELVE ───
-- Subir evidencia desde el portal del técnico falla con
-- "new row violates row-level security policy" cuando el navegador tiene una
-- sesión de admin activa.
--
-- CAUSA: el cliente Supabase es un singleton (src/lib/supabase.ts) con
-- persistSession activo. Si el admin se loguea (supabase.auth) y luego abre el
-- portal del técnico en el MISMO navegador, los requests salen con rol
-- `authenticated` en vez de `anon`. Las policies de los buckets estaban
-- scopeadas a `{anon}` solamente → el rol `authenticated` no matchea ninguna
-- → INSERT denegado.
--
-- FIX: scopear las policies a `public` (cubre anon + authenticated). NO es un
-- downgrade de seguridad: el anon key ya es público y las policies no
-- restringen por path — cualquiera puede subir igual. La seguridad real de los
-- portales con token es el token opaco a nivel de aplicación.
--
-- Estas policies se crearon a mano en el dashboard (la migración
-- 20260327_portal_evidencias.sql lo dejó como TODO manual). Este archivo las
-- deja documentadas.
-- ============================================================================

-- ─── Bucket evidencias-servicio (diagnóstico + completación del técnico) ───
ALTER POLICY "allow public insert evidencias" ON storage.objects TO public;  -- ← CRÍTICA (el bug)
ALTER POLICY "allow public select evidencias" ON storage.objects TO public;
ALTER POLICY "allow public update evidencias" ON storage.objects TO public;

-- ─── Bucket tecnicos-fotos (foto de perfil — flujo /registro) ───
ALTER POLICY "allow public uploads 49yfss_0" ON storage.objects TO public;
ALTER POLICY "allow public uploads 49yfss_1" ON storage.objects TO public;

-- ─── Bucket tecnicos-documentos (cédula — flujo /registro) ───
-- OJO: estos dos nombres de policy tienen un espacio inicial.
ALTER POLICY " allow public uploads 1tinn4i_0" ON storage.objects TO public;
ALTER POLICY " allow public uploads 1tinn4i_1" ON storage.objects TO public;
