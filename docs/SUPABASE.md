# Supabase — Baird Service

Doc canónico de la capa de datos: tablas, columnas JSONB, cliente único, migraciones, RLS, storage buckets, patrones de query, tablas append-only, CHECK constraints, auth admin y auditoría. Para el orden y la verificación SQL de las migraciones, ver también `supabase/migrations/README.md`.

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `solicitudes_servicio` | Main service request | estado, es_garantia, horario_token, cliente_token, horario_confirmado, siguiente_paso, tyc_aceptados_at, tecnico_asignado_id, triaje_resultado (JSONB), cotizacion (JSONB), cancelado_at, cancelado_por, motivo_cancelacion, cancelado_tarde, reagendamientos_count, **diagnosticado_at, cumple_ta** (tracking TA — 20260513), **cumple_encuesta, dias_solucion_efectivos, pago_tecnico_total, margen_baird, recargo_weekend_aplicado** (auditoría tarifa MABE — 20260510), **reprogramacion_token, repuesto_recibido_at** (reprogramación tras repuesto — 20260529), **direccion_lat, direccion_lng, direccion_geocodificada_at, direccion_geocoding_aproximada, fecha_visita_at** (geocoding + identidad del slot de agenda — 20260523; ver gotcha `fecha_visita_at` en `docs/GOTCHAS.md`), **llamada_intentos, ultima_llamada_at, requiere_confirmacion_llamada** (2ª línea de voz — 20260602) |
| `notificaciones_whatsapp` | One record per tech notification | token, estado, timestamps |
| `tecnicos` | Technician profiles | portal_token, whatsapp, ciudad_pueblo (ciudad base), especialidades, verificado, **acepta_garantias, especialidad_principal** (20260508), **ciudades_cobertura text[]** (multi-ciudad — 20260609) |
| `especialidades_tecnico` | Many-to-many: technicians ↔ skills | tecnico_id, especialidad |
| `evidencias_servicio` | Completion evidence | fotos, checklist, firma, oath_firma, gps_(diagnostico/completado/post_visita)_lat/lng, gps_flagged, **evidencia_no_show** (JSONB — selfie/inmueble/timbrazos/llamadas/wa_intentos/pings/notas, 20260510) |
| `repuestos_pendientes` | Spare parts pending arrival | solicitud_id, sku, descripcion, costo, tiempo_estimado, estado |
| `gps_pings` | All GPS pings from technician browsers | solicitud_id, tecnico_id, lat, lng, fase, capturado_at |
| `solicitud_eventos` (NEW 2026-05-06) | Append-only audit log. Desde 2026-06-12 registra **toda** transición de estado (tipo `cambio_estado`, actor inferido cliente/tecnico/admin/sistema — lo inserta `notificarCambioEstado`; migración `20260612_evento_cambio_estado.sql`), además de cancelaciones, reagendamientos, cambios manuales (`cambio_estado_admin`) y notas internas del admin (`nota_admin` con `payload.origen='nota_manual'` vía `/api/admin/notas`). UI: secciones "Notas del administrador" e "Historial de estados" en `/admin/solicitudes/[id]` | solicitud_id, tipo, estado_previo, estado_nuevo, actor, motivo, payload (JSONB), ocurrido_at |
| `cliente_historial` (NEW 2026-05-10) | Tracking de comportamiento del cliente (no-shows, cancelaciones tardías, servicios completados). Lookup por documento (preferido) o teléfono | documento, telefono, no_shows_count, cancelaciones_tarde_count, servicios_completados_count, bloqueado, bloqueado_motivo, requiere_confirmacion_llamada, ultimo_evento_at. RLS service_role-only. |
| `connection_errors` (NEW observability) | Telemetría de errores de red enviada por el browser vía `/api/log-error`. Backend del panel `/admin/errores` | url, error_type, error_message, attempt_number, network_effective_type, network_downlink, network_rtt, online, actor, ip, user_agent, created_at |
| `supervisores` (NEW 2026-05-29) | Destinatarios internos de notificaciones WhatsApp en cada cambio de estado. CRUD admin en `/admin/supervisores` | nombre, whatsapp (normalizado por trigger), activo, ambito (todos/garantia/particular), marca (NULL=todas), estados (text[], NULL/[]=todos los cambios), created_at, updated_at |
| `llamadas` (NEW 2026-06-02) | Segunda línea de voz IA (Dapta) — un intento de llamada por fila. Idempotencia del webhook por `dapta_call_id` (índice UNIQUE parcial). Ver `docs/DAPTA.md` | solicitud_id, proposito, proveedor, dapta_call_id, estado_llamada, intento, resultado (JSONB), transcript, created_at, finished_at |

