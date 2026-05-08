# Supabase migrations — Baird Service

Migraciones del proyecto. **Aplican manualmente** en el SQL editor del dashboard de Supabase (no usamos el CLI). Todas son idempotentes (`IF NOT EXISTS`, `DROP ... IF EXISTS` antes de `CREATE`).

## Orden de aplicación (alfanumérico)

| Archivo | Estado | Qué hace |
|---|---|---|
| `add_solicitud_fields.sql` | base | Tabla principal `solicitudes_servicio` |
| `add_whatsapp_fields.sql` | base | Tabla `notificaciones_whatsapp` |
| `add_verification_fields.sql` / `_safe.sql` | base | Campos de verificación de técnicos |
| `fix_especialidades_table.sql` | base | Tabla `especialidades_tecnico` |
| `20260327_portal_evidencias.sql` | aplicada | Bucket evidencias + portal_token |
| `20260427_customer_first_scheduling.sql` | aplicada | Customer-first flow + repuestos_pendientes + gps_pings |
| `20260428_verificacion_paso.sql` | aplicada | verificación de paso post-diagnóstico |
| **`20260506_cliente_self_service.sql`** | **PENDIENTE** | cliente_token + cancelar/reagendar + solicitud_eventos |
| **`20260507_admin_pricing_gate.sql`** | **PENDIENTE** | estado `pendiente_pricing` + repuestos_pendientes.tiempo_estimado nullable |
| **`20260508_fix_cotizacion_column.sql`** | **PENDIENTE — HOTFIX URGENTE** | Agrega columna faltante `cotizacion JSONB` en solicitudes_servicio (rompía POST /api/diagnostico no-garantía) |

## Cómo aplicar las pendientes

1. Abre Supabase → **SQL Editor** → **New query**
2. Pega el contenido de `20260506_cliente_self_service.sql` y ejecuta. Espera "Success".
3. Pega el contenido de `20260507_admin_pricing_gate.sql` y ejecuta.
4. Pega el contenido de `20260508_fix_cotizacion_column.sql` y ejecuta. **(HOTFIX urgente — sin esto, todo diagnóstico no-garantía falla.)**
5. Corre la verificación de abajo.

> **Importante**: el orden importa. `20260507` espera la columna y constraint reagendados por `20260506`.

## Verificación post-aplicación

Pega esto en el SQL Editor — todas las filas deben devolver `OK`:

```sql
-- 1. Columnas nuevas en solicitudes_servicio
SELECT
  CASE WHEN COUNT(*) = 7 THEN 'OK ✅' ELSE 'FALTA ❌ ' || (7 - COUNT(*))::text END AS check_columnas
FROM information_schema.columns
WHERE table_name = 'solicitudes_servicio'
  AND column_name IN (
    'cliente_token','cancelado_at','cancelado_por','motivo_cancelacion',
    'cancelado_tarde','reagendamientos_count','ultimo_reagendado_at'
  );

-- 2. Estado pendiente_pricing permitido
SELECT
  CASE WHEN check_clause LIKE '%pendiente_pricing%' AND check_clause LIKE '%reagendamiento_pendiente%'
       THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_estado_constraint
FROM information_schema.check_constraints
WHERE constraint_name = 'solicitudes_servicio_estado_check';

-- 3. Tabla solicitud_eventos existe
SELECT
  CASE WHEN COUNT(*) = 1 THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_tabla_eventos
FROM information_schema.tables
WHERE table_name = 'solicitud_eventos';

-- 4. RLS habilitado en solicitud_eventos
SELECT
  CASE WHEN relrowsecurity THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_rls_eventos
FROM pg_class WHERE relname = 'solicitud_eventos';

-- 5. tiempo_estimado nullable
SELECT
  CASE WHEN is_nullable = 'YES' THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_tiempo_nullable
FROM information_schema.columns
WHERE table_name = 'repuestos_pendientes' AND column_name = 'tiempo_estimado';

-- 6. Backfill de cliente_token (no debe haber NULLs)
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'OK ✅'
       ELSE 'FALTA ❌ ' || COUNT(*)::text || ' filas sin cliente_token' END AS check_backfill
FROM solicitudes_servicio
WHERE cliente_token IS NULL;

-- 7. Columna cotizacion existe (HOTFIX 20260508)
SELECT
  CASE WHEN COUNT(*) = 1 THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_cotizacion_column
FROM information_schema.columns
WHERE table_name = 'solicitudes_servicio' AND column_name = 'cotizacion';
```

Si alguna fila vuelve `FALTA ❌`, vuelve a ejecutar la migración correspondiente — son idempotentes.

## Rollback

Las migraciones no traen rollback automático. Si necesitas revertir una columna, hazlo manualmente. **No revertir** mientras haya filas `pendiente_pricing` o `reagendamiento_pendiente` en producción.

## Nota sobre RLS

- Tablas con RLS habilitado: `repuestos_pendientes`, `gps_pings`, `solicitud_eventos`.
- Tablas sin RLS: `solicitudes_servicio`, `tecnicos`, `especialidades_tecnico`, `notificaciones_whatsapp`, `evidencias_servicio`.
- Toda la app usa el `anon_key`. Para producción seria, queda pendiente habilitar RLS en las 5 tablas restantes (ver `improvement-plan.md`).
