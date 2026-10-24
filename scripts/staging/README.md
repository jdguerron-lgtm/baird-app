# Kit de staging — `baird-staging`

Runbook para levantar y mantener el ambiente de pruebas. Diseño, impacto y
cronograma en `docs/PLAN-CIERRE-SEGURIDAD-Y-STAGING.md` § 4. **Nada de lo que hay
aquí escribe en producción**: a prod solo se le hace `pg_dump --schema-only` y
`SELECT`.

## Archivos

| Archivo | Para qué | Dónde se corre |
|---|---|---|
| `01-storage-buckets-y-policies.sql` | Crea los 4 buckets y las 9 policies de `storage.objects` tal como están en prod (2026-10-24). `pg_dump --schema=public` no las incluye. | Staging (SQL Editor o MCP `apply_migration`) |
| `02-inventario-schema.sql` | Lista tablas, columnas, constraints, índices, policies, triggers y funciones en un formato estable para hacer `diff` entre prod y staging. | Prod (solo lectura) y staging |
| `03-seed-anonimizado.mjs` | Copia a staging las últimas N solicitudes con sus satélites, todos los técnicos y los supervisores, reemplazando PII y tokens. Se niega a escribir si el destino es prod. | Local, desde el repo (`node --env-file=…`) |

## 1. Crear el proyecto

Supabase → misma organización → *New project* `baird-staging`, región **us-east-1**
(igual que prod y que Vercel `iad1`), plan Free (la API confirma 0 USD). Guarda la
contraseña de la BD en tu gestor de claves; no va en el repo.

## 2. Schema desde prod (solo lectura)

Necesitas `pg_dump` 17 (PostgreSQL client). Opciones en Windows:

```bash
winget install -e --id PostgreSQL.PostgreSQL.17
```

o los binarios zip de EDB (sin instalar el servidor). La cadena de conexión sale de
Supabase → *Connect* → **Session pooler** (IPv4):
`postgresql://postgres.ceblicvdmephhktedsyv:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.

```bash
pg_dump "<cadena session pooler de PROD>" \
  --schema-only --schema=public --no-owner --no-comments \
  -f "C:/Users/Juan Guerron/Documents/baird-app-backups/schema-prod-$(date +%Y-%m-%d).sql"
```

Guárdalo **fuera del repo** (la carpeta de backups ya existe). El dump incluye las
tablas base que no están en `supabase/migrations/` (`solicitudes_servicio`,
`tecnicos`), todas las columnas, CHECKs, índices, policies de `public`, triggers y
funciones. No incluye: extensiones, Storage, Vault, pg_cron ni Auth.

## 3. Aplicar en staging, en este orden

1. Extensiones (el dump no las trae):
   ```sql
   create extension if not exists "uuid-ossp";
   create extension if not exists pgcrypto;
   ```
2. `schema-prod-<fecha>.sql` completo (MCP `apply_migration` en bloques, o
   `psql "<cadena session pooler de STAGING>" -v ON_ERROR_STOP=1 -f schema-prod-<fecha>.sql`).
3. `01-storage-buckets-y-policies.sql`.
4. Vault: *Project Settings → Vault → New secret* `cron_secret` con un valor **nuevo**
   (no el de prod). Es el `CRON_SECRET` que llevará el scope Preview de Vercel.
5. **No** programar los jobs pg_cron de prod (`wompi-conciliar-5min`,
   `oferta-escalonada-1min`, `auditar-pagos-diario`): apuntan a la URL de producción.
   En staging los crons se prueban a mano:
   `curl -H "Authorization: Bearer <cron_secret de staging>" https://<preview>/api/cron/oferta-escalonada`.