### Important JSONB Columns on solicitudes_servicio

**`triaje_resultado`** — Diagnóstico del técnico. Forma según flujo:
- Warranty (v2 2026-05-07): `{ diagnostico_tecnico, complejidad, codigo_complejidad, tarifa_mano_obra, bono_incentivo, total_servicio, productos_necesarios[], productos_recomendados[], codigo_falla, ... }`
- Non-warranty (v2 2026-05-07): `{ diagnostico_tecnico, complejidad, productos_necesarios[], productos_recomendados[], evidencias_diagnostico }`
- Legacy (pre-2026-05-07): `{ ..., requiere_repuestos, repuestos_detalle }` — el código maneja ambas formas con fallback.
- Cada item de `productos_necesarios[]` admite `imagen_url?` (2026-05-29): foto opcional del repuesto subida por el técnico al bucket público `evidencias-servicio`. El sanitizador de `/api/diagnostico` solo acepta URLs de ese bucket.

**`cotizacion`** (non-warranty only, v2 2026-05-07):
```
{
  diagnostico_tecnico,
  productos_necesarios: [{ sku, descripcion, cantidad, precio_unitario?, subtotal?, imagen_url? }],
  productos_recomendados: [{ nombre, descripcion }],
  pendiente_precio: boolean,           // true hasta que admin completa
  pricing_set_at?, pricing_set_by?,
  tiempo_entrega?,                     // admin lo fija
  mano_obra, repuestos, total,         // 0 hasta que admin completa
  repuestos_detalle?,                  // legacy back-compat
  evidencias_diagnostico, cotizado_at, aprobado_at?, rechazado_at?, comentario_rechazo?,
  token                                // para /cotizacion/{token}
}
```

## Supabase Architecture

### Cliente único + anon key
Todo el código (tanto API routes server-side como páginas client-side) usa **un único Supabase client** con `NEXT_PUBLIC_SUPABASE_ANON_KEY` declarado en `src/lib/supabase.ts`. Nunca crees clientes nuevos con `createClient()`. Para operaciones privilegiadas usaríamos un client con `service_role` — actualmente no está configurado, así que todas las operaciones pasan por las políticas RLS (donde existen).

### Migraciones — orden y aplicación
Todas las migraciones viven en `supabase/migrations/`. **No usamos el Supabase CLI**; se aplican manualmente en el SQL Editor del dashboard. Son idempotentes (`IF NOT EXISTS`, `DROP IF EXISTS` antes de `CREATE`).

