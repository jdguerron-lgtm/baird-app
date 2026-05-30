# Plantillas WhatsApp — Baird Service

> Documento canónico de TODAS las plantillas WhatsApp del proyecto.
> Última actualización: 2026-05-30 (admin ajusta valor al cliente → `valor_actualizado_cliente_v1`).

> 🆕 **Cambios 2026-05-29 (supervisores + bug repuesto):** tres plantillas nuevas/bumpeadas, **pendientes de subir a Meta** (no invocar en prod hasta `APPROVED`):
> - `supervisor_cambio_estado_v1` (NUEVA) — notifica a supervisores en cada cambio de estado. Disparada por `notificarCambioEstado()`.
> - `repuesto_recibido_cliente_v2` (BUMP de `_v1`) — ahora con botón URL → `/reprogramar-repuesto/{token}` para que el cliente elija una nueva fecha **tentativa** tras llegar el repuesto.
> - `repuesto_recibido_tecnico_v1` (NUEVA) — notifica al técnico la nueva fecha tentativa cuando el cliente reprograma tras el repuesto. Reemplaza el texto libre de `notificarTecnicoVisitaReprogramada()` (que fallaba fuera de la ventana 24h, cerrada tras semanas de espera del repuesto).

> 🆕 **Migración de dominio (2026-05-23):** las 10 plantillas con URLs en su contenido (botones o body) fueron re-subidas con versión incrementada (`_v1` → `_v2`, `_v3` → `_v4`, `_v5` → `_v6`) apuntando a `lineablanca.bairdservice.com`. Las 6 plantillas sin URLs siguen en su versión original. Ver `scripts/upload-templates-v2.mjs` (subscript usado en la migración) y `docs/mejoras-futuras/migracion-dominio/runbook-cutover-2026-05-23.md`. Las versiones viejas (`_v1`, `_v3`, `_v5` de las 10 migradas) siguen aprobadas en Meta pero **ya no se invocan desde el código** — borrarlas tras 1-2 semanas sin issues (respetando el cooldown de 4 semanas para reusar el nombre).

> 🧭 **Ver también**:
> - `docs/INDEX.md` — hub de navegación.
> - `docs/FLOWS.md` — cuándo se dispara cada plantilla en el flujo end-to-end.
> - `scripts/upload-templates.mjs` — fuente canónica del JSON de cada plantilla.
> - `docs/GOTCHAS.md` → "WhatsApp 24h window" — diferencia template vs free-form.

---

## ⚠️ Proceso obligatorio para crear o modificar una plantilla

Cada vez que cambies un mensaje WhatsApp **debes seguir estos 3 pasos en orden**. Saltarse alguno deja el código y Meta desincronizados, lo que rompe envíos en producción.

### Paso 1 — Revisar dónde está documentada

Las plantillas viven en uno de estos lugares (en orden de canonicidad):

| Lugar | Qué contiene |
|---|---|
| `scripts/upload-templates.mjs` | **Fuente canónica** del repo. Contiene la definición JSON exacta que se sube a Meta. Hoy: 19 plantillas. `valor_actualizado_cliente_v1` ya está subida (status PENDING, esperando aprobación Meta). Las 3 de 2026-05-29 (`supervisor_cambio_estado_v1`, `repuesto_recibido_cliente_v2`, `repuesto_recibido_tecnico_v1`) están en el script pero **aún no subidas a Meta**. Sólo las versiones vigentes — para subir SOLO las renombradas por la migración a `lineablanca`, ver `scripts/upload-templates-v2.mjs`. |
| Meta Business Manager → WhatsApp Manager → Message Templates | **Fuente de verdad operacional** — lo que Meta tiene aprobado y permite enviar. Toda plantilla ya enviada al menos una vez está aquí. |
| `docs/WHATSAPP_TEMPLATES.md` (este archivo) | **Documentación humana** — catálogo, parámetros, propósito. |
| `docs/FLOWS.md` | Plantillas en contexto del flujo. |
| `CLAUDE.md` | Resumen para agentes de IA. |

