# Observabilidad — Baird Service

> 🧭 **Hub**: `docs/INDEX.md`. Antes de tocar tracking/logging volvé al hub.
>
> **Última revisión: 2026-05-16.**

Cubre cómo se mide qué le pasa al usuario en el browser (errores de conexión, retries, timeouts) — distinto de los logs server-side de Vercel.

---

## Stack en uso

| Señal | Dónde se ve | Quién lo escribe |
|---|---|---|
| Errores app del lado servidor (500, throws) | Vercel Runtime Logs | Next.js / nuestras API routes |
| Errores conexión / carga del lado cliente | Supabase tabla `connection_errors` + Vercel Runtime Logs filtro `[ConnectionError]` + admin `/admin/errores` | El browser via `trackError()` → POST `/api/log-error` |
| Notificaciones WhatsApp (estado de envío) | Supabase `notificaciones_whatsapp.estado` + Vercel logs | `enviarPlantilla` en `whatsapp.service.ts` |
| GPS de visita técnica | Supabase `gps_pings` + admin `/admin/gps-alertas` | `useGps` hook + `/api/gps-ping` |
| Cambios de estado solicitud (audit) | Supabase `solicitud_eventos` | `logEvento` helper en `whatsapp.service.ts` |

---

## Connection error tracking (cliente)

### Cuándo se dispara

`trackError()` se llama desde los `useEffect` catch blocks de las 5 páginas client-side cuando el usuario está a punto de ver una pantalla de error:

- `/tecnico/[token]/page.tsx` — portal técnico
- `/tecnico/[token]/diagnostico/[id]/page.tsx`
- `/tecnico/[token]/completar/[id]/page.tsx`
- `/cotizacion/[token]/page.tsx`
- `/confirmar/[token]/page.tsx`

**No captura `ERR_CONNECTION_TIMED_OUT` puro** — si el browser jamás carga el JS, no puede ejecutar `trackError`. Para esos casos solo queda la "ausencia de eventos" o el GET log de Vercel. Si en el futuro hace falta capturarlos, mover el tracker a `proxy.ts` (Vercel Routing Middleware) que ve cada request antes del cache.

### Tipos de error (CHECK constraint en BD)

| `error_type` | Significado |
|---|---|
| `query_retry` | Una query individual reintentó (informativo — puede haber tenido éxito final). Sin uso hoy, reservado para si conectamos `withRetry.onRetry` callback. |
| `query_failed` | Todos los reintentos agotados. Reservado para futuras instrumentaciones más finas. |
| `page_load_error` | La página falló al cargar y mostró la pantalla con botón "Reintentar". Es el valor que más se usa hoy. |
| `fetch_failed` | Error genérico de fetch desde el cliente. Reservado. |
| `unknown` | Fallback si el body llega con `error_type` no reconocido. |

### Tipos de actor

| `actor` | Origen |
|---|---|
| `tecnico` | Pages bajo `/tecnico/[token]/...` |
| `cliente` | `/cotizacion`, `/confirmar`, `/horario`, `/verificar-paso`, `/servicio` |
| `admin` | Reservado |
| `desconocido` | Default si no se pasa |

### Network Information API

El browser reporta — cuando soporta `navigator.connection`:
- `network_effective_type`: `'2g'`, `'3g'`, `'4g'`, `'slow-2g'`
- `network_downlink`: Mbps estimado
- `network_rtt`: round-trip time estimado en ms

**iOS Safari no implementa esta API** → los técnicos en iPhone tendrán estos campos en NULL. No es bug, es limitación del navegador.

### Pipeline end-to-end

