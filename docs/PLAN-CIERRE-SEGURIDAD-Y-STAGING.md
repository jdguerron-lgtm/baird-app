# Plan de cierre de seguridad + ambiente de pruebas

> Creado 2026-10-24. Evidencia tomada en vivo de la BD de producción
> (`ceblicvdmephhktedsyv`, vía MCP, solo lectura), de los logs de runtime de
> Vercel y del código en `main` (`c74ec51`). Complementa `docs/PLAN-RLS.md`
> (fases de RLS) y `docs/FLUJO-DESARROLLO.md` (ciclo de un cambio).
>
> **Principio rector:** ningún cambio de base de datos o de código llega a
> producción sin pasar antes por staging, y todo cambio en producción se hace
> en la ventana de baja actividad (§ 2) con verificación y rollback escritos
> de antemano. Las únicas excepciones son cambios de configuración
> reversibles en segundos (env vars, toggles del dashboard).

---

## 0. Lo que está verificado hoy

| # | Hallazgo | Evidencia (2026-10-24) | Severidad |
|---|---|---|---|
| H1 | `CRON_SECRET` **no está configurado en Vercel**: los 8 crons aceptan cualquier llamada. | Logs de prod: `[cron] CRON_SECRET no configurado — /api/cron/oferta-escalonada acepta sin autenticación` cada minuto. Vault sí tiene `cron_secret` (creado 2026-10-11) y los 3 jobs pg_cron lo envían. | 🔴 |
| H2 | 3 funciones `SECURITY DEFINER` de pagos ejecutables por `anon`/`authenticated` vía `/rest/v1/rpc`: `auditar_pagos()`, `recalcular_resumen_pago(uuid)`, `trg_pagos_resumen()`. | Advisor `0028/0029`; `routine_privileges` muestra `PUBLIC:EXECUTE, anon:EXECUTE, authenticated:EXECUTE`. Ningún archivo de `src/` ni `scripts/` las llama por `rpc` (grep). | 🟠 |
| H3 | 6 funciones con `search_path` mutable (`normalizar_telefono_co` + 4 triggers de teléfono + `limpiar_confirmacion_visita`). | Advisor `0011`. Las 3 de pagos ya tienen `SET search_path = public`. | 🟡 |
| H4 | `solicitudes_servicio` y `especialidades_tecnico` **sin RLS**; `tecnicos` y `evidencias_servicio` con policies `USING(true)` para anon. | Advisors `0007/0013`; `pg_policies`. 45 archivos del navegador usan el anon key; 20 leen `solicitudes_servicio`; 11 escriben (registro, diagnóstico, completar, admin). | 🔴 |
| H5 | **No existe ambiente de pruebas.** Local y Preview de Vercel usan la BD, el número de WhatsApp y la cuenta Wompi de producción. | `docs/FLUJO-DESARROLLO.md` § 1; env vars únicas. | 🔴 |
| H6 | **Sin CI ni protección de rama.** `tsc`/`lint`/`test` se corren a mano; no hay `.github/workflows` ni hooks. | Repo. La protección de `main` en GitHub no se pudo verificar (sin `gh`). | 🟠 |
| H7 | Las tablas base `solicitudes_servicio` y `tecnicos` **no se crean en ninguna migración** (nacieron en el dashboard). Las 55 migraciones solas no levantan un staging. | `grep CREATE TABLE supabase/migrations`. | 🟡 (afecta staging) |
| H8 | Plan Free de Supabase: sin backups automáticos de la BD de producción (solo `git bundle` del código). Leaked-password protection y branching requieren Pro. | Advisor auth; `get_cost` devuelve 0 USD para un proyecto nuevo en la org (cabe un 3º proyecto gratis). | 🟠 (decisión) |
| H9 | Buckets `tecnicos-documentos` (cédulas), `tecnicos-fotos` y `evidencias-servicio` públicos por URL exacta. | `storage.buckets.public = true`. | 🟠 |

---

## 1. Qué podemos hacer hoy sin ningún riesgo para producción

Todo lo de esta lista es aditivo, no toca la BD de prod ni el deploy, y queda en la rama `seguridad/plan-cierre-y-staging`:

