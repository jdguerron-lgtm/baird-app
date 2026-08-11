-- ─────────────────────────────────────────────────────────────────
-- Tipo 'mensaje_cliente' en solicitud_eventos (2026-08-07, parte 2)
-- ─────────────────────────────────────────────────────────────────
-- Registro del protocolo de contacto: cada WhatsApp enviado al CLIENTE para
-- que reserve y confirme su servicio queda en el audit log:
--   tipo    = 'mensaje_cliente'
--   actor   = 'sistema'
--   motivo  = descripción legible ("Se envió al cliente el link para reservar…")
--   payload = { plantilla, canal: 'whatsapp' }
--
-- Quién inserta: registrarMensajeCliente() en whatsapp.service.ts, llamado
-- best-effort tras cada envío exitoso de: cliente_seleccion_horario_v2,
-- tecnico_asignado_cliente_v6 / tecnico_asignado_particular_v1,
-- pago_anticipo_cliente_v1, horario_confirmado_cliente_v1,
-- repuesto_en_camino_cliente_v1 / repuesto_recibido_cliente_v2,
-- solicitud_expirada_cliente_v1 y el texto libre de reprogramación admin.
-- (Los recordatorios de agendamiento ya se registran como tipo
-- 'recordatorio_horario' desde la parte 1.)
--
-- Quién lee: historial consolidado en /admin/solicitudes/[id] y la sección
-- "Protocolo de contacto" de la ficha del supervisor (/api/supervisor/solicitud).

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
    'mensaje_cliente',
    -- 'comprobante_envio' pertenece a 20260811_comprobante_envio.sql (feature
    -- paralela del mismo día). Ambas migraciones recrean el MISMO constraint,
    -- así que las dos listas deben ser el superset — si no, la que corra de
    -- última borra el tipo de la otra (pasó en prod el 2026-08-11 y se
    -- corrigió con el consolidado).
    'comprobante_envio'
  ));

-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'solicitud_eventos'::regclass AND contype = 'c';
--   → una fila con los 16 tipos.
