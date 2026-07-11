# Plan RLS — Auditoría y migración sin ruptura

> Creado 2026-07-11. Auditoría hecha contra la BD de producción (`ceblicvdmephhktedsyv`)
> vía MCP de Supabase + inventario línea-por-línea del código. Objetivo: cerrar la capa
> de datos (hoy abierta al anon key) sin romper la app en producción.
> Relacionado: `docs/SEGURIDAD.md`, `docs/GOTCHAS.md`, `supabase/migrations/README.md`.

---

## 1. Auditoría del estado actual (2026-07-11, verificado en vivo)

### 1.1 RLS por tabla (BD prod)

| Tabla | RLS | Policies anon/public de ESCRITURA | Riesgo |
|---|---|---|---|
| `solicitudes_servicio` | **OFF** | (policies existen pero inactivas) | 🔴 Crítico — tabla central, PII de clientes, tokens de todos los flujos. Con anon key: SELECT/UPDATE/INSERT/DELETE total |
| `especialidades_tecnico` | **OFF** | (policies inactivas) | 🔴 Sin restricción alguna |
| `tecnicos` | ON | anon INSERT/UPDATE/DELETE `true` | 🔴 Cualquiera puede borrar/editar técnicos; SELECT expone tokens |
| `supervisores` | ON | anon INSERT/UPDATE/DELETE `true` | 🔴 SELECT anon expone `portal_token` (= acceso al portal) y hash OTP |
| `llamadas` | ON | anon INSERT/UPDATE/DELETE `true` | 🟠 |
| `notificaciones_whatsapp` | ON | anon INSERT/UPDATE `true` | 🟠 SELECT anon expone historial |
| `evidencias_servicio` | ON | anon INSERT/UPDATE `true` | 🟠 PII (fotos, firmas, GPS) |
| `repuestos_pendientes` | ON | public INSERT/UPDATE `true` | 🟠 |
| `gps_pings` | ON | public INSERT `true` | 🟡 |
| `solicitud_eventos` | ON | public INSERT `true` + SELECT `true` | 🟡 Auditoría falsificable |
| `connection_errors` | ON | anon INSERT `true` + SELECT `true` | 🟡 SELECT anon innecesario |
| `cliente_historial` | ON | solo service_role | ✅ Única tabla bien cerrada |

Advisors Supabase: 4 ERROR (RLS off / policies inactivas), ~20 WARN (`USING(true)`),
leaked-password protection OFF, 4 funciones con `search_path` mutable.

### 1.2 Storage

Los 3 buckets (`evidencias-servicio`, `tecnicos-fotos`, `tecnicos-documentos`) son
`public=true` con INSERT/UPDATE público por bucket. Listing ya cerrado (2026-06-24).
Evidencias contiene PII (fotos de hogares, firmas).

### 1.3 Código (inventario completo del repo)

- **Todo el runtime usa el singleton anon** (`src/lib/supabase.ts`) — client y server.
- `src/lib/supabase-admin.ts` (service_role) **existe pero nunca se importa** en la app.
  Único uso real de service_role: `scripts/backfill-geocoding.mjs`.
- **Escrituras client-side (browser → BD, se romperán al endurecer):**
  - `/registro` → insert/update/delete `tecnicos`, insert `especialidades_tecnico`, upload a 2 buckets
  - `admin/tecnicos/[id]` → update `tecnicos`
  - `tecnico/[token]/completar/[id]` → update `solicitudes_servicio`, insert/update `evidencias_servicio`, upload bucket
  - `admin/test` (página seed)
- **Lecturas client-side (browser → BD):** los 7 portales token (`/aceptar`, `/horario`,
  `/cotizacion`, `/confirmar`, `/servicio`, `/reprogramar-repuesto`, `/verificar-paso`),
  todo `/admin/*`, `tecnico/[token]/**` — leen `solicitudes_servicio`, `tecnicos`,
  `especialidades_tecnico`, `notificaciones_whatsapp`, `repuestos_pendientes`,
  `evidencias_servicio`, `solicitud_eventos`, `connection_errors` con anon.
  Excepción (patrón a copiar): portal `/supervisor` pasa por `/api/supervisor/*` con
  scope server-side (`src/lib/auth/supervisor.ts`).
- **Server-side:** ~25 API routes + 6 services escriben con anon. Crons (`gps-followup`,
  `horario-recordatorio`) también.
- **Auth admin:** `verificarAdmin` usa `supabase.auth.getUser(token)` con anon + allowlist
  de emails — esto NO depende de RLS y no hay que tocarlo.
- Scripts anon que deben pasar a service_role al endurecer: `enviar-resumen-supervisores.mjs`,
  `subir-resumen-link.mjs`, `verify-flows.mjs`.