1. **Este plan** y la migración de hardening escrita y revisada, pero **sin aplicar** (`supabase/migrations/20261024_hardening_funciones_pagos_search_path.sql`).
2. **CI en GitHub Actions** (`.github/workflows/ci.yml`): `tsc`, `lint`, `test` en cada PR y en cada push a `main`. No cambia nada del deploy; solo pinta rojo o verde.
3. **Plantilla de PR** con el checklist de paso a producción (`.github/pull_request_template.md`).
4. **Kit de staging** en `scripts/staging/`: runbook, SQL de buckets y policies de Storage (copiadas de prod), inventario de schema para comparar prod ↔ staging y seed anonimizado (lee prod, escribe staging, con guardas para que nunca escriba en prod).
5. **Crear el proyecto `baird-staging`** en Supabase (0 USD, misma org, `us-east-1`): no interactúa con prod. Requiere tu OK porque crea un recurso en tu cuenta.

Lo que **sí** requiere ventana y va después de staging está en § 3.

---

## 2. Ventana de cambios (con datos, no por intuición)

Actividad real por hora (Bogotá), últimos 60 días, sumando eventos de estado, ofertas WhatsApp, solicitudes nuevas y pagos:

| Hora | Eventos | Ofertas WA | Solicitudes | Pagos | Lectura |
|---|---|---|---|---|---|
| 00–03 | 3 / 7 / 0 / 0 | 5 / 0 / 0 / 0 | 2 / 0 / 0 / 0 | 0 | Muerto |
| 04 | 63 | 10 | 0 | 0 | **Crons Vercel** 4:00 / 4:30 / 4:45 (recordatorios, GPS, repuestos) |
| 05–06 | 0 / 4 | 0 | 0 | 0 | Muerto |
| 07–12 | 39 → 69 | 31 → 66 | 1–6 | 0–3 | Mañana activa |
| 13 | 14 | 4 | 4 | 1 | Almuerzo |
| 14–16 | 49 / **94** / 53 | 35 / 49 / 46 | 7 / **25** / 5 | 1 / 5 / 1 | **Pico del día (15 h)** |
| 17 | 29 | 17 | 7 | 2 | Crons 17:00 resumen supervisores y 17:15 agenda técnicos |
| 18 | 36 | 40 | 3 | 3 | Técnicos cerrando el día |
| 19 | 16 | 5 | 0 | 1 | Baja |
| 20 | 38 | 35 | 8 | 0 | Cron 20:00 alerta visitas + clientes agendando de noche |
| 21 | 21 | 15 | 2 | 5 | Baja, pero hay pagos |
| **22–23** | 15 / 4 | 6 / 12 | 5 / 1 | 0 / 0 | **Ventana recomendada** |

Además corren siempre: `oferta-escalonada-1min` (pg_cron, cada minuto) y `wompi-conciliar-5min` (cada 5 min); `auditar-pagos-diario` a las 22:15 Bogotá.

**Reglas de ventana:**

- **Cambios en BD de producción (DDL, grants, RLS): lunes a jueves, 22:00–23:00 Bogotá**, nunca en viernes (si algo se nota tarde, el fin de semana nadie lo ve). Alternativa: 6:00–6:45 (después de los crons de la madrugada y antes del arranque de las 7).
- **Cambios de env vars + redeploy en Vercel:** misma ventana, y **no entre :13 y :17 ni entre :58 y :02** (así ningún cron de Vercel cae en mitad del redeploy).
- **Prohibido tocar producción 14:00–16:30** (pico) y en los minutos de cron 17:00, 17:15, 20:00.
- Cada cambio lleva **15 minutos de monitoreo** después: `net._http_response` (pg_cron sigue recibiendo 200), logs de runtime de Vercel sin errores nuevos, `/api/health` healthy, y la verificación específica del cambio.

---

## 3. Evaluación de impacto, cambio por cambio

Cada ficha tiene: qué, quién lo ejecuta, prerrequisitos, riesgo, qué pasa si sale mal y cómo se nota, verificación, rollback y ventana.

### C1 · `CRON_SECRET` en Vercel  ·  riesgo bajo · impacto alto si el valor no coincide

