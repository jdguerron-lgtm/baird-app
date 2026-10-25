-- 2026-10-24 — Hardening de funciones (advisors 0028/0029 y 0011)
--
-- Estado: ⏳ PENDIENTE. Orden obligatorio: STAGING → pruebas DML → PROD en
-- ventana 22:00–23:00 Bogotá (lun–jue). Ver docs/PLAN-CIERRE-SEGURIDAD-Y-STAGING.md § 3 (C2, C3).
--
-- 1. Quita EXECUTE público a las 3 funciones SECURITY DEFINER del módulo de pagos.
--    Hoy anon/authenticated pueden llamarlas vía /rest/v1/rpc/* y forzar
--    recálculos del resumen de pago de cualquier solicitud.
--    Por qué no rompe nada:
--      - El trigger pagos_resumen_aiud se dispara sin chequeo de EXECUTE
--        (Postgres solo lo exige al CREAR el trigger).
--      - trg_pagos_resumen llama a recalcular_resumen_pago dentro de una función
--        SECURITY DEFINER → corre como el dueño (postgres).
--      - auditar_pagos la ejecuta pg_cron como postgres.
--      - La app no usa rpc() para ninguna de las tres (grep en src/ y scripts/).
-- 2. Fija search_path en las 6 funciones que lo tenían mutable. Solo usan
--    funciones del catálogo y normalizar_telefono_co (en public): mismo resultado.
--
-- Idempotente. Impacto funcional esperado: ninguno.

-- ── 1. EXECUTE solo para el servidor ──────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.auditar_pagos()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalcular_resumen_pago(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_pagos_resumen()             FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.auditar_pagos()                 TO service_role;
GRANT  EXECUTE ON FUNCTION public.recalcular_resumen_pago(uuid)   TO service_role;
GRANT  EXECUTE ON FUNCTION public.trg_pagos_resumen()             TO service_role;

-- ── 2. search_path fijo ───────────────────────────────────────────────────
ALTER FUNCTION public.normalizar_telefono_co(text)                 SET search_path = public;
ALTER FUNCTION public.trigger_normalizar_telefono_cliente()        SET search_path = public;
ALTER FUNCTION public.trigger_normalizar_telefono_receptor()       SET search_path = public;
ALTER FUNCTION public.trigger_normalizar_whatsapp_supervisor()     SET search_path = public;
ALTER FUNCTION public.trigger_normalizar_whatsapp_tecnico()        SET search_path = public;
ALTER FUNCTION public.limpiar_confirmacion_visita()                SET search_path = public;

-- ── Opcional (NO incluido a propósito): que las funciones futuras nazcan sin
--    EXECUTE público. Cambia el comportamiento de cualquier rpc() nuevo, así
--    que se decide aparte:
--    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ── Verificación ──────────────────────────────────────────────────────────
-- a) Grants: no debe aparecer anon, authenticated ni PUBLIC en las 3 de pagos.
--   select p.proname, string_agg(a.grantee || ':' || a.privilege_type, ', ' order by a.grantee) grants
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   left join information_schema.routine_privileges a
--     on a.specific_schema = 'public' and a.specific_name = p.proname || '_' || p.oid
--   where n.nspname = 'public' and p.proname in ('auditar_pagos','recalcular_resumen_pago','trg_pagos_resumen')
--   group by 1;
-- b) search_path fijo en las 6:
--   select proname, proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' order by 1;
-- c) La normalización sigue igual:
--   select public.normalizar_telefono_co('+57 313 495 1164') = '573134951164' as ok;
-- d) SOLO EN STAGING — DML que dispara los triggers (como service_role / postgres):
--   insert into supervisores (nombre, whatsapp, activo, ambito) values ('Prueba hardening', '+57 300 000 0000', false, 'todos');
--   select whatsapp from supervisores where nombre = 'Prueba hardening';   -- 573000000000
--   delete from supervisores where nombre = 'Prueba hardening';
--   -- y un insert/delete de prueba en pagos sobre una solicitud del seed para ver que
--   -- monto_pagado_online se recalcula.
-- e) Como anon (SQL Editor → "Run as anon" o set role anon): debe fallar con 42501:
--   select public.auditar_pagos();
-- f) Advisors (MCP get_advisors security): 0028/0029 y 0011 desaparecen.

-- ── Rollback (instantáneo, sin deploy) ───────────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.auditar_pagos()               TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.recalcular_resumen_pago(uuid) TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.trg_pagos_resumen()           TO PUBLIC, anon, authenticated;
-- ALTER FUNCTION public.normalizar_telefono_co(text)              RESET search_path;
-- ALTER FUNCTION public.trigger_normalizar_telefono_cliente()     RESET search_path;
-- ALTER FUNCTION public.trigger_normalizar_telefono_receptor()    RESET search_path;
-- ALTER FUNCTION public.trigger_normalizar_whatsapp_supervisor()  RESET search_path;
-- ALTER FUNCTION public.trigger_normalizar_whatsapp_tecnico()     RESET search_path;
-- ALTER FUNCTION public.limpiar_confirmacion_visita()             RESET search_path;