```
┌─────────────────────────────────────────────────────────┐
│ Browser técnico/cliente                                  │
│   useEffect catch path:                                  │
│     trackError({ error_type, error_message, actor })     │
│   ↓                                                       │
│   navigator.sendBeacon('/api/log-error', JSON)           │
│   (sobrevive a unload; fallback fetch keepalive)         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ POST /api/log-error  (función Vercel en gru1)            │
│   1. Sanitiza inputs (longitudes, enums)                 │
│   2. console.error('[ConnectionError]', JSON) ─►         │
│      Vercel Runtime Logs (filtrable)                     │
│   3. supabase.from('connection_errors').insert(row) ─►   │
│      Tabla persistente                                   │
│   Siempre retorna 200 (telemetría no rompe UX).          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Visualización                                            │
│   • /admin/errores — dashboard React con filtros         │
│   • Vercel dashboard → Logs → "[ConnectionError]"        │
│   • SQL directo en Supabase                              │
└─────────────────────────────────────────────────────────┘
```

### Tabla `connection_errors`

```sql
id                      uuid PK
created_at              timestamptz NOT NULL DEFAULT now()
url                     text NOT NULL                      -- pathname donde falló
error_type              text NOT NULL CHECK (...)          -- ver enum arriba
error_message           text
attempt_number          int                                -- null si N/A
user_agent              text
network_effective_type  text                               -- '4g' | '3g' | ...
network_downlink        numeric                            -- Mbps
network_rtt             int                                -- ms
online                  boolean                            -- navigator.onLine
actor                   text CHECK (...)                   -- ver enum arriba
ip                      text                               -- truncada
```

Índices: `created_at desc`, `url`, `actor+created_at`, `error_type`.

RLS: append-only — `anon` y `authenticated` pueden INSERT y SELECT. Mismo patrón que `solicitud_eventos` y `gps_pings`.

### Cleanup recomendado (no implementado)

La tabla crece indefinidamente. A escala actual (cientos de errores/día como máximo) no es problema, pero para producción de largo plazo:

```sql
DELETE FROM connection_errors
WHERE created_at < now() - INTERVAL '90 days';
```

Idealmente como cron Vercel (`vercel.json` → `/api/cron/cleanup-errors`). Pendiente.

---

## Cómo agregar tracking en una nueva página

Cuando creés una página nueva con carga de datos client-side y queres trackear sus errores:

1. Importar el helper:
   ```ts
   import { trackError } from '@/lib/utils/track-error'
   ```
2. Llamar en cada path de error del `useEffect`:
   ```ts
   if (!data) {
     trackError({
       error_type: 'page_load_error',
       error_message: error?.message ?? 'data not found',
       actor: 'cliente',  // o 'tecnico' según corresponda
     })
     setError('Mensaje al usuario')
     return
   }
   ```
3. Que el render del error tenga botón "Reintentar" con `window.location.reload()` (ver pattern en `src/app/confirmar/[token]/page.tsx`).

No es necesario tocar el endpoint `/api/log-error` ni la tabla salvo que necesites un nuevo `error_type` (que requiere actualizar el `CHECK constraint` con una migración).

---

## Cómo agregar un nuevo `error_type`

1. Migración SQL:
   ```sql
   ALTER TABLE connection_errors DROP CONSTRAINT connection_errors_error_type_check;
   ALTER TABLE connection_errors ADD CONSTRAINT connection_errors_error_type_check
     CHECK (error_type IN ('query_retry','query_failed','page_load_error','fetch_failed','unknown','NUEVO_TYPE'));
   ```
2. Actualizar `ERROR_TYPES` en `src/app/api/log-error/route.ts`.
3. Actualizar `ConnectionErrorType` en `src/lib/utils/track-error.ts`.
4. Actualizar `ETIQUETA_TIPO` en `src/app/admin/errores/page.tsx` (label + color).
5. Esta sección.
6. Aplicar migración antes de deploy.

---

## Cómo investigar un incidente

1. Abrí `/admin/errores` con rango `24h` o `7d`.
2. Mirá el breakdown "Por URL" — ¿se concentran en una página específica?
3. Mirá "Por red" — ¿es solo `slow-2g`/`3g`, o también `4g`? Si solo redes lentas, es expected. Si afecta `4g` también, mirar infra.
4. Mirá "Por actor" — ¿son técnicos o clientes? Apunta a quién hay que escalarle.
5. Tabla de eventos — abrí el detalle y mirá:
   - `error_message`: pista del bug
   - `online: false` → el usuario se quedó sin red (no es bug nuestro)
   - `attempt_number`: si es 3, agotó retries
   - `user_agent`: si es solo iOS o solo Android, puede ser bug específico de plataforma
