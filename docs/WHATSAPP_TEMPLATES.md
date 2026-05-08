# Plantillas WhatsApp — Baird Service

> Documento canónico de TODAS las plantillas WhatsApp del proyecto.
> Última actualización: 2026-05-08.

> 🧭 **Ver también**:
> - `docs/INDEX.md` — hub de navegación.
> - `docs/FLOWS.md` — cuándo se dispara cada plantilla en el flujo end-to-end.
> - `scripts/upload-templates.mjs` — fuente canónica del JSON de cada plantilla.
> - `CLAUDE.md` § "Gotchas" → "WhatsApp 24h window" — diferencia template vs free-form.

---

## ⚠️ Proceso obligatorio para crear o modificar una plantilla

Cada vez que cambies un mensaje WhatsApp **debes seguir estos 3 pasos en orden**. Saltarse alguno deja el código y Meta desincronizados, lo que rompe envíos en producción.

### Paso 1 — Revisar dónde está documentada

Las plantillas viven en uno de estos lugares (en orden de canonicidad):

| Lugar | Qué contiene |
|---|---|
| `scripts/upload-templates.mjs` | **Fuente canónica** del repo. Contiene la definición JSON exacta que se sube a Meta. Hoy: 7 plantillas (customer-first y post-diagnóstico). |
| Meta Business Manager → WhatsApp Manager → Message Templates | **Fuente de verdad operacional** — lo que Meta tiene aprobado y permite enviar. Toda plantilla ya enviada al menos una vez está aquí. |
| `docs/WHATSAPP_TEMPLATES.md` (este archivo) | **Documentación humana** — catálogo, parámetros, propósito. |
| `docs/FLOWS.md` | Plantillas en contexto del flujo. |
| `CLAUDE.md` | Resumen para agentes de IA. |

**Estado de cobertura del script (2026-05-08):** las 15 plantillas en uso por el código ya están todas registradas en `scripts/upload-templates.mjs`. La única plantilla huérfana es `solicitud_particular_cliente_v1`, que existe en Meta pero no se invoca desde el código — está documentada como **DEPRECATED** abajo. No la borres durante 4 semanas mínimo (cooldown Meta).

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

#### `cliente_seleccion_horario_v1`
- **En script** ✅
- **Disparo**: `POST /api/solicitar` (ambos flujos)
- **Llamada**: `enviarSeleccionHorarioCliente(solicitudId)`
- **Destino**: cliente
- **Header**: TEXT — "Solicitud recibida en Baird Service"
- **Body** (4 params): `cliente`, `equipo`, `horario_1`, `horario_2`
- **Botón URL**: `/horario/{horario_token}` — display "Confirmar horario"
- **Propósito**: cliente confirma fecha + franja antes de notificar técnicos.

#### `recordatorio_horario_v1`
- **En script** ✅
- **Disparo**: cron `/api/cron/horario-recordatorio` (24h sin confirmar)
- **Llamada**: `enviarRecordatorioHorario(solicitudId)`
- **Destino**: cliente
- **Body** (2 params): `cliente`, `equipo`
- **Botón URL**: `/horario/{horario_token}` — display "Confirmar horario"
- **Propósito**: empujar al cliente que aún no abrió el primer enlace.

#### `nueva_solicitud_v3` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=true`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'nueva_solicitud_v3', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago`
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio garantía a técnicos compatibles.
- **Pendiente**: backfill a `upload-templates.mjs`.

#### `solicitud_particular_tecnico_v1` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=false`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'solicitud_particular_tecnico_v1', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago_diagnostico`
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio particular a técnicos compatibles.

#### `solicitud_particular_cliente_v1` ⚠️ DEPRECATED
- **NO está en `upload-templates.mjs`** y **NO se invoca desde el código**.
- Plantilla huérfana en Meta. Antes del rediseño customer-first (v2 2026-04-27) probablemente confirmaba al cliente particular tras crear la solicitud — hoy ese rol lo cumple `cliente_seleccion_horario_v1` (compartida entre garantía y particular).
- **No la borres** durante 4 semanas mínimo (cooldown Meta). Si quieres limpiarla, usa `--delete` y respeta el cooldown antes de reusar el nombre.

### Asignación

#### `servicio_no_disponible_v3` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `procesarAceptacion()` — perdedores de la carrera atómica
- **Destino**: técnicos perdedores
- **Body** (1 param): `nombre`
- **Propósito**: avisar que el servicio ya fue tomado.

#### `servicio_asignado_tecnico_v3` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `procesarAceptacion()` — ganador
- **Destino**: técnico ganador
- **Body** (6 params): `nombre`, `cliente`, `equipo`, `direccion`, `pago`, `telefono_cliente`
- **Botón URL**: `/tecnico/{portal_token}` — display "Ver portal"
- **Propósito**: confirmar asignación + datos del cliente al técnico.

