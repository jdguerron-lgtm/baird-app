# Flujo de cambios, pruebas y despliegue

> Cómo se lleva un cambio desde la idea hasta producción sin romper nada.
> Creado 2026-10-21; **v2 2026-10-24**: carriles por tipo de cambio, pirámide de
> pruebas, protocolo de despliegue con go/no-go, ensayo de migraciones con
> ROLLBACK, smoke test (`scripts/smoke.mjs`), incidentes y hoja de ruta de
> madurez. Decisiones de seguridad, ventana horaria con datos y fichas de
> impacto por cambio: `docs/PLAN-CIERRE-SEGURIDAD-Y-STAGING.md`.

## 0. Principios

1. **Ningún cambio llega a producción sin pasar por una barrera automática** (CI) y una prueba en un ambiente que no sea producción (preview, local o staging).
2. **Producción se toca en ventana** (§ 6.1), con verificación y rollback escritos antes de empezar.
3. **Rollback primero, diagnóstico después.** Si algo se ve mal en los 15 minutos de monitoreo, se revierte y se investiga fuera de producción.
4. **Un cambio, un PR, un riesgo.** No se mezclan en el mismo PR una migración, un upgrade de dependencias y una feature.
5. **Todo queda registrado**: PR con checklist, bitácora del área y memoria del proyecto.

---

## 1. Ambientes

| Ambiente | Dónde | Base de datos | WhatsApp | Pagos | Uso | Estado |
|---|---|---|---|---|---|---|
| **Local** | `npm run dev` → `localhost:3000` | ⚠️ Supabase de **producción** (hoy) | Real, limitado por `BAIRD_TEST_PHONE_WHITELIST` | Wompi prod | Desarrollar | ✅ |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) | Ninguna (tests con mocks) | Mock | Mock | Barrera automática en cada PR y push a `main` | ✅ desde 2026-10-24 |
| **Preview** | Vercel, una URL por rama, protegida por Vercel Authentication | ⚠️ Supabase de **producción** (hoy) | Real | Wompi prod | Revisar UI y navegación **de lectura** | ✅ (sin datos propios) |
| **Staging** | Proyecto Supabase `baird-staging` (`etsbzxnthpmyvuodrmrh`, us-east-1) + app local en `.wt/<worktree>` puerto 3100 (y scope Preview de Vercel cuando se carguen sus variables) | Propia: estructura idéntica a prod (11/11 huellas) + seed anonimizado (40 solicitudes) | Bloqueado por whitelist (`570000000000`) | Apagado (sin llaves) | Pruebas e2e, migraciones y RLS | ✅ **desde 2026-10-25** |
| **Producción** | Vercel, `https://lineablanca.bairdservice.com` (alias `baird-app.vercel.app`) | Supabase `ceblicvdmephhktedsyv` | Real | Wompi prod | Clientes, técnicos, MABE | ✅ |

**En local con el `.env.local` de producción y en las previews (hasta que tengan las variables de staging) no se envían formularios ni se ejecutan acciones** que escriban. Solo navegación. Lo que escribe se prueba **en staging** (§ 5.4) o con el ensayo con ROLLBACK (§ 5.3).

Kit para montar staging: `scripts/staging/README.md` (incluye la variante local con Docker, § 9 del README).

## 2. Carpetas en el PC

| Carpeta | Qué es | Para qué |
|---|---|---|
| `Documents/baird-app` | Repo de trabajo. **Lo comparten varias sesiones de Claude en paralelo.** | Desarrollar. Revisar `git status` antes de tocar el árbol. |
| `Documents/baird-app/.wt/<nombre>` | Worktrees aislados, uno por cambio (ignorados por git). | Trabajar una rama sin tocar el árbol compartido. Cada uno con su propio `npm ci`. |
| `Documents/baird-app-main` | Clon limpio que sigue `origin/main` (= producción), con su `node_modules` y `.env.local`. | Reproducir producción en local. |
| `Documents/baird-app-backups/*.bundle` | Respaldo completo del repo en un archivo. | Restaurar si se pierde el repo o GitHub. |

