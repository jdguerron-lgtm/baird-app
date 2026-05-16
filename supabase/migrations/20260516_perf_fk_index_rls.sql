-- ============================================================================
-- Performance: índice FK + RLS optimization
-- ============================================================================
--
-- Cierra 4 hallazgos del Supabase advisor (2026-05-16):
--
--   1. Unindexed FK: solicitudes_servicio.tecnico_asignado_id no tenía índice.
--      Impacta el UPDATE atómico `WHERE tecnico_asignado_id IS NULL` (aceptación
--      por primer técnico), filtros admin por técnico y joins.
--
--   2. Auth RLS initplan: las policies `service_role_all_*` llamaban
--      `auth.role()` por fila. Envolviendo en `(SELECT auth.role())` el
--      planner lo trata como InitPlan (1 vez por query).
--
--   3. Multiple permissive policies (service_role_*): aplicaban a role
--      `{public}` (todas las roles), solapándose con las policies `anon_*`.
--      Re-scope a role `service_role` para que no se evalúe en requests anon
--      (service_role además bypasea RLS en Supabase — la policy queda como
--      hint explícito de intención).
--
--   4. Multiple permissive policies (evidencias_servicio): dos policies
--      anon UPDATE idénticas (qual=true, with_check=true) — "Allow public
--      update evidencias" y `allow_update_evidencias`. Se elimina la legacy.
--
-- IDEMPOTENTE — `IF NOT EXISTS` para el índice y `ALTER POLICY` es idempotente
-- por naturaleza. Se puede correr varias veces sin efecto adicional.
-- ============================================================================

-- ─── 1. Índice FK para tecnico_asignado_id ───
CREATE INDEX IF NOT EXISTS idx_solicitudes_tecnico_asignado
  ON public.solicitudes_servicio (tecnico_asignado_id);

COMMENT ON INDEX public.idx_solicitudes_tecnico_asignado IS
  'FK index para acceptance atómico (UPDATE WHERE tecnico_asignado_id IS NULL) y joins admin → técnico (2026-05-16).';

-- ─── 2 + 3. RLS service_role_all_* : scope a service_role + initplan ───
ALTER POLICY service_role_all_gps ON public.gps_pings
  TO service_role
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

ALTER POLICY service_role_all_repuestos ON public.repuestos_pendientes
  TO service_role
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

ALTER POLICY service_role_all_eventos ON public.solicitud_eventos
  TO service_role
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─── 4. Drop policy duplicada en evidencias_servicio ───
--    `allow_update_evidencias` cubre exactamente lo mismo (anon UPDATE,
--    qual=true, with_check=true). Eliminamos la legacy.
DROP POLICY IF EXISTS "Allow public update evidencias" ON public.evidencias_servicio;