| Migración | Lo que cambia |
|---|---|
| `add_solicitud_fields.sql` | Tabla `solicitudes_servicio` base |
| `add_whatsapp_fields.sql` | Tabla `notificaciones_whatsapp` |
| `add_verification_fields*.sql` | Verificación de técnicos |
| `fix_especialidades_table.sql` | Many-to-many `especialidades_tecnico` |
| `20260327_portal_evidencias.sql` | Bucket evidencias + portal_token |
| `20260427_customer_first_scheduling.sql` | Customer-first flow + `repuestos_pendientes` + `gps_pings` |
| `20260428_verificacion_paso.sql` | Verificación de siguiente paso post-diagnóstico |
| `20260506_cliente_self_service.sql` | `cliente_token` + cancelar/reagendar + `solicitud_eventos` |
| `20260507_admin_pricing_gate.sql` | Estado `pendiente_pricing` + `repuestos_pendientes.tiempo_estimado` nullable |
| `20260508_fix_cotizacion_column.sql` | **HOTFIX** — agrega columna `cotizacion JSONB` que estaba referenciada en código pero nunca creada |
| `20260508_fix_tecnicos_columns.sql` | **HOTFIX** — agrega `acepta_garantias` + `especialidad_principal` en `tecnicos` (mismo bug histórico que el de `cotizacion`) |
| `20260516_perf_fk_index_rls.sql` | Performance: índice FK `idx_solicitudes_tecnico_asignado`; wrap `auth.role()` en `(SELECT auth.role())` para evitar re-evaluación por fila; re-scope `service_role_all_*` a role `{service_role}` (elimina multiple permissive con `anon_*`); drop duplicada `"Allow public update evidencias"` |
| `20260513_normalizar_telefonos.sql` | Trigger `normalizar_telefono_co()` en `tecnicos.whatsapp` + `solicitudes_servicio.cliente_telefono` (dígitos puros, prefijo 57) + backfill |
| `20260516_connection_errors.sql` | Tabla `connection_errors` (telemetría de errores de red del cliente — backend de `/admin/errores`) |
| `20260521_storage_policies_public_role.sql` | Policies de Storage de `{anon}` → `public` (fix de subida de evidencia con sesión admin activa). Se aplica vía Dashboard, no SQL |
| `20260523_geocoding_y_fecha_visita.sql` | Columnas geocoding (`direccion_lat/lng`, `direccion_geocodificada_at`, `direccion_geocoding_aproximada`) + `fecha_visita_at` en `solicitudes_servicio` (+2 índices). Alimenta `/admin/mapa` y el cupo por franja |
| `20260529_supervisores_y_repuesto_recibido.sql` | Tabla `supervisores` (+ RLS anon CRUD + trigger normalización teléfono); estado `repuesto_recibido` en el CHECK (22 estados); columnas `reprogramacion_token` + `repuesto_recibido_at` en `solicitudes_servicio` (+ índices). Aplicada — feature en producción |
| `20260602_dapta_llamadas.sql` | Tabla `llamadas` + columnas Dapta en `solicitudes_servicio` (`llamada_intentos`, `ultima_llamada_at`, `requiere_confirmacion_llamada`) |
| `20260609_tecnicos_ciudades_cobertura.sql` | Columna `ciudades_cobertura text[]` en `tecnicos` (multi-ciudad por técnico) + backfill desde `ciudad_pueblo`. El matching de `notificarTecnicos` compara la solicitud contra todas las ciudades de cobertura. Aplicada vía MCP (2026-06-12) |
| `20260612_evento_cambio_estado.sql` | Tipo `cambio_estado` en el CHECK de `solicitud_eventos.tipo` + fix de constraint duplicado (historial de estados) |
| `20260624_storage_quitar_listing_publico.sql` | Cierra el listing público de los 3 buckets de Storage (los objetos siguen accesibles por URL directa) |

Detalle paso a paso de aplicación + verificación SQL en `supabase/migrations/README.md`.

### RLS por tabla (estado actual — verificado 2026-05-22, auditoría 2026-06-24)

| Tabla | RLS | Acceso anon | Notas |
|---|---|---|---|
| `solicitudes_servicio` | ❌ | full (sin RLS) | **La tabla principal sigue sin RLS.** Toda la seguridad depende de tokens UUID en URLs. OJO: tiene policies `anon_*`/`service_role_*` definidas pero **inertes** (una POLICY no aplica con RLS off) |
| `especialidades_tecnico` | ❌ | full | OK, datos no sensibles |
| `tecnicos` | ✅ | full CRUD (`USING(true)`) | Policies anon abiertas — `portal_token` es el secret real |
| `evidencias_servicio` | ✅ | abierto (`USING(true)`) | Token `confirmacion_token` para cliente |
| `notificaciones_whatsapp` | ✅ | abierto (`USING(true)`) | Token único por notificación como secret |
| `repuestos_pendientes` | ✅ | `SELECT true` | service_role = ALL (scoped a role `service_role`, initplan optimizado — `20260516`) |
| `gps_pings` | ✅ | `INSERT true` | service_role = ALL (idem); SELECT requiere service_role |
| `solicitud_eventos` | ✅ | `SELECT true`, `INSERT true` | service_role = ALL (idem) |
| `cliente_historial` (20260510) | ✅ | service_role only | Tracking de no-shows / cancelaciones |
| `supervisores` (20260529) | ✅ | full CRUD (`USING(true)`) | Autorización real la impone `verificarAdmin` en `/api/admin/supervisores`. Contiene WhatsApp interno, no PII de clientes |
| `llamadas` (20260602) | ✅ | full CRUD (`USING(true)`) | + service_role = ALL |
| `connection_errors` (20260516) | ✅ | insert-only vía `/api/log-error` | 2 policies |

