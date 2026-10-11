-- 2026-10-11 — Permitir 'Cambio de filtro' en solicitudes_servicio.tipo_solicitud
--
-- Contexto: el código (TIPOS_SOLICITUD en src/types/solicitud.ts, formulario
-- /solicitar y TARIFA_CAMBIO_FILTRO) ofrece "Cambio de filtro" desde 2026-08,
-- pero el CHECK en prod solo admitía Diagnóstico / Reparación / Mantenimiento.
-- Resultado: todo intento de pedir un cambio de filtro fallaba con 23514 en
-- /api/solicitar (visto en logs de Vercel el 2026-10-10, clienta real perdida).
--
-- Cambio aditivo: se amplía la lista; no se tocan filas existentes.

ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT IF EXISTS solicitudes_servicio_tipo_solicitud_check;

ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_tipo_solicitud_check
  CHECK (tipo_solicitud = ANY (ARRAY[
    'Diagnóstico'::text,
    'Reparación'::text,
    'Mantenimiento'::text,
    'Cambio de filtro'::text
  ]));

-- Verificación:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'solicitudes_servicio_tipo_solicitud_check';
