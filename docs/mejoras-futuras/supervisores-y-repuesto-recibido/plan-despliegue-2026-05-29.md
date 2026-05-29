# Plan de despliegue — Supervisores + estado `repuesto_recibido`

**Fecha:** 2026-05-29
**Estado:** código completo y validado en local (`tsc --noEmit` limpio, `lint` exit 0). **Nada aplicado a producción todavía.**
**Autor del plan:** iteración 2026-05-29.

> 🎯 **Para qué sirve este doc.** Es el runbook para llevar a producción dos
> cambios que ya están escritos en el código pero **no desplegados**. Define el
> análisis de impacto, el **orden estricto** (migración → plantillas Meta → deploy)
> y la decisión de producto que falta tomar. Ejecutar en este orden evita que el
> código llame a una tabla/estado/plantilla que todavía no existe.

---

## 1. Qué se construyó (resumen)

Dos features independientes que viajan juntos en este release porque comparten migración:

### A. Notificaciones a supervisores en cada cambio de estado
Destinatarios internos (supervisores) reciben un WhatsApp **en cada cambio de
estado** de una solicitud. Configurables desde el panel admin (`/admin/supervisores`)
por:
- **ámbito**: `todos` | `garantia` | `particular`
- **marca**: filtro opcional (NULL = todas; se compara normalizado en la app)
- **estados[]**: subconjunto de estados a notificar (NULL/vacío = todos)

Caso de arranque pedido: (1) un supervisor **general** (ve todo) y (2) uno que
solo ve **garantía marca MABE**.

### B. Fix bug "repuesto que llega tarde"
Antes, al llegar el repuesto la solicitud volvía directo a `en_proceso` con la
fecha de visita vieja (podían haber pasado semanas). Ahora:

```
esperando_repuesto ──(repuesto llega)──▶ repuesto_recibido ──(cliente elige nueva fecha)──▶ en_proceso
```

El cliente recibe un link (`/reprogramar-repuesto/[token]`), elige **fecha
tentativa**, y recién ahí pasa a `en_proceso`. Se le avisa al técnico (plantilla
`repuesto_recibido_tecnico_v1`) dejando explícito que la fecha es **tentativa,
a coordinar según su disponibilidad**.

---

## 2. Análisis de impacto en el sistema

### 2.1 Supabase (migración `20260529_supervisores_y_repuesto_recibido.sql`)

| Cambio | Tipo | Riesgo | Nota |
|---|---|---|---|
| Tabla nueva `supervisores` | aditivo | bajo | No toca tablas existentes. RLS ON + 4 policies anon CRUD + service_role. |
| Trigger `normalizar_whatsapp_supervisor` | aditivo | bajo | Reusa `normalizar_telefono_co()` (ya en prod desde `20260513`). |
| `solicitudes_servicio_estado_check` DROP+ADD (22 estados, +`repuesto_recibido`) | **modifica constraint** | **medio** | Es el punto sensible. Ver nota abajo. |
| Columnas `reprogramacion_token uuid`, `repuesto_recibido_at timestamptz` | aditivo | bajo | `ADD COLUMN IF NOT EXISTS`, nullable, sin default pesado. |
| 3 índices (`idx_supervisores_activo`, `idx_solicitudes_reprogramacion_token`, `idx_solicitudes_repuesto_recibido`) | aditivo | bajo | Parciales, baratos. |

**Punto sensible — el CHECK constraint.** La migración hace
`DROP CONSTRAINT ... ADD CONSTRAINT` con la lista completa de 22 estados. Es
**solo aditivo** (agrega `repuesto_recibido`, no quita ninguno), así que ninguna
fila existente lo viola. El `DROP`/`ADD` es transaccional en Postgres: si la
nueva lista omitiera un estado en uso, el `ADD` fallaría y haría rollback — no
deja la tabla sin constraint. Riesgo real: que la lista de 22 esté
desincronizada con lo que hay en prod. **Mitigación**: la query de verificación
post-deploy chequea que `repuesto_recibido` quedó en el constraint; correr
también una cuenta de estados distintos en prod antes de aplicar (ver §4 Paso 0).

- **Backfill:** ninguno. Segura de re-correr (idempotente).
- **Dependencia de orden:** solo requiere que exista `normalizar_telefono_co()`
  (creada por `20260513`, ya aplicada). No depende de las demás pendientes.
