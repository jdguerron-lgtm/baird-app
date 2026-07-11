-- =============================================================================
-- SNAPSHOT DE ROLLBACK RLS — estado de producción al 2026-07-11
-- Proyecto: ceblicvdmephhktedsyv (prod)
-- =============================================================================
-- Propósito: red de seguridad de la Fase 0 del plan RLS (docs/PLAN-RLS.md).
-- Este archivo captura el estado EXACTO de RLS + policies ANTES de empezar a
-- endurecer. Si cualquier migración de la Fase 4 rompe producción, ejecutar la
-- sección relevante de abajo restaura el comportamiento previo al instante
-- (sin necesidad de deploy de la app).
--
-- NO se aplica como migración. Es referencia/rollback. Aplicar solo a mano y
-- solo la parte necesaria si hay que revertir.
--
-- Estado capturado (verificado en vivo vía MCP):
--   RLS OFF: solicitudes_servicio, especialidades_tecnico
--   RLS ON : el resto (pero con policies anon/public USING(true) = de facto abiertas)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RESTAURAR ESTADO DE RLS (enabled/disabled) POR TABLA
-- -----------------------------------------------------------------------------
-- Estas dos estaban DESACTIVADAS. Si una migración las activó y rompió algo:
ALTER TABLE public.solicitudes_servicio DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.especialidades_tecnico DISABLE ROW LEVEL SECURITY;

-- El resto estaba ACTIVADO (no tocar salvo que se haya desactivado por error):
-- ALTER TABLE public.cliente_historial      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.connection_errors      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.evidencias_servicio    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.gps_pings              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.llamadas               ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.notificaciones_whatsapp ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.repuestos_pendientes   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.solicitud_eventos      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.supervisores           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tecnicos               ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 2. RE-CREAR POLICIES (estado exacto al 2026-07-11)
-- -----------------------------------------------------------------------------
-- Cada bloque hace DROP IF EXISTS + CREATE para ser idempotente. Ejecutar solo
-- el/los bloque(s) de la tabla que haya que revertir.

-- cliente_historial ----------------------------------------------------------
DROP POLICY IF EXISTS cliente_historial_service_role_all ON public.cliente_historial;
CREATE POLICY cliente_historial_service_role_all ON public.cliente_historial
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- connection_errors ----------------------------------------------------------
DROP POLICY IF EXISTS anyone_can_insert_errors ON public.connection_errors;
CREATE POLICY anyone_can_insert_errors ON public.connection_errors
  AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anyone_can_read_errors ON public.connection_errors;
CREATE POLICY anyone_can_read_errors ON public.connection_errors
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

-- especialidades_tecnico -----------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated full access especialidades" ON public.especialidades_tecnico;
CREATE POLICY "Allow authenticated full access especialidades" ON public.especialidades_tecnico
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public insert especialidades" ON public.especialidades_tecnico;
CREATE POLICY "Allow public insert especialidades" ON public.especialidades_tecnico
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select especialidades" ON public.especialidades_tecnico;
CREATE POLICY "Allow public select especialidades" ON public.especialidades_tecnico
  AS PERMISSIVE FOR SELECT TO anon USING (true);

-- evidencias_servicio --------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated full access evidencias" ON public.evidencias_servicio;
CREATE POLICY "Allow authenticated full access evidencias" ON public.evidencias_servicio
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS allow_insert_evidencias ON public.evidencias_servicio;
CREATE POLICY allow_insert_evidencias ON public.evidencias_servicio
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select evidencias" ON public.evidencias_servicio;
CREATE POLICY "Allow public select evidencias" ON public.evidencias_servicio
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS allow_update_evidencias ON public.evidencias_servicio;
CREATE POLICY allow_update_evidencias ON public.evidencias_servicio
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- gps_pings ------------------------------------------------------------------
DROP POLICY IF EXISTS service_role_all_gps ON public.gps_pings;
CREATE POLICY service_role_all_gps ON public.gps_pings
  AS PERMISSIVE FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS anon_insert_gps ON public.gps_pings;
CREATE POLICY anon_insert_gps ON public.gps_pings
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);

-- llamadas -------------------------------------------------------------------
DROP POLICY IF EXISTS llamadas_service_role_all ON public.llamadas;
CREATE POLICY llamadas_service_role_all ON public.llamadas
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS llamadas_anon_delete ON public.llamadas;
CREATE POLICY llamadas_anon_delete ON public.llamadas
  AS PERMISSIVE FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS llamadas_anon_insert ON public.llamadas;
