-- ─────────────────────────────────────────────────────────────────────────────
-- Renombre de estados confusos — PASO 1 de 2 (EXPAND). 2026-07-09.
--
--   verificacion_pendiente → aprobacion_paso_pendiente
--     ("verificacion_pendiente" vs "en_verificacion" eran casi idénticos con
--      significados opuestos: este es ANTES del trabajo — el cliente aprueba
--      el siguiente paso propuesto en el diagnóstico de garantía)
--   en_verificacion        → confirmacion_pendiente
--     (DESPUÉS del trabajo — el cliente confirma que el servicio quedó bien)
--   cancelada_cliente      → reparacion_rechazada
--     ("cancelada_cliente" sonaba a cancelación genérica, pero significa
--      "el cliente se negó a reparar tras el diagnóstico" (negativa_cliente);
--      chocaba con `cancelada` (self-service). Paralelo a cotizacion_rechazada)
--
-- Estrategia expand→contract para deploy sin ventana rota:
--   1. ESTA migración: CHECK acepta viejos + nuevos, renombra filas existentes.
--      El código viejo (aún desplegado) puede seguir escribiendo valores viejos.
--   2. Deploy del código con los nombres nuevos.
--   3. 20260709_renombrar_estados_contract.sql: re-barre strays escritos durante
--      la ventana y cierra el CHECK solo a los nombres nuevos.
--
-- Verificado en prod antes de escribir esto (2026-07-09):
--   - 0 filas en verificacion_pendiente y en_verificacion; 3 en cancelada_cliente
--     (terminales).
--   - Ninguna función/vista/índice SQL referencia estos valores.
--   - Ningún supervisor filtra por `estados`.
--   - solicitud_eventos NO se toca: es audit append-only; el código mantiene
--     aliases legacy en ESTADO_LABELS/ESTADO_ESTILOS para renderizar historia.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Expandir el CHECK: viejos + nuevos conviven durante el deploy.
ALTER TABLE solicitudes_servicio
  DROP CONSTRAINT solicitudes_servicio_estado_check;

ALTER TABLE solicitudes_servicio
  ADD CONSTRAINT solicitudes_servicio_estado_check CHECK (estado IN (
    'pendiente',
    'pendiente_horario',
    'sin_agendar',
    'notificada',
    'asignada',
    'diagnostico_pendiente',
    'verificacion_pendiente',      -- legacy (se elimina en contract)
    'aprobacion_paso_pendiente',   -- nuevo
    'pendiente_pricing',
    'cotizacion_enviada',
    'cotizacion_aprobada',
    'cotizacion_rechazada',
    'esperando_repuesto',
    'repuesto_recibido',
    'reagendamiento_pendiente',
    'finalizado_sin_reparacion',
    'cancelada_cliente',           -- legacy (se elimina en contract)
    'reparacion_rechazada',        -- nuevo
    'no_show_cliente',
    'en_proceso',
    'en_verificacion',             -- legacy (se elimina en contract)
    'confirmacion_pendiente',      -- nuevo
    'completada',
    'cancelada',
    'en_disputa'
  ));

-- 2. Renombrar las filas existentes (idempotente).
UPDATE solicitudes_servicio SET estado = 'aprobacion_paso_pendiente' WHERE estado = 'verificacion_pendiente';
UPDATE solicitudes_servicio SET estado = 'confirmacion_pendiente'    WHERE estado = 'en_verificacion';
UPDATE solicitudes_servicio SET estado = 'reparacion_rechazada'      WHERE estado = 'cancelada_cliente';

-- 3. Actualizar el comment de Dapta que citaba el nombre viejo.
COMMENT ON COLUMN llamadas.proposito IS
  'agendar (pendiente_horario), cierre (confirmacion_pendiente), cotizacion (cotizacion_enviada), repuesto (repuesto_recibido), presencia (T-24h/T-2h).';
