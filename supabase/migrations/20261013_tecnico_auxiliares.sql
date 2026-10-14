-- ============================================================================
-- Equipo de trabajo del técnico: auxiliares (2026-10-13)
--
-- Hay técnicos que van a los servicios acompañados de uno o más auxiliares.
-- El cliente debe saber QUIÉNES van a entrar a su casa, no solo el técnico
-- titular. Modelo:
--
--   1. `tecnico_auxiliares` — el técnico registra a su(s) auxiliar(es) UNA vez
--      desde /tecnico/{token}/equipo (nombre, documento, foto, autorización
--      de datos). Baird los VERIFICA manualmente desde /admin/tecnicos/[id]
--      (decisión 2026-10-13): solo un auxiliar `verificado` y `activo` se
--      muestra al cliente y puede acompañar servicios.
--   2. `solicitudes_servicio.auxiliares_ids` — quién va a ESE servicio.
--      Se llena al aceptar (auxiliares con `acompana_por_defecto`) y el
--      técnico lo ajusta por servicio desde su portal. NULL = nunca se
--      definió (comportamiento previo a esta migración); '{}' = va solo.
--
-- Igual que `agenda_tecnico_bloqueos`: RLS habilitado SIN policies → solo
-- service_role (/api/tecnico/equipo, /api/admin/auxiliares, RSC del portal).
--
-- 100 % ADITIVA. Rollback:
--   ALTER TABLE public.solicitudes_servicio DROP COLUMN IF EXISTS auxiliares_ids;
--   DROP TABLE IF EXISTS public.tecnico_auxiliares;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tecnico_auxiliares (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id            UUID NOT NULL REFERENCES public.tecnicos(id) ON DELETE CASCADE,
  nombre_completo       TEXT NOT NULL CHECK (char_length(nombre_completo) BETWEEN 3 AND 80),
  tipo_documento        TEXT NOT NULL CHECK (tipo_documento IN ('CC', 'CE', 'Pasaporte', 'PPT')),
  numero_documento      TEXT NOT NULL CHECK (char_length(numero_documento) BETWEEN 4 AND 20),
  -- URL pública en el bucket `tecnicos-fotos` (carpeta {tecnico_id}/auxiliares/).
  foto_perfil_url       TEXT NOT NULL,
  whatsapp              TEXT,
  -- Verificación MANUAL de Baird. Solo 'verificado' se muestra al cliente.
  estado_verificacion   TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado')),
  fecha_verificacion    TIMESTAMPTZ,
  verificado_por        TEXT,
  nota_verificacion     TEXT CHECK (nota_verificacion IS NULL OR char_length(nota_verificacion) <= 300),
  -- Se copia a auxiliares_ids al aceptar un servicio (solo si está verificado y activo).
  acompana_por_defecto  BOOLEAN NOT NULL DEFAULT true,
  -- Baja lógica: nunca se borra para que el histórico de servicios lo resuelva.
  activo                BOOLEAN NOT NULL DEFAULT true,
  -- El técnico declara que el auxiliar autorizó compartir nombre, foto y
  -- documento (enmascarado) con Baird y con los clientes (Ley 1581/2012).
  autorizacion_datos_at TIMESTAMPTZ NOT NULL,
  autorizacion_version  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tecnico_auxiliares IS
  'Auxiliares que acompañan al técnico. Los registra el técnico (/tecnico/{token}/equipo); Baird los verifica en /admin/tecnicos/[id]. Solo verificado+activo se muestra al cliente.';
COMMENT ON COLUMN public.tecnico_auxiliares.estado_verificacion IS
  'pendiente (recién registrado o datos cambiados) | verificado (Baird revisó la cédula) | rechazado. Cambiar nombre/documento/foto vuelve a pendiente.';
COMMENT ON COLUMN public.tecnico_auxiliares.acompana_por_defecto IS
  'true = procesarAceptacion lo incluye automáticamente en auxiliares_ids del servicio aceptado.';
COMMENT ON COLUMN public.tecnico_auxiliares.autorizacion_datos_at IS
  'Momento en que el técnico declaró contar con la autorización del auxiliar para compartir sus datos (checkbox obligatorio).';

CREATE INDEX IF NOT EXISTS idx_tecnico_auxiliares_tecnico
  ON public.tecnico_auxiliares (tecnico_id);

-- Un mismo documento no se registra dos veces ACTIVO bajo el mismo técnico.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnico_auxiliares_doc_activo
  ON public.tecnico_auxiliares (tecnico_id, numero_documento)
  WHERE activo;

ALTER TABLE public.tecnico_auxiliares ENABLE ROW LEVEL SECURITY;
-- Sin policies: anon/authenticated no ven ni escriben nada; service_role bypassa.

-- Equipo por servicio.
ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS auxiliares_ids UUID[];

COMMENT ON COLUMN public.solicitudes_servicio.auxiliares_ids IS
  'Auxiliares (tecnico_auxiliares.id) que acompañan al técnico en ESTE servicio. NULL = nunca definido; {} = el técnico va solo. Lo fija procesarAceptacion y lo ajusta el técnico (PATCH /api/tecnico/equipo-servicio).';

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'tecnico_auxiliares';  -- true
--   SELECT count(*) FROM pg_policies WHERE tablename = 'tecnico_auxiliares';   -- 0
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'solicitudes_servicio' AND column_name = 'auxiliares_ids';