CREATE POLICY llamadas_anon_insert ON public.llamadas
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS llamadas_anon_select ON public.llamadas;
CREATE POLICY llamadas_anon_select ON public.llamadas
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS llamadas_anon_update ON public.llamadas;
CREATE POLICY llamadas_anon_update ON public.llamadas
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- notificaciones_whatsapp ----------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated full access notificaciones" ON public.notificaciones_whatsapp;
CREATE POLICY "Allow authenticated full access notificaciones" ON public.notificaciones_whatsapp
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public insert notificaciones" ON public.notificaciones_whatsapp;
CREATE POLICY "Allow public insert notificaciones" ON public.notificaciones_whatsapp
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select notificaciones" ON public.notificaciones_whatsapp;
CREATE POLICY "Allow public select notificaciones" ON public.notificaciones_whatsapp
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow public update notificaciones" ON public.notificaciones_whatsapp;
CREATE POLICY "Allow public update notificaciones" ON public.notificaciones_whatsapp
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- repuestos_pendientes -------------------------------------------------------
DROP POLICY IF EXISTS service_role_all_repuestos ON public.repuestos_pendientes;
CREATE POLICY service_role_all_repuestos ON public.repuestos_pendientes
  AS PERMISSIVE FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS anon_insert_repuestos ON public.repuestos_pendientes;
CREATE POLICY anon_insert_repuestos ON public.repuestos_pendientes
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS anon_read_repuestos ON public.repuestos_pendientes;
CREATE POLICY anon_read_repuestos ON public.repuestos_pendientes
  AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS anon_update_repuestos ON public.repuestos_pendientes;
CREATE POLICY anon_update_repuestos ON public.repuestos_pendientes
  AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);

-- solicitud_eventos ----------------------------------------------------------
DROP POLICY IF EXISTS service_role_all_eventos ON public.solicitud_eventos;
CREATE POLICY service_role_all_eventos ON public.solicitud_eventos
  AS PERMISSIVE FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS anon_insert_eventos ON public.solicitud_eventos;
CREATE POLICY anon_insert_eventos ON public.solicitud_eventos
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS anon_read_eventos ON public.solicitud_eventos;
CREATE POLICY anon_read_eventos ON public.solicitud_eventos
  AS PERMISSIVE FOR SELECT TO public USING (true);

-- solicitudes_servicio -------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated full access solicitudes" ON public.solicitudes_servicio;
CREATE POLICY "Allow authenticated full access solicitudes" ON public.solicitudes_servicio
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select" ON public.solicitudes_servicio;
CREATE POLICY "Allow public select" ON public.solicitudes_servicio
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow public update" ON public.solicitudes_servicio;
CREATE POLICY "Allow public update" ON public.solicitudes_servicio
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- supervisores ---------------------------------------------------------------
DROP POLICY IF EXISTS supervisores_service_role_all ON public.supervisores;
CREATE POLICY supervisores_service_role_all ON public.supervisores
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS supervisores_anon_delete ON public.supervisores;
CREATE POLICY supervisores_anon_delete ON public.supervisores
  AS PERMISSIVE FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS supervisores_anon_insert ON public.supervisores;
CREATE POLICY supervisores_anon_insert ON public.supervisores
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS supervisores_anon_select ON public.supervisores;
CREATE POLICY supervisores_anon_select ON public.supervisores
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS supervisores_anon_update ON public.supervisores;
CREATE POLICY supervisores_anon_update ON public.supervisores
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- tecnicos -------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated full access tecnicos" ON public.tecnicos;
CREATE POLICY "Allow authenticated full access tecnicos" ON public.tecnicos
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete tecnicos" ON public.tecnicos;
CREATE POLICY "Allow public delete tecnicos" ON public.tecnicos
  AS PERMISSIVE FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS "Allow public insert tecnicos" ON public.tecnicos;
CREATE POLICY "Allow public insert tecnicos" ON public.tecnicos
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select tecnicos" ON public.tecnicos;
CREATE POLICY "Allow public select tecnicos" ON public.tecnicos
  AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow public update tecnicos" ON public.tecnicos;
CREATE POLICY "Allow public update tecnicos" ON public.tecnicos
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- =============================================================================
-- FIN DEL SNAPSHOT
-- =============================================================================
