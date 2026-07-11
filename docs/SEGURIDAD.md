# Seguridad — Baird Service

> Doc canónico de **autenticación y autorización**. Última revisión: **2026-05-12**.
>
> Antes de tocar un endpoint admin o agregar uno nuevo, **lee la sección "Endpoints API" y replica el patrón** de `verificarAdmin`.

---

## TL;DR

- **Frontend admin**: protegido por sesión Supabase Auth **+ allowlist de emails** (`/admin/layout.tsx`). Sin sesión o email fuera de la lista → `signOut()` + redirect a `/admin/login`.
- **API admin**: protegida por `Authorization: Bearer ${session.access_token}` verificado con `verificarAdmin()` del helper compartido `src/lib/auth/admin.ts`. **`verificarAdmin` exige que el email esté en la allowlist** (`src/lib/auth/adminEmails.ts`), no solo que la sesión sea válida — autenticado ≠ admin (2026-07-06).
- **API cliente / técnico**: protegida por **tokens UUID opacos** (alta entropía) — `cliente_token`, `horario_token`, `portal_token`, etc.
- **Cron jobs**: protegidos por header `Authorization: Bearer ${CRON_SECRET}` (env var).
- **Webhook Meta**: HMAC-SHA256 con `WHATSAPP_WEBHOOK_SECRET`.

---

## 1. Frontend `/admin/*`

### Login
- `src/app/admin/login/page.tsx` — formulario email+password.
- Llama `supabase.auth.signInWithPassword({ email, password })`.
- Supabase devuelve `session` con `access_token` (JWT). Se persiste en cookies/localStorage automáticamente.
- **Las cuentas admin se crean manualmente desde el dashboard de Supabase** (Auth > Users > Add user).
- ⚠️ **El self-signup de Supabase Auth estaba ABIERTO** (verificado 2026-07-06: `POST /auth/v1/signup` con el anon key devolvía 200 creando un user). La app no expone signup, pero la API de GoTrue sí. Con el gate viejo ("autenticado = admin") eso permitía a cualquiera registrarse con su propio email, confirmarlo y quedar como admin. **Mitigado en código** con la allowlist (`adminEmails.ts`). **Pendiente en el dashboard**: apagar "Allow new users to sign up" (Authentication → Sign In / Providers → Email) para cerrarlo en la fuente.

### Allowlist de emails admin
- `src/lib/auth/adminEmails.ts` — `esEmailAdmin(email)` es la única fuente de verdad de quién es admin. Se usa en los 3 puntos: login (`/admin/login`), guard del layout (`/admin/layout.tsx`) y gate de API (`verificarAdmin`).
- Configurable por env var **`ADMIN_EMAILS`** (server, CSV) y **`NEXT_PUBLIC_ADMIN_EMAILS`** (cliente, CSV). Si ninguna está definida, cae a un default hardcodeado (`jdguerron@bairdservice.com`) para no romper prod. Para agregar un admin: crear la cuenta en Supabase **y** añadir el email a ambas env vars en Vercel.

### Guard de rutas
- `src/app/admin/layout.tsx` corre `supabase.auth.getSession()` en cada render del layout.
- Sin sesión → `router.push('/admin/login')`.
- **Limitación**: el check es **client-side**. El HTML del `/admin/*` se sirve igualmente; el redirect ocurre al hidratar React. Los datos sensibles NO se filtran (los queries dependen de la session válida), pero un atacante puede ver el HTML estructural por una fracción de segundo.

### Logout
- `supabase.auth.signOut()` limpia la sesión local. El JWT del lado del servidor sigue siendo válido hasta su `exp` (típicamente 1h en Supabase con auto-refresh).

---

## 2. Endpoints API — mapa de auth

### Admin (Bearer token Supabase)

Helper: `verificarAdmin()` en `src/lib/auth/admin.ts`. Patrón:

