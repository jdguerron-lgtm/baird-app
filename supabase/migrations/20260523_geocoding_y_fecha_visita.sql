-- ============================================================================
-- Geocoding de direcciones + fecha de visita estructurada
-- ============================================================================
--
-- Soporta la feature /admin/mapa (mapa-admin) y desbloquea filtros por día.
--
-- Columnas nuevas en solicitudes_servicio:
--   direccion_lat double precision                      -- latitud geocodificada
--   direccion_lng double precision                      -- longitud geocodificada
--   direccion_geocodificada_at timestamptz              -- cuándo se hizo el geocoding
--   direccion_geocoding_aproximada boolean default false
--                  -- true = falló el geocoding y se cayó al centro de la ciudad
--                  --        (badge "ubicación aproximada" en el mapa)
--   fecha_visita_at timestamptz
--                  -- parsed desde horario_confirmado al confirmar horario.
--                  -- Sirve a /admin/mapa (filtro por día) y a cualquier otro
--                  -- lugar que hoy parsee el texto a mano.
--                  -- NULL hasta que el cliente confirma horario.
--
-- IDEMPOTENTE — `IF NOT EXISTS` en cada ADD COLUMN.
-- ============================================================================

ALTER TABLE public.solicitudes_servicio
  ADD COLUMN IF NOT EXISTS direccion_lat              double precision,
  ADD COLUMN IF NOT EXISTS direccion_lng              double precision,
  ADD COLUMN IF NOT EXISTS direccion_geocodificada_at timestamptz,
  ADD COLUMN IF NOT EXISTS direccion_geocoding_aproximada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_visita_at            timestamptz;

COMMENT ON COLUMN public.solicitudes_servicio.direccion_lat IS
  'Latitud geocodificada de direccion. NULL = aún no se ha intentado o falló sin fallback.';

COMMENT ON COLUMN public.solicitudes_servicio.direccion_lng IS
  'Longitud geocodificada de direccion. NULL = aún no se ha intentado o falló sin fallback.';

COMMENT ON COLUMN public.solicitudes_servicio.direccion_geocodificada_at IS
  'Cuándo se hizo el último intento de geocoding (exitoso o no).';

COMMENT ON COLUMN public.solicitudes_servicio.direccion_geocoding_aproximada IS
  'true cuando la direccion no se pudo geocodificar exactamente y se cayó al centro de la ciudad. El mapa debe mostrar badge "ubicación aproximada".';

COMMENT ON COLUMN public.solicitudes_servicio.fecha_visita_at IS
  'Fecha+hora de inicio de la visita acordada. Parseada desde horario_confirmado (texto libre) al confirmar horario. NULL hasta confirmación. Usada por /admin/mapa para filtrar por día.';

-- ─── Índice espacial sobre lat/lng (helpful para queries del mapa por bounding box) ───
-- Solo crea entries para filas con coords no nulas → eficiente.
-- Sin PostGIS — un índice btree compuesto basta para los queries del mapa
-- que usan bounding box (lat BETWEEN x AND y AND lng BETWEEN a AND b).
CREATE INDEX IF NOT EXISTS idx_solicitudes_direccion_coords
  ON public.solicitudes_servicio (direccion_lat, direccion_lng)
  WHERE direccion_lat IS NOT NULL AND direccion_lng IS NOT NULL;

COMMENT ON INDEX public.idx_solicitudes_direccion_coords IS
  'Índice parcial sobre coordenadas no nulas. Acelera queries del mapa por bounding box.';

-- ─── Índice sobre fecha_visita_at para filtro por día ───
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha_visita_at
  ON public.solicitudes_servicio (fecha_visita_at DESC NULLS LAST)
  WHERE fecha_visita_at IS NOT NULL;

COMMENT ON INDEX public.idx_solicitudes_fecha_visita_at IS
  'Índice parcial sobre fecha de visita confirmada. Acelera filtros por día/rango en /admin/mapa.';
