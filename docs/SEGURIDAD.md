# Seguridad — Baird Service

> Doc canónico de **autenticación y autorización**. Última revisión: **2026-10-22** (excepción de facturación del rol lectura; RLS Fase 1 + 4.1 reflejadas; ver también `docs/PLAN-RLS.md`).
>
> Antes de tocar un endpoint admin o agregar uno nuevo, **lee la sección "Endpoints API" y replica el patrón** de `verificarAdmin`.

---

## TL;DR

- **Frontend admin**: protegido por sesión Supabase Auth **+ allowlist de emails** (`/admin/layout.tsx`). Sin sesión o email fuera de la lista → `signOut()` + redirect a `/admin/login`.
- **API admin**: protegida por `Authorization: Bearer ${session.access_token}` verificado con `verificarAdmin()` del helper compartido `src/lib/auth/admin.ts`. **`verificarAdmin` exige que el email esté en la allowlist** (`src/lib/auth/adminEmails.ts`), no solo que la sesión sea válida — autenticado ≠ admin (2026-07-06).
- **Rol `lectura` (logística)** — 2026-10-13: segunda allowlist (`LECTURA_EMAILS`, default `logistica@encompasslatam.com`) que entra al mismo panel **sin poder escribir**: el server rechaza sus escrituras (`verificarAdmin`), solo los exports/listados aceptan ambos roles (`verificarLectura`), y el navegador instala un guard que corta toda request mutante (`src/lib/auth/soloLectura.ts`). **Única excepción (2026-10-22):** `POST /api/admin/facturacion-estado` (marcar un servicio completado como facturado / no aplica / pendiente) acepta al rol lectura, porque logística es quien emite la FV en Siigo. Ver § 1 "Rol lectura".
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
- ⚠️ **El self-signup de Supabase Auth estaba ABIERTO** (verificado 2026-07-06: `POST /auth/v1/signup` con el anon key devolvía 200 creando un user). La app no expone signup, pero la API de GoTrue sí. Con el gate viejo ("autenticado = admin") eso permitía a cualquiera registrarse con su propio email, confirmarlo y quedar como admin. **Mitigado en código** con la allowlist (`adminEmails.ts`) y **cerrado en la fuente el 2026-07-11**: "Allow new users to sign up" quedó APAGADO en el dashboard (PLAN-RLS § 3bis). Leaked-password protection y MFA quedaron diferidos al plan Pro.

### Allowlist de emails admin
- `src/lib/auth/adminEmails.ts` — `esEmailAdmin(email)` es la única fuente de verdad de quién es admin. Se usa en los 3 puntos: login (`/admin/login`), guard del layout (`/admin/layout.tsx`) y gate de API (`verificarAdmin`).
- Configurable por env var **`ADMIN_EMAILS`** (server, CSV) y **`NEXT_PUBLIC_ADMIN_EMAILS`** (cliente, CSV). Si ninguna está definida, cae a un default hardcodeado (`jdguerron@bairdservice.com`) para no romper prod. Para agregar un admin: crear la cuenta en Supabase **y** añadir el email a ambas env vars en Vercel.