```ts
import { verificarAdmin } from '@/lib/auth/admin'

export async function POST(req: NextRequest) {
  const isAdmin = await verificarAdmin(req)
  if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // ... resto del handler
}
```

Llamada desde UI:
```ts
const { data: { session } } = await supabase.auth.getSession()
if (!session) { /* manejar sesión expirada */ }
const res = await fetch('/api/admin/...', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ ... }),
})
```

Endpoints protegidos con `verificarAdmin`:

| Endpoint | Método | Para qué |
|---|---|---|
| `/api/admin/export` | POST | Descarga Excel multi-hoja de solicitudes |
| `/api/admin/reenviar-ultimo-mensaje` | POST | Re-disparar la plantilla correspondiente al estado actual |
| `/api/admin/editar-solicitud` | POST | Editar manualmente tipo_equipo, horario_confirmado, dirección, ciudad, zona. Cambios auditados en `solicitud_eventos` con diff |
| `/api/admin/cambiar-estado` | POST | Forzar el `estado` de una solicitud (recuperación de flujos atascados). Auditado en `solicitud_eventos` (`tipo='cambio_estado_admin'`). No envía WhatsApp |
| `/api/admin/notas` | POST | Agregar nota interna a una solicitud. Insert append-only en `solicitud_eventos` (`tipo='nota_admin'`, `payload.origen='nota_manual'`); `actor` = email del admin autenticado (variante `obtenerEmailAdmin`). No envía WhatsApp |
| `/api/admin/supervisores` | GET/POST/PUT/DELETE | CRUD de la tabla `supervisores` (destinatarios de avisos WhatsApp por cambio de estado). POST dispara bienvenida `supervisor_bienvenida_v1` si el supervisor queda activo |
| `/api/admin/reagendar-solicitud` | POST | Reagendar con calendario (fecha + franja): materializa `fecha_visita_at` y notifica cliente + técnico + supervisores. Avisos no bloqueantes de cupo/fecha (variante `obtenerEmailAdmin`) |
| `/api/admin/actualizar-valor` | POST | Ajustar el valor al cliente de un servicio particular; reabre aprobación y notifica |
| `/api/admin/pedir-repuesto-supervisores` | POST | Enviar pedido de repuesto en garantía a supervisores con visibilidad de la marca (variante `obtenerEmailAdmin`) |
| `/api/carga-masiva` | POST + DELETE | Bulk upload BITÁCORA Excel y borrado masivo |
| `/api/whatsapp/notify` | POST | Re-notificar técnicos o re-enviar plantilla horario |
| `/api/cotizacion-precios` | POST | Admin fija precios + tiempo entrega (gate de pricing) |
| `/api/repuesto-recibido` | POST | Admin marca repuesto como recibido y reactiva el servicio |

### Cliente / Técnico (token UUID en URL o body)

No usan Supabase Auth — usan tokens opacos UUID v4. Cada token tiene un propósito específico y vive en una columna dedicada con índice.

| Endpoint | Token | Columna |
|---|---|---|
| `/api/confirmar-horario` | `horario_token` | `solicitudes_servicio.horario_token` |
| `/api/solicitud/cancelar` | `cliente_token` | `solicitudes_servicio.cliente_token` |
| `/api/solicitud/reagendar` | `cliente_token` | `solicitudes_servicio.cliente_token` |
| `/api/verificar-paso` | `verificacion_paso_token` | `solicitudes_servicio.verificacion_paso_token` |
| `/api/confirmar-servicio` | `confirmacion_token` | `evidencias_servicio.confirmacion_token` |
| `/api/aprobar-cotizacion` | `cotizacion.token` (JSONB) | `solicitudes_servicio.cotizacion->>'token'` ⚠️ |
| `/api/diagnostico` | `portal_token` (técnico) | `tecnicos.portal_token` |
| `/api/completar-servicio` | `portal_token` (técnico) | `tecnicos.portal_token` |
| `/api/whatsapp/accept` | token de notificación | `notificaciones_whatsapp.token` |
| `/api/supervisor/solicitudes` | `portal_token` (supervisor) | `supervisores.portal_token` |
| `/api/supervisor/solicitud` | `portal_token` (supervisor) | `supervisores.portal_token` |