- **Qué:** crear `CRON_SECRET` (Sensitive) en Vercel → Production con **el mismo valor** que `vault.secrets.cron_secret` en Supabase, y redesplegar el deploy actual de producción (sin cambio de código).
- **Quién:** tú (yo no debo leer ni mover el valor del secreto). Yo verifico antes y después.
- **Prerrequisito:** ninguno. Es independiente de staging porque es configuración reversible en segundos.
- **Mecánica:** Vercel manda `Authorization: Bearer <CRON_SECRET>` a sus crons solo cuando la env var existe. Los 3 jobs pg_cron ya lo mandan leyéndolo de Vault. `cronAutorizado()` (`src/lib/auth/cron.ts`) pasa de "abierto con warning" a "solo con Bearer".
- **Si sale mal (valor distinto al de Vault):** `oferta-escalonada` y `wompi-conciliar` reciben 401 → las ofertas con técnico de preferencia o reparto escalonado **no se abren al resto** tras los 10 min y los pagos no se concilian. Se nota en 1–5 minutos en `net._http_response` (status 401) y en los logs de Vercel.
- **Verificación (≤ 10 min después del redeploy):**
  1. `select id, status_code, created from net._http_response order by id desc limit 5;` → todo **200**.
  2. Logs de Vercel ya **sin** el warning `CRON_SECRET no configurado`.
  3. `curl -s -o /dev/null -w "%{http_code}" https://lineablanca.bairdservice.com/api/cron/oferta-escalonada` → **401**.
  4. Esperar al cron de Vercel más cercano (o `curl` con el Bearer correcto desde tu máquina) → 200.
- **Rollback:** Vercel → Deployments → *Instant Rollback* al deploy anterior (restaura su snapshot de env vars) o borrar la variable y redesplegar. < 3 min.
- **Ventana:** 22:00–23:00 Bogotá, fuera de :13–:17 y :58–:02. Primer cambio del plan.
- **Preview:** cuando exista staging, Preview lleva **otro** `CRON_SECRET` (el del Vault de staging).

### C2 · `REVOKE EXECUTE` en las 3 funciones de pagos  ·  riesgo muy bajo

- **Qué:** quitar `EXECUTE` a `PUBLIC`, `anon` y `authenticated` en `auditar_pagos()`, `recalcular_resumen_pago(uuid)` y `trg_pagos_resumen()`; dejar `postgres` (dueño) y `service_role`.
- **Por qué no rompe nada:** (a) el trigger `pagos_resumen_aiud` se ejecuta sin chequeo de `EXECUTE` en tiempo de disparo (Postgres solo lo exige al crear el trigger); (b) `trg_pagos_resumen` llama a `recalcular_resumen_pago` **dentro** de una función `SECURITY DEFINER`, es decir como `postgres`, que es el dueño; (c) `auditar_pagos` la corre pg_cron como `postgres`; (d) la app no usa `rpc()` para ninguna de las tres (grep en `src/` y `scripts/`).
- **Si sale mal:** un `INSERT` en `pagos` fallaría con `permission denied for function` → el webhook/redirect de Wompi y la conciliación no registrarían pagos. Se nota de inmediato en el log del cron (`errores: [...]`) y en `net._http_response`.
- **Verificación en staging (obligatoria antes de prod):** insertar una fila de prueba en `pagos` con service_role → el resumen de la solicitud cambia → borrarla. Luego, como anon: `select auditar_pagos()` debe dar `42501`.
- **Verificación en prod:** advisors `0028/0029` desaparecen; `routine_privileges` sin `anon`/`authenticated`/`PUBLIC`; siguiente corrida de `wompi-conciliar` con 200 y `errores: []`.
- **Rollback:** `GRANT EXECUTE ON FUNCTION … TO anon, authenticated;` (instantáneo, en el archivo de la migración).
- **Ventana:** 22:00–23:00 Bogotá, el día siguiente de haberlo probado en staging. Puede ir en la misma sesión que C3.

### C3 · `SET search_path = public` en las 6 funciones  ·  riesgo bajo

- **Qué:** `ALTER FUNCTION … SET search_path = public` en `normalizar_telefono_co(text)`, los 4 triggers de normalización y `limpiar_confirmacion_visita()`.
- **Por qué no rompe nada:** las 6 solo usan funciones del catálogo (`regexp_replace`, `length`, `trim`, `substring`), que siempre se resuelven, y `normalizar_telefono_co` sin calificar, que vive en `public`. No cambian resultados; `normalizar_telefono_co` sigue `IMMUTABLE` y no la usa ningún índice.
- **Si sale mal:** los `INSERT/UPDATE` en `tecnicos`, `solicitudes_servicio`, `supervisores` y el receptor fallarían → `/registro`, `/solicitar` y el diagnóstico se rompen. Se notaría en el primer formulario enviado (minutos en horario activo; por eso va en ventana y con prueba en staging).
- **Verificación en staging:** `insert` + `delete` en `supervisores` (dispara el trigger de teléfono) y un `update` de `fecha_visita_at` sobre una solicitud de prueba (dispara `limpiar_confirmacion_visita`).
- **Verificación en prod:** `select public.normalizar_telefono_co('+57 313 495 1164') = '573134951164'` → `true`; advisor `0011` baja de 6 a 0; `pg_proc.proconfig` muestra `search_path=public` en las 6. Al día siguiente, confirmar que entraron solicitudes y registros nuevos sin errores.
- **Rollback:** `ALTER FUNCTION … RESET search_path;` (instantáneo, en el archivo).
- **Ventana:** misma sesión que C2.

