-- ============================================================
-- Confirmación de visita por el técnico + liberación con reoferta
-- (docs/PROTOCOLO-VISITA.md § "Fase 0", 2026-10-22)
--
-- Qué agrega:
--   solicitudes_servicio
--     visita_confirmada_at / visita_confirmada_por  el técnico (portal), la
--                                                   aceptación reciente (≤36h)
--                                                   o el admin (por llamada)
--                                                   confirmaron la visita.
--     tecnico_liberado_count                        veces que se soltó al
--                                                   técnico (no alcanzo /
--                                                   admin) y se reofertó.
--   tecnicos.agenda_aviso_at                        último envío del
--                                                   recordatorio diario de
--                                                   agenda (idempotencia del
--                                                   cron por día CO).
--   trigger limpiar_confirmacion_visita             si cambia la fecha de la
--                                                   visita o el técnico, la
--                                                   confirmación anterior
--                                                   deja de valer.
--   solicitud_eventos.tipo                          +visita_confirmada
--                                                   +tecnico_liberado
--
-- ⚠️ El CHECK de solicitud_eventos.tipo se recrea como SUPERSET (gotcha
-- 2026-08-07: dos migraciones del mismo período se pisaron). Base: los 18
-- tipos de 20260825_repuesto_recordatorios.sql. Antes de aplicar, confirmar
-- que el vigente sigue siendo ese:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'solicitud_eventos_tipo_check';
--
-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
-- ============================================================

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS visita_confirmada_at   timestamptz,
  ADD COLUMN IF NOT EXISTS visita_confirmada_por  text,
  ADD COLUMN IF NOT EXISTS tecnico_liberado_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.solicitudes_servicio
  DROP CONSTRAINT IF EXISTS solicitudes_visita_confirmada_por_check;
ALTER TABLE public.solicitudes_servicio
  ADD CONSTRAINT solicitudes_visita_confirmada_por_check
  CHECK (visita_confirmada_por IS NULL OR visita_confirmada_por IN ('tecnico', 'aceptacion', 'admin'));

COMMENT ON COLUMN public.solicitudes_servicio.visita_confirmada_at IS
  'El técnico confirmó que va a la visita de fecha_visita_at (portal), o cuenta la aceptación reciente (≤36h) o el admin por llamada. Se limpia sola si cambia la fecha o el técnico (trigger).';
COMMENT ON COLUMN public.solicitudes_servicio.visita_confirmada_por IS
  'tecnico | aceptacion | admin — quién confirmó la visita.';
COMMENT ON COLUMN public.solicitudes_servicio.tecnico_liberado_count IS
  'Veces que se soltó al técnico asignado (No alcanzo / admin) y el servicio volvió a notificada con reoferta.';

-- Visitas con técnico y sin confirmar: lo que barren el recordatorio diario
-- y la alerta al admin.
CREATE INDEX IF NOT EXISTS idx_solicitudes_visita_sin_confirmar
  ON public.solicitudes_servicio (fecha_visita_at)
  WHERE tecnico_asignado_id IS NOT NULL AND visita_confirmada_at IS NULL;

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS agenda_aviso_at timestamptz;
COMMENT ON COLUMN public.tecnicos.agenda_aviso_at IS
  'Último recordatorio diario de agenda enviado (cron /api/cron/agenda-tecnicos). Evita doble envío el mismo día CO.';

-- ------------------------------------------------------------
-- Trigger: si cambia la fecha o el técnico, la confirmación anterior deja
-- de valer. Excepción: el UPDATE que confirma explícitamente en la misma
-- sentencia (la aceptación ≤36h escribe técnico + visita_confirmada_at a la
-- vez; el admin que confirma por llamada no cambia fecha ni técnico).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.limpiar_confirmacion_visita()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.fecha_visita_at IS DISTINCT FROM OLD.fecha_visita_at
      OR NEW.tecnico_asignado_id IS DISTINCT FROM OLD.tecnico_asignado_id)
     AND NEW.visita_confirmada_at IS NOT DISTINCT FROM OLD.visita_confirmada_at THEN
    NEW.visita_confirmada_at  := NULL;
    NEW.visita_confirmada_por := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_limpiar_confirmacion_visita ON public.solicitudes_servicio;
CREATE TRIGGER trg_limpiar_confirmacion_visita
  BEFORE UPDATE ON public.solicitudes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION public.limpiar_confirmacion_visita();

-- ------------------------------------------------------------
-- solicitud_eventos.tipo — superset (18 + 2)
-- ------------------------------------------------------------
ALTER TABLE public.solicitud_eventos DROP CONSTRAINT IF EXISTS solicitud_eventos_tipo_check;
ALTER TABLE public.solicitud_eventos
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
    'comprobante_envio',
    'pago_registrado',
    'recordatorio_repuesto',
    'visita_confirmada',
    'tecnico_liberado'
  ));

-- ============================================================
-- Verificación (correr después de aplicar):
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'solicitudes_servicio'
--      AND column_name IN ('visita_confirmada_at','visita_confirmada_por','tecnico_liberado_count');
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_limpiar_confirmacion_visita';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'solicitud_eventos_tipo_check';
--
-- Prueba del trigger sobre una fila de prueba:
--   (a) UPDATE … SET fecha_visita_at = fecha_visita_at + interval '1 day'
--       con visita_confirmada_at puesto → queda NULL.
--   (b) UPDATE … SET tecnico_asignado_id = '<id>', visita_confirmada_at = now(),
--       visita_confirmada_por = 'aceptacion' → se conserva.
--   (c) UPDATE … SET estado = estado → no toca nada.
-- ============================================================