### Rol `lectura` (logística, solo lectura) — 2026-10-13
- **Qué es**: una segunda allowlist, independiente de la admin, para cuentas que necesitan **ver todo el panel** (casos, pagos, repuestos, liquidaciones) **sin poder modificar nada**. Default hardcodeado: `logistica@encompasslatam.com`. Env vars: **`LECTURA_EMAILS`** (server, CSV) y **`NEXT_PUBLIC_LECTURA_EMAILS`** (cliente, CSV); si ninguna está definida se usa el default. Si un email aparece en ambas listas, gana admin.
- **Fuente de verdad**: `obtenerRolAdmin(email)` en `src/lib/auth/adminEmails.ts` → `'admin' | 'lectura' | null`. Login, layout y gates de API usan esa función. `esEmailAdmin` **no** cambia: un email de lectura nunca es admin.
- **Tres capas, de más a menos fuerte**:
  1. **Server (seguridad real)** — todo endpoint que escribe sigue con `verificarAdmin` / `obtenerEmailAdmin`, que rechazan al rol lectura (401). Solo los handlers que **no escriben** aceptan ambos roles vía `verificarLectura(req)` / `obtenerRolRequest(req)` (`src/lib/auth/admin.ts`): `POST /api/admin/export`, `POST /api/admin/liquidaciones` (generan Excel), `GET /api/admin/supervisores`, `GET /api/admin/auxiliares`, `GET /api/admin/incumplidos` (reporte de cumplimiento de reservas, 2026-10-19), `GET /api/admin/pagos` (ledger de una solicitud), `GET /api/admin/descuentos`.
     **Única ESCRITURA permitida al rol lectura (decisión 2026-10-22):** `POST /api/admin/facturacion-estado` — marca el seguimiento de facturación de un servicio completado (`facturada` con N° de FV, `no_aplica`, `pendiente`). Autoriza con `obtenerRolRequest` (admin **o** lectura), guarda `facturada_por` con el email del rol y deja evento `nota_admin` con `payload.origen='facturacion_estado'` y `payload.rol`. Es la única puerta abierta: no toca estado del servicio, pagos ni WhatsApp. Si se agrega otra excepción, debe quedar listada aquí y en `API_LECTURA_ESCRITURA_PERMITIDA`.
  2. **Guard del navegador** — `src/lib/auth/soloLectura.ts`. El layout lo instala sobre `window.fetch` cuando la sesión es `lectura`: cualquier request con método ≠ GET/HEAD/OPTIONS a `/api/*` (salvo los dos exports de `API_LECTURA_PERMITIDAS` y la ruta EXACTA `/api/admin/facturacion-estado` de `API_LECTURA_ESCRITURA_PERMITIDA`, sin subrutas ni prefijos), a Supabase `/rest/v1/*` o `/storage/v1/*` (salvo `object/sign`) se corta en el cliente con un 403 sintético + toast "Modo solo lectura". Cubre de una vez todas las acciones del panel, incluidos los writes directos de supabase-js (resuelve `fetch` global en cada llamada). Es defensa en profundidad, **no** la seguridad: alguien con DevTools puede quitarlo.
  3. **UI** — `useRolAdmin()` (`src/components/admin/RolAdminContext.tsx`) oculta controles de edición (botones "Editar" y "Cambiar estado manualmente" del detalle), el menú esconde `Carga Masiva`, `Testing`, `Accesos`, `Finanzas` y `Pagos técnicos` (y el layout redirige si se entra a mano) y se muestra banner + badge "logística · solo lectura". El bloque **🧾 Facturación** de la ficha (`FacturacionSolicitud.tsx`) es el único control de edición que se muestra y opera para este rol (el banner lo dice).
