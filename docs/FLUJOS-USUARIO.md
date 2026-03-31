# Flujos de Usuario — Baird Service

> Documentacion de los flujos completos de la plataforma.
> Ultima actualizacion: 2026-03-31

---

## Indice

1. [Resumen de Estados](#resumen-de-estados)
2. [Flujo 1: Solicitud Individual (Cliente)](#flujo-1-solicitud-individual-cliente)
3. [Flujo 2: Carga Masiva de Garantias (Admin)](#flujo-2-carga-masiva-de-garantias-admin)
4. [Flujo 3: Notificacion a Tecnicos (WhatsApp)](#flujo-3-notificacion-a-tecnicos-whatsapp)
5. [Flujo 4: Aceptacion del Servicio (Tecnico)](#flujo-4-aceptacion-del-servicio-tecnico)
6. [Flujo 5: Diagnostico del Equipo (Tecnico)](#flujo-5-diagnostico-del-equipo-tecnico)
7. [Flujo 6: Completar Servicio (Tecnico)](#flujo-6-completar-servicio-tecnico)
8. [Flujo 7: Confirmacion del Cliente](#flujo-7-confirmacion-del-cliente)
9. [Flujo 8: Panel Admin](#flujo-8-panel-admin)
10. [Tarifas de Garantia (Taller Tipo C)](#tarifas-de-garantia-taller-tipo-c)
11. [Integracion WhatsApp](#integracion-whatsapp)
12. [Almacenamiento de Archivos](#almacenamiento-de-archivos)

---

## Resumen de Estados

```
pendiente → notificada → asignada → en_proceso → en_verificacion → completada
                                                                  → en_disputa
                                                → cancelada
```

| Estado | Significado | Quien actua |
|--------|------------|-------------|
| `pendiente` | Solicitud creada, sin notificar | Sistema |
| `notificada` | WhatsApp enviado a tecnicos | Sistema |
| `asignada` | Tecnico acepto el servicio | Tecnico |
| `en_proceso` | Diagnostico completado, reparacion en curso | Tecnico |
| `en_verificacion` | Tecnico registro la finalizacion | Cliente |
| `completada` | Cliente confirmo satisfaccion | Cliente |
| `en_disputa` | Cliente reporto un problema | Admin |
| `cancelada` | Servicio cancelado | Admin |

---

## Flujo 1: Solicitud Individual (Cliente)

**Ruta:** `/solicitar`

### Descripcion
El cliente completa un formulario web para solicitar la reparacion de un electrodomestico.

### Pasos del Cliente

1. **Ingresa al formulario** en `baird-app.vercel.app/solicitar`
2. **Completa los datos:**
   - Nombre completo
   - Telefono (con selector de codigo de pais, default +57)
   - Tipo de equipo (Lavadora, Nevera, Estufa, etc.)
   - Marca del equipo
   - Tipo de solicitud (Reparacion, Instalacion, Mantenimiento)
   - Descripcion del problema
   - Direccion completa (con boton de geolocalizacion)
   - Ciudad/Pueblo
   - Zona de servicio (Norte, Sur, Centro, etc.)
   - Horarios de visita preferidos (selector de 3 dias habiles, AM/PM)
3. **Envia la solicitud**
4. **Recibe confirmacion** en pantalla con ID de seguimiento

### Datos Tecnicos
- **Validacion:** Zod schema (`solicitud.schema.ts`)
- **Telefono:** Se almacena como `"codigo|numero"` (ej: `"57|3001234567"`)
- **API:** `POST /api/solicitar` → Supabase insert en `solicitudes_servicio`
- **Estado inicial:** `pendiente`

### Despues del envio
- Se dispara notificacion a tecnicos de la zona via WhatsApp
- Estado cambia a `notificada`

---

## Flujo 2: Carga Masiva de Garantias (Admin)

**Ruta:** `/admin/carga-masiva`

### Descripcion
El administrador sube un archivo Excel con multiples solicitudes de servicio de garantia MABE. Este flujo es exclusivo para garantias.

### Pasos del Admin

1. **Inicia sesion** en el panel admin (`/admin`)
2. **Navega a Carga Masiva** (`/admin/carga-masiva`)
3. **Configura parametros por defecto:**
   - Pago tecnico (default: $80.000 COP)
   - Horarios de visita (AM: 8:00-12:00 / PM: 2:00-5:00)
   - Checkbox "Notificar tecnicos" (envia WhatsApp automatico)
4. **Sube archivo Excel** (formato BITACORA SERVICIOS PROGRAMADOS de MABE)
5. **Revisa resultados:**
   - Filas validas insertadas
   - Filas invalidas con detalle de errores
   - Notificaciones enviadas

### Formato Excel Esperado (BITACORA MABE)

El archivo Excel debe tener las columnas en el siguiente orden:

| Columna | Campo |
|---------|-------|
| A | Numero de servicio |
| B | Fecha |
| C | Nombre del cliente |
| D | Telefono |
| E | Direccion |
| F | Ciudad |
| G | Departamento |
| H | Tipo de equipo |
| I | Marca |
| J | Modelo |
| K | Serie |
| L | Descripcion del problema |

### Datos Tecnicos
- **Parser:** `excel-mapping.ts` con `xlsx` library
- **API:** `POST /api/carga-masiva` (multipart form data)
- **Validaciones:** Archivo max 10MB, formatos .xlsx/.xls
- **Garantia:** Todas las solicitudes se marcan como `es_garantia: true`
- **Modelo:** Se extrae del campo modelo y se embebe en `novedades_equipo` como `[Modelo: CODIGO / DESCRIPCION]`
- **Notificacion opcional:** Si se activa, llama a `/api/whatsapp/notify` para cada solicitud insertada

### Ejemplo de modelo embebido
```
[Modelo: WF18T6000AW / LAVADORA CARGA FRONTAL 18KG SAMSUNG] Motor no enciende, hace ruido
```

---

## Flujo 3: Notificacion a Tecnicos (WhatsApp)

### Descripcion
El sistema envia un mensaje WhatsApp interactivo a tecnicos calificados de la zona para que acepten el servicio.

### Logica de Seleccion
1. Busca tecnicos con especialidad que coincida con el tipo de equipo
2. Filtra por zona de servicio compatible
3. Envia mensaje a todos los candidatos simultaneamente

### Mensaje WhatsApp al Tecnico
Contiene:
- Tipo y marca de equipo
- Modelo (si disponible)
- Badge de garantia (si aplica)
- Zona y ciudad
- Descripcion del problema
- Valor del servicio
- Boton CTA: **"Ver detalles y aceptar"** → enlace a pagina de aceptacion

### Datos Tecnicos
- **API:** `POST /api/whatsapp/notify`
- **Servicio:** `notificarTecnicos()` en `whatsapp.service.ts`
- **Token de aceptacion:** UUID unico por tecnico/solicitud en tabla `notificaciones_whatsapp`
- **Estado:** Cambia a `notificada`

---

## Flujo 4: Aceptacion del Servicio (Tecnico)

**Ruta:** `/aceptar/[token]`

### Descripcion
El tecnico abre el enlace del WhatsApp y ve los detalles del servicio con opcion de aceptar.

### Pasos del Tecnico

1. **Abre el enlace** desde WhatsApp
2. **Ve la pagina de aceptacion** con:
   - Detalles del equipo (tipo, marca, modelo si hay)
   - Badge de garantia (si aplica)
   - Zona y direccion general
   - Descripcion del problema
   - Valor del servicio
3. **Selecciona horario** de los proximos 3 dias habiles:
   - Cada dia muestra 2 opciones: AM (8:00-12:00) y PM (2:00-5:00)
   - Los domingos se saltan automaticamente
4. **Acepta el servicio** tocando "Aceptar servicio"

### Despues de Aceptar
- **Patron atomico:** `UPDATE WHERE tecnico_asignado_id IS NULL` (el primero gana)
- Estado cambia a `asignada`
- Se envia WhatsApp al **tecnico** con:
  - Datos completos del cliente (nombre, telefono, direccion)
  - Horario confirmado
  - Boton CTA: "Ver mis servicios" → portal del tecnico
  - Segundo mensaje con boton: "Contactar cliente" → `wa.me/{telefono_cliente}`
- Se envia WhatsApp al **cliente** con:
  - Datos del tecnico asignado
  - Verificacion de documento
  - Equipo y modelo
  - Horario confirmado
  - Boton CTA: "Escribir al tecnico" → `wa.me/{telefono_tecnico}`

### Datos Tecnicos
- **API:** `POST /api/whatsapp/accept`
- **Servicio:** `procesarAceptacion()` en `whatsapp.service.ts`
- **Portal token:** Se genera UUID en primera aceptacion, se almacena en tabla `tecnicos`
- **Prevencion de race condition:** Solo el primer tecnico en aceptar queda asignado

---

## Flujo 5: Diagnostico del Equipo (Tecnico)

**Ruta:** `/tecnico/[token]/diagnostico/[id]`

### Descripcion
Despues de aceptar y antes de completar, el tecnico debe reportar el diagnostico real del equipo. Este paso determina la complejidad y el costo del servicio.

### Pasos del Tecnico

1. **Accede al portal** (`/tecnico/[portal_token]`)
2. **Toca "Diagnosticar"** (boton morado) en la tarjeta del servicio con estado `asignada`
3. **Ve la pagina de diagnostico** con:
   - Resumen del servicio (equipo, modelo, cliente, zona)
   - Dias transcurridos desde la solicitud
   - **Tabla de bonificacion TSS** (Time to Service):
     - 0-2 dias: Bono maximo (verde)
     - 3-5 dias: Bono medio (ambar)
     - 6-8 dias: Bono minimo (naranja)
     - 8+ dias: Sin bono (rojo)
4. **Completa el formulario de diagnostico:**
   - Descripcion del problema real (min. 10 caracteres)
   - Seleccion de complejidad: Baja / Media / Alta
     - **Sin precios visibles** (para evitar sesgo del tecnico)
   - Checkbox si requiere repuestos + detalle
5. **Sube evidencias** (obligatorio):
   - Minimo 1 foto o video del fallo
   - Maximo 4 archivos
   - Max 10MB por archivo
   - Formatos: JPG, PNG, MP4, MOV, WebM, HEIC, WebP
6. **Envia diagnostico**

### Despues del Envio
- Estado cambia a `en_proceso`
- Se calcula el pago automaticamente:
  - `pago_tecnico = tarifa_mano_obra + bono_incentivo`
- Datos se guardan en campo JSONB `triaje_resultado`:
  ```json
  {
    "diagnostico_tecnico": "Motor principal quemado",
    "complejidad": "alta",
    "codigo_complejidad": 23,
    "tarifa_mano_obra": 91592,
    "bono_incentivo": 17000,
    "total_servicio": 108592,
    "requiere_repuestos": true,
    "repuestos_detalle": "Motor WF18",
    "evidencias_diagnostico": ["https://..."],
    "diagnosticado_at": "2026-03-31T16:15:34Z",
    "dias_transcurridos": 0
  }
  ```

### Datos Tecnicos
- **Almacenamiento de evidencias:** Supabase Storage bucket `evidencias-servicio`
- **Path:** `{solicitud_id}/diagnostico_{timestamp}_{index}.{ext}`
- **Validacion:** Estado debe ser `asignada`, min 10 chars descripcion, min 1 evidencia
- **Calculo precio:** `calcularTotalGarantia()` en `tarifas-garantia.ts`

---

## Flujo 6: Completar Servicio (Tecnico)

**Ruta:** `/tecnico/[token]/completar/[id]`

### Descripcion
Despues del diagnostico y la reparacion, el tecnico registra la finalizacion del servicio con evidencia.

### Pasos del Tecnico

1. **Accede al portal** (`/tecnico/[portal_token]`)
2. **Toca "Completar servicio"** en la tarjeta con estado `en_proceso`
3. **Sube fotos** del trabajo realizado (min. 1, max. 4)
4. **Completa checklist:**
   - Diagnostico realizado
   - Prueba de encendido
   - Prueba ciclo completo
   - Pieza reemplazada (+ detalle)
   - Explicacion al cliente
   - Limpieza del area
   - Notas adicionales
5. **Firma digital** del tecnico (canvas touch)
6. **GPS automatico** (se captura la ubicacion)
7. **Envia evidencia**

### Despues del Envio
- Se crea registro en tabla `evidencias_servicio` con:
  - Fotos, checklist, firma, coordenadas GPS
  - `confirmacion_token` UUID para el cliente
- Estado cambia a `en_verificacion`
- Se envia WhatsApp al **cliente** con:
  - Resumen del servicio completado
  - Equipo y valor
  - Boton CTA: "Confirmar servicio" → enlace de confirmacion

### Datos Tecnicos
- **API:** `POST /api/completar-servicio`
- **Almacenamiento:** Supabase Storage bucket `evidencias-servicio`
  - Fotos: `{solicitud_id}/{timestamp}_{index}.{ext}`
  - Firma: `{solicitud_id}/firma_{timestamp}.png`
- **WhatsApp:** Mensaje interactivo CTA al cliente con enlace de confirmacion

---

## Flujo 7: Confirmacion del Cliente

**Ruta:** `/confirmar/[token]`

### Descripcion
El cliente recibe un WhatsApp con enlace para confirmar que el servicio quedo bien.

### Pasos del Cliente

1. **Recibe WhatsApp** con boton "Confirmar servicio"
2. **Abre el enlace** de confirmacion
3. **Ve la pagina** con:
   - Resumen: equipo, tecnico, valor, fecha
   - Evidencia fotografica del trabajo
4. **Decide:**
   - **"Si, quede satisfecho"** → marca como `completada`
   - **"Reportar un problema"** → abre campo de comentario → marca como `en_disputa`

### Datos Tecnicos
- **API:** `POST /api/confirmar-servicio`
- **Token:** UUID unico por evidencia (`confirmacion_token`)
- **Idempotente:** No se puede confirmar dos veces (verifica `confirmado !== null`)
- **Estados resultantes:**
  - `confirmado: true` → estado `completada`
  - `confirmado: false` → estado `en_disputa` + comentario del cliente

---

## Flujo 8: Panel Admin

**Ruta:** `/admin`

### Secciones

#### Solicitudes (`/admin/solicitudes`)
- Lista todas las solicitudes con filtros por estado
- Detalle de cada solicitud con evidencias, diagnostico, timeline

#### Tecnicos (`/admin/tecnicos`)
- Lista de tecnicos registrados
- Gestion de especialidades y zonas

#### Carga Masiva (`/admin/carga-masiva`)
- Upload de Excel de garantias MABE (ver Flujo 2)

#### Garantias (`/admin/garantias`)
- Dashboard resumen por marca y tipo de equipo
- Estadisticas de servicios de garantia

---

## Tarifas de Garantia (Taller Tipo C)

### Mano de Obra por Complejidad

| Complejidad | Codigo | Descripcion | Tarifa |
|-------------|--------|-------------|--------|
| **Baja** | 21 | Ajustes menores, limpieza, cambio de piezas accesibles | $26.254 |
| **Media** | 22 | Cambio de componentes internos, reparacion de sistemas | $42.079 |
| **Alta** | 23 | Reparacion de tarjeta electronica, compresor, motor principal | $91.592 |

### Bono Incentivo TSS (Time to Service)

Basado en dias desde la creacion de la solicitud hasta el diagnostico:

| Complejidad | 0-2 dias | 3-5 dias | 6-8 dias | 8+ dias |
|-------------|----------|----------|----------|---------|
| **Baja** | $9.400 | $7.500 | $4.000 | $0 |
| **Media** | $13.000 | $11.500 | $7.500 | $0 |
| **Alta** | $17.000 | $15.000 | $11.200 | $0 |

### Calculo Total
```
Total = Tarifa Mano de Obra + Bono Incentivo TSS
```

> **Nota:** El tecnico NO ve los valores monetarios al seleccionar la complejidad para evitar sesgo en el diagnostico.

---

## Integracion WhatsApp

### Configuracion
- **API:** Meta WhatsApp Business Cloud API v21.0
- **Numero:** Temporal de prueba (+1 555 189 2605)
- **Tipo de mensajes:** Interactive CTA URL (botones con enlaces)
- **Token:** Tokens temporales de 24h (produccion requiere System User token permanente)

### Mensajes Enviados

| Momento | Destinatario | Contenido |
|---------|-------------|-----------|
| Solicitud creada | Tecnicos de la zona | Oferta de servicio + boton "Aceptar" |
| Servicio aceptado | Tecnico asignado | Datos del cliente + botones "Ver servicios" y "Contactar cliente" |
| Servicio aceptado | Cliente | Datos del tecnico + boton "Escribir al tecnico" |
| Servicio completado | Cliente | Resumen + boton "Confirmar servicio" |

---

## Almacenamiento de Archivos

### Supabase Storage Buckets

| Bucket | Uso | Acceso |
|--------|-----|--------|
| `evidencias-servicio` | Fotos diagnostico, fotos completacion, firmas | Publico (SELECT + INSERT) |
| `tecnicos-documentos` | Documentos de verificacion de tecnicos | Publico (SELECT + INSERT) |
| `tecnicos-fotos` | Fotos de perfil de tecnicos | Publico (SELECT + INSERT) |

### Estructura de Archivos en `evidencias-servicio`
```
{solicitud_id}/
  diagnostico_{timestamp}_{index}.{ext}   ← Fotos/videos del diagnostico
  {timestamp}_{index}.{ext}               ← Fotos de completacion
  firma_{timestamp}.png                    ← Firma digital del tecnico
```

---

## Diagrama de Flujo Completo

```
┌─────────────┐     ┌─────────────┐
│   CLIENTE    │     │    ADMIN    │
│  Formulario  │     │ Carga Excel │
│  /solicitar  │     │/carga-masiva│
└──────┬───────┘     └──────┬──────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────┐
│     solicitudes_servicio         │
│     estado: pendiente            │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   WhatsApp a Tecnicos de zona   │
│     estado: notificada           │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Tecnico acepta (1ro gana)     │
│   /aceptar/[token]              │
│   estado: asignada               │
│   → WhatsApp a tecnico + cliente │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Tecnico diagnostica           │
│   /tecnico/[t]/diagnostico/[id] │
│   estado: en_proceso             │
│   → Calcula tarifa + bono TSS   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Tecnico completa servicio     │
│   /tecnico/[t]/completar/[id]   │
│   estado: en_verificacion        │
│   → WhatsApp a cliente           │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Cliente confirma              │
│   /confirmar/[token]            │
│                                  │
│   ✅ Satisfecho → completada     │
│   ❌ Problema  → en_disputa      │
└──────────────────────────────────┘
```

---

## URLs Importantes

| Pagina | URL | Acceso |
|--------|-----|--------|
| Solicitar servicio | `/solicitar` | Publico |
| Registro tecnico | `/registro` | Publico |
| Aceptar servicio | `/aceptar/[token]` | Token unico (WhatsApp) |
| Portal tecnico | `/tecnico/[portal_token]` | Token permanente |
| Diagnostico | `/tecnico/[token]/diagnostico/[id]` | Portal tecnico |
| Completar | `/tecnico/[token]/completar/[id]` | Portal tecnico |
| Confirmar cliente | `/confirmar/[confirmacion_token]` | Token unico (WhatsApp) |
| Admin | `/admin` | Autenticado (Supabase Auth) |

---

## Base de Datos

### Tablas Principales

| Tabla | Descripcion |
|-------|-------------|
| `solicitudes_servicio` | Solicitudes de servicio (todos los campos del formulario + estado + asignacion) |
| `tecnicos` | Perfiles de tecnicos (nombre, telefono, documento, `portal_token`) |
| `especialidades_tecnico` | Relacion muchos-a-muchos tecnicos ↔ especialidades |
| `notificaciones_whatsapp` | Un registro por notificacion enviada (token, estado, timestamps) |
| `evidencias_servicio` | Evidencia de completacion (fotos, checklist, firma, GPS, confirmacion) |

### Campos Clave de `solicitudes_servicio`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `estado` | text | Estado actual del servicio |
| `tecnico_asignado_id` | uuid | FK al tecnico que acepto |
| `pago_tecnico` | numeric | Valor calculado del servicio |
| `es_garantia` | boolean | Si es servicio de garantia |
| `triaje_resultado` | jsonb | Datos del diagnostico tecnico |
| `novedades_equipo` | text | Descripcion del problema (incluye modelo embebido) |
| `horario_visita_1` | text | Horario AM seleccionado |
| `horario_visita_2` | text | Horario PM seleccionado |