### Portal de supervisores (solo lectura, scope server-side) — 2026-07-06

Un supervisor entra por link mágico `/supervisor/{portal_token}` (UUID v4, mismo
modelo que `tecnicos.portal_token`) y ve, en **solo lectura**, únicamente las
solicitudes de su **alcance** (`ambito` + `marca`, mismo predicado que
`notificarCambioEstado`).

**Clave de seguridad**: el filtro de alcance se aplica **en el servidor**
(`src/lib/auth/supervisor.ts` + las rutas `/api/supervisor/*`), nunca en el
cliente. Las páginas admin leen `solicitudes_servicio` con el anon key, que ve
toda la tabla (RLS off); si el portal filtrara en el browser, el supervisor
podría pedir la tabla completa con el mismo anon key y saltarse su alcance. Por
eso el portal **no** consulta Supabase desde el browser: todo pasa por las API
que resuelven el token y filtran. El detalle (`/api/supervisor/solicitud`)
verifica que el `id` pedido esté en scope antes de responder (403 si no) y
**nunca devuelve columnas de token** (lista blanca explícita de columnas).

El link se envía por WhatsApp (`supervisor_acceso_v1`, botón URL dinámico) vía
`POST /api/admin/supervisores/enviar-acceso` (admin), que además devuelve el link
para copiar/pegar mientras Meta aprueba la plantilla. Revocar acceso = poner el
supervisor `activo=false` (el resolver rechaza inactivos).

#### Entrada de autoservicio con OTP — 2026-07-09

Además del link mágico enviado por el admin, el supervisor puede entrar solo
por **`/supervisor`**: ingresa su número de WhatsApp → `POST
/api/supervisor/enviar-codigo` verifica que exista un supervisor **activo** con
ese número (dígitos normalizados, mismos del trigger BD) y le envía un OTP de 6
dígitos (`supervisor_codigo_v1`, categoría AUTHENTICATION — APPROVED al
instante) → `POST /api/supervisor/verificar-codigo` valida y devuelve la URL
`/supervisor/{portal_token}`. El `portal_token` sigue siendo la credencial.

Controles (migración `20260709_supervisor_codigo_acceso.sql`):
- Solo se persiste **sha256(supervisor_id + ":" + código)** — nunca el código
  en claro (el anon key puede leer `supervisores`; un OTP legible sería filtrable).
- Expira a los **10 min**; **un solo uso** (se invalida al verificar); máximo
  **5 intentos** por código (al agotarse se invalida); comparación en
  **tiempo constante** (`crypto.timingSafeEqual`).
- **Cooldown de reenvío 60s** por supervisor + **rate limit por IP** en
  middleware (enviar-codigo 5/min, verificar-codigo 10/min).