- **Límite conocido**: los writes directos a Supabase desde el browser (`tecnicos`, `especialidades_tecnico`, `evidencias_servicio`) solo los frena el guard del navegador porque esas tablas aún no tienen RLS para anon (Fases 2–4 de `docs/PLAN-RLS.md`). Es el **mismo** hueco que ya tiene cualquier persona con el anon key público; el rol lectura no lo amplía. Cerrar RLS lo resuelve de raíz.
- **Alta de la cuenta y contraseña (self-service)** — 2026-10-13: la cuenta se crea **sin contraseña** con `node --env-file=.env.local scripts/crear-usuario-panel.mjs correo@dominio.com` (o desde el dashboard sin clave) y la persona fija la suya desde un link de un solo uso:
  - `/admin/accesos` (solo admin): lista la allowlist cruzada con `auth.users` y el botón *Enviar correo de acceso* llama `POST /api/admin/accesos` → `generateLink({ type: 'recovery' })` → link `/admin/establecer-clave?token_hash=…&type=recovery` (no depende del Site URL ni de la allowlist de redirects de Supabase). Se envía por **Resend** si hay `RESEND_API_KEY`; si no, cae al SMTP de Supabase (que por defecto solo entrega a miembros del equipo del proyecto). El endpoint **devuelve el link al admin** para mandarlo por WhatsApp si el correo no sale; vence en ~1 h (Email OTP expiry) y es de un solo uso.
  - `/admin/login` → *¿Olvidaste tu contraseña o es tu primer ingreso?* → `POST /api/auth/recuperar-clave` (público, respuesta siempre genérica, solo actúa con emails de la allowlist, throttle 1/min por email + 5/min por IP en middleware). Nunca devuelve el link.
  - `/admin/establecer-clave`: canjea el `token_hash` con `verifyOtp` (o toma el hash `#access_token…type=recovery` del correo de Supabase, que `RedireccionRecuperacion` en el layout raíz reenvía desde cualquier página), pide la clave (mín. 10) y hace `updateUser({ password })`. Está fuera del guard del layout admin (como `/admin/login`).
  - Revocar: borrar el usuario en Supabase y/o sacar el email de `LECTURA_EMAILS`.

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
| `/api/admin/facturacion-estado` | POST | **Admin O rol lectura** (`obtenerRolRequest`, excepción 2026-10-22). Marca el seguimiento de facturación de un servicio `completada`: `facturada` (exige `factura_numero`), `no_aplica`, `pendiente` (limpia número/fecha). Guard atómico `eq('estado','completada')`; evento `nota_admin` con `payload.origen='facturacion_estado'` (antes/después, rol). No envía WhatsApp. Ver `docs/FACTURACION.md` § 11 |
| `/api/admin/supervisores` | GET/POST/PUT/DELETE | CRUD de la tabla `supervisores` (destinatarios de avisos WhatsApp por cambio de estado). POST dispara bienvenida `supervisor_bienvenida_v1` si el supervisor queda activo |
| `/api/admin/reagendar-solicitud` | POST | Reagendar con calendario (fecha + franja): materializa `fecha_visita_at` y notifica cliente + técnico + supervisores. Avisos no bloqueantes de cupo/fecha (variante `obtenerEmailAdmin`) |
| `/api/admin/actualizar-valor` | POST | Ajustar el valor al cliente de un servicio particular; reabre aprobación y notifica |
| `/api/admin/pedir-repuesto-supervisores` | POST | Enviar pedido de repuesto en garantía a supervisores con visibilidad de la marca (variante `obtenerEmailAdmin`) |
| `/api/admin/confirmar-visita` | POST | Marcar la visita como confirmada por llamada con el técnico (`visita_confirmada_por='admin'`, evento `visita_confirmada`). Variante `obtenerEmailAdmin` (2026-10-22) |
| `/api/admin/liberar-tecnico` | POST | Soltar al técnico asignado (solo desde `asignada`): vuelve a `notificada`, evento `tecnico_liberado`, aviso al técnico y reoferta URGENTE a los demás. Variante `obtenerEmailAdmin` (2026-10-22) |
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
| `/api/tecnico/receptor` | `portal_token` (técnico) + `tecnico_asignado_id` | `tecnicos.portal_token` (2026-10-13) |
| `/api/tecnico/confirmar-visita` | `portal_token` (técnico) + `tecnico_asignado_id` | `tecnicos.portal_token` — "Confirmo" / "No alcanzo" (libera + reoferta) solo sobre servicios propios en `asignada` (2026-10-22) |
| `/api/tecnico/repuesto-recibido` | `portal_token` (técnico) + `tecnico_asignado_id` | `tecnicos.portal_token` — "Llegó el repuesto" solo sobre servicios propios en `esperando_repuesto` / `repuesto_en_camino`; UPDATE atómico con guard de estado (2026-10-23) |
| `/api/receptor/aceptar` | `receptor_token` | `solicitudes_servicio.receptor_token` (UNIQUE parcial, 2026-10-13) |
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

#### Qué ve y qué descarga el supervisor — 2026-08-06

El **listado** (`/api/supervisor/solicitudes`) incluye el código de falla del
diagnóstico aplanado desde `triaje_resultado` (`codigo_falla`,
`descripcion_falla`, `complejidad_falla` — ver el gotcha de tipos en
`docs/GOTCHAS.md`). El **detalle** devuelve además `archivos_at`: nombre de
archivo → `created_at` de `storage.objects` de la carpeta `{solicitud_id}/`,
que es lo que imprime el PDF como fecha de subida de cada foto.

Ambas vistas tienen botón **Descargar PDF** (jsPDF client-side, `src/lib/pdf/supervisorPdf.ts`):
- Listado: resumen por estado + resumen por código de falla + tabla completa.
- Ficha: datos, diagnóstico, agenda, evidencia, historial y **galería** con las
  fotos de diagnóstico/completación y las firmas, cada una con su fecha de subida.

