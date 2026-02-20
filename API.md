# 🔌 API — Baird Service

## Endpoints disponibles

| Endpoint | Estado | Descripción |
|----------|--------|-------------|
| `POST /api/triaje` | ✅ Implementado | Análisis IA del problema del equipo |
| `POST /api/whatsapp/notify` | ⏳ Pendiente | Envía ofertas a técnicos compatibles por WhatsApp |
| `POST /api/whatsapp/webhook` | ⏳ Pendiente | Recibe aceptación del técnico y asigna el servicio |

---

## POST `/api/triaje`

Analiza el problema de un equipo electrodoméstico usando Google Gemini 2.0 Flash y retorna un diagnóstico estructurado con estimaciones de costo, tiempo, urgencia y recomendaciones.

### Autenticación
Ninguna. El endpoint es público (protegido solo por validación de entrada). En producción, considerar rate limiting o autenticación básica.

### Request

**Headers**
```
Content-Type: application/json
```

**Body**
```json
{
  "tipoEquipo": "Lavadora",
  "marcaEquipo": "Samsung",
  "descripcionProblema": "La lavadora hace un ruido muy fuerte durante el centrifugado y a veces no drena bien el agua",
  "tipoSolicitud": "Reparación"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `tipoEquipo` | string | ✅ | Tipo de electrodoméstico |
| `marcaEquipo` | string | ✅ | Marca del equipo |
| `descripcionProblema` | string | ✅ | Mínimo 20 caracteres |
| `tipoSolicitud` | string | ✅ | Diagnóstico / Reparación / Mantenimiento / Instalación |

### Response exitosa `200 OK`

```json
{
  "posible_falla": "Rodamiento del tambor desgastado o bomba de drenaje obstruida",
  "nivel_complejidad": "medium",
  "partes_requeridas": [
    "Rodamiento 6205",
    "Sello de tambor",
    "Filtro de bomba de drenaje"
  ],
  "tiempo_estimado_horas": 3,
  "costo_estimado_min": 150000,
  "costo_estimado_max": 350000,
  "recomendaciones": [
    "Verificar nivel de carga para no sobrecargar el tambor",
    "Limpiar el filtro de la bomba cada 3 meses",
    "Usar detergente de baja espuma para lavadoras de carga frontal"
  ],
  "urgencia": "medium"
}
```

| Campo | Tipo | Valores posibles | Descripción |
|-------|------|-----------------|-------------|
| `posible_falla` | string | — | Diagnóstico principal en lenguaje técnico claro |
| `nivel_complejidad` | string | `low` / `medium` / `high` | Complejidad técnica de la reparación |
| `partes_requeridas` | string[] | — | Lista de piezas probablemente necesarias |
| `tiempo_estimado_horas` | number | — | Horas estimadas de trabajo |
| `costo_estimado_min` | number | — | Costo mínimo estimado en COP |
| `costo_estimado_max` | number | — | Costo máximo estimado en COP |
| `recomendaciones` | string[] | — | Consejos de mantenimiento y uso |
| `urgencia` | string | `low` / `medium` / `high` | Urgencia para atender el problema |

### Errores

#### `400 Bad Request` — Descripción muy corta
```json
{
  "error": "La descripción del problema es muy corta. Por favor proporcione más detalles."
}
```

#### `500 Internal Server Error` — Error de análisis
```json
{
  "error": "No se pudo analizar el problema. Por favor intente de nuevo."
}
```

#### `408 / Timeout` (manejado internamente)
El endpoint tiene un timeout de **15 segundos** para la llamada a Gemini. Si se excede, retorna un error 500 con mensaje de timeout.

---

## Operaciones directas en Supabase (client-side)

Estas no son endpoints HTTP propios, sino llamadas al SDK de Supabase desde el front-end.

### Insertar solicitud de servicio

**Función:** `submitSolicitud(data: SolicitudFormData)`
**Tabla:** `solicitudes_servicio`
**Operación:** `INSERT`

```typescript
// Uso
import { submitSolicitud } from '@/lib/services/solicitud.service';

const result = await submitSolicitud(formData);
if (result.success) {
  console.log('ID:', result.data.id);
} else {
  console.error(result.error);
}
```

**Errores manejados:**
| Código PostgreSQL | Mensaje retornado |
|-------------------|-------------------|
| `23505` | "Ya existe una solicitud con este número de serie/factura" |
| `23503` | "Error de referencia: el técnico especificado no existe" |
| `42P01` | "La tabla de solicitudes no existe. Contacte al administrador" |
| Otros | Mensaje de error de Supabase |

---

### Subir imagen de técnico

**Función:** `uploadFotoPerfil(file, tecnicoId)` / `uploadFotoDocumento(file, tecnicoId)`
**Storage:** Supabase Storage

```typescript
import { uploadFotoPerfil, uploadFotoDocumento } from '@/lib/uploadHelpers';