```bash
# Reproducir producción en local
cd "C:/Users/Juan Guerron/Documents/baird-app-main" && git pull && npm ci && npm test && npm run dev

# Respaldo nuevo del repo
cd "C:/Users/Juan Guerron/Documents/baird-app"
git bundle create "../baird-app-backups/baird-app-$(date +%Y-%m-%d_%H%M).bundle" --all
```

Restaurar: `git clone baird-app-<fecha>.bundle baird-app-restaurado` y luego
`git remote set-url origin https://github.com/jdguerron-lgtm/baird-app.git`.
El bundle no incluye `.env.local` ni `node_modules`.

---

## 3. Carriles por tipo de cambio

Cada PR declara su tipo en el título o la descripción. El tipo decide qué pruebas y qué protocolo aplican.

| Tipo | Ejemplos | Pruebas mínimas | Despliegue |
|---|---|---|---|
| **A · Docs / proceso** | `docs/**`, `.github/**`, plantillas de PR, scripts que no corren en prod | CI | Merge a cualquier hora. El deploy de Vercel no cambia el runtime. |
| **B · Código de la app** | `src/**` sin migración | CI + prueba en preview (navegación) + tests nuevos si toca lógica | **Ventana** (§ 6.1) + protocolo completo (§ 6) |
| **C · Base de datos** | `supabase/migrations/**`, policies, grants, funciones | Ensayo con ROLLBACK en prod (§ 5.3) **o** staging + inventario de schema | Migración en ventana, **antes** del código que la usa; luego el PR del código como tipo B |
| **D · Configuración** | Env vars de Vercel, toggles del dashboard de Supabase/Vercel | Verificación específica escrita antes | Ventana, fuera de :13–:17 y :58–:02 (redeploy) |
| **E · Plantillas WhatsApp** | `scripts/upload-templates*.mjs`, textos | `--check` en `APPROVED` | El código que la invoca no se mergea hasta que Meta la aprueba |
| **F · Dependencias** | `package.json`, `package-lock.json` | Worktree limpio con `npm ci`; línea base vs. después de tsc, lint, test y build; `next start` + smoke local; lockfile con binarios de Linux | Ventana + protocolo completo. **Nunca `npm audit fix --force`**. Pines exactos donde ya los hay. |
| **G · Hotfix** | Algo roto en producción | Las mismas barreras, sin atajos | Fuera de ventana solo si el daño de esperar es mayor; rollback listo antes de empezar |

**Cambios de cobros (`[pagos]`)** son siempre tipo B con revisión extra: `npm run check:pagos`, tests de contrato y `docs/WOMPI.md`.

## 4. Ciclo de un cambio

1. **Rama desde `main` al día, en su propio worktree:**
   ```bash
   cd "C:/Users/Juan Guerron/Documents/baird-app"
   git fetch origin
   git worktree add -b feat/nombre .wt/nombre origin/main
   cd .wt/nombre && npm ci
   ```
2. **Código + docs juntos.** Pipeline de `docs/INDEX.md` § "Pipeline de actualización".
3. **Barrera local** antes de cualquier push:
   ```bash
   npx tsc --noEmit && npm run lint && npm test
   ```
   Para tipos B y F, además `npm run build` (con env ficticias, ver § 5.1).
4. **Commit con archivos explícitos** (`git add <ruta>`, nunca `git add -A`) y mensaje con qué y por qué.
5. **Push de la rama → PR con la plantilla** (`.github/pull_request_template.md`). El CI corre solo; Vercel publica la preview.
6. **Antes de mergear**, si `main` avanzó desde que creaste la rama: traer `main` (`git merge origin/main`), repetir la barrera y volver a pushear. **El código combinado es el que se despliega, y es el que hay que probar.**
7. **Merge en ventana** siguiendo § 6. Merge = deploy a producción.
8. **Cierre:** bitácora, `CLAUDE.md` § Current Status y memoria del proyecto.

## 5. Pruebas

### 5.1 Pirámide

