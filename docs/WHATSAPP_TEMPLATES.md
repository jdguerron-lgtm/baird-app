# Plantillas WhatsApp — Baird Service

> Documento canónico de TODAS las plantillas WhatsApp del proyecto.
> Última actualización: 2026-05-08.

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

**Plantillas que aún NO están en `upload-templates.mjs`** (gap a cerrar — viven solo en Meta):
- `nueva_solicitud_v3`
- `servicio_asignado_tecnico_v3`
- `servicio_no_disponible_v3`
- `confirmar_servicio_v3`
- `registro_bienvenida_v3`
- `solicitud_particular_tecnico_v1`
- `tecnico_asignado_particular_v1`
- `solicitud_particular_cliente_v1`
- `cotizacion_cliente_v1`
- `cotizacion_aprobada_tecnico_v1`

Si vas a tocar alguna de estas, **primero búscala en Meta**, copia su definición a `upload-templates.mjs` para tenerla como código, y desde ahí trabajas.

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

#### `nueva_solicitud_v3` ⚠️ NO en script
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=true`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'nueva_solicitud_v3', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago`
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio garantía a técnicos compatibles.
- **Pendiente**: backfill a `upload-templates.mjs`.

#### `solicitud_particular_tecnico_v1` ⚠️ NO en script
- **Disparo**: `notificarTecnicos(solicitudId)` cuando `es_garantia=false`
- **Llamada**: `enviarPlantilla(tecnico.whatsapp, 'solicitud_particular_tecnico_v1', 'es', [...])`
- **Destino**: técnico
- **Body** (6 params): `nombre`, `equipo`, `problema`, `ubicacion`, `horario`, `pago_diagnostico`
- **Botón URL**: `/aceptar/{token_notif}` — display "Aceptar"
- **Propósito**: ofrecer servicio particular a técnicos compatibles.

#### `solicitud_particular_cliente_v1` ⚠️ NO en script
- **Disparo**: hoy posiblemente legacy — verificar uso vivo.
- **Destino**: cliente
- **Propósito**: confirmación inicial al cliente particular sobre tarifa de diagnóstico + anticipo (50%).

### Asignación

#### `servicio_no_disponible_v3` ⚠️ NO en script
- **Disparo**: `procesarAceptacion()` — perdedores de la carrera atómica
- **Destino**: técnicos perdedores
- **Body** (1 param): `nombre`
- **Propósito**: avisar que el servicio ya fue tomado.

#### `servicio_asignado_tecnico_v3` ⚠️ NO en script
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

#### `tecnico_asignado_particular_v1` ⚠️ NO en script
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

#### `cotizacion_cliente_v1` ⚠️ NO en script
- **Disparo**: `enviarCotizacionCliente(solicitudId)` (particular post-pricing admin)
- **Destino**: cliente
- **Body** (7 params): `cliente`, `tecnico`, `equipo`, `diagnostico`, `mano_obra`, `repuestos`, `total`
- **Botón URL**: `/cotizacion/{cotizacion.token}` — display "Aprobar cotización"
- **Propósito**: cliente aprueba/rechaza la cotización particular.
- **⚠️ Cambio pendiente**: con el admin pricing gate v1 podría ser útil agregar el `tiempo_entrega` al body — requiere nueva versión `_v2`.

### Post-decisión cliente

#### `cotizacion_aprobada_tecnico_v1` ⚠️ NO en script
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

#### `confirmar_servicio_v3` ⚠️ NO en script
- **Disparo**: `POST /api/completar-servicio`
- **Destino**: cliente
- **Body** (3 params): `cliente`, `tecnico`, `equipo`
- **Botón URL**: `/confirmar/{confirmacion_token}` — display "Confirmar servicio"
- **Propósito**: cliente califica satisfacción (1-10) o reporta problema.

### Onboarding

#### `registro_bienvenida_v3` ⚠️ NO en script
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

Identificadas en `docs/FLOWS.md` sección "Gaps conocidos":

1. `solicitud_expirada_v1` — cuando timeout 36h pasa a `sin_agendar` (cliente queda colgado hoy).
2. `cotizacion_rechazada_cliente_v1` — confirmación al cliente de que su rechazo se registró.
3. `paso_aprobado_cliente_v1` — opcional, reemplaza el texto libre actual.
4. `tecnico_asignado_cliente_v6` con `HEADER` tipo `IMAGE` — para mandar foto del técnico sin depender de la ventana 24h.
5. `gestionar_servicio_v1` con botón URL a `/servicio/{cliente_token}` — para que el cliente acceda al portal de cancelación/reagendamiento sin depender de URLs guardadas.

Cuando se prioricen: agregar a `scripts/upload-templates.mjs`, documentar acá, subir a Meta. Sin esto, la app no las puede usar.

---

## Checklist rápido antes de mergear cambios de plantilla

- [ ] La plantilla está en `scripts/upload-templates.mjs` con su definición JSON exacta.
- [ ] Documentación actualizada en `docs/WHATSAPP_TEMPLATES.md` (este archivo).
- [ ] Si impacta flujo: `docs/FLOWS.md` actualizado.
- [ ] Si es plantilla nueva: nombre versionado (`_v1`, `_v2`, etc.).
- [ ] Subida a Meta: `node --env-file=.env.local scripts/upload-templates.mjs <nombre>`.
- [ ] Verificada como `APPROVED` con `--check` antes del deploy del código que la usa.
- [ ] Si reemplaza una plantilla anterior: la anterior queda como deprecated en docs hasta que ningún código la use; **no borrar** durante el cooldown.
