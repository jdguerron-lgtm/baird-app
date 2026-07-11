-- =============================================================================
-- RLS Fase 4.1 — cierre de tablas que el browser ya NO toca (docs/PLAN-RLS.md)
-- =============================================================================
-- PRERREQUISITO (verificado antes de aplicar):
--   * Prod corre la Fase 1 (todo el server-side usa service_role, que tiene
--     BYPASSRLS=true — verificado en pg_roles). Deploy a32fdd3 o posterior.
--   * Rollback completo del estado previo: supabase/rls-rollback-snapshot-2026-07-11.sql
--
-- Qué cierra y por qué es seguro:
--   * supervisores  — el browser nunca la toca (portal va por /api/supervisor/*).
--                     Cierra el hueco CRÍTICO: anon podía leer portal_token (=
--                     entrar a cualquier panel) y hacer INSERT/UPDATE/DELETE.
--   * llamadas      — solo dapta.service/webhook (server). Anon tenía CRUD total.
--   * gps_pings     — escribe /api/gps-ping (server). Se quita INSERT público.
--   * solicitud_eventos — audit log append-only; escribía server. Se quita el
--                     INSERT público (auditoría ya no falsificable) y el SELECT
--                     pasa de public a authenticated (solo lo lee /admin).
--   * notificaciones_whatsapp — escribía whatsapp.service (server). Se quitan
--                     INSERT/UPDATE anon. El SELECT anon SE CONSERVA: /aceptar
--                     la lee client-side (migra en Fase 3).
--   * repuestos_pendientes — escribía server. Se quitan INSERT/UPDATE públicos.
--                     SELECT público SE CONSERVA: /verificar-paso y /admin/repuestos
--                     la leen client-side (migra en Fase 3).
--   * connection_errors — inserta /api/log-error (server). Se quita INSERT
--                     anon/authenticated y el SELECT queda solo authenticated
--                     (/admin/errores).
--
-- NO se tocan (el browser aún les escribe/lee; Fases 2-4.2):
--   tecnicos, evidencias_servicio, solicitudes_servicio, especialidades_tecnico.
-- =============================================================================

-- supervisores ----------------------------------------------------------------
DROP POLICY IF EXISTS supervisores_anon_select ON public.supervisores;
DROP POLICY IF EXISTS supervisores_anon_insert ON public.supervisores;
DROP POLICY IF EXISTS supervisores_anon_update ON public.supervisores;
DROP POLICY IF EXISTS supervisores_anon_delete ON public.supervisores;

-- llamadas --------------------------------------------------------------------
DROP POLICY IF EXISTS llamadas_anon_select ON public.llamadas;
DROP POLICY IF EXISTS llamadas_anon_insert ON public.llamadas;
DROP POLICY IF EXISTS llamadas_anon_update ON public.llamadas;
DROP POLICY IF EXISTS llamadas_anon_delete ON public.llamadas;

-- gps_pings ---------------------------------------------------------------
DROP POLICY IF EXISTS anon_insert_gps ON public.gps_pings;

-- solicitud_eventos -------------------------------------------------------
DROP POLICY IF EXISTS anon_insert_eventos ON public.solicitud_eventos;
DROP POLICY IF EXISTS anon_read_eventos ON public.solicitud_eventos;
CREATE POLICY eventos_authenticated_select ON public.solicitud_eventos
  FOR SELECT TO authenticated USING (true);

-- notificaciones_whatsapp (conserva SELECT anon: /aceptar lo usa) -----------
DROP POLICY IF EXISTS "Allow public insert notificaciones" ON public.notificaciones_whatsapp;
DROP POLICY IF EXISTS "Allow public update notificaciones" ON public.notificaciones_whatsapp;

-- repuestos_pendientes (conserva SELECT público: /verificar-paso lo usa) ----
DROP POLICY IF EXISTS anon_insert_repuestos ON public.repuestos_pendientes;
DROP POLICY IF EXISTS anon_update_repuestos ON public.repuestos_pendientes;

-- connection_errors ---------------------------------------------------------
DROP POLICY IF EXISTS anyone_can_insert_errors ON public.connection_errors;
DROP POLICY IF EXISTS anyone_can_read_errors ON public.connection_errors;
CREATE POLICY errores_authenticated_select ON public.connection_errors
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- ROLLBACK (si algo falla, ejecutar el bloque de la tabla afectada del snapshot
-- supabase/rls-rollback-snapshot-2026-07-11.sql — recrea las policies exactas).
-- Para las dos policies nuevas de este archivo:
--   DROP POLICY IF EXISTS eventos_authenticated_select ON public.solicitud_eventos;
--   DROP POLICY IF EXISTS errores_authenticated_select ON public.connection_errors;
-- =============================================================================