| Nivel | Herramienta | Qué cubre | Cuándo |
|---|---|---|---|
| Tipos | `npx tsc --noEmit` | Contratos entre módulos, columnas usadas en el código | Siempre (CI) |
| Lint | `npm run lint` (incluye `check-pagos-frontera`) | Reglas de React/Next, frontera del módulo de pagos | Siempre (CI) |
| Unitarias | `npm test` (Vitest, 745 casos en 55 archivos) | Cálculos de tarifas, bonos, pagos, validaciones Zod, utilidades, parsers | Siempre (CI). **Toda lógica nueva lleva su test** en `src/__tests__/<área>/` |
| Build | `npm run build` | Que Next compile todas las rutas (121 páginas) | CI + tipos B y F |
| Smoke | `node scripts/smoke.mjs [url]` | Salud con lectura real a la BD, páginas clave, headers de seguridad, noindex, 404 de tokens, 401 de webhook y admin. **Solo lectura.** | Después de cada deploy y en cada ronda de monitoreo |
| Conectividad | `npm run conectividad` (`scripts/conectividad.mjs`) | App, TLS del dominio, Supabase prod y staging (Auth, REST, Storage), WhatsApp (número, calidad), Wompi (comercio), y Siigo / Resend / Google Maps / Gemini si hay credencial. **Solo lectura** | Antes de cada ventana de despliegue y cuando falle una integración |
| RLS / Storage | `node --env-file=.env.local scripts/verify-flows.mjs` | Lo que el navegador puede leer con la anon key + ciclo de subida a Storage | Antes y después de tocar RLS, policies o buckets |
| Ensayo SQL | Bloque `DO` con `RAISE EXCEPTION` final (§ 5.3) | Que una migración se aplica y que los triggers siguen funcionando, sin dejar nada aplicado | Todo cambio tipo C mientras no haya staging |
| Flujos end-to-end | `npm run e2e` (`scripts/e2e/flujos.mjs`, 32 pasos) contra la app corriendo sobre staging | Particular reparar, particular con repuesto + precios admin, garantía con verificación de paso, y seguridad (tokens falsos, admin sin sesión, cron sin secreto, doble confirmación). Verifica el estado en la base en cada paso y borra sus datos | Tipos B, C y F antes del merge (§ 5.4). Futuro: Playwright para la UI |

Build local con env ficticias (no se conecta a nada):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ci.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=ci NEXT_PUBLIC_APP_URL=https://ci.baird.app npm run build
```

### 5.2 Smoke test

```bash
node scripts/smoke.mjs                                  # producción
node scripts/smoke.mjs https://<preview>.vercel.app --bypass=<token>   # preview protegida
node scripts/smoke.mjs --json > smoke-$(date +%H%M).json               # evidencia para la bitácora
```

El token de bypass sale de Vercel → Settings → Deployment Protection → *Protection Bypass for Automation*. Salida con código 1 si algún check falla.

### 5.3 Ensayo de una migración con ROLLBACK (sin staging)

Patrón usado el 2026-10-24 para el hardening de funciones: todo dentro de un bloque `DO` que aplica el cambio, prueba lo que importa **con el rol real de la app** (`service_role`) y termina con `RAISE EXCEPTION`, que deshace todo (Postgres hace transaccional también el DDL y los grants).

```sql
DO $$
DECLARE r text := '';
BEGIN
  -- 1. El cambio, idéntico al archivo de la migración
  ALTER FUNCTION public.mi_funcion() SET search_path = public;

  -- 2. Comprobaciones de privilegios / resultados
  r := r || ' anon=' || has_function_privilege('anon', 'public.mi_funcion()', 'execute')::text;

  -- 3. DML que dispara los triggers afectados, como lo hace la app
  EXECUTE 'SET LOCAL ROLE service_role';
  INSERT INTO supervisores (nombre, whatsapp, activo) VALUES ('Prueba', '+57 300 000 0000', false);
  RESET ROLE;

  -- 4. Abortar: nada queda aplicado
  RAISE EXCEPTION 'ENSAYO_OK %', r;
