# 📦 MÓDULOS — Baird Service

## Mapa de módulos

```
src/
├── app/           → Rutas y páginas (Next.js App Router)
├── components/    → Componentes React reutilizables
├── hooks/         → Lógica de estado y efectos secundarios
├── lib/           → Servicios, utilidades, validaciones, cliente Supabase
└── types/         → Interfaces y tipos TypeScript
```

---

## 📁 `src/app/` — Rutas y API

**Responsabilidad:** Definir las rutas de la aplicación (páginas y endpoints API) usando el App Router de Next.js.

### Archivos clave

| Archivo | Función |
|---------|---------|
| `layout.tsx` | Layout raíz: fuentes, metadatos globales, estructura HTML |
| `page.tsx` | Página principal (`/`): landing con acceso a cliente y técnico |
| `globals.css` | Variables CSS globales, importación de Tailwind |
| `solicitar/page.tsx` | Formulario de solicitud de servicio con triaje IA |
| `registro/page.tsx` | Formulario de registro de técnicos con verificación de identidad |
| `api/triaje/route.ts` | Endpoint POST `/api/triaje`: llamada a Google Gemini y diagnóstico |
| `api/whatsapp/notify/route.ts` | ⏳ Endpoint POST: notifica a técnicos compatibles por WhatsApp |
| `api/whatsapp/webhook/route.ts` | ⏳ Endpoint POST: recibe respuesta del técnico y asigna el servicio |

> ⏳ = pendiente de implementar

### Interfaces expuestas
- `GET /` — Landing page
- `GET /solicitar` — Formulario de cliente
- `GET /registro` — Formulario de técnico
- `POST /api/triaje` — Análisis IA (ver API.md)
- `POST /api/whatsapp/notify` — Dispara notificaciones WhatsApp a técnicos ⏳
- `POST /api/whatsapp/webhook` — Recibe aceptaciones de técnicos vía WhatsApp ⏳

### Dependencias del módulo
- `← components/` (componentes UI y solicitud)
- `← hooks/` (useSolicitudForm, useTriaje, useDebounce)
- `← lib/` (submitSolicitud, uploadHelpers, validations, whatsappService)
- `← types/` (SolicitudFormData, TriajeResponse)
- `← @google/generative-ai` (solo en route.ts)
- `← whatsapp-business-api` (solo en api/whatsapp/)

---

## 📁 `src/components/` — Componentes React

**Responsabilidad:** Proveer componentes de UI reutilizables y desacoplados del estado de negocio.

### `components/ui/` — Componentes base

| Componente | Props clave | Descripción |
|-----------|-------------|-------------|
| `Button.tsx` | `variant`, `loading`, `disabled`, `icon` | Botón con estados de carga y variantes |
| `InputField.tsx` | `label`, `name`, `type`, `error`, `icon` | Campo de texto con label e icono |
| `SelectField.tsx` | `label`, `options`, `error`, `icon` | Select dropdown estilizado |
| `TextAreaField.tsx` | `label`, `rows`, `hint`, `error` | Área de texto con hint opcional |
| `Alert.tsx` | `type`, `message`, `onClose` | Alerta de 4 tipos (success/error/warning/info) |

### `components/icons/` — Iconos SVG

| Icono | Uso |
|-------|-----|
| `UserIcon` | Nombre, perfil de usuario |
| `PhoneIcon` | Teléfono, WhatsApp |
| `LocationIcon` | Dirección, ciudad |
| `TagIcon` | Marcas, etiquetas |
| `AlertIcon` | Advertencias |
| `BoxIcon` | Tipo de equipo |
| `ChecklistIcon` | Listas de verificación |
| `LightBulbIcon` | Recomendaciones IA |
| `ShieldCheckIcon` | Verificación de identidad |
| `DocumentIcon` | Documentos |
| `BoltIcon` | Urgencia, energía |

### `components/solicitud/` — Componentes de dominio

| Componente | Descripción |
|-----------|-------------|
| `TriajeDisplay.tsx` | Muestra el resultado del análisis IA: diagnóstico, costo, urgencia, partes, recomendaciones |

### Dependencias del módulo
- `← types/components.ts` (prop interfaces)
- `← types/solicitud.ts` (TriajeResponse)
- No depende de hooks ni servicios (componentes puros)

---

## 📁 `src/hooks/` — Lógica de Estado

**Responsabilidad:** Encapsular lógica de estado, efectos y llamadas a servicios externos, manteniendo las páginas limpias.

| Hook | Descripción | Retorna |
|------|-------------|---------|
| `useDebounce<T>` | Retrasa actualizaciones de valor | `debouncedValue: T` |
| `useSolicitudForm` | Estado del formulario + validación con Zod | `formData`, `errors`, `handleChange`, `validate`, `resetForm` |
| `useTriaje` | Llama a `/api/triaje` y gestiona estado IA | `triaje`, `triajeLoading`, `triajeError`, `analizarProblema`, `resetTriaje` |

### Flujo de datos entre hooks (en `solicitar/page.tsx`)

```
useSolicitudForm.formData
        │
        ▼ (campos: tipo_equipo, marca_equipo, novedades_equipo)
useDebounce (500ms)
        │
        ▼
useTriaje.analizarProblema()
        │
        ▼
TriajeDisplay (muestra resultado)
```