- El endpoint **revela** si un número pertenece a un supervisor (mensaje "este
  número no está asociado…") — decisión de producto explícita; la enumeración
  queda acotada por el rate limit.

⚠️ **Antipatrón conocido**: el token de cotización está dentro de un JSONB → se filtra cargando todas las solicitudes en estado `cotizacion_enviada` y buscando en JS. Backlog: migrar a columna generada con índice único. Detalles en `docs/SUPABASE.md` § "Supabase Architecture" → "Filtros JSONB".

### Cron (env var `CRON_SECRET`)

```ts
const authHeader = req.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}
```

| Endpoint | Cadencia | Para qué |
|---|---|---|
| `/api/cron/horario-recordatorio` | Cada hora | Recordatorio T-24h + transición a `sin_agendar` (T-24h+12h) |
| `/api/cron/gps-followup` | Cada 10 min | Flag silencioso si GPS post-visita está a < 100m del cliente |

Configurados en `vercel.json`.

El mismo gate `Bearer CRON_SECRET` (más `ENABLE_TEST_ENDPOINTS=true`, sin el cual responde 404) protege `/api/test-whatsapp` — GET de diagnóstico de configuración WhatsApp (presencia de env vars, whitelist activa, validez del token, salud del número). No filtra secretos ni envía mensajes.

### Webhook Meta (HMAC)

- `/api/whatsapp/webhook` — verifica firma HMAC-SHA256 con `WHATSAPP_WEBHOOK_SECRET`.
- Implementación en `verificarFirmaWebhook()` de `whatsapp.service.ts`.
- Sin firma válida → 401.

### Webhook Dapta (HMAC)

- `/api/dapta/webhook` — webhook POST-CALL de la segunda línea de voz IA. Verifica firma/token con `DAPTA_WEBHOOK_SECRET`; idempotente por `dapta_call_id` (índice UNIQUE parcial en tabla `llamadas`). Fase 0 desplegada pero apagada (`DAPTA_ENABLED=false`). Ver `docs/DAPTA.md`.

### Público por diseño

| Endpoint | Por qué público |
|---|---|
| `/api/solicitar` | Cualquiera crea solicitud (es la entrada del marketplace). |
| `/api/health` | Health check para Vercel/UptimeRobot. |
| `/api/gps-ping` | Browser del técnico envía GPS — el técnico ya está autenticado por `portal_token` en la URL del portal, pero el endpoint mismo es público. Backlog: pasar `portal_token` en body y validar. |

---

## 3. Tokens — modelo y rotación

| Token | Tipo | Dónde se genera | Rotación |
|---|---|---|---|
| `cliente_token` | UUID v4 | Default DB + override en `/api/solicitar` | Nunca rota (durable, sirve al cliente para toda la vida de la solicitud) |
| `horario_token` | UUID v4 | Default DB | Nunca rota; consumido en confirmación pero queda visible para audit |
| `verificacion_paso_token` | UUID v4 | Generado en `/api/diagnostico` | Nunca rota |
| `confirmacion_token` | UUID v4 | Generado al completar servicio | Nunca rota |
| `cotizacion.token` | UUID v4 | Generado en `/api/diagnostico` (particular) | Nunca rota |
| `portal_token` | UUID v4 | Generado al aceptar primer servicio en `procesarAceptacion` | Nunca rota — **secret del técnico**, vale para todas sus solicitudes |
| `notificaciones_whatsapp.token` | UUID v4 | Generado en `notificarTecnicos` | Único por notificación |

**Seguridad**: UUID v4 = 122 bits de entropía. Imposible de adivinar; OK como bearer en URL.

**Riesgo**: si un técnico filtra su `portal_token` (lo comparte, screenshot público, etc.) cualquier persona con esa URL puede ver sus solicitudes asignadas y completarlas. **Mitigación pendiente**: agregar `signed_urls` con TTL o pedir PIN al técnico la primera vez. Por ahora se asume que el técnico cuida su URL (igual que un password).

---

## 4. RLS en Supabase — estado actual

Estado verificado contra producción **2026-05-23** (`pg_tables.rowsecurity`):

| Tabla | RLS | Anon | Nota |
|---|---|---|---|
| `solicitudes_servicio` | ❌ | full | **Gap activo** — tabla principal con todo el PII del cliente. Toda la seguridad recae en tokens UUID en URLs |
| `especialidades_tecnico` | ❌ | full | OK — datos no sensibles (lista de especialidades por técnico) |
| `tecnicos` | ✅ | full | Habilitada — `portal_token` sigue siendo el secret efectivo de acceso al portal |
| `evidencias_servicio` | ✅ | full | Habilitada — token `confirmacion_token` complementa |
| `notificaciones_whatsapp` | ✅ | full | Habilitada — el token único de cada notificación es el secret |
| `repuestos_pendientes` | ✅ | service_role-only | Solo backend |
| `gps_pings` | ✅ | `INSERT true` | service_role = ALL; SELECT requiere service_role |
| `solicitud_eventos` | ✅ | `SELECT true`, `INSERT true` | service_role = ALL |
| `cliente_historial` | ✅ | service_role-only | Solo backend (no-show tracking) |

⚠️ **El "✅ Habilitada" engaña (verificado 2026-06-24):** varias de las tablas con RLS on tienen policies de escritura `USING(true)`/`WITH CHECK(true)` para anon → la RLS está **efectivamente bypasseada en writes**. En particular `tecnicos`, `supervisores` y `llamadas` permiten **DELETE/UPDATE/INSERT anon**. Apretar esto requiere primero mover los writes de la app (registro client-side, singleton server-side) a `service_role`. Ver § 7 ítem 1.

**Backlog activo**: solo quedan `solicitudes_servicio` y `especialidades_tecnico` sin RLS. La habilitación de `solicitudes_servicio` **no es un toggle trivial** — la app entera consulta esa tabla con el `anon_key` (singleton client). Habilitar RLS con policies restrictivas rompe el sitio; habilitarlo con `USING (true)` para anon es seguridad-teatro. Plan correcto (ver § 7): mover queries server-side a `service_role` + diseñar policies anon por token.

---

## 5. Storage buckets

| Bucket | Contenido | Acceso |
|---|---|---|
| `evidencias-servicio` | Fotos del diagnóstico y completación | **Público** (`getPublicUrl`) |
| `tecnicos-fotos` | Foto de perfil del técnico | **Público** |
| `tecnicos-documentos` | Documento de identidad del técnico (PII) | **Público** ⚠️ |

⚠️ **`tecnicos-documentos` PII expuesto**: cualquiera con la URL puede descargar la cédula del técnico. **Backlog**: migrar a `createSignedUrl()` (TTL 1h) en `src/lib/uploadHelpers.ts`. Mismo aplica con menor severidad a las otras dos.

**No publicar URLs de documentos en lugares públicos** (issues, Slack público, screenshots, etc.).

---

## 5.1 Verificación de flujos críticos (smoke test)

`scripts/verify-flows.mjs` corre los SELECTs anon que la app hace desde el browser sobre las 8 tablas críticas + un ciclo completo de subida / lectura / borrado en el bucket `evidencias-servicio`. Es exactamente lo que rompió la vez anterior cuando se tocó RLS sin pensar.

```bash
node --env-file=.env.local scripts/verify-flows.mjs
```

Salida esperada: `✅  Todos los checks pasaron (11/11)`. Exit 1 si algo falla.

**Cuándo correrlo**:
- **Antes** de cualquier cambio de RLS, policy o permisos en Supabase → baseline.
- **Inmediatamente después** → confirmar que el cambio no rompió SELECTs anon ni la subida de evidencia.
- Tras cada deploy a Vercel que toque queries → confirmar que el cliente anon sigue funcionando.

Si falla después de un cambio: **revertir el cambio antes de que un usuario lo encuentre**. El script no requiere admin ni credenciales — solo el anon key del `.env.local`, igual al del browser.

Limitación: no simula el caso "admin logueado en mismo navegador → rol `authenticated`" (ver gotcha en `docs/GOTCHAS.md`). Ese se prueba manualmente desde el browser después del fix de Storage policies.

---

## 6. Histórico de incidentes y fixes

### 2026-06-24 — Auditoría de seguridad (Supabase advisors en vivo + lectura de código)

**Capa de auth: sólida.** 12 endpoints admin con `verificarAdmin` (ya usa el singleton); webhooks Meta + Dapta con HMAC + `timingSafeEqual`; security headers single-source en `middleware.ts`; `escapeLikePattern` aplicado en el único `.ilike()`; `/api/gps-ping` **ya valida `portal_token`** (backlog #8 quedó cerrado); `/api/solicitar` recalcula `pago_tecnico` server-side. Varios ítems del viejo improvement-plan estaban ya resueltos.

**Hallazgo nuevo — capa de datos expuesta.** Con el `anon_key` (extraíble del bundle JS) cualquiera puede **DELETE / UPDATE / INSERT en `tecnicos`, `supervisores` y `llamadas`**: esas tablas "tienen RLS" pero con policies `USING(true)` (advisor `0024_permissive_rls_policy`). Borrar técnicos o pisar datos es trivial. **Raíz**: la app escribe con el `anon_key` — `/registro` inserta/borra/actualiza `tecnicos` **client-side**, y el singleton anon hace writes server-side (supervisores, `portal_token`). No se puede apretar sin antes mover esas escrituras a `service_role` (`src/lib/supabase-admin.ts` ya existe **sin usar**). Ver § 7.

**Fixes aplicados (verificados, reversibles):**
- **Migración `20260624_storage_quitar_listing_publico.sql`**: quitó las policies SELECT de listado de los 3 buckets públicos (advisor `0025_public_bucket_allows_listing`) → **cerró la enumeración de cédulas/fotos/evidencias**. Las lecturas por URL pública (`getPublicUrl`) y los uploads (policies INSERT separadas) quedaron intactos; `verify-flows.mjs` 11/11 antes y después; advisor confirmó las 3 warnings resueltas.
- **Código** (batch seguro): rate-limit a `/api/solicitar` (8/min) y `/api/log-error` (30/min) en `middleware.ts`; `/api/test-whatsapp` apagado en prod salvo `ENABLE_TEST_ENDPOINTS=true`; `*.log` agregado a `.gitignore`.

### 2026-05-12 — Endpoints admin sin auth (cotizacion-precios, repuesto-recibido)
- **Bug**: `/api/cotizacion-precios` y `/api/repuesto-recibido` se crearon sin `verificarAdmin`, asumiendo "solo el admin tiene la URL". Cualquiera con la URL podía:
  - Fijar precios y disparar la cotización al cliente.
  - Marcar un repuesto como recibido y transicionar la solicitud a `en_proceso`.
- **Fix**: agregado `verificarAdmin` al inicio del POST handler en ambos. UIs (`/admin/cotizaciones-pendientes`, `/admin/repuestos`) ahora envían `Authorization: Bearer ${session.access_token}`.
- **Adicional**: centralizado `verificarAdmin()` en `src/lib/auth/admin.ts` (antes duplicado en 4 endpoints). Migrados export, reenviar-ultimo-mensaje, carga-masiva, whatsapp/notify al helper.

---

## 7. Backlog priorizado

Una vez la app esté estable y validada en producción, atender en este orden:

1. **RLS en `solicitudes_servicio`** — máxima prioridad de seguridad. Hoy el `anon_key` (extraíble del bundle JS) da acceso completo a esa tabla (datos del cliente, dirección, teléfono, cotización). La auth admin es de fachada hasta que esto se cierre. **No es un toggle simple** — la app consulta esa tabla con anon-key tanto en cliente como en API routes (singleton); habilitar RLS sin policies rompe el sitio. Plan: (a) crear cliente `service_role` server-side, (b) migrar API routes (admin + flujos protegidos) a ese cliente, (c) diseñar policies anon estrictas por token (`cliente_token`, `horario_token`, `verificacion_paso_token`, `cotizacion.token`, `portal_token`), (d) probar end-to-end cada flujo. Estimación: 1-2 días dedicados + testing. `especialidades_tecnico` también queda sin RLS pero es datos no sensibles — baja prioridad.
2. **`tecnicos-documentos` → signed URLs** — exposición de PII (cédulas). Implementar en `uploadHelpers.ts`. TTL 1h. **(Parcial hecho 2026-06-24:** se cerró el *listado* del bucket — ya no se pueden enumerar las cédulas. Falta el bucket privado + signed URLs para que un objeto no sea accesible por su URL exacta.)
3. **Rate limiting en `/api/solicitar` y `/api/admin/login`** — sin rate limit, spam de solicitudes falsas y brute-force de passwords son posibles. Recomendado: `@vercel/firewall` + Vercel KV.
4. **MFA (TOTP) en login admin** — Supabase Auth lo soporta nativo. Una contraseña filtrada hoy = acceso total.
5. **Audit log de acciones admin** — tabla `admin_actions(user_id, action, target_id, payload, at)`. Hoy nada queda registrado de qué admin marcó qué repuesto, fijó qué precio, exportó qué Excel.
6. **Password policy en Supabase** (Settings > Auth > Password requirements): mín. 12 caracteres + complejidad.
7. **Server-side guard en `/admin/*`** — convertir el layout a Server Component que verifique sesión antes de servir HTML (evita el flash del HTML estructural).
8. ✅ **HECHO** — `/api/gps-ping` ya valida `portal_token`: resuelve el técnico por el token y verifica que sea el asignado a ESA solicitud (401/403 si no). Verificado 2026-06-24.
9. **Webhook Meta — log de eventos** — el webhook recibe estados de delivery (read, delivered, failed) pero no se persiste. Útil para debug.
10. **Token rotación** — para `portal_token` específicamente. Si un técnico se va o filtra, hoy hay que generar UUID manual en SQL. Endpoint admin "regenerar portal_token".
11. **Apretar policies de write anon** (advisor `0024_permissive_rls_policy`) — `tecnicos`, `supervisores`, `llamadas` permiten DELETE/UPDATE/INSERT anon vía `USING(true)`. Mismo prerequisito que el ítem 1: mover los writes de la app a `service_role`, luego reemplazar las policies anon por unas restrictivas (o quitarlas y dejar solo `service_role`). El INSERT anon de `tecnicos` lo necesita `/registro` (client-side) → o se crea un API route server-side para el registro, o se mantiene una policy INSERT acotada.
12. **`search_path` mutable en 5 funciones** (`normalizar_telefono_co` + 4 triggers de normalización) — advisor `0011_function_search_path_mutable`. Fix: `ALTER FUNCTION … SET search_path = public` (behavior-neutral; solo usan `public` + built-ins). ⚠️ **Sin red automática**: `verify-flows.mjs` no testea inserts que disparan el trigger → aplicar con una prueba de registro/solicitud manual inmediatamente después.
13. **Auth dashboard Supabase** (no togglable vía MCP): activar **leaked-password protection** (HaveIBeenPwned, advisor `auth_leaked_password_protection`), **MFA TOTP**, y **password policy ≥12** (Settings → Auth). Una contraseña filtrada hoy = acceso admin total (no hay role check: cualquier user autenticado = admin).

---

## 8. Cómo agregar un endpoint admin nuevo (checklist)

- [ ] Crear route handler en `src/app/api/.../route.ts`.
- [ ] Importar `verificarAdmin` desde `@/lib/auth/admin`.
- [ ] **Primera línea del handler**: `const isAdmin = await verificarAdmin(req); if (!isAdmin) return 401`.
- [ ] En el UI (`/admin/...`): obtener `session` con `supabase.auth.getSession()`, enviar `Authorization: Bearer ${session.access_token}` en el fetch.
- [ ] Si muta estado: validar el estado actual con `.eq('estado', '...')` para evitar race conditions (patrón modelo: `procesarAceptacion`).
- [ ] Si genera audit: insertar en `solicitud_eventos` vía `logEvento()`.
- [ ] Actualizar este doc (sección "Endpoints API → Admin") con la nueva ruta.
- [ ] `npx tsc --noEmit` para confirmar.