La galería se arma en el navegador leyendo las imágenes del bucket público
`evidencias-servicio` (responde `Access-Control-Allow-Origin: *`) a canvas y
recodificándolas a JPEG 900px — sin eso el PDF pesaría decenas de MB. Como el
bucket es público, el PDF no expone nada que el supervisor no pudiera ver ya en
el portal; **si el bucket pasa a privado con URLs firmadas (backlog de PII, ver
`docs/GOTCHAS.md`), esta carga hay que rehacerla contra la URL firmada**.

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
  en claro (defensa en profundidad: hasta la Fase 4.1 el anon key podía leer `supervisores`; hoy la tabla está cerrada al anon, pero el hash se mantiene).
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
| `/api/cron/repuesto-recordatorio` | Diario 09:45 UTC | Recordatorios del ciclo de repuesto (supervisores en garantía, cliente tras la guía) |
| `/api/cron/wompi-conciliar` | Cada 5 min (pg_cron) | Conciliación de pagos contra Wompi |
| `/api/cron/resumen-movimientos` | Diario 22:00 UTC (5 pm Bogotá) | Resumen de cambios de estado del día a cada supervisor activo, SOLO sus servicios (alcance server-side `solicitudEnAlcance`). Envía WhatsApp → con `CRON_SECRET` sin configurar cualquiera podría disparar reenvíos (`?force=1`); la bitácora `supervisor_resumenes` evita duplicados por corte |
| `/api/cron/agenda-tecnicos` | Diario 22:15 UTC (5:15 pm Bogotá) | Recordatorio de agenda de mañana a cada técnico con visitas (servicios Baird + compromisos propios, link al portal). Envía WhatsApp; `tecnicos.agenda_aviso_at` evita duplicados por día salvo `?force=1`. Kill-switch `AGENDA_TECNICOS_ENABLED=false` (2026-10-22) |
| `/api/cron/alerta-visitas` | Diario 01:00 UTC (8 pm Bogotá) | Texto libre a `WHATSAPP_ALERT_PHONE` con las visitas de mañana sin confirmar / sin técnico y link a cada ficha. Sin estado: dispararlo a mano repite la alerta (2026-10-22) |

Configurados en `vercel.json` (Hobby: diarios; `wompi-conciliar` lo dispara `pg_cron` desde Supabase).

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

Estado tras **Fase 1 + Fase 4.1** (aplicadas en prod el 2026-07-11, bitácora en `docs/PLAN-RLS.md` § 3bis; esta tabla actualizada 2026-10-07). El server-side entero escribe con `service_role` (bypass RLS), así que la columna "Anon" describe lo que puede hacer el **browser** con el anon key del bundle:

| Tabla | RLS | Anon (browser) | Nota |
|---|---|---|---|
| `solicitudes_servicio` | ❌ | full | **Gap activo** — tabla principal con todo el PII del cliente. Toda la seguridad recae en tokens UUID en URLs. Fase 4.2 |
| `especialidades_tecnico` | ❌ | full | Datos no sensibles. Fase 4.2 |
| `tecnicos` | ✅ | full CRUD (`USING(true)`) | **Pendiente Fase 2**: `/registro` y `/admin/tecnicos/[id]` aún escriben client-side. `portal_token` es el secret efectivo del portal |
| `evidencias_servicio` | ✅ | abierto (`USING(true)`) | **Pendiente Fase 3**: `completar/[id]` inserta client-side |
| `notificaciones_whatsapp` | ✅ | solo `SELECT` | Writes anon cerrados (4.1). `/aceptar` lee client-side hasta Fase 3 |
| `repuestos_pendientes` | ✅ | solo `SELECT` | Writes anon cerrados (4.1). `/verificar-paso` y `/admin/repuestos` leen client-side hasta Fase 3 |
| `gps_pings` | ✅ | ninguno | INSERT anon cerrado (4.1); escribe `/api/gps-ping` |
| `solicitud_eventos` | ✅ | ninguno; `SELECT` solo `authenticated` | Audit log ya no falsificable desde el browser |
| `connection_errors` | ✅ | ninguno; `SELECT` solo `authenticated` | Inserta `/api/log-error`; lee `/admin/errores` |
| `cliente_historial` | ✅ | ninguno | service_role only (sin uso en código hoy) |
| `supervisores` | ✅ | ninguno | Cerrada en 4.1 — antes anon leía `portal_token` (= entrar a cualquier panel) y hacía CRUD |
| `llamadas` | ✅ | ninguno | Cerrada en 4.1 |
| `pagos` | ✅ | ninguno | Nace cerrada (20260818): solo service_role |