### C4 · MFA en la cuenta admin y política de contraseñas  ·  sin impacto en usuarios

- **Qué:** activar TOTP para los emails de la allowlist (gratis en Supabase Auth) y, si se pasa a Pro, *Leaked password protection*.
- **Impacto:** solo el login del panel. Requiere un pequeño cambio en `/admin/login` para pedir el segundo factor (hoy no lo hay). Va con staging para probar el flujo de login.
- **Ventana:** cualquiera (no toca clientes ni técnicos).

### C5 · Plan Pro de Supabase en producción  ·  decisión de negocio

- **Qué:** 25 USD/mes. Trae **backups diarios con 7 días de retención** (hoy la BD con el ledger de pagos no tiene ningún respaldo automático), leaked-password protection, branching y 8 GB de storage (hoy el video está topado en 50 MB por el plan Free).
- **Mi lectura:** el backup diario solo ya lo justifica para una base con pagos y datos de clientes. No es urgente para este plan (staging cabe gratis), pero sí antes de la Fase 4.2 de RLS, que es el cambio más delicado.

### C6 · RLS Fase 2: escrituras del navegador → API routes  ·  riesgo medio · requiere staging

- **Qué:** `/registro` (insert/update/delete `tecnicos`, insert `especialidades_tecnico`, uploads), `/admin/tecnicos/[id]` (update), `tecnico/[token]/completar/[id]` y `diagnostico/[id]` (update `solicitudes_servicio`, insert/update `evidencias_servicio`), más los 4 componentes admin que escriben directo. Cada superficie pasa a un endpoint con `verificarAdmin` o `portal_token` validado server-side.
- **Si sale mal:** el formulario afectado deja de guardar. Se detecta en staging con el smoke de 4 flujos antes del merge; en prod con el monitoreo de 15 min y revisando el primer registro/diagnóstico real del día siguiente.
- **Cómo se despliega sin riesgo:** un PR por superficie, probado en la preview (que ya apuntará a staging), merge en ventana, y **sin tocar policies todavía** (el código nuevo funciona igual con la BD abierta). Las policies se cierran en C8.
- **Rollback:** revert del PR (Vercel Instant Rollback) — no hay cambio de BD que revertir.

### C7 · RLS Fase 3: lecturas de portales → API routes  ·  riesgo medio · requiere staging

- **Qué:** los 7 portales por token (`/aceptar`, `/horario`, `/cotizacion`, `/confirmar`, `/servicio`, `/reprogramar-repuesto`, `/verificar-paso`) y las páginas `/admin/*` dejan de consultar Supabase con anon; leen vía `GET /api/portal/...` que valida el token y devuelve solo las columnas necesarias (patrón de `/api/supervisor/*`).
- **Despliegue:** portal por portal, cada uno con su PR, preview en staging y ventana. Igual que C6, no cambia la BD.

### C8 · RLS Fase 4.2: habilitar RLS en `solicitudes_servicio` y `especialidades_tecnico`, cerrar `tecnicos` y `evidencias_servicio`  ·  riesgo alto · el último

- **Qué:** `ENABLE ROW LEVEL SECURITY` + policies deny-by-default (solo `service_role`), y drop de las policies `anon` `USING(true)` de `tecnicos` y `evidencias_servicio`.
- **Prerrequisito duro:** C6 y C7 completos y **`scripts/verify-flows.mjs` adaptado** para que falle si alguna página todavía usa anon sobre esas tablas. Backups (C5) activos.
- **Si sale mal:** cualquier página que todavía lea con anon muestra vacío o error. Por eso va una tabla por noche, con `verify-flows` antes y después y rollback SQL preescrito (`DISABLE ROW LEVEL SECURITY` / recrear la policy) que se aplica en segundos sin deploy.
- **Ventana:** 22:00–23:00 Bogotá, lunes a miércoles, una tabla por noche, con las 24 h siguientes de observación.

### C9 · Bucket `tecnicos-documentos` privado con signed URLs  ·  riesgo medio · después de C6