- **RLS:** la app usa **anon key** (no hay service_role configurado). Las
  policies anon CRUD permiten que el panel admin gestione supervisores y que
  `notificarCambioEstado` los lea. La autorización real la impone
  `verificarAdmin` en `/api/admin/*` — consistente con el patrón de `tecnicos`.

### 2.2 Código (ya en local, se despliega en el Paso 3)

| Archivo | Cambio |
|---|---|
| `src/lib/services/whatsapp.service.ts` | + `notificarCambioEstado(solicitudId, estadoPrevio, estadoNuevo)` (filtra por ámbito/marca/estados; **nunca lanza**, solo loguea). `notificarTecnicoVisitaReprogramada` migrada de texto libre → plantilla `repuesto_recibido_tecnico_v1`. |
| `src/app/api/admin/supervisores/route.ts` | CRUD de supervisores (protegido por `verificarAdmin`). |
| `src/app/admin/supervisores/page.tsx` | UI admin de supervisores + entrada en el sidebar. |
| `src/app/api/repuesto-recibido/route.ts` | `esperando_repuesto` → `repuesto_recibido` (genera `reprogramacion_token`, setea `repuesto_recibido_at`, manda link al cliente, dispara `notificarCambioEstado`). |
| `src/app/api/reprogramar-repuesto/route.ts` | Página pública: cliente elige fecha → `repuesto_recibido` → `en_proceso` (UPDATE atómico con guard `WHERE estado='repuesto_recibido'`, avisa al técnico, dispara `notificarCambioEstado`). |
| `src/app/reprogramar-repuesto/[token]/page.tsx` | UI cliente para elegir nueva fecha tentativa. |

**Wiring de `notificarCambioEstado`:** cableado en el **dueño de la transición**
(la route/función que muta `estado`), nunca dentro de helpers compartidos
(`notificarTecnicos`, `enviarCotizacionCliente`) que re-setean estado de forma
idempotente — eso dispararía doble. El helper además corta solo si
`estadoPrevio === estadoNuevo`. Lista completa de call-sites en
`docs/ARQUITECTURA.md` § "Call-sites de notificarCambioEstado".

**Tolerancia a fallos:** `notificarCambioEstado` envuelve todo en try/catch y
nunca lanza. Si la tabla `supervisores` no existiera (orden de deploy mal), el
`select` falla → lo captura el catch → loguea y sigue. **No rompe la transición
de estado.** Aun así, el orden correcto (migración primero) evita ruido en logs.

### 2.3 WhatsApp / Meta — 3 plantillas nuevas a aprobar

| Plantilla | Dónde se usa | Params |
|---|---|---|
| `supervisor_cambio_estado_v1` | `notificarCambioEstado` | HEADER TEXT + 6 body (nombre, cliente, equipo, ciudad, tipo flujo, estado) + FOOTER |
| `repuesto_recibido_cliente_v2` | `enviarRepuestoRecibidoCliente` | 3 body + botón URL → `/reprogramar-repuesto/{token}` |
| `repuesto_recibido_tecnico_v1` | `notificarTecnicoVisitaReprogramada` | 4 body (técnico, equipo, cliente, fecha) + botón URL → `/tecnico/{token}` |

Las tres están en `scripts/upload-templates.mjs` (líneas 589, 151, 623) y
catalogadas en `docs/WHATSAPP_TEMPLATES.md`. **Funcionan fuera de la ventana de
24h** (son plantillas, no texto libre) — crítico porque entre diagnóstico y
llegada del repuesto pueden pasar semanas y la ventana del técnico/cliente está
cerrada.

> ⚠️ **Por qué las plantillas van ANTES del deploy.** Si el código se despliega
> y dispara `enviarPlantilla('supervisor_cambio_estado_v1', …)` antes de que Meta
> la apruebe, la API devuelve error y el supervisor no recibe nada (la transición
> de estado igual ocurre, porque el helper no lanza — pero se pierde el aviso).

### 2.4 Vercel / variables de entorno

- **No hay env vars nuevas.** El feature reusa `WHATSAPP_API_TOKEN`,
  `WHATSAPP_PHONE_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_APP_URL`. Nada que tocar en Vercel salvo el deploy del código.