### Dependencias del módulo
- `useDebounce` — sin dependencias externas
- `useSolicitudForm` ← `lib/validations/solicitud.schema.ts`
- `useTriaje` ← `/api/triaje` (HTTP)

---

## 📁 `src/lib/` — Servicios y Utilidades

**Responsabilidad:** Centralizar toda comunicación con servicios externos (Supabase, Storage) y lógica de infraestructura.

### `lib/supabase.ts`
- Inicializa el cliente Supabase con variables de entorno
- Lanza error si faltan credenciales al arrancar
- Exporta `supabase` como singleton

### `lib/services/solicitud.service.ts`

```typescript
submitSolicitud(data: SolicitudFormData): Promise<{ success, data?, error? }>
```
- Inserta en tabla `solicitudes_servicio`
- Maneja errores de PostgreSQL (23505, 23503, 42P01)
- Retorna el registro insertado con su ID

### `lib/services/whatsapp.service.ts` ⏳

Servicio de comunicación con técnicos vía WhatsApp. Pendiente de implementar.

```typescript
// Funciones planeadas:
notificarTecnicos(solicitudId: string, tecnicos: Tecnico[]): Promise<void>
// Envía mensaje de oferta a cada técnico compatible con:
//   - Diagnóstico IA del problema
//   - Dirección completa (dirección + zona + ciudad)
//   - Pago que recibirá por el servicio
//   - Token único de aceptación

asignarTecnico(token: string): Promise<{ success, tecnicoId?, error? }>
// UPDATE atómico: asigna el servicio al primer técnico que acepta
// WHERE tecnico_id IS NULL garantiza que solo uno gana

generarTokenAceptacion(solicitudId: string, tecnicoId: string): string
// Genera token único firmado para identificar quién aceptó

invalidarTokens(solicitudId: string): Promise<void>
// Marca como usados todos los tokens pendientes de una solicitud
```

### `lib/uploadHelpers.ts`

```typescript
uploadImage(file, bucket, folder, maxSizeMB)  // genérico
uploadFotoPerfil(file, tecnicoId)              // foto de perfil
uploadFotoDocumento(file, tecnicoId)           // documento de identidad
deleteImage(url, bucket)                       // eliminar imagen
```
- Valida tipo de archivo (JPG, PNG)
- Valida tamaño (2MB fotos, 5MB documentos)
- Genera nombres únicos con timestamp

### `lib/validations/solicitud.schema.ts`

```typescript
solicitudSchema  // Zod schema completo del formulario
```
- Valida teléfono colombiano con regex
- Validación condicional: `numero_serie_factura` requerido si `es_garantia = true`
- Validaciones de longitud para cada campo

### Dependencias del módulo
- `← @supabase/supabase-js`
- `← zod`
- `← types/solicitud.ts`
- `← whatsapp-business-api` (pendiente, cuando se implemente `whatsapp.service.ts`)

---

## 📁 `src/types/` — Tipos TypeScript

**Responsabilidad:** Definir contratos de datos compartidos entre módulos.

### `types/solicitud.ts`

| Tipo | Descripción |
|------|-------------|
| `TIPOS_EQUIPO` | Array constante de tipos de equipos válidos |
| `TIPOS_SOLICITUD` | Array constante de tipos de servicio válidos |
| `SolicitudFormData` | Datos del formulario del cliente |
| `SolicitudServicio` | Registro completo en BD (extiende FormData, incluye `pago_tecnico`, `estado`) |
| `TriajeResponse` | Respuesta de la IA (diagnóstico, costo, partes, etc.) |
| `TriajeState` | Estado del hook useTriaje |
| `NotificacionWhatsApp` ⏳ | Registro de mensaje enviado a un técnico (solicitud_id, tecnico_id, token, estado) |
| `WhatsAppOferta` ⏳ | Estructura del mensaje de oferta enviado al técnico |

### `types/components.ts`

| Tipo | Componente destino |
|------|--------------------|
| `AlertProps` | Alert.tsx |
| `InputFieldProps` | InputField.tsx |
| `SelectFieldProps` | SelectField.tsx |
| `TextAreaFieldProps` | TextAreaField.tsx |
| `ButtonProps` | Button.tsx |

### Dependencias del módulo
- Sin dependencias externas (tipos puros)
- Importado por todos los demás módulos

---

## 📁 `supabase/migrations/` — Migraciones de BD

**Responsabilidad:** Definir y versionar los cambios al esquema de la base de datos.

| Archivo | Descripción |
|---------|-------------|
| `add_solicitud_fields.sql` | Agrega `numero_serie_factura` a `solicitudes_servicio` |
| `add_verification_fields.sql` | Agrega campos de verificación a tabla `tecnicos` |
| `add_verification_fields_safe.sql` | Versión segura con `IF NOT EXISTS`, crea tabla `especialidades_tecnico` |
| `add_whatsapp_fields.sql` ⏳ | Agrega `pago_tecnico` a `solicitudes_servicio`, crea tabla `notificaciones_whatsapp` |

---

## 🔗 Mapa de dependencias entre módulos

```
types/ ◄──── todos los módulos
  ▲
  │
lib/ ◄──── hooks/ ◄──── app/
  │                       │
  └───────────────────────┤
                          │
components/ ◄─────────────┘
```

**Regla general:** El flujo de dependencias va `app → hooks → lib → types` y `app → components → types`. No hay dependencias circulares.