**El "✅" engaña** (hallazgo auditoría 2026-06-24): la mayoría de las policies de write son `USING(true)` para anon, así que con el `anon_key` (extraíble del bundle) cualquiera puede DELETE/UPDATE `tecnicos`/`supervisores`/`llamadas`. La raíz es que la app escribe con anon (registro client-side + cliente singleton). **Fix real pendiente**: migrar writes a `service_role` server-side, luego endurecer policies y habilitar RLS en `solicitudes_servicio`. Ver `docs/SEGURIDAD.md`.

### Storage buckets

| Bucket | Contenido | Acceso |
|---|---|---|
| `evidencias-servicio` | Fotos del diagnóstico y completación | **Público** (`getPublicUrl`) |
| `tecnicos-fotos` | Foto de perfil del técnico | **Público** |
| `tecnicos-documentos` | Documento de identidad del técnico (PII) | **Público** ⚠️ |

⚠️ **Riesgo conocido:** `tecnicos-documentos` es público — cualquiera con la URL puede descargar la cédula. **Pendiente migrar a signed URLs** (TTL 1h) usando `createSignedUrl()` en `src/lib/uploadHelpers.ts`. Mismo aplica con menor severidad a las otras dos. **Mitigación parcial aplicada** (`20260624_storage_quitar_listing_publico.sql`): el listing/enumeración de los 3 buckets quedó cerrado — ya no se puede listar el contenido, pero un objeto sigue accesible por su URL exacta.

Path pattern (todos):
- evidencias: `{solicitud_id}/{timestamp}_{index}.{ext}` o `{solicitud_id}/diagnostico_{timestamp}_{i}.{ext}`
- fotos/documentos técnicos: `{tecnico_id}/...`

### Patrones de query

#### Atomic update (anti race-condition) — **patrón modelo**
Cuando dos requests pueden mutar la misma fila, usa un `WHERE` adicional que actúe como guard. Ejemplo en `procesarAceptacion` (`src/lib/services/whatsapp.service.ts`):

```ts
// Solo el primer técnico que llega gana la asignación.
const { data: updated, error } = await supabase
  .from('solicitudes_servicio')
  .update({ tecnico_asignado_id: tecId, estado: 'asignada' })
  .eq('id', solicitudId)
  .is('tecnico_asignado_id', null)   // ← guard: solo si nadie ganó aún
  .select('*')
  .single()

if (error || !updated) {
  // alguien más ya ganó la carrera; tratar como "ya tomado"
}
```

Aplica también a transiciones de estado donde el actor anterior podría disparar dos veces. Patrón seguro:
```ts
.eq('estado', 'cotizacion_enviada')   // guard: solo si todavía está en este estado
```

**Lugares donde se necesita revisar este patrón** (audit 2026-05-07):
- `src/app/api/aprobar-cotizacion/route.ts:57-80` — hace dos UPDATEs separados sin guard, race posible.
- `src/app/api/confirmar-horario/route.ts:54` — agregar `.is('horario_confirmado_at', null)` al UPDATE.
- `src/app/api/cron/horario-recordatorio/route.ts:56,65` — UPDATE sin guard.

#### Filtros JSONB — **antipatrón a evitar**
**No** cargues toda la tabla y filtres en JS por un campo dentro de un JSONB. Hoy ocurren dos casos con `cotizacion->>'token'`:

```ts
// ❌ ANTIPATTERN — escala mal:
const { data: solicitudes } = await supabase
  .from('solicitudes_servicio')
  .select('*')
  .eq('estado', 'cotizacion_enviada')
const sol = solicitudes?.find(s => (s.cotizacion as { token?: string })?.token === token)
```

Lugares afectados (2026-05-07):
- `src/app/api/aprobar-cotizacion/route.ts:21-38`
- `src/app/cotizacion/[token]/page.tsx:58-67`

Fix preferido: **columna generada + índice único**:
```sql
ALTER TABLE solicitudes_servicio
  ADD COLUMN cotizacion_token uuid GENERATED ALWAYS AS ((cotizacion->>'token')::uuid) STORED;
CREATE UNIQUE INDEX idx_cotizacion_token ON solicitudes_servicio(cotizacion_token)
  WHERE cotizacion_token IS NOT NULL;
```
Luego: `.eq('cotizacion_token', token)`.