Verificado post-4.1 (SQL con rol anon simulado): 0 filas y `42501` al escribir en las tablas cerradas; advisors de Supabase bajaron de ~29 a 17 (quedan los de Fases 2–5).

**Backlog activo (Fases 2–4.2 de `docs/PLAN-RLS.md`)**: (a) mover a API routes server-side los writes client-side de `tecnicos` (`/registro`, edición admin) y `evidencias_servicio` (`completar/[id]`), (b) cerrar sus policies anon, (c) habilitar RLS en `solicitudes_servicio` y `especialidades_tecnico` con policies anon por token para lo que el browser aún lee (`/servicio`, `/horario`, `/cotizacion`, portal técnico). No es un toggle trivial: el browser todavía consulta `solicitudes_servicio` con el anon key en varias páginas.

---

## 5. Storage buckets

| Bucket | Contenido | Acceso |
|---|---|---|
| `evidencias-servicio` | Fotos del diagnóstico y completación | **Público** (`getPublicUrl`) |
| `tecnicos-fotos` | Foto de perfil del técnico | **Público** |
| `tecnicos-documentos` | Documento de identidad del técnico (PII) | **Público** ⚠️ |
| `tecnicos-contratos` | Contrato de prestación de servicios firmado en físico y escaneado (PDF/JPG/PNG ≤ 10 MB) | **Privado** (20261009): 4 policies sobre `storage.objects` solo para `authenticated` (el admin logueado; self-signup apagado). Sin acceso anon ni por URL directa. Lectura con `createSignedUrl` 1 h (`urlContratoFirmado`) desde `/admin/tecnicos/[id]` |

⚠️ **`tecnicos-documentos` PII expuesto**: cualquiera con la URL puede descargar la cédula del técnico. **Backlog**: migrar a `createSignedUrl()` (TTL 1h) en `src/lib/uploadHelpers.ts`. Mismo aplica con menor severidad a las otras dos.

✅ **Mitigación 2026-10-10 — carnet digital**: la URL de la cédula **ya no se entrega al cliente** por ningún canal (antes salía como imagen por WhatsApp en `procesarAceptacion` y se renderizaba en `/servicio/{cliente_token}`). El cliente recibe el **carnet digital** (`src/lib/utils/carnet.ts`, componente `CarnetTecnico`, PNG en `GET /api/carnet/{tecnico_id}`): foto de perfil, nombre, especialidad, ciudad, estado de verificación y tipo + número de documento para cotejar contra la cédula física. La foto completa de la cédula solo se ve en `/admin/tecnicos/[id]`. El bucket sigue público (el backlog de signed URLs se mantiene), pero la URL dejó de circular fuera del admin.

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

### 2026-10-24 — Tokens en la URL enviados a Google Analytics / Ads
- **Hallazgo** (estudio SEO/analítica, `docs/mejoras-futuras/seo-conversion-analitica/`): gtag y Vercel Analytics cargaban en TODAS las rutas. `page_location` llevaba a GA4 (×2), Google Ads y Vercel los tokens de `/tecnico/{token}`, `/servicio/{token}`, `/pago/*?id=`, `/supervisor/{token}`, `/receptor/{token}`, y el **`token_hash` de recuperación de clave** de `/admin/establecer-clave?token_hash=…&type=recovery` (un solo uso, vence en ~1 h, pero quedó en informes de terceros).
- **Fix**: `src/lib/analytics/rutas.ts` + `gtag.ts` + `AnaliticaCliente.tsx`. Portales internos (`/admin`, `/tecnico`, `/aceptar`, `/supervisor`) no cargan analítica; páginas del cliente con token mandan a GA4 la ruta saneada (`/servicio/[token]`, sin query) y no configuran Ads (su hit `ccm/collect` ignora `page_location`); Vercel con `beforeSend`. Verificado en local con el navegador: 0 hits con token.
- **Además**: `/receptor/` no tenía noindex ni estaba en robots (muestra datos del cliente) → agregado; `public/guia*.html` ahora con `X-Robots-Tag: noindex` (guia-pagos publicaba tarifas de técnicos).

