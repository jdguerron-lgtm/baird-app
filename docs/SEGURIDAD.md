# Seguridad — Baird Service

> Doc canónico de **autenticación y autorización**. Última revisión: **2026-05-12**.
>
> Antes de tocar un endpoint admin o agregar uno nuevo, **lee la sección "Endpoints API" y replica el patrón** de `verificarAdmin`.

---

## TL;DR

- **Frontend admin**: protegido por sesión Supabase Auth (`/admin/layout.tsx`). Sin sesión → redirect a `/admin/login`.
- **API admin**: protegida por `Authorization: Bearer ${session.access_token}` verificado con `verificarAdmin()` del helper compartido `src/lib/auth/admin.ts`.
- **API cliente / técnico**: protegida por **tokens UUID opacos** (alta entropía) — `cliente_token`, `horario_token`, `portal_token`, etc.
- **Cron jobs**: protegidos por header `Authorization: Bearer ${CRON_SECRET}` (env var).
- **Webhook Meta**: HMAC-SHA256 con `WHATSAPP_WEBHOOK_SECRET`.

---

## 1. Frontend `/admin/*`

### Login
- `src/app/admin/login/page.tsx` — formulario email+password.
- Llama `supabase.auth.signInWithPassword({ email, password })`.
- Supabase devuelve `session` con `access_token` (JWT). Se persiste en cookies/localStorage automáticamente.
- **Las cuentas admin se crean manualmente desde el dashboard de Supabase** (Auth > Users > Add user). **No hay self-signup**: nadie puede crear una cuenta desde la app.

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
| `/api/admin/editar-solicitud` | POST | Editar manualmente horario_confirmado, dirección, ciudad, zona. Cambios auditados en `solicitud_eventos` con diff |
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

### Webhook Meta (HMAC)

- `/api/whatsapp/webhook` — verifica firma HMAC-SHA256 con `WHATSAPP_WEBHOOK_SECRET`.
- Implementación en `verificarFirmaWebhook()` de `whatsapp.service.ts`.
- Sin firma válida → 401.

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

| Tabla | RLS | Anon | Nota |
|---|---|---|---|
| `solicitudes_servicio` | ❌ | full | Toda la seguridad recae en tokens UUID en URLs |
| `tecnicos` | ❌ | full | Idem — `portal_token` es el secret |
| `especialidades_tecnico` | ❌ | full | OK — datos no sensibles |
| `evidencias_servicio` | ❌ | full | Token `confirmacion_token` |
| `notificaciones_whatsapp` | ❌ | full | ⚠️ con el token único un atacante podría aceptar masivamente |
| `repuestos_pendientes` | ✅ | `SELECT true` | service_role = ALL |
| `gps_pings` | ✅ | `INSERT true` | service_role = ALL; SELECT requiere service_role |
| `solicitud_eventos` | ✅ | `SELECT true`, `INSERT true` | service_role = ALL |

**Backlog**: habilitar RLS en las 5 tablas ❌ con políticas que filtren por `cliente_token`/`portal_token` extraído del JWT o contexto de request. Ver detalle en `improvement-plan.md`.

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

## 6. Histórico de incidentes y fixes

### 2026-05-12 — Endpoints admin sin auth (cotizacion-precios, repuesto-recibido)
- **Bug**: `/api/cotizacion-precios` y `/api/repuesto-recibido` se crearon sin `verificarAdmin`, asumiendo "solo el admin tiene la URL". Cualquiera con la URL podía:
  - Fijar precios y disparar la cotización al cliente.
  - Marcar un repuesto como recibido y transicionar la solicitud a `en_proceso`.
- **Fix**: agregado `verificarAdmin` al inicio del POST handler en ambos. UIs (`/admin/cotizaciones-pendientes`, `/admin/repuestos`) ahora envían `Authorization: Bearer ${session.access_token}`.
- **Adicional**: centralizado `verificarAdmin()` en `src/lib/auth/admin.ts` (antes duplicado en 4 endpoints). Migrados export, reenviar-ultimo-mensaje, carga-masiva, whatsapp/notify al helper.

---

## 7. Backlog priorizado

Una vez la app esté estable y validada en producción, atender en este orden:

1. **RLS en las 5 tablas críticas** — máxima prioridad de seguridad. Sin RLS, el `anon_key` (extraíble del bundle JS) da acceso total a la DB. La auth admin es de fachada hasta que esto se cierre.
2. **`tecnicos-documentos` → signed URLs** — exposición de PII (cédulas). Implementar en `uploadHelpers.ts`. TTL 1h.
3. **Rate limiting en `/api/solicitar` y `/api/admin/login`** — sin rate limit, spam de solicitudes falsas y brute-force de passwords son posibles. Recomendado: `@vercel/firewall` + Vercel KV.
4. **MFA (TOTP) en login admin** — Supabase Auth lo soporta nativo. Una contraseña filtrada hoy = acceso total.
5. **Audit log de acciones admin** — tabla `admin_actions(user_id, action, target_id, payload, at)`. Hoy nada queda registrado de qué admin marcó qué repuesto, fijó qué precio, exportó qué Excel.
6. **Password policy en Supabase** (Settings > Auth > Password requirements): mín. 12 caracteres + complejidad.
7. **Server-side guard en `/admin/*`** — convertir el layout a Server Component que verifique sesión antes de servir HTML (evita el flash del HTML estructural).
8. **`/api/gps-ping` validar `portal_token`** — hoy es público. Que pase token en body y validate.
9. **Webhook Meta — log de eventos** — el webhook recibe estados de delivery (read, delivered, failed) pero no se persiste. Útil para debug.
10. **Token rotación** — para `portal_token` específicamente. Si un técnico se va o filtra, hoy hay que generar UUID manual en SQL. Endpoint admin "regenerar portal_token".

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