6. Si querés cruzar con server-side, abrí Vercel Logs y filtrá por la URL afectada en el mismo rango horario.

---

## Cómo querear datos en SQL

```sql
-- Últimos 50
SELECT * FROM connection_errors ORDER BY created_at DESC LIMIT 50;

-- Top URLs problemáticas última semana
SELECT url, count(*)
FROM connection_errors
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY url
ORDER BY count(*) DESC
LIMIT 10;

-- Errores por tipo de red
SELECT network_effective_type, count(*)
FROM connection_errors
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY network_effective_type
ORDER BY count(*) DESC;

-- Técnicos vs clientes
SELECT actor, count(*)
FROM connection_errors
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY actor;

-- Tasa de errores por día (últimos 7)
SELECT
  date_trunc('day', created_at) AS dia,
  count(*) AS errores
FROM connection_errors
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY dia
ORDER BY dia DESC;
```

---

## Trade-offs y limitaciones conocidas

| Limitación | Impacto | Por qué no la arreglamos hoy |
|---|---|---|
| No captura `ERR_CONNECTION_TIMED_OUT` puro | Si el browser nunca carga el JS, no hay evento | Requeriría mover tracker a `proxy.ts` (Vercel Edge Middleware). Más complejo, más caro. Solo lo hacemos si vemos que el problema persiste tras el fix de región. |
| iOS no tiene Network Information API | Campos `network_*` null para usuarios iPhone | Limitación de Safari, sin workaround. Los demás campos sí sirven. |
| `SELECT` público vía RLS | Cualquiera con anon key puede leer la tabla | Mismo trade-off que `solicitud_eventos`/`gps_pings`. Datos sin PII grave (no hay nombres ni teléfonos). Si la app crece, migrar a `authenticated`-only. |
| Sin cleanup automático | La tabla crece indefinidamente | Volumen actual bajo. Si supera ~100k filas, agregar cron de borrado >90 días. |
| Sin alertas | Hay que entrar al panel a ver | Si lo necesitamos, podemos agregar trigger Supabase → Slack/email vía webhook. |
| `trackError` es fire-and-forget | Si Supabase está caído, perdemos el evento | Por diseño — no podemos bloquear al técnico para guardar telemetría. Vercel Runtime Logs sigue capturando vía `console.error`. |

---

## Si la fila no aparece en Supabase

Checklist de debugging:

1. **¿La migración está aplicada?** SQL: `SELECT to_regclass('public.connection_errors')` debería retornar `connection_errors`. Si NULL, aplicar `supabase/migrations/20260516_connection_errors.sql`.
2. **¿El `/api/log-error` está respondiendo 200?** Test: `curl -X POST https://baird-app.vercel.app/api/log-error -H 'Content-Type: application/json' -d '{"url":"/t","error_type":"page_load_error","actor":"admin"}'`. Esperar `{"ok":true}`.
3. **¿Aparece en Vercel logs?** Dashboard → Logs → filtro `[ConnectionError]`. Si NO aparece allí pero SÍ retorna 200, hay un error en el insert (revisar logs `[ConnectionError][insert-failed]`).
4. **¿RLS bloquea?** Probar query directa con anon key: `SELECT count(*) FROM connection_errors`. Si retorna error 42501, falta policy.
5. **¿Sanitización quitó campos?** Si pasás un `error_type` inválido, queda como `unknown`. Pasás algo no string, queda null. Validar payload contra el sanitizer en `src/app/api/log-error/route.ts`.

---

## Referencias

- Helper cliente: `src/lib/utils/track-error.ts`
- Endpoint API: `src/app/api/log-error/route.ts`
- Migración: `supabase/migrations/20260516_connection_errors.sql`
- Admin page: `src/app/admin/errores/page.tsx`
- Helper retry (relacionado): `src/lib/utils/retry.ts` — `querySupabase` + lista de códigos no-retryables (PGRST116, 42501, 22P02, 42P01, 42703).