### 2026-06-24 — Auditoría de seguridad (Supabase advisors en vivo + lectura de código)

**Capa de auth: sólida.** 12 endpoints admin con `verificarAdmin` (ya usa el singleton); webhooks Meta + Dapta con HMAC + `timingSafeEqual`; security headers single-source en `middleware.ts`; `escapeLikePattern` aplicado en el único `.ilike()`; `/api/gps-ping` **ya valida `portal_token`** (backlog #8 quedó cerrado); `/api/solicitar` recalcula `pago_tecnico` server-side. Varios ítems del viejo improvement-plan estaban ya resueltos.

**Hallazgo nuevo — capa de datos expuesta.** Con el `anon_key` (extraíble del bundle JS) cualquiera puede **DELETE / UPDATE / INSERT en `tecnicos`, `supervisores` y `llamadas`**: esas tablas "tienen RLS" pero con policies `USING(true)` (advisor `0024_permissive_rls_policy`). Borrar técnicos o pisar datos es trivial. **Raíz**: la app escribe con el `anon_key` — `/registro` inserta/borra/actualiza `tecnicos` **client-side**, y el singleton anon hace writes server-side (supervisores, `portal_token`). No se puede apretar sin antes mover esas escrituras a `service_role`. **Resuelto parcialmente el 2026-07-11** (RLS Fase 1 + 4.1): todo el server-side usa `supabaseAdmin` y `supervisores`/`llamadas` quedaron cerradas al anon; `tecnicos` sigue abierto porque `/registro` escribe client-side (Fase 2). Ver § 4 y `docs/PLAN-RLS.md`.

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

1. **RLS en `solicitudes_servicio`** — máxima prioridad de seguridad. Hoy el `anon_key` (extraíble del bundle JS) da acceso completo a esa tabla (datos del cliente, dirección, teléfono, cotización). La auth admin es de fachada hasta que esto se cierre. **No es un toggle simple** — la app consulta esa tabla con anon-key tanto en cliente como en API routes (singleton); habilitar RLS sin policies rompe el sitio. Plan: (a) ✅ cliente `service_role` server-side (`supabase-admin.ts`, Fase 0), (b) ✅ API routes y services migrados (Fase 1, 2026-07-11), (c) diseñar policies anon estrictas por token (`cliente_token`, `horario_token`, `verificacion_paso_token`, `cotizacion.token`, `portal_token`) y mover a server los writes client-side de `tecnicos`/`evidencias_servicio` (Fases 2–3), (d) probar end-to-end cada flujo y habilitar RLS (Fase 4.2). Detalle en `docs/PLAN-RLS.md`. `especialidades_tecnico` también queda sin RLS pero es datos no sensibles — baja prioridad.
2. **`tecnicos-documentos` → signed URLs** — exposición de PII (cédulas). Implementar en `uploadHelpers.ts`. TTL 1h. **(Parcial hecho 2026-06-24:** se cerró el *listado* del bucket — ya no se pueden enumerar las cédulas. Falta el bucket privado + signed URLs para que un objeto no sea accesible por su URL exacta.) **Patrón de referencia ya en prod (2026-10-09):** `tecnicos-contratos` nació privado con policies `authenticated` y lectura por `createSignedUrl` — replicarlo aquí requiere además mover el upload de `/registro` (anon) a un API route server-side (Fase 2 RLS).
3. **Rate limiting real** — hoy `middleware.ts` cubre 10 paths (`/api/solicitar` 8/min, `/api/log-error` 30/min, OTP supervisor, notify, accept, carga-masiva…) con un `Map` en memoria: best-effort por isolate. Para un límite real: `@vercel/firewall` o Upstash/KV. ⚠️ `/api/notificar-registro` sigue público, sin auth ni rate limit, y dispara WhatsApp para cualquier `tecnicoId` (hallazgo 2026-10-07) — acotarlo.
4. **MFA (TOTP) en login admin** — Supabase Auth lo soporta nativo. Una contraseña filtrada hoy = acceso total.
5. **Audit log de acciones admin** — tabla `admin_actions(user_id, action, target_id, payload, at)`. Hoy nada queda registrado de qué admin marcó qué repuesto, fijó qué precio, exportó qué Excel.
6. **Password policy en Supabase** (Settings > Auth > Password requirements): mín. 12 caracteres + complejidad.
7. **Server-side guard en `/admin/*`** — convertir el layout a Server Component que verifique sesión antes de servir HTML (evita el flash del HTML estructural).
8. ✅ **HECHO** — `/api/gps-ping` ya valida `portal_token`: resuelve el técnico por el token y verifica que sea el asignado a ESA solicitud (401/403 si no). Verificado 2026-06-24.
9. **Webhook Meta — log de eventos** — el webhook recibe estados de delivery (read, delivered, failed) pero no se persiste. Útil para debug.
10. **Token rotación** — para `portal_token` específicamente. Si un técnico se va o filtra, hoy hay que generar UUID manual en SQL. Endpoint admin "regenerar portal_token".
11. **Apretar policies de write anon** (advisor `0024_permissive_rls_policy`) — ✅ `supervisores` y `llamadas` cerradas en Fase 4.1 (2026-07-11), junto con `gps_pings`, `solicitud_eventos`, `connection_errors` y los writes de `notificaciones_whatsapp`/`repuestos_pendientes`. **Falta** `tecnicos` y `evidencias_servicio`: el INSERT anon de `tecnicos` lo necesita `/registro` (client-side) → crear un API route server-side para el registro (Fase 2) y mover el insert de evidencias (Fase 3).
12. ✅ **HECHO 2026-10-24** (migración `20261024_hardening_funciones_pagos_search_path.sql`, que además quitó EXECUTE a anon/authenticated en `auditar_pagos`, `recalcular_resumen_pago` y `trg_pagos_resumen`). Texto original: **`search_path` mutable en 5 funciones** (`normalizar_telefono_co` + 4 triggers de normalización) — advisor `0011_function_search_path_mutable`. Fix: `ALTER FUNCTION … SET search_path = public` (behavior-neutral; solo usan `public` + built-ins). ⚠️ **Sin red automática**: `verify-flows.mjs` no testea inserts que disparan el trigger → aplicar con una prueba de registro/solicitud manual inmediatamente después.
13. **Auth dashboard Supabase** (no togglable vía MCP): activar **leaked-password protection** (HaveIBeenPwned, advisor `auth_leaked_password_protection`), **MFA TOTP**, y **password policy ≥12** (Settings → Auth). Una contraseña filtrada de un email de la allowlist = acceso admin total (el role check existe desde 2026-07-06 vía `adminEmails.ts`; self-signup apagado 2026-07-11).

---

## 8. Cómo agregar un endpoint admin nuevo (checklist)

- [ ] Crear route handler en `src/app/api/.../route.ts`.
- [ ] Importar `verificarAdmin` desde `@/lib/auth/admin`.
- [ ] **Primera línea del handler**: `const isAdmin = await verificarAdmin(req); if (!isAdmin) return 401`.
- [ ] ¿El handler **no escribe nada** (listado, export)? Entonces usa `verificarLectura(req)` para que el rol logística también lo pueda consumir. Si escribe, **nunca** `verificarLectura`. Si es un POST que no escribe y lo llama el panel, añadirlo a `API_LECTURA_PERMITIDAS` en `src/lib/auth/soloLectura.ts` para que el guard del navegador no lo corte. La única escritura abierta a lectura es `/api/admin/facturacion-estado` (`API_LECTURA_ESCRITURA_PERMITIDA`); una segunda excepción requiere decisión explícita y documentarla en § 1.
- [ ] En el UI (`/admin/...`): obtener `session` con `supabase.auth.getSession()`, enviar `Authorization: Bearer ${session.access_token}` en el fetch.
- [ ] Si muta estado: validar el estado actual con `.eq('estado', '...')` para evitar race conditions (patrón modelo: `procesarAceptacion`).
- [ ] Si genera audit: insertar en `solicitud_eventos` vía `logEvento()`.
- [ ] Actualizar este doc (sección "Endpoints API → Admin") con la nueva ruta.
- [ ] `npx tsc --noEmit` para confirmar.