**Estado de cobertura del script (2026-05-23):** las 16 plantillas en uso por el código ya están todas registradas en `scripts/upload-templates.mjs`, todas en sus versiones vigentes (tras la migración del 2026-05-23 — ver banda informativa al inicio de este doc). Plantillas huérfanas/legacy en Meta que NO se invocan desde el código (NO borrar hasta cooldown de 4 semanas desde su deprecation):
- `solicitud_particular_cliente_v1` — DEPRECATED hace tiempo
- `cliente_seleccion_horario_v1`, `recordatorio_horario_v1`, `nueva_solicitud_v3`, `solicitud_particular_tecnico_v1`, `servicio_asignado_tecnico_v3`, `tecnico_asignado_cliente_v5`, `verificar_siguiente_paso_v1`, `cotizacion_cliente_v1`, `cotizacion_aprobada_tecnico_v1`, `confirmar_servicio_v3` — reemplazadas por sus versiones `_v2/_v4/_v6` el 2026-05-23 por la migración de dominio. Cooldown hasta ~2026-06-20 para borrar y reusar nombre (o simplemente dejarlas indefinidamente).

### Paso 2 — Actualizar la plantilla en su lugar canónico

- **Si está en `upload-templates.mjs`**: edita el array `TEMPLATES`. Mantén el patrón del JSON (`HEADER` opcional, `BODY` con `{{1}}`, `{{2}}`, ..., `BUTTONS` opcional con `URL`).
- **Si NO está en el script**: agrégala al array. Luego edita.
- **Actualiza `docs/WHATSAPP_TEMPLATES.md`** (este archivo) en la sección "Catálogo" con los nuevos parámetros, body y propósito.
- **Actualiza `docs/FLOWS.md`** si el cambio impacta el flujo (qué se envía, cuándo).
- **Si cambias el nombre**: el código que la invoca (`enviarPlantilla(..., 'nombre_v?', ...)`) debe actualizarse también. **No reuses nombres** — versiona (`_v2`, `_v3`).

### Paso 3 — Subir a Meta y esperar aprobación

```bash
# Subir solo la plantilla modificada (recomendado):
node --env-file=.env.local scripts/upload-templates.mjs <nombre_template>

# Listar plantillas vigentes en Meta (verificación):
node --env-file=.env.local scripts/upload-templates.mjs --check

# Eliminar (solo si necesitas — ver caveat de cooldown abajo):
node --env-file=.env.local scripts/upload-templates.mjs --delete <nombre_template>
```

Tras submit, Meta revisa la plantilla. Tiempos típicos:

- Categoría `UTILITY` (la mayoría de las nuestras): 1–24 horas.
- Categoría `MARKETING`: 1–3 días.
- Si Meta rechaza: el script muestra el error. Edita y vuelve a subir con el mismo nombre — no consume cooldown.

**Hasta que Meta apruebe**, los `enviarPlantilla(..., 'nombre_v?', ...)` que apunten a esta plantilla **fallarán**. No deployar código que dependa de una plantilla nueva sin antes confirmar que está aprobada en Meta.

### ⚠️ Caveat crítico: cooldown de 4 semanas tras eliminar

Si eliminas una plantilla en Meta, **no puedes reusar el mismo nombre durante 4 semanas**. Por eso versionamos en el nombre (`_v1` → `_v2` → ...). Para cambios de body o parámetros:

- **Cambios menores** (texto): edita y re-sube con el mismo nombre — Meta evalúa como nueva versión.
- **Cambio de número de parámetros, header, botón**: crea una nueva versión (`_v6`, `_v7`) y deja la anterior como deprecated. Solo borra cuando ningún código la use.

---

## Catálogo de plantillas

Todas en idioma `es`. Categoría `UTILITY` salvo notas.

### Pre-asignación

#### `cliente_seleccion_horario_v2`
- **En script** ✅
- **Disparo**: `POST /api/solicitar` (ambos flujos)
- **Llamada**: `enviarSeleccionHorarioCliente(solicitudId)`
- **Destino**: cliente
- **Header**: TEXT — "Solicitud recibida en Baird Service"
- **Body** (4 params): `cliente`, `equipo`, `horario_1`, `horario_2`
- **Botón URL**: `/horario/{horario_token}` — display "Confirmar horario"
- **Propósito**: cliente confirma fecha + franja antes de notificar técnicos.