const fotoUrl = await uploadFotoPerfil(file, 'tecnico-uuid-123');
// Retorna: URL pública de la imagen o lanza error
```

**Validaciones:**
- Tipos aceptados: `image/jpeg`, `image/png`
- Tamaño máximo fotos perfil: **2 MB**
- Tamaño máximo documentos: **5 MB**

**Errores (lanzados como `Error`):**
- `"Solo se permiten archivos JPG o PNG"`
- `"La foto de perfil no puede superar 2MB"` / `"El documento no puede superar 5MB"`
- Errores de Supabase Storage

---

## Modelo de IA utilizado

| Parámetro | Valor |
|-----------|-------|
| Proveedor | Google AI (Gemini) |
| Modelo | `gemini-2.0-flash-exp` |
| SDK | `@google/generative-ai` v0.24.1 |
| Temperatura | Default (no configurado) |
| Formato de respuesta | JSON estructurado |
| Timeout | 15 segundos |
| Input mínimo | 20 caracteres en descripción |

### Prompt del sistema (resumen)
El modelo recibe el tipo de equipo, marca, descripción del problema y tipo de servicio. Se le instruye a responder **únicamente con JSON válido** (sin markdown) con los 8 campos definidos en `TriajeResponse`. La respuesta se parsea y valida campo por campo antes de devolverse al cliente.

---

---

## POST `/api/whatsapp/notify` ⏳

Busca técnicos compatibles con la solicitud y les envía un mensaje de oferta por WhatsApp con el diagnóstico IA, la ubicación exacta y el pago que recibirán.

### Autenticación
Llamada interna desde el servidor (después de `submitSolicitud`). No expuesto directamente al cliente.

### Request

```json
{
  "solicitudId": "uuid-de-la-solicitud"
}
```

### Comportamiento interno
1. Lee la solicitud de Supabase (tipo_equipo, zona, diagnóstico IA, pago_tecnico)
2. Consulta técnicos con `estado_verificacion = 'verificado'` y especialidad/zona compatibles
3. Por cada técnico encontrado:
   - Genera un `token` único firmado con `{solicitudId}:{tecnicoId}`
   - Inserta en `notificaciones_whatsapp` con estado `enviado`
   - Envía mensaje WhatsApp con el siguiente contenido:

```
🔧 *Nueva solicitud — Baird Service*

📋 *Equipo:* {tipo_equipo} {marca_equipo}
🛠️ *Diagnóstico IA:* {posible_falla}

📍 *Ubicación:* {direccion}
   {zona_servicio}, {ciudad_pueblo}

💰 *Tu pago por este servicio: ${pago_tecnico} COP*

¿Aceptas este servicio?
👉 Responde: *ACEPTO* o toca el link:
{NEXT_PUBLIC_APP_URL}/aceptar/{token}

⏱️ El primer técnico en aceptar se queda con el trabajo.
```

4. Actualiza `solicitudes_servicio.estado = 'notificada'`

### Response exitosa `200 OK`

```json
{
  "tecnicosNotificados": 4,
  "solicitudId": "uuid"
}
```

---

## POST `/api/whatsapp/webhook` ⏳

Recibe mensajes entrantes desde WhatsApp Business API. Cuando un técnico responde "ACEPTO" o visita el link de aceptación, este endpoint procesa la asignación atómica.

### Autenticación
Verificación de firma HMAC usando `WHATSAPP_WEBHOOK_SECRET`. **Rechazar cualquier request sin firma válida.**

### Request (formato Meta Cloud API)

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "573001234567",
          "text": { "body": "ACEPTO-eyJhbGci..." }
        }]
      }
    }]
  }]
}
```

### Lógica de aceptación (crítica — anti race-condition)

```sql
-- UPDATE atómico: solo uno puede ganar
UPDATE solicitudes_servicio
SET
  tecnico_id = :tecnicoId,
  estado = 'asignada'
WHERE
  id = :solicitudId
  AND tecnico_id IS NULL   -- ← garantía de exclusividad
RETURNING id;
```

- Si `rowCount = 1` → **técnico ganó el servicio**
  - Notificar al técnico: `"✅ ¡Servicio asignado! Cliente: {nombre}, Tel: {telefono}"`
  - Notificar al cliente: `"Tu técnico {nombre} está en camino. WhatsApp: {numero}"`
  - Marcar todos los demás tokens de esa solicitud como `invalidado`
- Si `rowCount = 0` → **servicio ya fue tomado**
  - Notificar al técnico: `"❌ Este servicio ya fue asignado a otro técnico."`

### Response `200 OK`
WhatsApp requiere respuesta 200 inmediata, incluso si el procesamiento aún está en curso.

```json
{ "status": "ok" }
```

---

## Supabase como backend de datos

| Operación | Tabla | Tipo |
|-----------|-------|------|
| Crear solicitud | `solicitudes_servicio` | INSERT |
| Registrar técnico | `tecnicos` | INSERT |
| Guardar especialidades | `especialidades_tecnico` | INSERT (múltiples filas) |
| Subir foto perfil | Storage: `fotos-perfil` | Upload |
| Subir foto documento | Storage: `fotos-documentos` | Upload |
| Registrar notificación enviada | `notificaciones_whatsapp` | INSERT ⏳ |
| Asignar técnico (atómico) | `solicitudes_servicio` | UPDATE WHERE tecnico_id IS NULL ⏳ |
| Invalidar tokens | `notificaciones_whatsapp` | UPDATE estado = 'invalidado' ⏳ |

> 📌 Las operaciones de lectura (listar solicitudes para técnicos, verificar técnicos en admin) aún no están implementadas en el front-end.