#### Tokens en columnas dedicadas
Usa columnas UUID dedicadas (con índice) para todo lo que se busque por token. Hoy: `horario_token`, `cliente_token`, `verificacion_paso_token`, `portal_token` (en `tecnicos`), `confirmacion_token` (en `evidencias_servicio`). Todos tienen índices o son `UNIQUE`.

### Tablas append-only — crecimiento y limpieza

Tres tablas crecen indefinidamente sin política de borrado:

| Tabla | Volumen estimado/solicitud | Proyección 5 años (5k sol/año) |
|---|---|---|
| `gps_pings` | 4–20 rows | ~100k–500k rows |
| `notificaciones_whatsapp` | 1–20 rows | ~25k–500k rows |
| `solicitud_eventos` | 5–20 rows | ~125k–500k rows |

A escala actual no es problema. Para producción de largo plazo, agregar un cron de limpieza:
```sql
DELETE FROM gps_pings WHERE capturado_at < NOW() - INTERVAL '2 years';
DELETE FROM notificaciones_whatsapp
  WHERE enviado_at < NOW() - INTERVAL '6 months'
  AND estado IN ('expirado', 'invalidado', 'error');
```

### CHECK constraints
Cada migración que agrega un nuevo `estado` reemplaza el constraint completo (`DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT`). El vigente está en `20260529_supervisores_y_repuesto_recibido.sql` (**22 estados**, 1:1 con `EstadoSolicitud` en `src/types/solicitud.ts`). Si agregas un nuevo estado **debes**:
1. Sumarlo al union type en `solicitud.ts`.
2. Crear nueva migración con el constraint completo (no `ADD ... IN (...)` parcial).
3. Agregar label/color en `src/lib/constants/estados.ts`.
4. Aplicar en Supabase **antes** del deploy.

Otros constraints relevantes: `siguiente_paso`, `verificacion_paso_decision`, `cancelado_por`, `repuestos_pendientes.estado`, `gps_pings.fase`, `solicitud_eventos.tipo`. Todos en sus respectivas migraciones.

### Auth admin

> 🔒 **Doc canónico**: `docs/SEGURIDAD.md` — mapa de auth por endpoint, modelo de tokens, backlog (RLS, rate limit, MFA).

**Frontend** — `src/app/admin/layout.tsx` llama `supabase.auth.getSession()`; sin sesión redirect a `/admin/login`. Login usa `supabase.auth.signInWithPassword`. Las cuentas admin se crean manualmente desde el dashboard de Supabase (no hay self-signup).

**API routes admin** — todas validan `Authorization: Bearer ${session.access_token}` con el helper compartido `verificarAdmin()` de `src/lib/auth/admin.ts`. Llamadas UI obtienen el token con `supabase.auth.getSession()` y lo envían en el header.

La tabla completa de endpoints protegidos (export, editar/cambiar-estado, notas, supervisores, reagendar-solicitud, actualizar-valor, pedir-repuesto-supervisores, carga-masiva, whatsapp/notify, cotizacion-precios, repuesto-recibido, ...) vive en `docs/SEGURIDAD.md` § 2 — no duplicarla acá.

**Patrón nuevo** (cualquier endpoint admin futuro):
```ts
import { verificarAdmin } from '@/lib/auth/admin'

export async function POST(req: NextRequest) {
  const isAdmin = await verificarAdmin(req)
  if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // ...
}
```

**Gotcha histórico** (2026-05-12): `/api/cotizacion-precios` y `/api/repuesto-recibido` se crearon sin auth check (asumiendo "solo el admin tiene la URL"). Cualquiera con la URL podía fijar precios y disparar cotizaciones, o transicionar estados marcando repuestos. Fix en este commit. **Cuando agregues un endpoint nuevo bajo `/api/admin/` o que muta estado admin, agrega `verificarAdmin` ANTES de cualquier parse de body.**

### Auditoría / observabilidad
Todo cambio relevante (cancelación, reagendamiento, cambio manual de admin) escribe a `solicitud_eventos` (append-only). Pattern:
```ts
await supabase.from('solicitud_eventos').insert({
  solicitud_id, tipo, estado_previo, estado_nuevo,
  actor: 'cliente' | 'tecnico' | 'admin' | 'sistema',
  motivo, payload: { ... }
})
```
Implementación en `logEvento()` de `src/lib/services/whatsapp.service.ts`. Los inserts NUNCA bloquean el flujo principal — siempre dentro de try/catch.