#### `recordatorio_horario_v2`
- **En script** ✅
- **Disparo**: cron `/api/cron/horario-recordatorio` (24h sin confirmar)
- **Llamada**: `enviarRecordatorioHorario(solicitudId)`
- **Destino**: cliente
- **Body** (2 params): `cliente`, `equipo`
- **Botón URL**: `/horario/{horario_token}` — display "Confirmar horario"
- **Propósito**: empujar al cliente que aún no abrió el primer enlace.

#### `nueva_solicitud_v4` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=true`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'nueva_solicitud_v4', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago`
  - `ubicacion` (`{{4}}`) = **dirección + zona + ciudad** (ej. `Calle 53 #24-18, Chapinero, Bogotá`). Se arma en `notificarTecnicos` con `[direccion, zona_servicio, ciudad_pueblo]` filtrando vacíos. La dirección exacta le permite al técnico evaluar distancia/acceso antes de aceptar. El texto de la plantilla no cambió — solo el valor del param.
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio garantía a técnicos compatibles.
- **Pendiente**: backfill a `upload-templates.mjs`.

#### `solicitud_particular_tecnico_v2` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=false`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'solicitud_particular_tecnico_v2', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago_diagnostico`
  - `ubicacion` (`{{4}}`) = **dirección + zona + ciudad** — mismo armado que `nueva_solicitud_v4` (ver arriba).
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio particular a técnicos compatibles.

#### `solicitud_particular_cliente_v1` ⚠️ DEPRECATED
- **NO está en `upload-templates.mjs`** y **NO se invoca desde el código**.
- Plantilla huérfana en Meta. Antes del rediseño customer-first (v2 2026-04-27) probablemente confirmaba al cliente particular tras crear la solicitud — hoy ese rol lo cumple `cliente_seleccion_horario_v2` (compartida entre garantía y particular).
- **No la borres** durante 4 semanas mínimo (cooldown Meta). Si quieres limpiarla, usa `--delete` y respeta el cooldown antes de reusar el nombre.

### Asignación

#### `servicio_no_disponible_v3` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `procesarAceptacion()` — perdedores de la carrera atómica
- **Destino**: técnicos perdedores
- **Body** (1 param): `nombre`
- **Propósito**: avisar que el servicio ya fue tomado.

#### `servicio_asignado_tecnico_v4` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `procesarAceptacion()` — ganador
- **Destino**: técnico ganador
- **Body** (6 params): `nombre`, `cliente`, `equipo`, `direccion`, `pago`, `telefono_cliente`
- **Botón URL**: `/tecnico/{portal_token}` — display "Ver portal"
- **Propósito**: confirmar asignación + datos del cliente al técnico.

#### `tecnico_asignado_cliente_v6`
- **En script** ✅
- **Disparo**: `procesarAceptacion()` cuando `es_garantia=true`
- **Destino**: cliente
- **Body** (5 params): `cliente`, `tecnico`, `equipo`, `horario`, `telefono_tecnico`
- **Sin botón** (info-only)
- **Propósito**: avisar al cliente que ya tiene técnico asignado (warranty).

#### `tecnico_asignado_particular_v1` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `procesarAceptacion()` cuando `es_garantia=false`
- **Destino**: cliente
- **Body** (7 params): `cliente`, `tecnico`, `equipo`, `horario`, `telefono_tecnico`, `tarifa_diagnostico`, `anticipo`
- **Propósito**: avisar al cliente + recordar tarifa diagnóstico + anticipo.

### Post-diagnóstico (cliente decide)

#### `verificar_siguiente_paso_v2`
- **En script** ✅
- **Disparo**: `enviarVerificacionPasoCliente(solicitudId)` (warranty post-diagnóstico, o post-pricing si esperar_repuesto)
- **Destino**: cliente
- **Body** (5 params): `cliente`, `tecnico`, `equipo`, `diagnostico`, `accion_propuesta`
- **Botón URL**: `/verificar-paso/{verificacion_paso_token}` — display "Aprobar paso"
- **Propósito**: cliente aprueba/rechaza el siguiente paso del técnico (4 opciones: reparar, esperar_repuesto, no_reparable, negativa_cliente).

