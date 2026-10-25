-- 2026-10-24 — Origen del lead (atribución) en cada solicitud
--
-- Qué: columna `solicitudes_servicio.origen jsonb` con de dónde vino el
-- cliente que envió /solicitar. La arma el navegador al llegar al sitio
-- (src/lib/analytics/atribucion.ts) y la valida/clasifica /api/solicitar
-- (src/lib/validations/origen.schema.ts). Forma:
--
--   {
--     "v": 1,
--     "canal": "google_ads",            -- último toque no directo (el acreditado)
--     "canal_primera": "organico_buscador",
--     "primera": { "ts": "...", "landing": "/servicios/...", "referrer": "www.google.com" },
--     "ultima":  { "ts": "...", "landing": "/", "gclid": "...", "utm_source": "google", ... }
--   }
--
-- canal ∈ google_ads | meta_ads | pago_otro | campana | organico_buscador |
--         social | whatsapp | referido | directo
--
-- Sin datos personales: del referrer solo se guarda el dominio. NULL = sin
-- origen (solicitud creada antes de esta columna, carga masiva, admin, o
-- navegador sin localStorage).
--
-- Si se despliega el código ANTES de aplicar esto: /api/solicitar recibe
-- PGRST204 y reintenta el insert sin `origen` (el lead NO se pierde, solo la
-- atribución). Aplicar cuanto antes para no perder datos.
--
-- Consulta útil:
--   SELECT origen->>'canal' AS canal, count(*) AS leads,
--          count(*) FILTER (WHERE estado = 'completada') AS completadas
--   FROM solicitudes_servicio
--   WHERE NOT es_garantia AND origen IS NOT NULL
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- Aditiva e idempotente. Rollback:
--   ALTER TABLE public.solicitudes_servicio DROP COLUMN IF EXISTS origen;

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS origen jsonb;

COMMENT ON COLUMN public.solicitudes_servicio.origen IS
  'Atribución del lead (2026-10-24): canal clasificado + primer y último toque (gclid, utm_*, dominio referrer, landing). Lo escribe /api/solicitar. Ver src/lib/analytics/atribucion.ts.';

-- Que PostgREST vea la columna nueva sin esperar al refresco del schema cache.
NOTIFY pgrst, 'reload schema';
