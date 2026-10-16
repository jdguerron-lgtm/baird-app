-- ============================================================================
-- Técnico de preferencia elegido por el cliente (2026-10-15)
--
-- El cliente puede, OPCIONALMENTE, elegir en /solicitar a uno de los técnicos
-- verificados que cubren su ciudad y tipo de equipo. La primera oferta de la
-- solicitud se envía SOLO a ese técnico; si no acepta, el admin reenvía la
-- oferta desde el panel y llega a todos como siempre.
--
-- No todos los técnicos verificados se ofrecen al público: `visible_para_cliente`
-- (default true) permite ocultar perfiles internos del selector sin tocar su
-- verificación ni el matching normal (siguen recibiendo ofertas abiertas).
--
-- 100 % ADITIVA: columnas nuevas con default / nullable. Sin preferencia el
-- sistema se comporta exactamente igual que antes.
--
-- Rollback:
--   ALTER TABLE solicitudes_servicio DROP COLUMN IF EXISTS tecnico_preferido_id;
--   ALTER TABLE tecnicos DROP COLUMN IF EXISTS visible_para_cliente;
-- ============================================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS visible_para_cliente boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tecnicos.visible_para_cliente IS
  'Si aparece en el selector "técnico de preferencia" de /solicitar. false = perfil interno (no se ofrece al público, pero sigue recibiendo ofertas abiertas).';

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS tecnico_preferido_id uuid REFERENCES public.tecnicos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.solicitudes_servicio.tecnico_preferido_id IS
  'Técnico elegido por el cliente en el formulario (opcional). La primera oferta (notificados_at IS NULL) va solo a él; los reenvíos van a todos.';

CREATE INDEX IF NOT EXISTS idx_solicitudes_tecnico_preferido
  ON public.solicitudes_servicio (tecnico_preferido_id)
  WHERE tecnico_preferido_id IS NOT NULL;

-- Perfiles internos que NO se ofrecen al público (decisión 2026-10-15):
-- Henry Mosquera y Juan David Guerrón. Siguen verificados y siguen recibiendo
-- las ofertas abiertas; solo no salen en el selector del cliente.
UPDATE public.tecnicos
   SET visible_para_cliente = false
 WHERE id IN (
   'd01a1ae6-5419-496c-933e-6ee250ef00c3', -- Henry Mosquera
   '61553250-ac43-405e-aa03-d6b8e52652fa'  -- Juan David Guerrón
 );

-- PostgREST: reconocer las columnas de inmediato (evita PGRST204).
NOTIFY pgrst, 'reload schema';
