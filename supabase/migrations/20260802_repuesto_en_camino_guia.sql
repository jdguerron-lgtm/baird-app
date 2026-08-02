-- ─────────────────────────────────────────────────────────────────────────────
-- Repuesto en camino + guía de envío del supervisor — 2026-08-02.
--
-- Rediseño del flujo de repuestos (garantía):
--   1. El diagnóstico con esperar_repuesto pasa DIRECTO a esperando_repuesto
--      (se elimina el paso por pendiente_pricing / "fechas de entrega" y la
--      aprobación previa del cliente). El supervisor recibe el requerimiento
--      exacto del repuesto (SKU + descripción + cantidad) al instante.
--   2. NUEVO estado `repuesto_en_camino`: el supervisor sube la guía de envío
--      desde su portal (/supervisor/{token}/{id}) → se notifica a cliente y
--      técnico que el producto va en camino y el cliente agenda la visita de
--      finalización vía /reprogramar-repuesto/{token} (queda registrada en
--      fecha_visita_at, igual que el agendamiento inicial).
--   3. `repuesto_recibido` se mantiene (camino admin /admin/repuestos).
--
-- CHECK 18 → 19 estados. DEBE coincidir con ESTADOS_VALIDOS en
-- src/lib/constants/estados.ts y EstadoSolicitud en src/types/solicitud.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columnas de la guía de envío (subida por el supervisor).
ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS guia_envio_url text,
  ADD COLUMN IF NOT EXISTS guia_envio_numero text,
  ADD COLUMN IF NOT EXISTS guia_envio_at timestamptz,
  ADD COLUMN IF NOT EXISTS guia_envio_por text;

COMMENT ON COLUMN solicitudes_servicio.guia_envio_url IS
  'URL pública (Storage evidencias-servicio) de la guía de envío del repuesto subida por el supervisor';
COMMENT ON COLUMN solicitudes_servicio.guia_envio_numero IS
  'Número de guía / transportadora (texto libre, opcional)';
COMMENT ON COLUMN solicitudes_servicio.guia_envio_at IS
  'Cuándo se subió la guía (transición esperando_repuesto → repuesto_en_camino)';
COMMENT ON COLUMN solicitudes_servicio.guia_envio_por IS
  'Nombre del supervisor que subió la guía';

-- 2. Cantidad del repuesto solicitado (antes solo vivía en el JSONB
--    productos_necesarios; ahora el requerimiento exacto viaja al supervisor).
ALTER TABLE repuestos_pendientes
  ADD COLUMN IF NOT EXISTS cantidad integer NOT NULL DEFAULT 1;

-- 3. CHECK con los 19 estados canónicos (18 + repuesto_en_camino).
ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT solicitudes_servicio_estado_check;

ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_estado_check CHECK (estado IN (
    'pendiente_horario',
    'sin_agendar',
    'notificada',
    'asignada',
    'aprobacion_paso_pendiente',
    'pendiente_pricing',
    'cotizacion_enviada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'repuesto_en_camino',
    'repuesto_recibido',
    'finalizado_sin_reparacion',
    'reparacion_rechazada',
    'no_show_cliente',
    'en_proceso',
    'confirmacion_pendiente',
    'completada',
    'cancelada',
    'en_disputa'
  ));
