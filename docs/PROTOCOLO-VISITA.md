# Protocolo de visita y no-show — Baird Service

> Procedimiento de verificación de presencia del cliente antes y durante
> la visita técnica, y manejo de no-show con evidencia documentada.
>
> **Última actualización: 2026-10-22** (Fase 0 implementada: recordatorio diario de agenda a técnicos, Confirmo / No alcanzo en el portal, alerta al equipo a las 8 pm, liberación manual con reoferta urgente — sin liberación automática por decisión del 2026-10-22; base 2026-05-10).
>
> 🧭 **Ver también**:
> - [docs/TARIFAS.md](./TARIFAS.md) — modelo "no-show: nadie paga".
> - [docs/FLOWS.md](./FLOWS.md) — flujo end-to-end donde encaja este protocolo.

---

## Tabla de contenido

1. [Por qué existe este protocolo](#por-qué-existe-este-protocolo)
2. [**Fase 0 — Confirmación del técnico a T-24h con liberación y reoferta urgente**](#fase-0--confirmación-del-técnico-a-t-24h-con-liberación-y-reoferta-urgente) ← implementada 2026-10-22
3. [Lado Baird — automatización WhatsApp + cron (cliente, Fase B)](#lado-baird--automatización-whatsapp--cron)
4. [Lado técnico — en la app](#lado-técnico--en-la-app)
5. [Protocolo de no-show](#protocolo-de-no-show)
6. [Estados, columnas y tablas DB](#estados-columnas-y-tablas-db)
7. [Política de gracia con clientes recurrentes](#política-de-gracia-con-clientes-recurrentes)
8. [Plantillas WhatsApp pendientes](#plantillas-whatsapp-pendientes)
9. [Cláusula informativa en T&C](#cláusula-informativa-en-tc)

---

## Por qué existe este protocolo

**No-show: nadie paga.** Si el cliente no está al momento de la visita confirmada, ni MABE ni Baird ni el cliente cubren el costo. El técnico pierde transporte y tiempo.

Aún así, el protocolo de evidencia es **obligatorio** porque:

1. **Protege al técnico contra acusaciones falsas.** Si MABE o el cliente alegan "el técnico nunca fue", Baird tiene foto + GPS + timestamps + intentos de contacto que prueban lo contrario.
2. **Permite reportar a MABE.** Aunque no se cobre, MABE necesita el reporte para su métrica interna y gestión de su cliente final. Sin evidencia, MABE descuenta el caso a Baird.
3. **Identifica clientes problemáticos recurrentes.** Si un cliente acumula 2–3 no-shows, Baird puede pedir confirmación obligatoria por llamada antes de aceptar nueva solicitud, o reportar a MABE para que decidan si lo siguen atendiendo en garantía.

**No es cobro — es gestión de riesgo operativo y trazabilidad.**

---

## Fase 0 — Confirmación del técnico a T-24h con liberación y reoferta urgente

> **Implementada el 2026-10-22** (código en rama, migración `20261022_confirmacion_visita.sql`
> pendiente de aplicar en prod, plantilla `agenda_manana_tecnico_v1` pendiente de subir).
> Esta fase se antepone a los Momentos 1–3 (que verifican al **cliente**) porque los
> datos de prod dicen que hoy el que falla es el **técnico**, no el cliente.
>
> **Decisión de alcance (user, 2026-10-22): sin liberación automática.** El sistema
> recuerda y alerta; sueltan al técnico solo él mismo ("No alcanzo") o el admin
> ("Liberar técnico y reofertar"). La versión estricta (liberar a las 20:00 sin
> confirmación) queda documentada al final como paso siguiente si las alertas no
> alcanzan.

### Por qué el técnico primero (datos de prod, 60 días al 2026-10-22)

54 reservas con `fecha_visita_at` ya vencida, clasificadas con la misma
lógica de `incumplidos.service.ts`:

| Resultado | Garantía | Particular | Total |
|---|---|---|---|
| Cumplida el día reservado | 3 | 7 | 10 |
| Atendida días después (`tarde`) | 6 | 4 | 10 |
| Vencida con técnico asignado y sin visita | 6 | 6 | 12 |
| Vencida sin que nadie aceptara | 7 | 1 | 8 |
| Cerrada sin marcador (completada/cancelada) | 5 | 9 | 14 |

- Reservar con más anticipación **no** mejora nada: 5+ días → 3 cumplidas de 22; 1 día → 3 de 10.
- El cupo no explica: slots con un solo servicio fallan 53 %; un técnico con un solo servicio en el día falla 69 %.
- No-show de cliente: 2 en 60 días.
- Un técnico aceptó 45 de 54 asignaciones y cumplió 9. Los demás aceptan casi nada (0–5 de 50–97 ofertas).
- Las 10 `tarde` tienen casi todas `reagendamientos_count = 0`: el técnico movió la visita por fuera del sistema.

Conclusión: la palanca es que **cada visita quede confirmada por el técnico
el día anterior y que avisar "no alcanzo" sea más fácil que no aparecer**, con
el equipo enterado a tiempo para reasignar. La confirmación del cliente
(Momentos 1–2) sigue siendo útil pero es fase B.

### Qué hace (hora Colombia)

| Cuándo | Qué | Dónde |
|---|---|---|
| **17:15** diario | **Recordatorio de agenda a cada técnico** con visitas Baird mañana: sus servicios (✅ confirmada / ⏳ sin confirmar) **+ sus compromisos propios** del calendario (`agenda_tecnico_bloqueos`), y el link al portal para confirmar o marcar "No alcanzo". Texto libre; si la ventana 24h está cerrada cae a la plantilla `agenda_manana_tecnico_v1`. Idempotente por día (`tecnicos.agenda_aviso_at`). | `GET /api/cron/agenda-tecnicos` (`vercel.json` `15 22 * * *`) → `enviarAgendaTecnicos()` |
| **20:00** diario | **Alerta al equipo** (`WHATSAPP_ALERT_PHONE`, texto libre) con las visitas de mañana **con técnico y sin confirmar** y las **sin técnico**, cada una con link a su ficha. Si todo está confirmado no manda nada. | `GET /api/cron/alerta-visitas` (`0 1 * * *`) → `enviarAlertaAdminVisitas()` |
| Cuando el técnico quiera | **Card del portal** (`/tecnico/{token}`, estado `asignada`): banner "⏳ Visita MAÑANA 8am - 12pm. ¿Vas?" con **✅ Confirmo** / **❌ No alcanzo** (ámbar si es hoy o mañana, discreto si es más adelante). Confirmada → "✅ Visita confirmada" + link "Ya no alcanzo". | `POST /api/tecnico/confirmar-visita` |
| Al aceptar | Aceptar un servicio con la visita a **≤ 36 h** cuenta como confirmación (`visita_confirmada_por='aceptacion'`): no se le vuelve a pedir. | `procesarAceptacion` → `aceptacionCuentaComoConfirmacion()` |
| Cuando el admin quiera | Ficha `/admin/solicitudes/[id]`, bloque **"📅 Confirmación de la visita"**: estado de la confirmación, **"✅ Confirmada por llamada"** y **"🔓 Liberar técnico y reofertar"**. Historial muestra `visita_confirmada` y `tecnico_liberado`. | `POST /api/admin/confirmar-visita`, `POST /api/admin/liberar-tecnico` |

**Liberar** (`liberarTecnico()` en `confirmacion-visita.service.ts`), tanto por
"No alcanzo" como por el admin:

1. Solo desde **`asignada`** (en `repuesto_recibido` el técnico tiene la pieza; en `en_proceso` ya hubo diagnóstico: ahí el admin reasigna con las herramientas de siempre).
2. **UPDATE atómico** `tecnico_asignado_id = NULL, estado = 'notificada', tecnico_liberado_count + 1` condicionado al técnico y estado leídos (si alguien se adelantó, no toca nada).
3. Evento `tecnico_liberado` (actor `tecnico` o email del admin; payload con técnico, motivo, detalle, fecha). `notificarCambioEstado(asignada → notificada)` → historial + supervisores que filtren ese estado.
4. Si lo soltó el admin, texto libre al técnico (best-effort; si no tiene ventana abierta, el admin lo llama).
5. **Reoferta URGENTE**: `notificarTecnicos(id, { excluirTecnicoId, urgente: true })` — va a todos los técnicos de la ciudad menos el liberado (preferido incluido, porque `notificados_at` ya está) con el horario prefijado **"🚨 URGENTE (técnico liberado) ·"**. Sin plantilla nueva. Si no hay otros técnicos, lo dice en `errors` y el admin asigna a mano.
6. El cliente **no** recibe mensaje (no hay plantilla y avisar sin reemplazo genera más llamadas que valor). Fase B: `visita_en_reasignacion_cliente_v1`.

Es también el "quitar técnico" limpio que faltaba: el guard de 2026-09-08 en
`notificarTecnicos` prohíbe reofertar con técnico puesto porque no había forma
segura de soltarlo.

### Cambio manual de técnico, penalización y bloqueo (2026-10-26; EN PROD 2026-10-27 vía PR jdguerron-lgtm/baird-app#26, main `89c958d`)

**🔁 Cambiar técnico** (ficha admin, tarjeta "Técnico asignado"; `CambiarTecnicoAdmin` → `POST /api/admin/cambiar-tecnico` → `reasignarTecnicoManual()` en `reasignar-tecnico.service.ts`). El admin elige al técnico que va (candidatos de `GET /api/admin/candidatos-oferta?todos=1` + resto de verificados, sin los bloqueados para ese flujo):

1. Cualquier estado vivo salvo `pendiente_horario` (`puedeCambiarTecnico`), con horario. `notificada` sin técnico → `asignada`; el resto conserva el estado.
2. UPDATE atómico condicionado al técnico y estado leídos; el trigger `limpiar_confirmacion_visita` borra la confirmación anterior. Ofertas `enviado` → `invalidado`.
3. Cupo por franja del técnico nuevo: `codigo: 'cupo_lleno'` → la UI pregunta y reintenta con `forzarCupo`.
4. Evento `nota_admin` con `payload.origen='cambio_tecnico'` (anterior, nuevo, motivo, `cuenta_incumplimiento`) — sin tocar el CHECK de `solicitud_eventos.tipo`.
5. Avisos (casilla, default sí): técnico nuevo + cliente con los MISMOS mensajes de una aceptación (`avisarAsignacionTecnico`, extraído de `procesarAceptacion`; sin repetir el anticipo si reemplaza a alguien) y texto libre best-effort al anterior. Sin avisos igual se fijan los auxiliares del técnico nuevo.

**Penalización** (`penalizacion.service.ts` + `utils/penalizacion-oferta.ts`, config en `/admin/reparto` → `GET/PATCH /api/admin/reparto/penalizacion`): incumplimientos en `penalizacion_dias` (30) = reservas propias `vencida`/`tarde` (regla de `/admin/incumplidos`) + liberaciones del admin (`tecnico_liberado` motivo `admin`) + cambios con `cuenta_incumplimiento`; uno por técnico + servicio. "No alcanzo" no cuenta. Cada uno = `penalizacion_minutos` (5) de espera, tope `penalizacion_max_minutos` (60). En `notificarTecnicos` (paso 3e) los penalizados se retienen en `solicitudes_servicio.oferta_pendientes` y `oferta_abierta_at` queda como despertador del cron `oferta-escalonada`, que les manda la oferta a su hora (la segunda ola del reparto escalonado también entra como retenida para no adelantarse). No aplica a la invitación dirigida ni al técnico preferido del cliente.

**Bloqueo por flujo** (`/admin/tecnicos/[id]` → `RestriccionesTecnicoAdmin` → `GET/POST /api/admin/tecnicos/restricciones`): `tecnicos.bloqueado_garantia` / `bloqueado_particular` sacan al técnico de las ofertas de ese flujo (también la dirigida), del selector público y del cambio manual.

Migración `20261026_restricciones_penalizacion_tecnicos.sql` (aditiva). **Todo es fail-soft**: sin ella no hay bloqueos ni penalización y las ofertas salen como antes; se puede desplegar el código primero.

### Datos (`supabase/migrations/20261022_confirmacion_visita.sql`)

- `solicitudes_servicio.visita_confirmada_at`, `visita_confirmada_por` (`tecnico | aceptacion | admin`), `tecnico_liberado_count`; índice parcial para las visitas con técnico sin confirmar.
- `tecnicos.agenda_aviso_at` (idempotencia del recordatorio por día CO).
- Trigger `limpiar_confirmacion_visita` (BEFORE UPDATE): si cambia `fecha_visita_at` o `tecnico_asignado_id` **y el mismo UPDATE no está confirmando**, pone en null la confirmación. Cubre los tres caminos de reagendamiento (cliente, admin, aceptación con otro horario) y cualquier reasignación sin tocar su código.
- `solicitud_eventos.tipo` CHECK **superset 18 → 20** (`visita_confirmada`, `tecnico_liberado`). ⚠️ Antes de aplicar, confirmar que el vigente sigue siendo el de `20260825_repuesto_recordatorios.sql`.
- ⚠️ **Aplicar la migración ANTES de desplegar**: el portal del técnico ya selecciona `visita_confirmada_at`; sin la columna, la lista de servicios del técnico falla.

### Archivos

| Archivo | Qué |
|---|---|
| `src/lib/utils/confirmacion-visita.ts` | Puro (server + browser): `proximidadVisita`, `aceptacionCuentaComoConfirmacion` (36 h), `armarAgendaTecnico` (texto + línea para plantilla), `armarAlertaAdmin`, `nombreCorto`, `ESTADOS_LIBERABLES`. |
| `src/lib/services/confirmacion-visita.service.ts` | `confirmarVisita`, `liberarTecnico`, `enviarAgendaTecnicos`, `enviarAlertaAdminVisitas`. |
| `src/lib/services/whatsapp.service.ts` | `notificarTecnicos(id, { excluirTecnicoId, urgente })`; `procesarAceptacion` marca confirmada si la visita es ≤ 36 h. |
| `src/app/api/cron/agenda-tecnicos`, `src/app/api/cron/alerta-visitas` | Crons diarios (`cronAutorizado`, `?dry=1`, `?fecha=YYYY-MM-DD`; agenda además `?force=1`). Kill-switch `AGENDA_TECNICOS_ENABLED=false`. |
| `src/app/api/tecnico/confirmar-visita` | `{ portalToken, solicitudId, accion: 'confirmar' \| 'no_alcanzo', motivo? }`. |
| `src/app/api/admin/confirmar-visita`, `src/app/api/admin/liberar-tecnico` | Solo admin (`obtenerEmailAdmin` rechaza rol lectura). |
| `src/app/tecnico/[token]/page.tsx` | Componente `ConfirmacionVisita` en la card; aviso verde tras "No alcanzo". |
| `src/app/admin/solicitudes/[id]/page.tsx`, `src/app/supervisor/[token]/[id]/page.tsx` | Bloque admin + etiquetas de los eventos nuevos. |
| `scripts/upload-templates.mjs` | `agenda_manana_tecnico_v1` (4 params + botón portal). |
| `src/__tests__/utils/confirmacion-visita.test.ts`, `src/__tests__/services/confirmacion-visita.test.ts` | 35 casos: proximidad, 36 h, textos, guards y atomicidad de `liberarTecnico`, idempotencia de `confirmarVisita`. |

Variables de entorno:

```
AGENDA_TECNICOS_ENABLED   # OPCIONAL — 'false' apaga los dos crons (agenda + alerta). Default: encendido.
WHATSAPP_ALERT_PHONE      # destino de la alerta de las 20:00 (ya existía; default 573153019192).
CRON_SECRET               # sigue SIN configurar en Vercel → estos crons quedan abiertos como los demás.
```

### Puesta en marcha

1. Aplicar `20261022_confirmacion_visita.sql` en prod (verificar el CHECK vigente primero) → **antes** del deploy.
2. Subir la plantilla: `node --env-file=.env.local scripts/upload-templates.mjs agenda_manana_tecnico_v1` y esperar APPROVED (`--check`). Mientras tanto el recordatorio llega solo a los técnicos con ventana 24h abierta (el texto libre); la alerta al equipo y los botones funcionan desde el deploy.
3. Probar sin enviar: `GET /api/cron/agenda-tecnicos?dry=1` y `GET /api/cron/alerta-visitas?dry=1` devuelven los textos.
4. Avisar a los técnicos: *"Todos los días a las 5 pm te llega tu agenda de mañana. Entra al portal y confirma cada visita; si no alcanzas a alguna, márcala como 'No alcanzo' y la reasignamos de inmediato."* Agregar la regla a `public/guia-plataforma.html`.
5. Medir en `/admin/incumplidos` (pendiente agregar la columna "Confirmó") si las confirmadas se cumplen y cuántas se liberan a tiempo.

### Qué quedó fuera a propósito (siguiente paso si las alertas no alcanzan)

- **Liberación automática a las 20:00** de toda visita de mañana sin confirmar, con último aviso a las 18:00 y segunda reoferta a las 06:30. Requiere un tick horario (pg_cron + pg_net, como `wompi-conciliar`, porque Vercel en este plan solo permite crons diarios), una plantilla de pedido de confirmación con botón, gracia de 2 h para reagendamientos tardíos, y un modo `aviso` previo. Todo el modelo de datos de esta fase ya lo soporta.
- Reagendamiento propuesto por el técnico (hoy "No alcanzo" libera; no propone otra fecha).
- Ranking de ofertas por cumplimiento y cupo diario por técnico.
- Respuesta por texto ("confirmo") en WhatsApp: el webhook no procesa botones ni texto como acción; el técnico usa el portal.
- Aviso al cliente cuando su visita queda sin técnico; recordatorio al cliente (Momentos 1–2); protocolo de llegada (Momento 3).
- Cláusula en `/contrato-tecnico` sobre la obligación de confirmar el día anterior (subir `CONTRATO_TECNICO_VERSION` si cambia el texto).

---

## Lado Baird — automatización WhatsApp + cron

> **Fase B (cliente).** Los Momentos 1–3 verifican al cliente. Se implementan después de la Fase 0 (técnico), que es donde están los incumplimientos hoy.

### Momento 1 — T-24h antes de la visita (cron)

**Trigger:** cron `/api/cron/recordatorio-visita` ejecuta cada 1h y dispara cuando faltan ~24h para `horario_confirmado`.

**Mensaje:** plantilla `recordatorio_visita_v1` (pendiente aprobación Meta — ver § Plantillas pendientes).

**Acción del cliente:** botón "✅ Confirmo" (no requiere acción) o "📅 Reagendar" (abre `/servicio/{cliente_token}` para reagendar — usa flujo existente).

**Si el cliente no responde:** el cron del momento 2 intenta de nuevo a T-2h.

### Momento 2 — T-2h antes (mismo cron)

**Mensaje:** plantilla `recordatorio_visita_inminente_v1`.

**Si el cliente no confirma en 1h:** se inserta evento en `solicitud_eventos` con `tipo='alerta_visita'` y aparece en `/admin/alertas-visita` (página nueva). Permite a admin llamar al cliente preventivamente.

### Momento 3 — Llegada del técnico (al ping GPS `llegada`)

**Trigger:** cuando el técnico envía `POST /api/gps-ping { fase: 'llegada' }`.

**Mensaje:** plantilla `tecnico_llegando_v1` al cliente: "[Nombre] está en tu puerta. Por favor abrir o responder en 10 min."

**Lado técnico:** en `/tecnico/{token}/diagnostico/{id}` aparece un badge:
- 🟢 **Cliente confirmó** (cliente respondió YES o ya había confirmado en T-2h)
- 🟡 **Pendiente** (mensaje enviado, sin respuesta aún)
- 🔴 **No respondió 10min** (activa el protocolo de no-show)

---

## Lado técnico — en la app

### Antes de llegar (opcional)

- Botón "Voy en camino" en `/tecnico/{token}` que dispara WhatsApp libre al cliente con ETA. Best-effort (depende de ventana 24h del cliente).
- Llamada telefónica rápida del técnico al cliente — recomendada pero no obligatoria.

### Al llegar (GPS llegada activado)

1. Técnico pulsa botón "Llegué" en el portal → frontend captura GPS y envía `POST /api/gps-ping { fase: 'llegada' }`.
2. Sistema dispara `tecnico_llegando_v1` al cliente.
3. UI del técnico muestra el badge de estado de confirmación del cliente.
4. Si el badge sigue en 🟡 después de 10 minutos:
   - Técnico llama al cliente desde la app (botón con `tel:` link).
   - El log de llamadas (timestamp + número + duración aproximada) se registra manualmente con un toggle "Llamada intentada".

### Cuando entra al inmueble

- Confirma presencia con botón "Cliente presente" → estado pasa a 🟢 manualmente.
- Procede al diagnóstico normal.

---

## Protocolo de no-show

Si después de 10 minutos en sitio el cliente no responde y no abre, el técnico inicia el protocolo de 15 minutos:

### Pasos obligatorios (todos requeridos para que la evidencia sea válida)

1. **Selfie del técnico frente a la dirección** — foto con cara del técnico visible y número del inmueble en el fondo. Subida a `evidencias-servicio` con timestamp y GPS automáticos.
2. **Foto del frente del inmueble** — número visible. Misma carga.
3. **Tres timbrazos espaciados** — uno cada 5 minutos. Cada uno con foto del intento (o video corto si el técnico prefiere).
4. **GPS pings cada 5 min** — automáticos (cada vez que el técnico permanece en sitio se envía un ping `fase: 'no_show'`).
5. **Intentos de contacto** — al menos 1 llamada y 1 WhatsApp del técnico al teléfono del cliente, registrados con timestamp.

### Después de 15 minutos

- Botón "Marcar no-show" en el portal del técnico.
- Modal de confirmación: "¿Confirmas que has cumplido todos los pasos? Esta acción cierra el servicio sin pago."
- Al confirmar:
  - `evidencias_servicio.evidencia_no_show` (JSONB) se persiste con todos los datos recolectados.
  - `solicitudes_servicio.estado = 'no_show_cliente'` (terminal).
  - `solicitud_eventos` registra evento `tipo='no_show_cliente'` con payload completo.
  - `cliente_historial` incrementa contador del cliente.
  - WhatsApp libre al cliente: "No pudimos completar tu servicio porque no estabas. Si necesitas otro horario, crea una nueva solicitud en /solicitar."
  - WhatsApp libre al admin: "Servicio NO-SHOW de [cliente] documentado. Ver /admin/solicitudes/[id]."
- Técnico puede salir del sitio con su evidencia documentada.

### Qué NO se hace

- No se penaliza al cliente económicamente (cláusula informativa en T&C, no penal).
- No se factura a MABE (la solicitud queda en estado terminal).
- No se paga al técnico por la visita (decisión del 2026-05-10).

---

## Estados, columnas y tablas DB

Ver `supabase/migrations/20260510_no_show_protocolo.sql` (pendiente de aplicación).

### Nuevos estados

| Estado | Tipo | Significado |
|---|---|---|
| `no_show_cliente` | terminal | Cliente no estuvo presente, técnico documentó evidencia, servicio cerrado sin pago |

### Nuevas columnas en `evidencias_servicio`

| Columna | Tipo | Notas |
|---|---|---|
| `evidencia_no_show` | JSONB | Payload con: selfie_url, inmueble_url, timbrazos[], llamadas[], wa_intentos[], pings_no_show[], notas_tecnico, marcado_at |

### Nuevas columnas en `solicitudes_servicio`

Para soportar el cálculo de bonos y reparto de pagos según las reglas de TARIFAS.md:

| Columna | Tipo | Notas |
|---|---|---|
| `cumple_ta` | boolean | true si diagnóstico < 24h de horario_confirmado_at; computado al diagnosticar |
| `cumple_encuesta` | boolean | true si el cliente contestó encuesta de satisfacción; null hasta el cierre |
| `dias_solucion_efectivos` | integer | días desde creación hasta completada, descontando esperando_repuesto |
| `pago_tecnico_total` | integer | computado al cerrar el servicio (base × 0.78 + bono + recargo_weekend) |
| `margen_baird` | integer | computado (base × 0.22) |
| `recargo_weekend_aplicado` | integer | computado (0 o 5k/6k/7k según complejidad) |

### Tabla nueva `cliente_historial`

```sql
CREATE TABLE cliente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text,                          -- cédula o NIT
  telefono text,                            -- formato pipe "57|3134951164"
  nombre_ultimo_visto text,
  no_shows_count integer DEFAULT 0,
  cancelaciones_tarde_count integer DEFAULT 0,
  servicios_completados_count integer DEFAULT 0,
  bloqueado boolean DEFAULT false,
  bloqueado_motivo text,
  bloqueado_at timestamptz,
  ultimo_evento_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cliente_historial_documento ON cliente_historial(documento) WHERE documento IS NOT NULL;
CREATE INDEX idx_cliente_historial_telefono ON cliente_historial(telefono) WHERE telefono IS NOT NULL;
```

Lookup: por documento (preferido) o teléfono. Update: trigger en `solicitudes_servicio` cuando entra a estado terminal.

---

## Política de gracia con clientes recurrentes

Para reducir churn por "se me olvidó una vez" pero pegar duro a abusadores recurrentes:

| No-shows acumulados | Acción |
|---|---|
| 1 (primero) | Sin penalidad. Mensaje cordial: "No pudimos hacer tu servicio. Crea una nueva solicitud cuando puedas." |
| 2 | Mensaje firme: "Notamos que es la segunda vez que no estás presente. Para tu próxima solicitud necesitaremos confirmar por llamada antes de despachar técnico." Flag `requiere_confirmacion_llamada=true` en `cliente_historial`. |
| 3 o más | Cliente queda en lista negra: `bloqueado=true` con motivo `'no_show_recurrente'`. No puede crear nuevas solicitudes en la plataforma sin que admin lo desbloquee manualmente. Admin puede notificar a MABE para que decidan si los siguen atendiendo en garantía. |

Endpoint admin para gestión: `/admin/clientes-historial` (página pendiente).

---

## Plantillas WhatsApp pendientes

Las siguientes plantillas Meta deben crearse y aprobarse antes de activar el protocolo automatizado. JSON listo en `docs/WHATSAPP_TEMPLATES.md` § "Backlog".

| Nombre | Disparo | Destino | Backlog ID |
|---|---|---|---|
| `recordatorio_visita_v1` | Cron T-24h | Cliente | (nuevo, agregar) |
| `recordatorio_visita_inminente_v1` | Cron T-2h | Cliente | (nuevo, agregar) |
| `tecnico_llegando_v1` | GPS llegada | Cliente | (nuevo, agregar) |
| `no_show_aviso_cliente_v1` | Tras marcar no-show | Cliente | (nuevo, agregar) |

Mientras Meta no apruebe estas plantillas, el protocolo funciona en modo manual (admin avisa por teléfono o WhatsApp libre cuando aplique). Recordatorios automáticos T-24h/T-2h quedan deshabilitados.

---

## Cláusula informativa en T&C

Sin penalidad económica al cliente, pero con consecuencias claras. Texto base para `legal/01-terminos-y-condiciones.docx` y `src/app/terminos/page.tsx`:

> **8. Visita programada y compromiso de presencia**
>
> 8.1. Al confirmar un horario, el cliente se compromete a estar presente o tener un mayor de edad autorizado en la dirección registrada durante toda la franja horaria seleccionada.
>
> 8.2. El cliente puede cancelar o reagendar la visita sin costo hasta 4 horas antes del inicio de la franja, a través del portal `/servicio/{token}` o respondiendo al WhatsApp de confirmación.
>
> 8.3. Si el técnico llega a la dirección dentro de la franja confirmada y no encuentra al cliente, y el cliente no canceló con al menos 4 horas de anticipación, el servicio quedará cerrado y deberá solicitarse nuevamente.
>
> 8.4. La acumulación de **2 inasistencias** a visitas confirmadas faculta a Baird Service para exigir confirmación adicional por llamada en futuras solicitudes. La acumulación de **3 o más inasistencias** faculta a Baird Service para suspender el acceso del cliente a la plataforma.
>
> 8.5. Excepciones (caso fortuito o fuerza mayor comprobable): emergencia médica del cliente o familiar, evento de fuerza mayor declarado por autoridad, o error del técnico/Baird (dirección errónea, llegada fuera de franja). Reclamos por excepción se evalúan caso a caso por Baird en máximo 48 horas.

---

## Roadmap de implementación

| Fase | Trabajo | Bloqueador |
|---|---|---|
| **0** | **Confirmación del técnico a T-24h** (sección arriba): recordatorio diario de agenda + Confirmo / No alcanzo + alerta al equipo + liberación manual con reoferta urgente. **Código listo 2026-10-22.** | Aplicar `20261022_confirmacion_visita.sql` antes del deploy; subir `agenda_manana_tecnico_v1`; `CRON_SECRET` en Vercel |
| 1 | Migración SQL: `no_show_cliente` estado + columnas evidencia + tabla `cliente_historial` | — |
| 2 | UI técnico: botón "Llegué" → ping GPS + protocolo no-show (foto, llamadas, espera 15 min, marcar) | Migración Fase 1 |
| 3 | Plantillas WhatsApp: subir 4 plantillas a Meta y esperar aprobación | Diseño copy + JSON |
| 4 | Cron T-24h y T-2h: nuevo `/api/cron/recordatorio-visita` | Plantillas aprobadas |
| 5 | UI cliente en `/servicio/{token}`: ver botón rápido "Confirmar presencia" | — |
| 6 | UI admin: `/admin/alertas-visita`, `/admin/clientes-historial` | Migración Fase 1 |
| 7 | T&C update: cláusula sección 8 | Revisión legal |
| 8 | Backfill `cliente_historial` con histórico actual | Migración Fase 1 + script |

Cada fase es independiente excepto donde se indica el bloqueador.