END $$;
```

Reglas: (1) antes, revisar que ningún trigger tocado llame a servicios externos (`pg_net`, `http`); (2) después del ensayo, confirmar que no quedó rastro (filas de prueba = 0, privilegios como antes); (3) el `ENSAYO_OK` con los resultados se copia a la bitácora.

### 5.4 Pruebas end-to-end contra staging

```bash
# 1. Worktree del cambio con dependencias
cd "C:/Users/Juan Guerron/Documents/baird-app/.wt/<nombre>" && npm ci

# 2. .env.local del worktree apuntando a staging (WhatsApp, pagos, Siigo, correo y voz apagados)
node scripts/e2e/preparar-env-staging.mjs   --base="C:/Users/Juan Guerron/Documents/baird-app/.env.local"   --staging="C:/Users/Juan Guerron/Documents/baird-app/.env.staging-seed"

# 3. Levantar la app en :3100 (preview_start "staging-local", o npm run dev -- -p 3100) y correr
npm run e2e                     # los 4 flujos
npm run e2e -- --solo=A,C       # solo algunos
npm run e2e -- --json > e2e.json   # evidencia para el PR
```

Qué garantiza cada corrida: crea un técnico y un cliente propios en una ciudad ficticia (nadie más recibe la oferta), recorre cada flujo por la API real, comprueba en la base el estado esperado después de cada paso y borra todo al final. Se niega a correr si la base no es `baird-staging` o si la URL es la de producción. Una oferta queda en `error` cuando la whitelist bloquea el WhatsApp; la prueba la reabre antes de aceptar, como pasaría si el mensaje llegara.

Primera corrida (2026-10-26): **32/32 en 39 s**, sin ningún WhatsApp enviado (todos filtrados) y sin restos en staging.

Cuándo correrla: **todo PR tipo B, C o F antes del merge**; además, después de aplicar una migración en staging y antes de llevarla a producción.

---

## 6. Protocolo de despliegue

### 6.1 Ventana

- **Lunes a jueves, 22:00–23:00 Bogotá** (actividad mínima medida en 60 días; ver plan § 2). Si el dueño confirma baja actividad, se puede extender dentro de la noche.
- **Prohibido 14:00–16:30** (pico) y en los minutos de cron 17:00, 17:15, 20:00, 22:15.
- Con redeploy: **fuera de :13–:17 y :58–:02**.
- **No agendar despliegues desatendidos con el cron de sesión de Claude**: si el PC se suspende, la tarea arranca tarde (pasó el 2026-10-24). El despliegue se lanza con alguien frente al PC.

### 6.2 Go / no-go (todo debe estar en verde)

| # | Check | Cómo |
|---|---|---|
| 1 | Hora dentro de la ventana | `date` |
| 2 | PR abierto, `mergeable_state=clean`, head = el commit probado | GitHub (API o web) |
| 3 | CI en verde en ese head | Check `verificar` del PR |
| 4 | `main` no avanzó desde la última prueba del código combinado | `git log <base>..origin/main` vacío |
| 5 | Preview del head en READY | Vercel |
| 6 | Producción sana antes de tocar | `node scripts/smoke.mjs` 15/15 + `net._http_response` en 200 |
| 7 | Destino de rollback anotado | id del deploy de producción actual |
| 8 | Migraciones y plantillas que el código necesita, ya aplicadas / `APPROVED` | README de migraciones, `--check` |
| 9 | **E2E en verde contra staging** con el código del PR (tipos B, C y F) | `npm run e2e` (§ 5.4); pegar el resumen en el PR |

### 6.3 Ejecución

1. Merge del PR (método *merge*, con el `sha` esperado para que GitHub rechace si cambió).
2. Esperar el deploy de producción del commit de merge hasta READY. Si el build falla, producción sigue en el deploy anterior: no hace falta rollback.
3. **Monitoreo 15 minutos**, una ronda cada 3–5 minutos:
   - `node scripts/smoke.mjs` → 15/15.
   - Errores de runtime de Vercel del deploy nuevo: ninguno nuevo frente a la línea base.
   - `select status_code, created from net._http_response order by id desc limit 5;` → 200 (crons de Supabase hacia la app).
4. **Criterio de rollback**: smoke con algún fallo que no estaba antes, 5xx en páginas o crons, o errores nuevos repetidos atribuibles al deploy.
5. Cierre en la bitácora: sha del merge, id del deploy, hora, rondas del smoke.

## 7. Rollback

| Qué falló | Cómo se revierte | Tiempo |
|---|---|---|
| Código (deploy) | Vercel → Deployments → *Instant Rollback* al deploy anterior (o MCP `request_rollback`). Luego `git revert -m 1 <merge>` en un PR. | < 2 min |
| Migración | SQL de rollback escrito en el mismo archivo de la migración | < 1 min |
| Env var | Instant Rollback (restaura el snapshot de env del deploy anterior) o quitar la variable y redesplegar | < 3 min |
| Plantilla WhatsApp | Volver a la versión anterior en el código (las plantillas viejas siguen aprobadas en Meta) | Un PR tipo B |

## 8. Incidentes

1. **Detectar**: smoke en rojo, errores en Vercel, aviso de un técnico o del equipo.
2. **Contener**: rollback según § 7, sin esperar el diagnóstico.
3. **Comunicar**: al equipo por WhatsApp interno; a clientes o técnicos solo si quedaron afectados (con texto aprobado).
4. **Diagnosticar** fuera de producción (local, preview, staging o ensayo con ROLLBACK).
5. **Postmortem** breve en `docs/SEGURIDAD.md` § "Histórico de incidentes" (si es de seguridad) o en el doc del área: qué pasó, impacto, causa raíz, qué barrera faltó y qué se agregó.

## 9. Varias sesiones en el mismo repo

- Antes de cambiar de rama o hacer `reset`/`stash`, revisar `git status`: si hay cambios que no son tuyos, **no toques el árbol**; usa un worktree en `.wt/`.
- Nunca `git stash` sin etiqueta (la pila es compartida entre worktrees).
- `push` de una rama cuando quieras; **merge a `main` solo con OK explícito** del dueño (es un deploy).
- Actualizar `main` local sin checkout: `git fetch origin main:main`.

## 10. Herramientas

| Herramienta | Estado | Para qué |
|---|---|---|
| GitHub Actions | ✅ | CI |
| GitHub CLI (`winget install GitHub.cli`) | ⏳ no instalada | `gh pr create/merge/checks`; hoy se usa la API con la credencial de git |
| Vercel CLI (`npm i -g vercel`) | ⏳ no instalada | `vercel env`, `vercel logs`, `vercel rollback` |
| PostgreSQL client 17 (`pg_dump`, `psql`) | ⏳ no instalado | Volcar el schema para staging |
| Docker Desktop + Supabase CLI | ⏳ no instalado | Staging local (`npx supabase start`) |

## 11. Hoja de ruta de madurez

| Nivel | Qué incluye | Estado |
|---|---|---|
| 1 · Manual | Reglas escritas, verificación local, merge = deploy | ✅ hasta 2026-10-23 |
| 2 · Barreras | CI en cada PR, plantilla de PR, ventana con datos, smoke test, ensayo de migraciones, rollback escrito | ✅ **2026-10-24** |
| 3 · Protegido | Protección de rama en `main` (CI obligatorio + PR), `CRON_SECRET`, backups diarios de la BD | ⏳ protección de rama tras el primer CI verde; backups requieren Supabase Pro |
| 4 · Ambiente de pruebas | `baird-staging` con seed anonimizado, e2e de 4 flujos; previews contra staging; migraciones con Supabase CLI | ✅ staging + e2e **2026-10-26**; ⏳ variables de Preview en Vercel y Supabase CLI |
| 5 · Automatizado | E2E automático en CI contra la preview (con bypass de Vercel) en cada PR; Playwright para la UI; Sentry o log drain con alertas; Rolling Releases | ⏳ |
