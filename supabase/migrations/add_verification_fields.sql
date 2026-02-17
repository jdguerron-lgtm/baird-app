-- Migración: Sistema de Verificación de Técnicos
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar nuevos campos para verificación de identidad
ALTER TABLE tecnicos
ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT 'CC',
ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(50),
ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT,
ADD COLUMN IF NOT EXISTS foto_documento_url TEXT,
ADD COLUMN IF NOT EXISTS estado_verificacion VARCHAR(20) DEFAULT 'pendiente',
ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMP,
ADD COLUMN IF NOT EXISTS nota_verificacion TEXT;

-- 2. Crear índices para mejorar performance de búsquedas
CREATE INDEX IF NOT EXISTS idx_tecnicos_estado_verificacion 
ON tecnicos(estado_verificacion);

CREATE INDEX IF NOT EXISTS idx_tecnicos_numero_documento 
ON tecnicos(numero_documento);

-- 3. Agregar restricción para valores válidos de estado
ALTER TABLE tecnicos 
DROP CONSTRAINT IF EXISTS check_estado_verificacion;

ALTER TABLE tecnicos 
ADD CONSTRAINT check_estado_verificacion 
CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado'));

-- 4. Agregar restricción para tipos de documento válidos
ALTER TABLE tecnicos 
DROP CONSTRAINT IF EXISTS check_tipo_documento;

ALTER TABLE tecnicos 
ADD CONSTRAINT check_tipo_documento 
CHECK (tipo_documento IN ('CC', 'CE', 'TI', 'Pasaporte'));

-- 5. Hacer número de documento único (opcional, comentar si no se desea)
-- ALTER TABLE tecnicos ADD CONSTRAINT unique_numero_documento UNIQUE (numero_documento);

-- Verificar que los cambios se aplicaron correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'tecnicos'
ORDER BY ordinal_position;