6. Auth → *Providers → Email*: apagar *Allow new users to sign up*.
7. Cuentas del panel (sin contraseña, luego link de acceso desde `/admin/accesos`):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=<staging> SUPABASE_SERVICE_ROLE_KEY=<staging> \
     node scripts/crear-usuario-panel.mjs jdguerron@bairdservice.com
   ```

## 4. Verificar que el schema es idéntico

Corre `02-inventario-schema.sql` en prod y en staging, guarda las dos salidas y
compáralas (`diff`, o pegar en dos pestañas). Diferencias esperadas: ninguna en
`public`. Si falta algo, casi siempre es una extensión o una policy de Storage.

## 5. Seed anonimizado

Crea `.env.staging-seed` **fuera del control de versiones** (el patrón `.env*` ya
está en `.gitignore`):

```
PROD_SUPABASE_URL=https://ceblicvdmephhktedsyv.supabase.co
PROD_SERVICE_ROLE_KEY=<service_role de PROD — solo lectura en este script>
STAGING_SUPABASE_URL=https://<ref-staging>.supabase.co
STAGING_SERVICE_ROLE_KEY=<service_role de STAGING>
```

```bash
node --env-file=.env.staging-seed scripts/staging/03-seed-anonimizado.mjs --confirmo-staging --solicitudes=40
```

Qué hace y qué no:

- Copia `tecnicos`, `especialidades_tecnico`, `supervisores`, las últimas N
  `solicitudes_servicio` y sus `notificaciones_whatsapp`, `evidencias_servicio`,
  `repuestos_pendientes`, `solicitud_eventos`, `pagos` y `gps_pings`.
- Reemplaza: nombres → `Prueba <tabla> NNN`; teléfonos/WhatsApp → `5730…` ficticios
  (válidos de formato, inexistentes); correos → `staging+NNN@example.com`; documentos
  y cédulas → números ficticios; direcciones y barrios → texto genérico; lat/lng →
  redondeadas a 2 decimales; **todas las columnas `*_token` → UUID nuevos**; URLs de
  Storage de prod → placeholder; dentro de JSONB (`triaje_resultado`, `cotizacion`,
  `payload` de eventos, respuestas de Wompi) aplica las mismas reglas por nombre de
  clave y además borra teléfonos y correos por patrón.
- Anula `codigo_descuento_id` y `auxiliares_ids` (tablas no copiadas).
- Es re-ejecutable (`upsert` por `id`).
- **No copia**: archivos de Storage, `cliente_historial`, `connection_errors`,
  `llamadas`, `liquidaciones_*`, `tecnico_auxiliares`, `agenda_tecnico_bloqueos`,
  `codigos_descuento`, `supervisor_resumenes`, `config_reparto` (esta última se crea
  con sus defaults al aplicar el schema; si falta la fila, insertarla a mano).
- Textos libres (diagnóstico, notas, motivos) se copian tal cual.

Guardas: exige `--confirmo-staging`; aborta si `STAGING_SUPABASE_URL` es igual a la
de prod o contiene el ref `ceblicvdmephhktedsyv`; sobre prod solo ejecuta `select`.

## 6. Vercel — scope Preview

Settings → Environment Variables. **Solo marcar "Preview"** en cada una; las de
Production no se tocan. El MCP de Vercel no tiene permiso de env vars, así que es a
mano (o `vercel env add <NOMBRE> preview` con la CLI).

| Variable | Valor en Preview |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon de staging |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de staging (Sensitive) |
| `CRON_SECRET` | el `cron_secret` del Vault de staging (Sensitive) |
| `BAIRD_TEST_PHONE_WHITELIST` | **obligatoria**: celulares del equipo, CSV de dígitos con 57 |
| `WOMPI_PUBLIC_KEY` / `WOMPI_INTEGRITY_SECRET` / `WOMPI_EVENTS_SECRET` / `WOMPI_PRIVATE_KEY` | llaves `pub_test_…` / sandbox de Wompi (el código activa sandbox solo) |
| `SIIGO_USERNAME` / `SIIGO_ACCESS_KEY` | **vacías** (503 por kill-switch; no crear cotizaciones reales desde previews) |
| `RESEND_API_KEY` | vacía (correos no-op) |
| `DAPTA_ENABLED` | `false` |
| `ENABLE_TEST_ENDPOINTS` | `true` (habilita `/api/test-whatsapp` para diagnosticar) |
| `NEXT_PUBLIC_APP_URL` | se deja igual que prod **o** la URL fija de la rama (`https://baird-app-git-<rama>-<team>.vercel.app`) cuando se prueben links de WhatsApp |
| `WHATSAPP_*`, `ADMIN_EMAILS`, `LECTURA_EMAILS`, `GOOGLE_MAPS_API_KEY`, GA | se heredan de prod (mismo número de WhatsApp, protegido por la whitelist) |

Después: push de cualquier rama → preview contra staging. Primer check:
`https://<preview>/api/health` y `node --env-file=<env de staging> scripts/verify-flows.mjs`.

## 7. Local

`.env.local` del repo de trabajo → valores de staging (misma tabla, columna
"Preview"). La réplica `Documents/baird-app-main` conserva el `.env.local` de prod
para reproducir producción cuando haga falta (ver `docs/FLUJO-DESARROLLO.md` § 2).

## 8. Mantenimiento

- **Cada migración nueva se aplica primero en staging** y se verifica con
  `02-inventario-schema.sql` antes de ir a prod.
- Re-seed cuando los datos de prueba queden viejos: el script es idempotente.
- Si staging se desalinea más de la cuenta, se repite § 2–3 (el proyecto se puede
  resetear desde el dashboard sin costo).