#### `cotizacion_cliente_v2` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `enviarCotizacionCliente(solicitudId)` (particular post-pricing admin)
- **Destino**: cliente
- **Body** (7 params): `cliente`, `tecnico`, `equipo`, `diagnostico`, `mano_obra`, `repuestos`, `total`
- **Botón URL**: `/cotizacion/{cotizacion.token}` — display "Aprobar cotización"
- **Propósito**: cliente aprueba/rechaza la cotización particular.
- **⚠️ Cambio pendiente**: con el admin pricing gate v1 podría ser útil agregar el `tiempo_entrega` al body — requiere nueva versión `_v2`.

### Post-decisión cliente

#### `cotizacion_aprobada_tecnico_v2` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarCotizacionAprobada(solicitudId)`
- **Destino**: técnico
- **Body** (4 params): `tecnico`, `cliente`, `equipo`, `total`
- **Botón URL**: `/tecnico/{portal_token}` — display "Ver portal"
- **Propósito**: avisar al técnico que el cliente aprobó.

#### `esperando_repuesto_cliente_v1`
- **En script** ✅
- **Disparo**: `enviarEsperandoRepuestoCliente(...)` tras aprobación cliente del paso esperar_repuesto
- **Destino**: cliente
- **Body** (6 params): `cliente`, `tecnico`, `equipo`, `sku`, `descripcion_repuesto`, `tiempo_estimado`
- **Sin botón**
- **Propósito**: avisar que el repuesto está siendo gestionado.

#### `repuesto_recibido_cliente_v2` ⏳ pendiente de subir a Meta
- **En script** ✅ (bump de `_v1` el 2026-05-29)
- **Disparo**: `enviarRepuestoRecibidoCliente(solicitudId)` cuando admin marca todos los repuestos recibidos (estado pasa a `repuesto_recibido`). También re-enviable desde `/api/admin/reenviar-ultimo-mensaje` para ese estado.
- **Destino**: cliente
- **Body** (3 params): `cliente`, `equipo`, `tecnico`
- **Botón URL**: `/reprogramar-repuesto/{reprogramacion_token}` — display "Elegir nueva fecha"
- **Propósito**: el repuesto llegó; el cliente elige una **nueva fecha tentativa** (semanas pueden haber pasado desde el diagnóstico). El copy aclara que la fecha se confirma según disponibilidad del técnico. Al elegir, `/api/reprogramar-repuesto` pasa la solicitud a `en_proceso`.
- **⚠️ Cambio vs `_v1`**: `_v1` (sin botón) solo avisaba "el técnico se contactará". `_v2` agrega el botón para que el cliente reagende. `_v1` queda deprecated en Meta (cooldown 4 semanas).

#### `repuesto_recibido_tecnico_v1` ⏳ pendiente de subir a Meta
- **En script** ✅ (nueva 2026-05-29)
- **Disparo**: `notificarTecnicoVisitaReprogramada(solicitudId, horario)` desde `POST /api/reprogramar-repuesto`, justo después de que el cliente elige la nueva fecha y la solicitud pasa a `en_proceso`.
- **Destino**: técnico asignado
- **Body** (4 params): `nombre_tecnico`, `equipo`, `cliente`, `fecha_tentativa`
- **Botón URL**: `/tecnico/{portal_token}` — display "Abrir portal"
- **Propósito**: avisar al técnico la nueva fecha **tentativa** que eligió el cliente y recordarle que la confirme según su disponibilidad. El servicio ya está `en_proceso`; puede completar la reparación al coordinar.
- **⚠️ Por qué plantilla y no texto libre**: entre el diagnóstico (`esperando_repuesto`) y la llegada del repuesto pasan semanas, así que la ventana 24h del técnico casi siempre está cerrada → el texto libre anterior fallaba en silencio. Una plantilla funciona fuera de la ventana. Reemplaza el `enviarMensajeTexto` que usaba `notificarTecnicoVisitaReprogramada` hasta el 2026-05-29.

#### `finalizado_sin_reparacion_v1`
- **En script** ✅
- **Disparo**: `enviarFinalizadoSinReparacion(solicitudId, motivo)` cuando paso = no_reparable y cliente aprueba
- **Destino**: cliente
- **Body** (4 params): `cliente`, `equipo`, `motivo`, `tecnico`
- **Sin botón**
- **Propósito**: cierre formal — equipo no es reparable.