- `BAIRD_TEST_PHONE_WHITELIST` (opcional) sigue aplicando: si está seteada en
  dev, los envíos a supervisores fuera de la lista se filtran. Útil para no
  alertar supervisores reales mientras se prueba.

### 2.5 Matriz de riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Código desplegado antes que la migración | media | medio | Orden estricto §4. El helper no lanza, pero los `select` a `supervisores` loguearían error. |
| Plantilla no aprobada al desplegar | media | bajo | Gate en §4 Paso 2: esperar `APPROVED` antes del deploy. Falla silenciosa (no rompe estado). |
| CHECK constraint desincronizado con prod | baja | medio | §4 Paso 0: contar estados distintos en prod antes de aplicar. |
| Spam a supervisores (muchos cambios de estado) | media | medio | Config por `estados[]` permite acotar. Ver decisión §6. |
| Notificación en creación masiva (carga-masiva) | — | — | **Hoy NO cableado a propósito.** Ver decisión §6. |

---

## 3. Pre-requisitos antes de empezar

- [ ] Acceso al **SQL Editor** de Supabase (dashboard).
- [ ] Acceso al **Meta WhatsApp Manager** (o credenciales para correr `upload-templates.mjs`).
- [ ] `.env.local` con `WHATSAPP_API_TOKEN` válido para subir plantillas.
- [ ] Permiso para mergear/desplegar a `main` (deploy Vercel) — **recordar: no se sube a GitHub hasta cerrar la revisión**.

---

## 4. Orden de despliegue (secuencia estricta)

> Regla de oro: **infra primero, código último.** Cada paso tiene un gate; no
> avanzar hasta que el gate pase.

### Paso 0 — Snapshot read-only de prod (opcional pero recomendado)
Antes de tocar nada, en el SQL Editor:
```sql
-- Estados distintos actualmente en uso (para confirmar que ninguno se pierde)
SELECT estado, COUNT(*) FROM solicitudes_servicio GROUP BY estado ORDER BY 1;
```
Confirmar que todos los estados que aparecen están en la lista de 22 de la
migración. (Lo están: la migración es aditiva.)

### Paso 1 — Aplicar la migración
1. Supabase → **SQL Editor** → New query.
2. Pegar **todo** `supabase/migrations/20260529_supervisores_y_repuesto_recibido.sql`. Ejecutar. Esperar "Success".
3. Correr la **verificación de `20260529`** de `supabase/migrations/README.md`
   (7 checks, todos deben dar `OK ✅`).

**Gate 1:** los 7 checks en `OK ✅`. Si alguno falla, re-correr (es idempotente).

### Paso 2 — Subir y aprobar las 3 plantillas Meta
```bash
node --env-file=.env.local scripts/upload-templates.mjs supervisor_cambio_estado_v1
node --env-file=.env.local scripts/upload-templates.mjs repuesto_recibido_cliente_v2
node --env-file=.env.local scripts/upload-templates.mjs repuesto_recibido_tecnico_v1
```
Verificar estado en Meta:
```bash
node --env-file=.env.local scripts/upload-templates.mjs --check
```

**Gate 2:** las 3 plantillas en estado **`APPROVED`** en Meta. La aprobación
puede tardar de minutos a ~24h. **No avanzar al deploy hasta que estén las 3.**

### Paso 3 — Desplegar el código
1. (Cuando esté autorizado push) mergear la rama a `main` → Vercel auto-deploya.
2. Confirmar deploy exitoso en el dashboard de Vercel.

**Gate 3:** build verde en Vercel + home carga.

### Paso 4 — Verificación post-deploy (smoke test)
1. **Admin supervisores:** entrar a `/admin/supervisores`, crear los dos
   supervisores de arranque:
   - General: ámbito `todos`, marca vacía, estados vacío.
   - MABE garantía: ámbito `garantia`, marca `MABE`, estados vacío.
   Confirmar que el WhatsApp queda normalizado a dígitos (ej. `573XXXXXXXXX`).
2. **Notificación de estado:** forzar un cambio de estado en una solicitud de
   prueba (idealmente con `BAIRD_TEST_PHONE_WHITELIST` apuntando a un número
   propio) y confirmar que llega `supervisor_cambio_estado_v1`.