### 1.4 Conclusión

El problema no es "activar RLS" (dos `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`): es que
**la app entera opera con el anon key**, así que activar RLS restrictivo hoy tumba
producción. La migración correcta es: primero mover el tráfico a canales privilegiados
(service_role server-side, API routes para el browser), y **al final** cerrar las policies.
Cada fase es independiente, verificable y con rollback.

---

## 2. Plan de implementación por fases

**Principio rector:** ninguna fase cambia comportamiento visible hasta la Fase 4.
Las fases 1–3 son puramente aditivas/reorganizativas y dejan la BD igual de abierta
(pero el tráfico ya no depende de que esté abierta). La Fase 4 cierra tabla por tabla.

### Fase 0 — Red de seguridad (½ día, cero riesgo)

1. Confirmar/crear `SUPABASE_SERVICE_ROLE_KEY` en Vercel (Production + Preview).
   **← Requiere acción tuya** (yo no manejo la key; ver §4).
2. Guard anti-fuga en `supabase-admin.ts`: `throw` si `typeof window !== 'undefined'`
   (que el cliente service_role jamás llegue al bundle del browser). Verificar además
   que `SUPABASE_SERVICE_ROLE_KEY` no tenga prefijo `NEXT_PUBLIC_`.
3. Script de smoke-test E2E (`scripts/smoke-rls.mjs`): crea solicitud de prueba
   (con `BAIRD_TEST_PHONE_WHITELIST`), recorre portal token, login admin, completar,
   y limpia. Es la vara de verificación de TODAS las fases siguientes.
4. Snapshot SQL de policies actuales guardado en el repo (rollback documentado).

### Fase 1 — Server-side a service_role (1 día, riesgo bajo)

Cambiar el import `supabase` → `getSupabaseAdmin()` en **código exclusivamente server**:
todas las rutas `src/app/api/**` y los services (`transiciones`, `whatsapp`, `solicitud`,
`geocoding`, `dapta`). `verificarAdmin` y el login admin siguen con anon (correcto).

- Comportamiento idéntico: service_role bypasea RLS, y con RLS off también funciona igual.
- Riesgo real único: importar el admin client desde un archivo `'use client'` → lo bloquea
  el guard de Fase 0 en build/runtime de preview, no en prod.
- **Verificación (redundante):** `tsc` + `lint` + `build` → deploy **preview** → smoke E2E
  contra preview → revisar logs runtime Vercel → recién ahí merge a prod → smoke E2E prod.

### Fase 2 — Escrituras del browser a API routes (1–2 días)

| Superficie | Destino |
|---|---|
| `/registro` | `POST /api/registro` (insert tecnicos + especialidades server-side; uploads siguen client por ahora — el bucket ya limita por `bucket_id`) |
| `admin/tecnicos/[id]` | ruta admin con `verificarAdmin` (patrón ya existente) |
| `tecnico/[token]/completar/[id]` | extender `/api/completar-servicio` (ya existe) validando token server-side |
| `admin/test` | protegerla con `verificarAdmin` o eliminarla de prod |

Misma verificación redundante que Fase 1 (preview → smoke → prod).

### Fase 3 — Lecturas del browser a API routes (2–4 días, la más voluminosa)

- **Portales token (7):** endpoints `GET /api/portal/...` que validan el token server-side
  y devuelven solo las columnas necesarias (sin `*_token` ajenos) — copiar el patrón probado
  de `/api/supervisor/*`. Alternativa más corta: funciones RPC `SECURITY DEFINER`
  (`get_solicitud_por_token(uuid)`); recomiendo API routes por consistencia con lo ya hecho.
- **Admin:** páginas `/admin/*` leen vía rutas admin con Bearer + `verificarAdmin`
  (varias ya existen; es completar el patrón).
- Se puede hacer **portal por portal** — cada uno se migra, se verifica y se despliega solo.

### Fase 4 — El cierre: activar RLS y endurecer policies (tabla por tabla, NUNCA big bang)

Orden de menor a mayor riesgo, una migración por tabla, en horario valle:

1. **Solo-server** (tras Fase 1 nada del browser las toca): `llamadas`, `supervisores`,
   `gps_pings`, `solicitud_eventos`, `notificaciones_whatsapp`, `repuestos_pendientes`
   → drop policies anon, dejar solo service_role.
2. `connection_errors` → quitar SELECT anon (mover `/admin/errores` a API en Fase 3);
   mantener INSERT anon (el log-error client lo necesita) o moverlo también.
3. `tecnicos`, `evidencias_servicio` → tras Fase 2/3.
4. **Al final:** `ENABLE ROW LEVEL SECURITY` en `solicitudes_servicio` y
   `especialidades_tecnico` + policies deny-by-default (solo service_role).