### Final

#### `confirmar_servicio_v4` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `POST /api/completar-servicio`
- **Destino**: cliente
- **Body** (3 params): `cliente`, `tecnico`, `equipo`
- **Botón URL**: `/confirmar/{confirmacion_token}` — display "Confirmar servicio"
- **Propósito**: cliente califica satisfacción (1-10) o reporta problema.

### Onboarding

#### `registro_bienvenida_v3` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarRegistroTecnico(tecnicoId)` post-registro
- **Destino**: técnico recién registrado
- **Body** (3 params): `nombre`, `ciudad`, `especialidad`
- **Sin botón**
- **Propósito**: bienvenida + indicar que falta verificación admin.

### Supervisión

#### `supervisor_cambio_estado_v1` ⏳ pendiente de subir a Meta
- **En script** ✅ (nueva 2026-05-29)
- **Disparo**: `notificarCambioEstado(solicitudId, estadoPrevio, estadoNuevo)` — se invoca en cada transición de estado de `solicitudes_servicio` (ver lista de call-sites en `docs/ARQUITECTURA.md`).
- **Destino**: cada supervisor **activo** de la tabla `supervisores` cuyo filtro matchea la solicitud:
  - `ambito`: `todos` (siempre) | `garantia` (solo `es_garantia=true`) | `particular` (solo `es_garantia=false`)
  - `marca`: `null` (todas) | string (solo si coincide con `marca_equipo`, normalizado sin acentos)
  - `estados`: `null`/`[]` (todos) | `text[]` (solo si `estadoNuevo` está en la lista)
- **Header**: TEXT — "Actualización de servicio"
- **Body** (6 params): `supervisor_nombre`, `cliente`, `equipo`, `ciudad`, `tipo_flujo` (Garantía/Particular), `estado_nuevo` (label legible de `ESTADO_LABELS`)
- **Sin botón** (informativo)
- **Propósito**: dar visibilidad a supervisores (p.ej. uno general que ve todo, otro que solo ve garantías MABE) sobre cualquier cambio de estado. La plantilla funciona fuera de la ventana 24h (los supervisores no chatean con el número del negocio).
- **Nota**: `notificarCambioEstado` nunca lanza — si el envío falla, loguea y no rompe la transición que lo disparó.

#### `valor_actualizado_cliente_v1` ⏳ pendiente de aprobación Meta (subida 2026-05-30, status PENDING)
- **En script** ✅ (nueva 2026-05-30) — id Meta `965589726530805`
- **Disparo**: `enviarValorActualizadoCliente(solicitudId)`, llamada desde `/api/admin/actualizar-valor` cuando el admin ajusta el valor al cliente de un servicio **particular**.
- **Destino**: el cliente (`cliente_telefono`). Solo flujo particular (`es_garantia=false`) con `cotizacion.token` existente.
- **Header**: TEXT — "Actualización de tu cotización"
- **Body** (3 params): `cliente_nombre`, `equipo` (`tipo_equipo marca_equipo`), `nuevo_valor` (formateado con `formatCOP`, sin el símbolo `$` porque la plantilla ya lo antepone)
- **Botón**: URL dinámica → `${APP_URL}/cotizacion/{{1}}` con param = `cotizacion.token` (lleva al cliente a re-aprobar)
- **Propósito**: avisar al cliente que el admin reajustó el precio del servicio. El endpoint reabre la aprobación (estado → `cotizacion_enviada`) para que el cliente confirme el nuevo valor en `/cotizacion/{token}`.
- **Nota**: el BODY no empieza ni termina en variable (regla Meta 2388299) — abre con "Hola {{1}}," (texto + var) y cierra con "…vía Baird Service." `enviarValorActualizadoCliente` no muta estado (eso lo hace el endpoint); solo envía.

---

## Texto libre (no plantillas)

Algunos avisos se envían como **texto libre** (`enviarMensajeTexto`) en vez de plantilla. Requieren ventana 24h del destinatario abierta — si no, Meta los rechaza con error #131047 ("Re-engagement message").