3. **Flujo repuesto:** en una solicitud `esperando_repuesto`, marcar repuesto
   recibido → confirmar que el cliente recibe el link, que la solicitud queda en
   `repuesto_recibido`, elegir fecha en `/reprogramar-repuesto/[token]` →
   confirmar que pasa a `en_proceso` y que el técnico recibe
   `repuesto_recibido_tecnico_v1`.

---

## 5. Verificación de que NO se rompió nada existente

- Crear una solicitud normal (garantía y particular) y avanzar un par de estados:
  las notificaciones a cliente/técnico de siempre siguen llegando.
- Confirmar que no hay **doble notificación** de supervisor en transiciones que
  pasan por helpers (aceptación, cotización): el wiring está en el dueño de la
  transición, no en los helpers.

---

## 6. ⚠️ Decisión de producto PENDIENTE

**¿Se debe notificar a los supervisores cuando se *crea* una solicitud?**

Hoy `notificarCambioEstado` **NO está cableado** en los inserts de creación
(`/api/solicitar`, `carga-masiva`). Razón: la **carga masiva** inserta muchas
solicitudes de golpe → cablearlo ahí spamearía a los supervisores con decenas/
cientos de WhatsApp en segundos.

Opciones:
- **(a) Dejar como está** (recomendado para v1): supervisores se enteran desde el
  primer cambio de estado real (notificada/asignada). Cero riesgo de spam.
- **(b) Notificar solo en creación individual** (`/api/solicitar`), no en
  carga masiva. Requiere cablear `notificarCambioEstado(id, null, estadoInicial)`
  en esa route.
- **(c) Notificar también en carga masiva** pero con un resumen agregado (1
  mensaje "se cargaron N solicitudes") en vez de 1 por solicitud. Requiere una
  plantilla nueva.

**Acción requerida del dueño de producto:** elegir (a)/(b)/(c) antes o después
del deploy (no bloquea el release; (a) es el estado actual).

---

## 7. Rollback

Por capa, de menor a mayor esfuerzo:

- **Código:** revertir el deploy en Vercel (redeploy del commit anterior). El
  helper no lanza, así que incluso sin rollback de DB no rompe nada.
- **Plantillas Meta:** no se borran (cooldown de 4 semanas para reusar el
  nombre). Quedan aprobadas e inertes si el código no las llama.
- **Migración:** no hay rollback automático. Para revertir:
  - Desactivar supervisores: `UPDATE supervisores SET activo=false;` (corta los
    envíos sin tocar schema).
  - **No** revertir el CHECK constraint ni dropear columnas mientras haya filas
    en `repuesto_recibido` (las dejaría sin estado válido). Primero migrar esas
    filas a `en_proceso`/`esperando_repuesto`.

---

## 8. Checklist imprimible

```
[ ] Paso 0  Snapshot estados en prod (SELECT … GROUP BY estado)
[ ] Paso 1  Aplicar 20260529_*.sql en SQL Editor
[ ]   Gate 1  7 checks de verificación en OK ✅
[ ] Paso 2  Subir 3 plantillas (supervisor_cambio_estado_v1, repuesto_recibido_cliente_v2, repuesto_recibido_tecnico_v1)
[ ]   Gate 2  Las 3 en APPROVED (--check)
[ ] Paso 3  Deploy código (merge a main → Vercel)
[ ]   Gate 3  Build verde + home carga
[ ] Paso 4  Smoke test (crear 2 supervisores + cambio de estado + flujo repuesto)
[ ] Paso 5  Verificar no-regresión (sin doble notificación)
[ ] Decisión §6  Elegir (a)/(b)/(c) notificación en creación
```

---

## Referencias

- Migración: `supabase/migrations/20260529_supervisores_y_repuesto_recibido.sql`
- Cómo aplicar + verificación: `supabase/migrations/README.md` § "Aplicar 20260529"
- Estados y flujos: `docs/MAQUINA-DE-ESTADOS.md` §4b/4c y § "Notificación a supervisores"
- Flujos end-to-end: `docs/FLOWS.md` § "Side flow: Notificación a supervisores"
- Plantillas: `docs/WHATSAPP_TEMPLATES.md`
- Call-sites del helper: `docs/ARQUITECTURA.md` § "Call-sites de notificarCambioEstado"