- **Qué:** `public=false` + policies `authenticated` (patrón de `tecnicos-contratos`) + `createSignedUrl` en `/admin/tecnicos/[id]`. Requiere que el upload de `/registro` ya pase por API (C6), porque hoy sube con anon.
- **Si sale mal:** el admin no ve la cédula en la ficha. No afecta a clientes (desde 2026-10-10 la URL no les llega). Rollback: `public=true` en el dashboard.

### C10 · Rate limit real y `/api/notificar-registro`  ·  riesgo bajo

- **Qué:** Upstash Ratelimit o Vercel Firewall en las rutas que disparan WhatsApp; `/api/notificar-registro` pasa a exigir `verificarAdmin` o un token.
- **Impacto:** solo si el límite queda demasiado bajo (un cliente legítimo ve 429). Se calibra en staging con los límites actuales de `middleware.ts`.

---

## 4. Ambiente de pruebas: diseño

| Pieza | Producción | Staging (propuesta) | Costo |
|---|---|---|---|
| Base de datos | Supabase `ceblicvdmephhktedsyv` | Proyecto nuevo `baird-staging`, misma org, `us-east-1`, Free | 0 USD (confirmado por API) |
| Schema | Dashboard + 55 migraciones | `pg_dump --schema-only` de prod (incluye las tablas base que no están en migraciones, policies, triggers, funciones) + `scripts/staging/01-storage-buckets-y-policies.sql` | — |
| Datos | Reales | `scripts/staging/03-seed-anonimizado.mjs`: últimas 40 solicitudes con sus satélites, todos los técnicos y supervisores, **teléfonos, nombres, documentos, correos, direcciones y tokens reemplazados**; URLs de Storage de prod → placeholder | — |
| Auth | Cuentas admin reales | 1 cuenta admin + 1 lectura creadas con `scripts/crear-usuario-panel.mjs` apuntando a staging; self-signup apagado | — |
| Storage | 4 buckets | Mismos 4 buckets y policies (01-…sql); vacíos | — |
| pg_cron / Vault | 3 jobs → URL de prod | **Sin jobs programados** (los crons se prueban a mano con `curl` + Bearer). Vault con `cron_secret` propio | — |
| Código | Vercel Production ← `main` | Vercel **Preview** (toda rama ≠ main) con env vars de scope Preview apuntando a staging | 0 (incluido) |
| WhatsApp | Número real | Mismo número, **`BAIRD_TEST_PHONE_WHITELIST` obligatoria** en Preview (celulares del equipo). Opción B: número de prueba de Meta en la misma WABA | 0 |
| Wompi | Llaves prod | `pub_test_…` + secretos de sandbox (el código ya activa sandbox al ver `pub_test_`) | 0 |
| Siigo / Resend / Dapta / Gemini | Reales / apagados | Siigo **sin credenciales** en Preview (503 por kill-switch); Resend sin key (no-op); Dapta `false` | 0 |
| Local | `.env.local` → prod | `.env.local` → staging. La réplica `baird-app-main` conserva el `.env.local` de prod para reproducir producción | — |

**Qué cambia para producción:** nada. Las env vars de scope Production no se tocan; solo se agregan las de Preview.

**Limitaciones que hay que aceptar:** los archivos de Storage no se copian (las fotos del seed son placeholders); los textos libres (diagnóstico, notas) se copian tal cual; las plantillas de WhatsApp son las mismas de prod (no hay "plantillas de staging" en Meta), por eso la whitelist es obligatoria.

### Pasos y dueño

| # | Paso | Dueño | Riesgo prod |
|---|---|---|---|
| S1 | Crear proyecto `baird-staging` en Supabase (MCP `create_project`, 0 USD) | Yo, con tu OK | Ninguno |
| S2 | Instalar `pg_dump` (PostgreSQL 17 client; `winget install PostgreSQL.PostgreSQL.17` o binarios zip de EDB) | Tú | Ninguno |
| S3 | `pg_dump --schema-only --schema=public --no-owner` de prod con la cadena *Session pooler* (contraseña de la BD solo la ves tú) → `schema-prod.sql` fuera del repo | Tú | Solo lectura |
| S4 | Aplicar `schema-prod.sql` en staging (MCP `apply_migration` o `psql`), luego `01-storage-buckets-y-policies.sql` | Yo | Ninguno |
| S5 | `02-inventario-schema.sql` en prod y staging → diff vacío (tablas, columnas, constraints, índices, policies, triggers, funciones) | Yo | Solo lectura |
| S6 | Vault `cron_secret` en staging (valor nuevo) | Tú | Ninguno |
| S7 | Seed anonimizado (`03-seed-anonimizado.mjs --confirmo-staging`) | Yo | Solo lectura en prod |
| S8 | Cuentas admin/lectura en staging; apagar self-signup | Tú / yo | Ninguno |
| S9 | Env vars de scope **Preview** en Vercel (lista en `scripts/staging/README.md`) | Tú (el MCP de Vercel no tiene permiso de env vars) | Ninguno |
| S10 | Push de esta rama → preview contra staging; `verify-flows.mjs` contra staging; recorrer `/solicitar`, `/registro`, portal técnico, admin | Yo | Ninguno |
| S11 | `.env.local` del repo de trabajo → staging | Tú | Ninguno (la réplica sigue en prod) |