| Disparo | Destino | Por qué texto libre y no plantilla |
|---|---|---|
| Cliente cancela su solicitud | cliente + técnico | Texto dinámico, sin plantilla aprobada hoy |
| Cliente reagenda | cliente + técnico | Idem |
| Cliente APROBÓ siguiente paso (warranty) | técnico | Confirmación corta |
| Cliente RECHAZÓ siguiente paso | técnico | Confirmación corta |
| Cliente RECHAZÓ cotización | técnico | Confirmación con motivo |
| Cliente APROBÓ "negativa_cliente" | cliente | Cierre amable |

**Pendiente**: convertir los textos libres más críticos (cancelación, reagendamiento) en plantillas para que se entreguen siempre. Requiere aprobación Meta.

---

## Imágenes (no son plantillas)

`enviarImagen()` envía imágenes free-form (foto perfil técnico, foto documento, fotos de evidencia). **Sufren la misma restricción de ventana 24h** que el texto libre — y en customer-first la ventana NO se abre, así que estos envíos suelen fallar.

| Imagen | Origen | Mitigación si falla |
|---|---|---|
| Foto perfil técnico | `procesarAceptacion()` post-asignación | Visible en `/servicio/{cliente_token}` |
| Foto documento técnico | Idem | Idem |

**Fix durable pendiente**: nueva plantilla con `HEADER` tipo `IMAGE` para que la foto vaya dentro de un mensaje template (no requiere ventana 24h). Ejemplo: `tecnico_asignado_cliente_v6` con foto en header.

---

## Variables de entorno relacionadas

```
WHATSAPP_API_TOKEN          # System User token "baird-api" — permanente
WHATSAPP_PHONE_ID           # 1148716061648720 — phone ID del número
WHATSAPP_WEBHOOK_VERIFY_TOKEN  # handshake con Meta
WHATSAPP_WEBHOOK_SECRET     # HMAC-SHA256 para firmar webhook
WABA_ID                     # default: 2354953275016882 (en script)
BAIRD_TEST_PHONE_WHITELIST  # opcional, CSV de digits — filtra envíos en dev
```

Si rotas el token: actualiza `WHATSAPP_API_TOKEN` en Vercel **y** re-deploy. Los tokens de System User no expiran.

---

## Backlog — plantillas pendientes de crear

Cubren los gaps detectados al revisar el flujo de garantía (2026-05-08). Cada una con JSON listo para pegar en `scripts/upload-templates.mjs` cuando se priorice. **Ninguna está creada en Meta todavía** — no las invoques desde código hasta que estén `APPROVED`.

### Alta prioridad (cierran gaps activos en producción)

#### A. `solicitud_expirada_cliente_v1`
**Gap**: cuando el cron `horario-recordatorio` mueve a `sin_agendar` tras 36h sin confirmación, el cliente NO recibe ningún mensaje. Queda pensando que el horario sigue abierto.
**Disparo sugerido**: agregar a `/api/cron/horario-recordatorio` justo después del UPDATE a `sin_agendar`.

