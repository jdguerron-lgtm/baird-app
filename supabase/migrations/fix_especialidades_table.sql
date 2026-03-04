-- =========================================
-- FIX CONSOLIDADO — Todas las tablas
-- Ejecutar en Supabase SQL Editor
-- =========================================

-- ═══════════════════════════════════════════
-- PARTE 1: tecnicos — quitar FK a auth.users
-- ═══════════════════════════════════════════

-- El formulario de registro no crea auth users, asi que la FK impide el INSERT.
-- Quitar la FK y agregar default gen_random_uuid() para que el INSERT funcione.

ALTER TABLE tecnicos DROP CONSTRAINT IF EXISTS tecnicos_id_fkey;

ALTER TABLE tecnicos ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ═══════════════════════════════════════════
-- PARTE 2: tecnicos — zonas nullable
-- ═══════════════════════════════════════════

-- El formulario no envia zonas. Hacerla nullable con default vacio.
ALTER TABLE tecnicos ALTER COLUMN zonas DROP NOT NULL;
ALTER TABLE tecnicos ALTER COLUMN zonas SET DEFAULT '{}';

-- ═══════════════════════════════════════════
-- PARTE 3: tecnicos — columnas de verificacion
-- ═══════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='tipo_documento') THEN
        ALTER TABLE tecnicos ADD COLUMN tipo_documento VARCHAR(20) DEFAULT 'CC';
        RAISE NOTICE 'tipo_documento agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='numero_documento') THEN
        ALTER TABLE tecnicos ADD COLUMN numero_documento VARCHAR(50);
        RAISE NOTICE 'numero_documento agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='foto_perfil_url') THEN
        ALTER TABLE tecnicos ADD COLUMN foto_perfil_url TEXT;
        RAISE NOTICE 'foto_perfil_url agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='foto_documento_url') THEN
        ALTER TABLE tecnicos ADD COLUMN foto_documento_url TEXT;
        RAISE NOTICE 'foto_documento_url agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='estado_verificacion') THEN
        ALTER TABLE tecnicos ADD COLUMN estado_verificacion VARCHAR(20) DEFAULT 'pendiente';
        RAISE NOTICE 'estado_verificacion agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='fecha_verificacion') THEN
        ALTER TABLE tecnicos ADD COLUMN fecha_verificacion TIMESTAMP;
        RAISE NOTICE 'fecha_verificacion agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tecnicos' AND column_name='nota_verificacion') THEN
        ALTER TABLE tecnicos ADD COLUMN nota_verificacion TEXT;
        RAISE NOTICE 'nota_verificacion agregada';
    END IF;
END $$;

-- Constraints de verificacion
ALTER TABLE tecnicos DROP CONSTRAINT IF EXISTS check_estado_verificacion;
ALTER TABLE tecnicos ADD CONSTRAINT check_estado_verificacion
  CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado'));

-- Indices
CREATE INDEX IF NOT EXISTS idx_tecnicos_estado_verificacion ON tecnicos(estado_verificacion);
CREATE INDEX IF NOT EXISTS idx_tecnicos_numero_documento ON tecnicos(numero_documento);

-- ═══════════════════════════════════════════
-- PARTE 4: especialidades_tecnico — fix columnas
-- ═══════════════════════════════════════════

-- Renombrar tipo_electrodomestico → especialidad
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='especialidades_tecnico' AND column_name='tipo_electrodomestico'
    ) THEN
        ALTER TABLE especialidades_tecnico RENAME COLUMN tipo_electrodomestico TO especialidad;
        RAISE NOTICE 'tipo_electrodomestico renombrada a especialidad';
    END IF;
END $$;

-- Eliminar marca (NOT NULL, el codigo no la usa → bloquea inserts)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='especialidades_tecnico' AND column_name='marca'
    ) THEN
        ALTER TABLE especialidades_tecnico DROP COLUMN marca;
        RAISE NOTICE 'columna marca eliminada';
    END IF;
END $$;

-- Eliminar es_autorizado (el codigo no la usa)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='especialidades_tecnico' AND column_name='es_autorizado'
    ) THEN
        ALTER TABLE especialidades_tecnico DROP COLUMN es_autorizado;
        RAISE NOTICE 'columna es_autorizado eliminada';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_especialidades_tecnico_especialidad ON especialidades_tecnico(especialidad);
CREATE INDEX IF NOT EXISTS idx_especialidades_tecnico_tecnico_id ON especialidades_tecnico(tecnico_id);

-- ═══════════════════════════════════════════
-- VERIFICACION: estructura final
-- ═══════════════════════════════════════════

SELECT 'TECNICOS' AS tabla, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'tecnicos'
ORDER BY ordinal_position;

SELECT 'ESPECIALIDADES' AS tabla, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'especialidades_tecnico'
ORDER BY ordinal_position;
