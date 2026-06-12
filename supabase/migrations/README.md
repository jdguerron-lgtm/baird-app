# Supabase migrations — Baird Service

Migraciones del proyecto. **Aplican manualmente** en el SQL editor del dashboard de Supabase (no usamos el CLI). Todas son idempotentes (`IF NOT EXISTS`, `DROP ... IF EXISTS` antes de `CREATE`).

> 🧭 **Ver también**:
> - `docs/INDEX.md` — hub de navegación. Tabla "¿qué doc abro para...?".
> - `CLAUDE.md` § "Supabase Architecture" — RLS, storage, atomic update pattern.
> - `docs/FLOWS.md` § "Verificación detallada del flujo" — qué cambia en estado en cada paso.

## Orden de aplicación (alfanumérico)

> ✅ **Verificado 2026-05-21 contra producción:** todas las migraciones de
> schema hasta `20260516` están **aplicadas**. Los estados "PENDIENTE" de la
> tabla de abajo y la sección "Cómo aplicar las pendientes" quedaron
> desactualizados — **NO re-corras esas migraciones** (algunas tienen backfills).
> Pendientes reales hoy (2026-05-29):
> - `20260521_storage_policies_public_role.sql` — va por el **Dashboard de Storage**, no por SQL.
> - `20260529_supervisores_y_repuesto_recibido.sql` — va por **SQL Editor**. Ver
>   sección dedicada ["Aplicar 20260529"](#aplicar-20260529_supervisores_y_repuesto_recibidosql-pendiente-real)
>   más abajo y el plan de despliegue en
>   `docs/mejoras-futuras/supervisores-y-repuesto-recibido/plan-despliegue-2026-05-29.md`.

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
| **`20260508_fix_tecnicos_columns.sql`** | **PENDIENTE — HOTFIX URGENTE** | Agrega `acepta_garantias` + `especialidad_principal` en tecnicos (rompía registro de técnicos). Incluye backfill desde especialidades_tecnico |
| **`20260508_fix_completado_at_default.sql`** | **PENDIENTE — HOTFIX URGENTE** | Drop DEFAULT NOW() de evidencias_servicio.completado_at + backfill rows mal seteadas (rompía botón "Completar servicio" tras diagnóstico) |
| **`20260510_no_show_protocolo.sql`** | **PENDIENTE** | Estado terminal `no_show_cliente`, columna `evidencia_no_show` JSONB, columnas auditoría de tarifa MABE (cumple_ta, cumple_encuesta, dias_solucion_efectivos, pago_tecnico_total, margen_baird, recargo_weekend_aplicado), tabla nueva `cliente_historial`, tipos extra en `solicitud_eventos`. Ver `docs/PROTOCOLO-VISITA.md` y `docs/TARIFAS.md` |
| **`20260513_normalizar_telefonos.sql`** | **PENDIENTE** | Función `normalizar_telefono_co()` + triggers BEFORE INSERT/UPDATE en `tecnicos.whatsapp` y `solicitudes_servicio.cliente_telefono`. Backfill: normaliza datos existentes a dígitos puros con prefijo 57 (strip `+`, espacios, guiones, pipe). Resuelve "técnico no recibe WhatsApp porque `whatsapp` quedó con +57" |
| **`20260513_tracking_ta.sql`** | **PENDIENTE** | Columnas `diagnosticado_at timestamptz` + `cumple_ta boolean` en `solicitudes_servicio`, con índices. Backfill desde `triaje_resultado` JSONB. Habilita tracking del SLA 24h y filtros admin por TA |
| `20260516_perf_fk_index_rls.sql` | aplicada (2026-05-16) | Mejoras de performance del advisor de Supabase: (a) índice FK `idx_solicitudes_tecnico_asignado` para `solicitudes_servicio.tecnico_asignado_id`, (b) wrap `auth.role()` en `(SELECT auth.role())` para las policies `service_role_all_*` (RLS initplan, 1 evaluación por query en vez de por fila), (c) re-scope `service_role_all_{gps,repuestos,eventos}` de role `{public}` → `{service_role}` para eliminar superposición con policies `anon_*` (multiple permissive), (d) drop policy duplicada `"Allow public update evidencias"` en `evidencias_servicio`. Aplicada vía MCP — ya no aparece en pendientes |
| **`20260521_storage_policies_public_role.sql`** | **PENDIENTE — aplicar vía Dashboard** | Fix RLS Storage: amplía las policies de los buckets `evidencias-servicio`, `tecnicos-fotos` y `tecnicos-documentos` de role `{anon}` → `public`. Resuelve `new row violates row-level security policy` al subir evidencia desde el portal del técnico cuando el navegador tiene una sesión de admin activa (rol `authenticated` no matcheaba las policies `{anon}`). **NO se puede correr en el SQL Editor** — `postgres` no es dueño de `storage.objects`. Aplicar vía Dashboard → Storage → Policies (ver cabecera del archivo) |
| **`20260529_supervisores_y_repuesto_recibido.sql`** | **PENDIENTE — aplicar vía SQL Editor** | (1) Tabla nueva `supervisores` (destinatarios WhatsApp por cambio de estado; filtrable por ámbito `todos`/`garantia`/`particular`, `marca`, subconjunto de `estados[]`) con RLS + 4 policies anon CRUD + service_role + trigger de normalización de teléfono. (2) Estado nuevo `repuesto_recibido` en el CHECK constraint de `solicitudes_servicio.estado` (22 estados). (3) Columnas `reprogramacion_token uuid` + `repuesto_recibido_at timestamptz` + sus índices parciales. Idempotente. **No tiene backfill** — segura de re-correr. Ver sección dedicada abajo + `docs/MAQUINA-DE-ESTADOS.md` §4b/4c y §Supervisores |
| `20260602_dapta_llamadas.sql` | aplicada vía MCP (2026-06-12) | Segunda línea de voz IA (Dapta). (1) Tabla nueva `llamadas` (un intento por fila; auditoría + idempotencia del webhook por `dapta_call_id` vía índice UNIQUE parcial) con RLS + 4 policies anon CRUD + service_role. (2) Columnas en `solicitudes_servicio`: `llamada_intentos int DEFAULT 0`, `ultima_llamada_at timestamptz` (cerrojo de cooldown), `requiere_confirmacion_llamada boolean DEFAULT false`. **No toca** el CHECK de `estado` ni el enum `solicitud_eventos.tipo`. Idempotente. **No tiene backfill** — segura de re-correr. La Fase 2 (cierre + encuesta) además requiere la columna `cumple_encuesta` que vive en `20260510_no_show_protocolo.sql`. Ver `docs/DAPTA.md` |
| `20260609_tecnicos_ciudades_cobertura.sql` | aplicada vía MCP (2026-06-12) — backfill OK (13 técnicos) | Multi-ciudad por técnico: columna nueva `ciudades_cobertura text[]` (NOT NULL DEFAULT `'{}'`) en `tecnicos` + backfill `ARRAY[ciudad_pueblo]` para técnicos existentes. El matching de `notificarTecnicos` ahora compara la solicitud contra TODAS las ciudades de cobertura (fallback a `ciudad_pueblo`). Editable desde `/admin/tecnicos/[id]`. Idempotente; backfill seguro de re-correr (solo toca filas con cobertura vacía). Ver `docs/SUPABASE.md` |
| `20260612_evento_cambio_estado.sql` | aplicada vía MCP (2026-06-12) — verificado: queda UN solo CHECK con 11 tipos | Historial de estados: agrega tipo `cambio_estado` al CHECK de `solicitud_eventos.tipo` (lo inserta `notificarCambioEstado()` en cada transición, con actor inferido cliente/tecnico/admin/sistema; lo muestra "Historial de estados" en `/admin/solicitudes/[id]`). **Fix incluido**: dropea el constraint viejo `chk_evento_tipo` (de `20260506`) que `20260510` no reemplazó por usar otro nombre — sin este fix, los tipos de no-show y `cambio_estado` violan el CHECK viejo aunque `20260510` esté aplicada. Idempotente, sin backfill. Si el código se deploya antes de aplicarla, las transiciones NO se rompen (insert best-effort) — solo no se llena el historial |

> **Nota 2026-06-12**: al aplicar `20260612` se verificó contra la BD real que los
> constraints de `20260506` Y `20260510` ya existían (ambos CHECK activos a la vez —
> bug corregido por `20260612`). Es decir: varias filas marcadas **PENDIENTE** arriba
> probablemente ya fueron aplicadas y el doc quedó desactualizado. Antes de re-aplicar
> una "pendiente", verificar contra la BD (`information_schema`) — todas son
> idempotentes, pero conviene saber el estado real.

## Cómo aplicar las pendientes

1. Abre Supabase → **SQL Editor** → **New query**
2. Pega el contenido de `20260506_cliente_self_service.sql` y ejecuta. Espera "Success".
3. Pega el contenido de `20260507_admin_pricing_gate.sql` y ejecuta.
4. Pega el contenido de `20260508_fix_cotizacion_column.sql` y ejecuta. **(HOTFIX urgente — sin esto, todo diagnóstico no-garantía falla.)**
5. Pega el contenido de `20260508_fix_tecnicos_columns.sql` y ejecuta. **(HOTFIX urgente — sin esto, el registro de técnicos falla.)**
6. Pega el contenido de `20260508_fix_completado_at_default.sql` y ejecuta. **(HOTFIX urgente — sin esto, el técnico no puede completar servicios tras hacer diagnóstico.)**
7. Pega el contenido de `20260510_no_show_protocolo.sql` y ejecuta. (No es hotfix urgente; sin esto, el protocolo de visita queda en modo manual y la auditoría detallada de tarifas no se persiste.)
8. Pega el contenido de `20260513_normalizar_telefonos.sql` y ejecuta. (No es hotfix urgente, pero recomendado: limpia inconsistencias de `+57`, espacios y formato pipe que pueden hacer que WhatsApp no llegue.)
9. Corre la verificación de abajo.

> **Importante**: el orden importa. `20260507` espera la columna y constraint reagendados por `20260506`. `20260510` extiende el CHECK constraint de `solicitud_eventos` y `solicitudes_servicio.estado` reemplazándolos completos — debe ir después de `20260507`.

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

-- 8. Columnas tecnicos existen (HOTFIX 20260508)
SELECT
  CASE WHEN COUNT(*) = 2 THEN 'OK ✅' ELSE 'FALTA ❌ ' || (2 - COUNT(*))::text END AS check_tecnicos_columns
FROM information_schema.columns
WHERE table_name = 'tecnicos'
  AND column_name IN ('acepta_garantias', 'especialidad_principal');

-- 9. completado_at YA NO tiene DEFAULT NOW() (HOTFIX 20260508)
SELECT
  CASE WHEN column_default IS NULL THEN 'OK ✅'
       ELSE 'FALTA ❌ default todavía es: ' || column_default END AS check_completado_at_default
FROM information_schema.columns
WHERE table_name = 'evidencias_servicio' AND column_name = 'completado_at';

-- 10. Backfill de completado_at: filas activas no deben tener completado_at
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'OK ✅'
       ELSE 'INVESTIGAR: ' || COUNT(*)::text || ' filas activas con completado_at seteado' END
       AS check_completado_at_backfill
FROM evidencias_servicio e
JOIN solicitudes_servicio s ON s.id = e.solicitud_id
WHERE e.completado_at IS NOT NULL
  AND e.firma_url IS NULL
  AND (e.fotos IS NULL OR array_length(e.fotos, 1) IS NULL)
  AND s.estado IN ('asignada','diagnostico_pendiente','pendiente_pricing',
                   'verificacion_pendiente','cotizacion_enviada','cotizacion_aprobada',
                   'esperando_repuesto','reagendamiento_pendiente','en_proceso');
```

Si alguna fila vuelve `FALTA ❌`, vuelve a ejecutar la migración correspondiente — son idempotentes.

## Aplicar `20260529_supervisores_y_repuesto_recibido.sql` (pendiente real)

> Esta es la única migración SQL realmente pendiente a 2026-05-29. **No tiene
> backfill ni dependencias de orden** con las anteriores (solo asume que
> `normalizar_telefono_co()` ya existe — creada por `20260513_normalizar_telefonos.sql`,
> ya aplicada). Es 100% idempotente: segura de re-correr.

1. Abre Supabase → **SQL Editor** → **New query**.
2. Pega el contenido completo de `20260529_supervisores_y_repuesto_recibido.sql` y ejecuta. Espera "Success".
3. Corre la verificación de abajo (debe devolver todo `OK ✅`).
4. **Antes de tocar producción**, lee el plan de despliegue completo en
   `docs/mejoras-futuras/supervisores-y-repuesto-recibido/plan-despliegue-2026-05-29.md`
   — incluye el orden migración → plantillas Meta → deploy y la decisión de
   producto pendiente (¿notificar a supervisores en la *creación* de solicitudes?).

### Verificación de `20260529`

```sql
-- 1. Tabla supervisores existe
SELECT
  CASE WHEN COUNT(*) = 1 THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_tabla_supervisores
FROM information_schema.tables
WHERE table_name = 'supervisores';

-- 2. RLS habilitado en supervisores
SELECT
  CASE WHEN relrowsecurity THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_rls_supervisores
FROM pg_class WHERE relname = 'supervisores';

-- 3. Las 5 policies de supervisores existen (4 anon CRUD + service_role)
SELECT
  CASE WHEN COUNT(*) = 5 THEN 'OK ✅' ELSE 'FALTA ❌ ' || COUNT(*)::text || '/5' END AS check_policies_supervisores
FROM pg_policies
WHERE tablename = 'supervisores';

-- 4. Trigger de normalización de teléfono existe
SELECT
  CASE WHEN COUNT(*) = 1 THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_trigger_supervisor
FROM pg_trigger
WHERE tgname = 'normalizar_whatsapp_supervisor';

-- 5. Estado repuesto_recibido permitido en el CHECK constraint
SELECT
  CASE WHEN check_clause LIKE '%repuesto_recibido%' THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_estado_repuesto_recibido
FROM information_schema.check_constraints
WHERE constraint_name = 'solicitudes_servicio_estado_check';

-- 6. Columnas nuevas en solicitudes_servicio
SELECT
  CASE WHEN COUNT(*) = 2 THEN 'OK ✅' ELSE 'FALTA ❌ ' || (2 - COUNT(*))::text END AS check_columnas_reprogramacion
FROM information_schema.columns
WHERE table_name = 'solicitudes_servicio'
  AND column_name IN ('reprogramacion_token', 'repuesto_recibido_at');

-- 7. Índices nuevos existen
SELECT
  CASE WHEN COUNT(*) = 3 THEN 'OK ✅' ELSE 'FALTA ❌ ' || COUNT(*)::text || '/3' END AS check_indices
FROM pg_indexes
WHERE indexname IN (
  'idx_supervisores_activo',
  'idx_solicitudes_reprogramacion_token',
  'idx_solicitudes_repuesto_recibido'
);
```

## Aplicar `20260609_tecnicos_ciudades_cobertura.sql` (multi-ciudad por técnico)

> Idempotente y con backfill seguro (solo setea `ciudades_cobertura` donde está
> vacío). No depende de otras migraciones. Sin esto, el editor de ciudades en
> `/admin/tecnicos/[id]` falla al guardar (la columna no existe) y el matching
> cae al fallback de `ciudad_pueblo` (comportamiento previo, una sola ciudad).

1. Abre Supabase → **SQL Editor** → **New query**.
2. Pega el contenido de `20260609_tecnicos_ciudades_cobertura.sql` y ejecuta. Espera "Success".
3. Corre la verificación de abajo.

### Verificación de `20260609`

```sql
-- 1. Columna ciudades_cobertura existe y es text[]
SELECT
  CASE WHEN data_type = 'ARRAY' THEN 'OK ✅' ELSE 'FALTA ❌' END AS check_columna_cobertura
FROM information_schema.columns
WHERE table_name = 'tecnicos' AND column_name = 'ciudades_cobertura';

-- 2. Backfill: ningún técnico con ciudad base queda sin cobertura
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'OK ✅'
       ELSE 'FALTA ❌ ' || COUNT(*)::text || ' técnico(s) sin cobertura' END AS check_backfill_cobertura
FROM tecnicos
WHERE coalesce(array_length(ciudades_cobertura, 1), 0) = 0
  AND ciudad_pueblo IS NOT NULL AND btrim(ciudad_pueblo) <> '';
```

## Rollback

Las migraciones no traen rollback automático. Si necesitas revertir una columna, hazlo manualmente. **No revertir** mientras haya filas `pendiente_pricing` o `reagendamiento_pendiente` en producción.

## Nota sobre RLS

- Tablas con RLS habilitado: `repuestos_pendientes`, `gps_pings`, `solicitud_eventos`, `supervisores` (esta última desde `20260529`).
- Tablas sin RLS: `solicitudes_servicio`, `tecnicos`, `especialidades_tecnico`, `notificaciones_whatsapp`, `evidencias_servicio`.
- Toda la app usa el `anon_key`. Para producción seria, queda pendiente habilitar RLS en las 5 tablas restantes (ver `improvement-plan.md`).

## Hallazgos del audit (2026-05-07) — backlog de migraciones futuras

El audit detectó issues que requieren cambios de schema. Cuando se prioricen, crear migraciones nuevas:

### Crítico

```sql
-- M-NEXT-A: Storage privado para documentos de identidad (PII).
-- Hoy `tecnicos-documentos` es público. Cualquier URL filtra la cédula.
-- Acción manual en Dashboard:
--   Storage → tecnicos-documentos → Settings → toggle "Public" OFF.
--   Cambiar uploadHelpers.ts a createSignedUrl(filename, 3600).
-- Idem (severidad menor) para tecnicos-fotos y evidencias-servicio.

-- M-NEXT-B: RLS en notificaciones_whatsapp (riesgo: token público + sin RLS).
ALTER TABLE notificaciones_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_notifs" ON notificaciones_whatsapp;
CREATE POLICY "service_role_all_notifs" ON notificaciones_whatsapp
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Mientras la app use anon_key sin JWT-claims, la única política viable
-- es permitir lectura/UPDATE solo cuando el filtro por token coincide.
-- PostgREST evalúa esto con `current_setting('request.jwt.claims', true)`,
-- pero como no usamos JWT custom, la opción práctica es mover los endpoints
-- afectados a un service_role server-side y dejar la tabla cerrada al anon.
-- Mientras tanto, no habilitar RLS sin migrar los endpoints.
```

### Alta

```sql
-- M-NEXT-C: Columna generada para cotizacion.token con índice único.
-- Elimina antipatrón "load all + filter in JS" en aprobar-cotizacion y /cotizacion/[token].
ALTER TABLE solicitudes_servicio
  ADD COLUMN cotizacion_token uuid GENERATED ALWAYS AS ((cotizacion->>'token')::uuid) STORED;

CREATE UNIQUE INDEX idx_solicitudes_cotizacion_token
  ON solicitudes_servicio(cotizacion_token)
  WHERE cotizacion_token IS NOT NULL;

-- Tras aplicar, refactor en código:
--   src/app/api/aprobar-cotizacion/route.ts:21-38
--   src/app/cotizacion/[token]/page.tsx:58-67
-- Reemplazar load-all + .find() por .eq('cotizacion_token', token).
```

### Media

```sql
-- M-NEXT-D: Índices secundarios faltantes.
CREATE INDEX IF NOT EXISTS idx_tecnicos_portal_token
  ON tecnicos(portal_token) WHERE portal_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_tecnico_asignado
  ON solicitudes_servicio(tecnico_asignado_id)
  WHERE tecnico_asignado_id IS NOT NULL;
```

### Baja

```sql
-- M-NEXT-E: TTL / cleanup de tablas append-only.
-- Programar como cron job (pg_cron en Supabase requiere extension):
DELETE FROM gps_pings
  WHERE capturado_at < NOW() - INTERVAL '2 years';

DELETE FROM notificaciones_whatsapp
  WHERE enviado_at < NOW() - INTERVAL '6 months'
  AND estado IN ('expirado', 'invalidado', 'error');

-- solicitud_eventos NO se purga — es audit log permanente para soporte/disputas.
```

## Race conditions identificadas (cambios de código, no schema)

No requieren migración — solo refactor. Documentado para no olvidar:

- `src/app/api/aprobar-cotizacion/route.ts:57-80` — dos UPDATEs secuenciales sin guard. Fix: combinar en uno solo o agregar `.eq('estado', 'cotizacion_enviada')` al primer UPDATE.
- `src/app/api/confirmar-horario/route.ts:54` — UPDATE acepta cualquier estado previo. Fix: `.is('horario_confirmado_at', null)` como guard atómico.
- `src/app/api/cron/horario-recordatorio/route.ts:56,65` — UPDATEs sin guard. Fix similar.

**Patrón modelo**: `procesarAceptacion` en `src/lib/services/whatsapp.service.ts` usa `.is('tecnico_asignado_id', null)` como guard atómico — copiarlo cuando aplique.
