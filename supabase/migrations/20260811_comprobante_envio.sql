-- ─────────────────────────────────────────────────────────────────
-- Comprobantes de envío del supervisor (2026-08-11)
-- ─────────────────────────────────────────────────────────────────
-- Nuevo tipo 'comprobante_envio' en solicitud_eventos: el supervisor puede
-- adjuntar comprobantes de envío del repuesto (recibo de la transportadora,
-- pantallazo de tracking, remisión, factura del courier) durante todo el
-- ciclo de repuesto (esperando_repuesto / repuesto_en_camino /
-- repuesto_recibido) — ADEMÁS de la guía única que dispara la transición
-- esperando_repuesto → repuesto_en_camino.
--
-- El evento ES el registro del comprobante (no hay tabla nueva):
--   tipo   = 'comprobante_envio'
--   actor  = 'supervisor'
--   motivo = nota opcional del supervisor
--   payload = { url, nombre_original, mime, subido_por }
--   estado_previo = estado_nuevo = estado de la solicitud al adjuntar
--
-- Quién inserta: POST /api/supervisor/comprobante-envio (service_role; valida
-- portal_token + alcance ambito/marca server-side). El archivo vive en el
-- bucket evidencias-servicio bajo {solicitud_id}/comprobante_envio_*.
-- Quién lee: detalle del portal supervisor (sección Comprobantes + Historial)
-- y la ficha admin (historial consolidado).
--
-- Si esta migración NO se aplica antes del deploy: la subida del comprobante
-- falla con error visible para el supervisor (el endpoint borra el archivo
-- subido y devuelve 500) — el resto del flujo no se afecta.

ALTER TABLE solicitud_eventos
  DROP CONSTRAINT IF EXISTS solicitud_eventos_tipo_check;
ALTER TABLE solicitud_eventos
  ADD CONSTRAINT solicitud_eventos_tipo_check
  CHECK (tipo IN (
    'cancelacion',
    'reagendamiento',
    'reagendamiento_confirmado',
    'cancelacion_revertida',
    'cambio_estado_admin',
    'nota_admin',
    'no_show_cliente',
    'alerta_visita',
    'cliente_bloqueado',
    'cliente_desbloqueado',
    'cambio_estado',
    'llamada_admin',
    'llamada_tecnico',
    'recordatorio_horario',
    -- 'mensaje_cliente' pertenece a 20260807_mensaje_cliente.sql (feature
    -- paralela). Ambas migraciones recrean el MISMO constraint, así que las
    -- dos listas deben ser el superset — si no, la que corra de última borra
    -- el tipo de la otra.
    'mensaje_cliente',
    'comprobante_envio'
  ));

-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'solicitud_eventos'::regclass AND contype = 'c';
--   → una fila con los 16 tipos.