**Protocolo por migración (redundancia pedida):**
1. Migración con **rollback SQL preescrito** en el mismo archivo (comentado).
2. Aplicar → `get_advisors` (Supabase) debe bajar, no subir.
3. Diff de `pg_policies` contra snapshot esperado.
4. Smoke E2E completo.
5. Monitoreo 24h: logs Vercel (errores 500/PGRST) + logs Supabase (permission denied).
6. Cualquier síntoma → ejecutar rollback SQL (re-crear policy permisiva / disable RLS);
   es instantáneo y no requiere deploy.

### Fase 5 — Hardening complementario (post-RLS)

- **Dashboard Supabase Auth (acción tuya, ver §4):** apagar self-signup (sigue abierto,
  probado 2026-07-06), prender leaked-password protection, evaluar MFA.
- Buckets → `public=false` + signed URLs (`createSignedUrl`); fase aparte porque toca
  links en WhatsApp (PDF resumen semanal) — planear con `docs/WHATSAPP_TEMPLATES.md`.
- `ALTER FUNCTION ... SET search_path = ''` en las 4 funciones señaladas por advisors.
- Scripts `.mjs` anon → service_role.
- Rate limiter real (Upstash/KV) — hoy es per-isolate best-effort.

---

## 3. Estado de MCPs (verificado 2026-07-11)

| MCP | Estado | Alcance |
|---|---|---|
| Supabase | ✅ conectado | SQL, migraciones, advisors, logs sobre el proyecto prod `ceblicvdmephhktedsyv` |
| Vercel | ✅ conectado | proyecto `baird-app`, deployments, logs de build/runtime. **No expone env vars** (para eso: CLI `vercel env`, no instalado — `npm i -g vercel`) |
| Chrome | ✅ conectado | 1 navegador local (Windows) disponible para coordinar dashboards |

## 3bis. Bitácora de ejecución

- **2026-07-11 — Fase 0 ✅ hecha.**
  - Guard anti-fuga: ya existía en `src/lib/supabase-admin.ts` (throw en browser, key sin
    `NEXT_PUBLIC`, init perezoso). No requirió cambios.
  - Snapshot de rollback: `supabase/rls-rollback-snapshot-2026-07-11.sql`.
  - `SUPABASE_SERVICE_ROLE_KEY` puesta en Vercel (Production + Preview) por el usuario.
  - Auth (opciones gratuitas): **self-signup APAGADO** ✅. Leaked-password protection
    **DIFERIDO** — requiere plan Pro; se activa cuando se cambie de plan. MFA idem.
- **2026-07-11 — Fase 1 (código) ✅ hecha, verificación local ✅.**
  - Rama `seguridad/rls-fase1`. 35 archivos server-side (28 rutas API + 7 services/auth)
    cambiaron `import { supabase } from '@/lib/supabase'` →
    `import { supabaseAdmin as supabase } from '@/lib/supabase-admin'`.
  - Excluidos a propósito: `src/lib/auth/admin.ts` (anon para `auth.getUser`), `supabase-admin.ts`.
  - Verificado: `tsc --noEmit` (0 errores), `lint` (0 errores, 6 warnings preexistentes),
    `build` (exit 0 — compila client+server, incl. `verificar-paso/[token]` que jala whatsapp.service).
  - **Runtime verificado en preview** (deploy `dpl_Gd2jPGyy8mdnBAKWWX4no8PNyKWL`, rama
    `seguridad/rls-fase1`): `GET /api/health` → `healthy` (select real sobre `tecnicos` con
    service_role) y `GET /api/disponibilidad-horario?fecha=2026-07-14` → `agendable:true`
    (read vía `agenda.service`). Dos code paths service_role confirmados contra la BD prod.
  - **Pendiente:** merge del PR → deploy a prod → re-verificar `/api/health` en prod.
    (PR lo abre el usuario: no se toca `main` directo; `gh` no instalado.)

## 4. Lo que necesito de ti (bloqueantes)

1. **`SUPABASE_SERVICE_ROLE_KEY` en Vercel** (Production + Preview). La copias del
   dashboard Supabase → Settings → API. Yo no debo manipular la key. Sin esto no arranca la Fase 1.
2. **Dashboard Supabase → Authentication → Settings:** apagar "Allow new users to sign up",
   prender "Leaked password protection". (Puedo guiarte con Chrome si quieres, pero el
   click es tuyo — son settings de seguridad.)
3. **Decisión de alcance:** ¿Fases 1–4 completas, o priorizamos el cierre exprés de las
   tablas solo-server (Fase 1 + Fase 4.1, ~2 días) y las superficies client-side después?
