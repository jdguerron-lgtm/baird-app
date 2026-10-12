-- ============================================================
-- 20261011_agenda_tecnico_bloqueos.sql
-- ------------------------------------------------------------
-- Agenda del técnico: compromisos FUERA de la plataforma.
--
-- El técnico, desde /tecnico/{token}/agenda, registra sus servicios
-- externos (otros clientes, taller, personal) por día + franja para
-- organizarse junto a los servicios Baird que va aceptando. Cada
-- bloqueo cuenta contra el cupo por técnico (3 por franja desde
-- 2026-10-11, MAX_SERVICIOS_TECNICO_POR_FRANJA) en
-- tecnicoOcupadoEnSlot(); `bloquea_franja = true` cierra la franja
-- completa sin importar el conteo.
--
-- Solo la toca el server con service_role (/api/tecnico/agenda,
-- agenda.service). Nace con RLS habilitado y SIN policies anon,
-- igual que `pagos` / `supervisores` (RLS Fase 4.1).
--
-- Aditiva e idempotente. Rollback:
--   drop table if exists public.agenda_tecnico_bloqueos;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agenda_tecnico_bloqueos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id      UUID NOT NULL REFERENCES public.tecnicos(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  franja          TEXT NOT NULL CHECK (franja IN ('8am-12pm', '12pm-3pm', '3pm-6pm', '6pm-8pm')),
  titulo          TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 80),
  nota            TEXT CHECK (nota IS NULL OR char_length(nota) <= 300),
  bloquea_franja  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agenda_tecnico_bloqueos IS
  'Compromisos del técnico fuera de Baird por día + franja. Cuentan contra el cupo por técnico al aceptar servicios.';
COMMENT ON COLUMN public.agenda_tecnico_bloqueos.franja IS
  'Valor de FRANJAS_HORARIO (src/lib/constants/franjas.ts).';
COMMENT ON COLUMN public.agenda_tecnico_bloqueos.bloquea_franja IS
  'true = la franja queda cerrada para servicios Baird aunque el conteo no llegue al cupo.';

CREATE INDEX IF NOT EXISTS idx_agenda_tecnico_bloqueos_tecnico_fecha
  ON public.agenda_tecnico_bloqueos (tecnico_id, fecha);

ALTER TABLE public.agenda_tecnico_bloqueos ENABLE ROW LEVEL SECURITY;
-- Sin policies: anon/authenticated no ven ni escriben nada; service_role bypassa.

NOTIFY pgrst, 'reload schema';
