-- =========================================
-- MIGRACIÓN: Agregar campos a solicitudes_servicio
-- Fecha: 2026-02-17
-- Descripción: Agrega numero_serie_factura (crítico) y campos opcionales de triaje
-- =========================================

-- PASO 1: Agregar numero_serie_factura si no existe (CRÍTICO)
-- Este campo es necesario para guardar el número de serie o factura cuando es garantía
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='solicitudes_servicio'
        AND column_name='numero_serie_factura'
    ) THEN
        ALTER TABLE solicitudes_servicio
        ADD COLUMN numero_serie_factura VARCHAR(100);

        RAISE NOTICE 'Campo numero_serie_factura agregado exitosamente';
    ELSE
        RAISE NOTICE 'Campo numero_serie_factura ya existe';
    END IF;
END $$;

-- PASO 2: Crear índice para búsquedas de garantía
-- Mejora el rendimiento al buscar solicitudes de garantía
CREATE INDEX IF NOT EXISTS idx_solicitudes_numero_serie
ON solicitudes_servicio(numero_serie_factura)
WHERE numero_serie_factura IS NOT NULL;

-- PASO 3: Agregar campos de triaje (OPCIONALES - para analytics futuros)
-- Estos campos permiten guardar los resultados del análisis de IA
-- Descomentar el bloque completo si quieres habilitar estos campos

/*
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='solicitudes_servicio'
        AND column_name='triaje_posible_falla'
    ) THEN
        ALTER TABLE solicitudes_servicio
        ADD COLUMN triaje_posible_falla TEXT,
        ADD COLUMN triaje_nivel_complejidad VARCHAR(10) CHECK (triaje_nivel_complejidad IN ('baja', 'media', 'alta')),
        ADD COLUMN triaje_tiempo_estimado_horas DECIMAL(4,1),
        ADD COLUMN triaje_costo_estimado_min INTEGER,
        ADD COLUMN triaje_costo_estimado_max INTEGER,
        ADD COLUMN triaje_urgencia VARCHAR(10) CHECK (triaje_urgencia IN ('baja', 'media', 'alta')),
        ADD COLUMN triaje_realizado_at TIMESTAMP WITH TIME ZONE;

        RAISE NOTICE 'Campos de triaje agregados exitosamente';
    ELSE
        RAISE NOTICE 'Campos de triaje ya existen';
    END IF;
END $$;

-- Índice para filtrar por urgencia de triaje
CREATE INDEX IF NOT EXISTS idx_solicitudes_triaje_urgencia
ON solicitudes_servicio(triaje_urgencia)
WHERE triaje_urgencia IS NOT NULL;

-- Índice para filtrar por complejidad de triaje
CREATE INDEX IF NOT EXISTS idx_solicitudes_triaje_complejidad
ON solicitudes_servicio(triaje_nivel_complejidad)
WHERE triaje_nivel_complejidad IS NOT NULL;
*/

-- =========================================
-- FIN DE LA MIGRACIÓN
-- =========================================
