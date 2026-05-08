-- HOTFIX: evidencias_servicio.completado_at tenía DEFAULT NOW() en el
-- schema original (20260327_portal_evidencias.sql), lo que causaba que
-- TODA fila insertada por /api/diagnostico (que NO especifica completado_at
-- porque el oath se guarda antes de completar el servicio) quedara con
-- completado_at = NOW() automáticamente.
--
-- Síntoma en producción:
--   Tras un servicio que pasó por diagnóstico, el portal del técnico
--   marcaba el servicio como "ya completado" y ocultaba el botón
--   "Completar servicio". El técnico no podía cerrar el flujo.
--
-- Causa raíz:
--   DEFAULT NOW() en evidencias_servicio.completado_at. Semánticamente
--   completado_at debe ser NULL hasta que el técnico ejecute
--   /api/completar-servicio, que es donde la columna debe poblarse.
--
-- Fix:
--   1. Drop default — la columna queda como nullable sin valor implícito.
--   2. Backfill: poner completado_at = NULL en filas que vinieron del
--      diagnóstico (fotos vacío + firma_url IS NULL) y cuya solicitud
--      todavía no llegó a estado de cierre. No tocar filas de servicios
--      ya en en_verificacion / completada / en_disputa porque ahí
--      completado_at sí refleja una completación real.
--
-- Date: 2026-05-08

ALTER TABLE evidencias_servicio
  ALTER COLUMN completado_at DROP DEFAULT;

-- Backfill de filas mal seteadas. Criterio:
--   - Sin firma del cliente (firma_url NULL)
--   - Sin fotos (array_length(fotos, 1) IS NULL en postgres significa array vacío)
--   - La solicitud asociada todavía está en flujo activo (no llegó a verificación/cierre)
UPDATE evidencias_servicio e
   SET completado_at = NULL
  FROM solicitudes_servicio s
 WHERE e.solicitud_id = s.id
   AND e.firma_url IS NULL
   AND (e.fotos IS NULL OR array_length(e.fotos, 1) IS NULL)
   AND s.estado NOT IN ('en_verificacion', 'completada', 'en_disputa');

-- Refresca el schema cache de PostgREST.
NOTIFY pgrst, 'reload schema';