#### `tecnico_asignado_cliente_v5`
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

#### `verificar_siguiente_paso_v1`
- **En script** ✅
- **Disparo**: `enviarVerificacionPasoCliente(solicitudId)` (warranty post-diagnóstico, o post-pricing si esperar_repuesto)
- **Destino**: cliente
- **Body** (5 params): `cliente`, `tecnico`, `equipo`, `diagnostico`, `accion_propuesta`
- **Botón URL**: `/verificar-paso/{verificacion_paso_token}` — display "Aprobar paso"
- **Propósito**: cliente aprueba/rechaza el siguiente paso del técnico (4 opciones: reparar, esperar_repuesto, no_reparable, negativa_cliente).

#### `cotizacion_cliente_v1` **En script** ✅ (backfilled 2026-05-08)
- **Disparo**: `enviarCotizacionCliente(solicitudId)` (particular post-pricing admin)
- **Destino**: cliente
- **Body** (7 params): `cliente`, `tecnico`, `equipo`, `diagnostico`, `mano_obra`, `repuestos`, `total`
- **Botón URL**: `/cotizacion/{cotizacion.token}` — display "Aprobar cotización"
- **Propósito**: cliente aprueba/rechaza la cotización particular.
- **⚠️ Cambio pendiente**: con el admin pricing gate v1 podría ser útil agregar el `tiempo_entrega` al body — requiere nueva versión `_v2`.

### Post-decisión cliente

#### `cotizacion_aprobada_tecnico_v1` **En script** ✅ (backfilled 2026-05-08)
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

#### `repuesto_recibido_cliente_v1`
- **En script** ✅
- **Disparo**: `enviarRepuestoRecibidoCliente(solicitudId)` cuando admin marca todos los repuestos recibidos
- **Destino**: cliente
- **Body** (3 params): `cliente`, `equipo`, `tecnico`
- **Sin botón**
- **Propósito**: avisar que el repuesto llegó y la reparación se reanuda.

#### `finalizado_sin_reparacion_v1`
- **En script** ✅
- **Disparo**: `enviarFinalizadoSinReparacion(solicitudId, motivo)` cuando paso = no_reparable y cliente aprueba
- **Destino**: cliente
- **Body** (4 params): `cliente`, `equipo`, `motivo`, `tecnico`
- **Sin botón**
- **Propósito**: cierre formal — equipo no es reparable.

### Final

#### `confirmar_servicio_v3` **En script** ✅ (backfilled 2026-05-08)
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

#### E. `repuesto_recibido_tecnico_v1`
**Gap**: hoy el técnico recibe texto libre cuando admin marca el repuesto como recibido — depende de su ventana 24h. Mejor usar plantilla.
**Disparo sugerido**: reemplazar el texto libre en `/api/repuesto-recibido` por esta plantilla.

```js
{
  name: 'repuesto_recibido_tecnico_v1',
  category: 'UTILITY',
  language: 'es',
  components: [
    {
      type: 'BODY',
      text:
        '📦 Hola {{1}}, los repuestos para el servicio de {{2}} ({{3}}) ya llegaron.\n\n' +
        'El servicio está listo para retomarse. Coordina con el cliente la nueva visita y, cuando termines, abre el portal para subir las evidencias.',
      example: { body_text: [['Carlos', 'Lavadora Mabe', 'Juan Pérez']] },
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

#### G. `tecnico_asignado_cliente_v6` con HEADER IMAGE
**Gap**: las fotos del técnico (perfil + documento) se mandan como mensajes free-form `image` separados — fallan ~siempre por ventana 24h. La plantilla actual `_v5` es solo texto.
**Solución**: nueva versión `_v6` con `HEADER` tipo `IMAGE` para incluir la foto en el mismo mensaje template. Requiere subir el media_id al endpoint de Meta primero.
- Body params iguales que `_v5`. Header: `{ type: 'HEADER', format: 'IMAGE' }`.
- Cuando se envía: `components: [{ type: 'header', parameters: [{ type: 'image', image: { link: foto_perfil_url } }] }, { type: 'body', ... }]`.
- También agregar BUTTON URL al portal cliente.
- Cuando Meta apruebe, deprecar `_v5` y mover invocaciones a `_v6`.

#### H. `cotizacion_cliente_v2`
**Gap**: post-admin-pricing-gate, ahora siempre se fija `tiempo_entrega` — pero la plantilla `_v1` no lo incluye. Hoy se omite del WhatsApp; el cliente lo ve en la página `/cotizacion/{token}`.
**Solución**: nueva versión `_v2` con un parámetro extra:
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