```js
{
  name: 'solicitud_expirada_cliente_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        'Hola {{1}}, no recibimos la confirmación de horario para tu {{2}} y por eso cerramos la solicitud. ' +
        'Si todavía necesitas el servicio, puedes crear una nueva en cualquier momento.',
      example: { body_text: [['Juan', 'Lavadora Mabe']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Crear nueva solicitud', url: `${APP_URL}/solicitar`, example: [`${APP_URL}/solicitar`] },
      ],
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

#### B. `paso_aprobado_cliente_v1`
**Gap**: cuando cliente aprueba `reparar` o `negativa_cliente` en `/verificar-paso`, hoy se le manda solo texto libre — depende de ventana 24h. Muchos clientes no reciben confirmación por WhatsApp.
**Disparo sugerido**: en `/api/verificar-paso` para `reparar` y `negativa_cliente`, reemplazar el texto libre por esta plantilla.

```js
{
  name: 'paso_aprobado_cliente_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        '✅ Hola {{1}}, registramos tu aprobación para tu {{2}}.\n\n' +
        'Acción: {{3}}\n\n' +
        '{{4}}',
      example: {
        body_text: [[
          'Juan',
          'Lavadora Mabe',
          'Proceder con la reparación',
          'El técnico Carlos procederá según lo acordado. Te avisaremos al completar el servicio.',
        ]],
      },
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

#### C. `paso_rechazado_cliente_v1`
**Gap**: cliente rechaza paso en `/verificar-paso` → estado=en_disputa, pero solo ve in-app. Sin plantilla de confirmación. **Disparo sugerido**: en `/api/verificar-paso` rama rechazo.

```js
{
  name: 'paso_rechazado_cliente_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        'Hola {{1}}, registramos tu rechazo del siguiente paso propuesto para tu {{2}}.\n\n' +
        'El equipo de Baird Service se pondrá en contacto contigo en las próximas horas para resolver la situación. ' +
        'Mientras tanto, no realices ningún pago al técnico.',
      example: { body_text: [['Juan', 'Lavadora Mabe']] },
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

#### D. `paso_resuelto_tecnico_v1`
**Gap**: cuando cliente aprueba/rechaza el siguiente paso, al técnico solo se le manda texto libre — depende de su ventana 24h.
**Disparo sugerido**: en `/api/verificar-paso`, ambas ramas, reemplazar texto libre por plantilla con dos parámetros (decisión + acción).

```js
{
  name: 'paso_resuelto_tecnico_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        'Hola {{1}}, el cliente {{2}} {{3}} el siguiente paso para {{4}}.\n\n' +
        '{{5}}',
      example: {
        body_text: [[
          'Carlos',
          'Juan Pérez',
          'APROBÓ',
          'Lavadora Mabe',
          'Procede según lo acordado. Si llegas a sospechar algo, contacta a Baird Service antes de actuar.',
        ]],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Abrir portal', url: `${APP_URL}/tecnico/{{1}}`, example: [`${APP_URL}/tecnico/...`] },
      ],
    },
  ],
}
```

#### E. `repuesto_recibido_tecnico_v1` ✅ PROMOVIDA (2026-05-29)
Ya no está en backlog: se agregó al script y al catálogo (sección "Post-decisión cliente"). La versión final tiene **4 params** (`nombre`, `equipo`, `cliente`, `fecha_tentativa` + botón portal) — diverge del borrador de 3 params de este backlog porque se dispara **después** de que el cliente elige fecha (no al recibir el repuesto), así que incluye la fecha tentativa. Ver entrada de catálogo y `scripts/upload-templates.mjs`.

#### F. `gestionar_servicio_v1`
**Gap**: el cliente accede al portal `/servicio/{cliente_token}` solo si abre un webview que contenga el `<GestionarServicioLink>` (hoy en /horario, /verificar-paso, /cotizacion). Ideal sería tenerlo en WhatsApp directo en momentos clave.
**Disparo sugerido**: opt-in. Inicialmente, agregar al final de `/api/confirmar-horario` para que el cliente reciba el portal-link justo después de elegir horario.

```js
{
  name: 'gestionar_servicio_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        'Hola {{1}}, este es tu enlace permanente para gestionar el servicio de tu {{2}}.\n\n' +
        '🔧 Desde acá puedes cancelar o cambiar la fecha en cualquier momento mientras el técnico no haya completado el servicio.',
      example: { body_text: [['Juan', 'Lavadora Mabe']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Gestionar servicio', url: `${APP_URL}/servicio/{{1}}`, example: [`${APP_URL}/servicio/...`] },
      ],
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

### Media prioridad (mejoran UX, no son bloqueantes)

#### G. `tecnico_asignado_cliente_v7` con HEADER IMAGE
**Gap**: las fotos del técnico (perfil + documento) se mandan como mensajes free-form `image` separados — fallan ~siempre por ventana 24h. La plantilla actual `_v6` es solo texto.
**Solución**: nueva versión `_v7` con `HEADER` tipo `IMAGE` para incluir la foto en el mismo mensaje template. Requiere subir el media_id al endpoint de Meta primero.
- Body params iguales que `_v6`. Header: `{ type: 'HEADER', format: 'IMAGE' }`.
- Cuando se envía: `components: [{ type: 'header', parameters: [{ type: 'image', image: { link: foto_perfil_url } }] }, { type: 'body', ... }]`.
- También agregar BUTTON URL al portal cliente.
- Cuando Meta apruebe, deprecar `_v6` y mover invocaciones a `_v7`.
- **Nota**: el slot `_v6` fue tomado por la migración de dominio del 2026-05-23 (text-only con URL nueva), por eso el siguiente salto es `_v7`.

#### H. `cotizacion_cliente_v3`
**Gap**: post-admin-pricing-gate, ahora siempre se fija `tiempo_entrega` — pero la plantilla `_v2` (la vigente tras la migración 2026-05-23) no lo incluye. Hoy se omite del WhatsApp; el cliente lo ve en la página `/cotizacion/{token}`.
**Solución**: nueva versión `_v3` con un parámetro extra (el slot `_v2` está tomado por la migración de dominio):
```
'... 🧾 Total: {{7}} COP\n⏱ Tiempo estimado: {{8}}\n\n...'
```
8 parámetros. Cuando Meta apruebe, mover invocaciones a `_v2` y deprecar `_v1`.

#### J. `horario_confirmado_cliente_v1`
**Gap (H1, H2 en FLOWS.md)**: tras elegir horario en `/horario/{token}`, el cliente solo ve confirmación in-app — no recibe WhatsApp de "horario registrado, buscando técnico". Cierra el webview y queda en suspenso hasta que un técnico acepte (puede tardar horas) o que abra de nuevo la URL.

**Disparo sugerido**: en `/api/confirmar-horario` después de `notificarTecnicos`. Body con 4 params (cliente, equipo, horario, ciudad).

```js
{
  name: 'horario_confirmado_cliente_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        '✅ Hola {{1}}, registramos el horario para tu {{2}}:\n\n' +
        '🕐 {{3}}\n\n' +
        'Estamos buscando un técnico verificado en {{4}}. Te avisaremos por WhatsApp cuando alguno acepte tu servicio.',
      example: { body_text: [['Juan', 'Lavadora Mabe', 'lunes 12 de mayo · 8am-12pm', 'Bogotá']] },
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

Variante opcional con HEADER + URL button al portal:

```js
// Si quieres incluir botón al portal del cliente (recomendado).
// Requiere parámetro extra para cliente_token.
{
  ...,
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Horario confirmado' },
    {
      type: 'BODY',
      text: 'Hola {{1}}, registramos el horario para tu {{2}}: {{3}}.\n\n' +
            'Estamos buscando técnico verificado en {{4}}. Te avisaremos cuando alguno acepte.',
      example: { body_text: [['Juan', 'Lavadora Mabe', 'lunes 12 de mayo · 8am-12pm', 'Bogotá']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Gestionar servicio', url: `${APP_URL}/servicio/{{1}}`, example: [`${APP_URL}/servicio/...`] },
      ],
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

### Baja prioridad (nice to have)

#### I. `servicio_confirmado_tecnico_v1`
**Gap**: cuando el cliente confirma satisfacción del servicio (estado=completada), el técnico no recibe aviso WhatsApp del cierre exitoso. Solo lo ve si abre el portal.
**Solución**: plantilla simple de cierre con calificación.

```js
{
  name: 'servicio_confirmado_tecnico_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        '✅ Hola {{1}}, el cliente {{2}} confirmó satisfacción del servicio de {{3}}. ' +
        'Calificación: {{4}}/10.\n\n' +
        'Servicio cerrado exitosamente. Próxima liquidación te llegará en el ciclo correspondiente.',
      example: { body_text: [['Carlos', 'Juan Pérez', 'Lavadora Mabe', '10']] },
    },
    { type: 'FOOTER', text: 'Baird Service' },
  ],
}
```

---

## Checklist rápido antes de mergear cambios de plantilla

- [ ] La plantilla está en `scripts/upload-templates.mjs` con su definición JSON exacta.
- [ ] Documentación actualizada en `docs/WHATSAPP_TEMPLATES.md` (este archivo).
- [ ] Si impacta flujo: `docs/FLOWS.md` actualizado.
- [ ] Si es plantilla nueva: nombre versionado (`_v1`, `_v2`, etc.).
- [ ] Subida a Meta: `node --env-file=.env.local scripts/upload-templates.mjs <nombre>`.
- [ ] Verificada como `APPROVED` con `--check` antes del deploy del código que la usa.
- [ ] Si reemplaza una plantilla anterior: la anterior queda como deprecated en docs hasta que ningún código la use; **no borrar** durante el cooldown.