---

## 5. Reglas de paso a producción (versión endurecida)

Se suman a `docs/FLUJO-DESARROLLO.md` § 3:

1. **Todo PR pasa CI** (`tsc`, `lint`, `test`) y la protección de rama de `main` exige el check verde + PR (no push directo). *Configurar en GitHub → Settings → Branches → `main`.*
2. **Todo cambio de BD se aplica primero en staging**, se verifica con `02-inventario-schema.sql` y con el flujo afectado, y recién entonces en prod, **en ventana** (§ 2), con el rollback del archivo a mano.
3. **Orden inmutable para features con migración:** migración en staging → código probado en preview → migración en prod (ventana) → merge/deploy → verificación en prod → bitácora.
4. **Plantillas WhatsApp:** `APPROVED` (`--check`) antes del merge del código que las invoca (sin cambio).
5. **Env vars nuevas:** creadas en Production **y** Preview antes del merge; documentadas en `CLAUDE.md`.
6. **Checklist de la plantilla de PR** completo. Un ítem sin marcar = no se mergea.
7. **Después del merge:** 15 minutos de monitoreo (logs de runtime, `/api/health`, el flujo tocado) y entrada en la bitácora (§ 7).
8. **Nunca** `git add -A`; nunca merge a `main` sin OK explícito; nunca en viernes un cambio de BD.
9. **Rollback primero, diagnóstico después:** si un síntoma aparece en los 15 minutos, se revierte (Instant Rollback o SQL de rollback) y luego se investiga en staging.

---

## 6. Cronograma propuesto

| Cuándo | Qué | Riesgo prod |
|---|---|---|
| **Hoy** | Rama con plan, migración (sin aplicar), CI, plantilla de PR, kit de staging. Crear `baird-staging`. | Ninguno |
| **Día 1 (mañana)** | S2–S11: schema, policies, seed, cuentas, env vars de Preview, verificación. | Ninguno |
| **Día 1, 22:00–23:00** | **C1** `CRON_SECRET` en Vercel + redeploy + 15 min de monitoreo. | Bajo, reversible en 3 min |
| **Día 2 (día)** | Aplicar `20261024_hardening…` en staging + pruebas DML. Activar CI como requerido en `main`. | Ninguno |
| **Día 2, 22:00–23:00** | **C2 + C3** en prod (una sola migración) + verificación + 15 min. | Muy bajo, rollback SQL instantáneo |
| **Semana 2** | C6 (Fase 2) por superficie, cada PR contra staging. Decidir C5 (Pro). | Bajo (solo código, reversible con rollback de deploy) |
| **Semana 3–4** | C7 (Fase 3) portal por portal. C9 bucket privado. C10 rate limit. | Bajo |
| **Semana 5** | C8 (Fase 4.2) una tabla por noche, lunes a miércoles, con backups activos. | Alto, pero con rollback SQL en segundos y verify-flows antes/después |

---

## 7. Bitácora de ejecución

| Fecha | Cambio | Ambiente | Resultado | Rollback usado |
|---|---|---|---|---|
| 2026-10-24 | Plan, evidencia, migración escrita (sin aplicar), CI, kit de staging | repo | rama `seguridad/plan-cierre-y-staging`, sin merge | — |

---

## 8. Decisiones que necesito de ti

1. **OK para crear `baird-staging`** en Supabase (0 USD, misma org).
2. **Quién copia `cron_secret` de Vault a Vercel** (C1): lo haces tú en la ventana; yo verifico antes y después.
3. **Plan Pro de Supabase** (C5, 25 USD/mes): ahora, antes de la Fase 4.2, o no.
4. **WhatsApp en staging:** mismo número con whitelist (más simple) o número de prueba de Meta.
5. **Protección de rama en GitHub:** tú la activas cuando el workflow de CI haya corrido verde una vez.
