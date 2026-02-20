# 🧭 CONTEXTO — Baird Service

## ¿Por qué existe este proyecto?

**Baird Service** es un marketplace de servicios técnicos para electrodomésticos en Colombia. Conecta a clientes que necesitan reparación, mantenimiento o instalación de equipos del hogar con técnicos certificados cercanos.

### Problema que resuelve
- Los clientes no saben si su equipo tiene reparación viable antes de llamar a un técnico.
- No existe visibilidad de costos estimados antes del diagnóstico presencial.
- Los técnicos no tienen una plataforma centralizada para recibir solicitudes.

### Propuesta de valor
- **Para clientes**: Formulario de solicitud con diagnóstico IA previo al servicio, estimación de costos y urgencia. El primer técnico que acepta atiende el caso.
- **Para técnicos**: Reciben ofertas de trabajo directamente en su WhatsApp con toda la información necesaria para decidir: diagnóstico del equipo, dirección exacta y cuánto se les pagará. El primero en responder "ACEPTO" gana el servicio.

---

## 🏢 Dominio de negocio

**Equipos cubiertos:** Lavadora, Nevera, Nevecón, Horno, Estufa, Aire Acondicionado, Secadora, Lavavajillas

**Tipos de servicio:** Diagnóstico, Reparación, Mantenimiento, Instalación

**Zona geográfica:** Colombia (validación de teléfonos colombianos, moneda COP)

---

## 🎨 Convenciones de código

### Nombrado de archivos
| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Páginas Next.js | `page.tsx` en carpeta | `solicitar/page.tsx` |
| Componentes React | PascalCase | `TriajeDisplay.tsx` |
| Hooks | camelCase con prefijo `use` | `useSolicitudForm.ts` |
| Servicios | camelCase con sufijo `.service` | `solicitud.service.ts` |
| Schemas | camelCase con sufijo `.schema` | `solicitud.schema.ts` |
| Helpers | camelCase con sufijo `Helpers` | `uploadHelpers.ts` |
| Tipos | camelCase, archivo de módulo | `solicitud.ts`, `components.ts` |
| Migraciones SQL | snake_case descriptivo | `add_verification_fields.sql` |

### Nombrado de variables y funciones
- **Variables de estado**: descriptivas en español (`formData`, `triajeLoading`, `errores`)
- **Handlers**: prefijo `handle` (`handleChange`, `handleSubmit`)
- **Funciones async de servicio**: verbo + sustantivo (`submitSolicitud`, `uploadImage`, `analizarProblema`)
- **Constantes de dominio**: MAYÚSCULAS_SNAKE (`TIPOS_EQUIPO`, `TIPOS_SOLICITUD`)

### Idioma
- **Código**: inglés para nombres técnicos genéricos (`Button`, `Loading`, `error`)
- **Dominio de negocio**: español (`solicitud`, `tecnico`, `triaje`, `novedades_equipo`)
- **UI / Labels**: español colombiano

### Estilos (Tailwind)
- Clases directamente en JSX, sin CSS modules ni styled-components
- Responsive con prefijos: `sm:`, `md:`, `lg:`
- Gradientes para elementos destacados: `from-blue-600 to-purple-600`
- Paleta principal: azul (`blue-600`), morado (`purple-600`), verde (`green-*`), rojo (`red-*`)

### Estructura de componentes
```tsx
// 1. Imports
// 2. Interface de props (si es componente reutilizable)
// 3. Función del componente
// 4. return JSX
export default function ComponentName({ prop1, prop2 }: Props) { ... }
```

---

## ⚙️ Configuraciones importantes

### TypeScript (`tsconfig.json`)
- `strict: true` — tipado estricto activado
- `paths: { "@/*": ["./src/*"] }` — alias para importaciones absolutas
- `target: "ES2017"` — soporte amplio de navegadores

### Next.js (`next.config.ts`)
- `reactCompiler: true` — optimización automática de renders (experimental)

### ESLint (`eslint.config.mjs`)
- Configuración `next/core-web-vitals` + `next/typescript`
- Sin reglas adicionales personalizadas actualmente

### Supabase Storage Buckets requeridos
- `fotos-perfil` — fotos de perfil de técnicos
- `fotos-documentos` — fotos de documentos de identidad

---

## 🔐 Variables de entorno

### Archivo: `.env.local` (nunca en repositorio)

| Variable | Alcance | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + Servidor | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + Servidor | Clave pública anónima de Supabase |
| `GEMINI_API_KEY` | **Solo servidor** | Clave API de Google Gemini (privada) |
| `WHATSAPP_API_TOKEN` | **Solo servidor** | Token de autenticación de WhatsApp Business API ⏳ |
| `WHATSAPP_PHONE_ID` | **Solo servidor** | ID del número de teléfono en Meta/Twilio ⏳ |
| `WHATSAPP_WEBHOOK_SECRET` | **Solo servidor** | Secret para verificar firma de webhooks entrantes ⏳ |
| `NEXT_PUBLIC_APP_URL` | Cliente + Servidor | URL base del sitio (e.g. `https://baird.app`) — usada para generar links de aceptación ⏳ |

> ⚠️ Las variables `WHATSAPP_*` **NUNCA** deben tener el prefijo `NEXT_PUBLIC_`. Solo se usan en API Routes server-side.

### Plantilla: `.env.example` (actualizar)
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
WHATSAPP_API_TOKEN=your-whatsapp-api-token-here
WHATSAPP_PHONE_ID=your-whatsapp-phone-id-here
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🗄️ Esquema de base de datos (Supabase)

### Tabla `solicitudes_servicio`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK generado automáticamente |
| `created_at` | timestamp | Fecha de creación |
| `cliente_nombre` | text | Nombre del cliente |
| `cliente_telefono` | text | Teléfono colombiano |
| `direccion` | text | Dirección completa del servicio |
| `ciudad_pueblo` | text | Ciudad o municipio |
| `zona_servicio` | text | Zona/barrio — enviado al técnico como parte de la ubicación |
| `marca_equipo` | text | Marca del electrodoméstico |
| `tipo_equipo` | text | Tipo de equipo |
| `tipo_solicitud` | text | Tipo de servicio |
| `novedades_equipo` | text | Descripción del problema |
| `es_garantia` | boolean | ¿Es solicitud de garantía? |
| `numero_serie_factura` | text | Número de serie (si es garantía) |
| `estado` | text | `pendiente` / `notificada` / `asignada` / `en_progreso` / `completada` / `cancelada` |
| `tecnico_id` | UUID | FK al técnico asignado (NULL hasta que alguien acepta) |
| `pago_tecnico` | integer | ⏳ Monto en COP que recibirá el técnico por el servicio |
| `triaje_resultado` | jsonb | ⏳ JSON del análisis IA guardado para enviarlo al técnico |
| `notificados_at` | timestamp | ⏳ Cuándo se enviaron los mensajes WhatsApp a los técnicos |

### Tabla `notificaciones_whatsapp` ⏳ (nueva)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `solicitud_id` | UUID | FK a `solicitudes_servicio` |
| `tecnico_id` | UUID | FK a `tecnicos` |
| `token` | text | Token único de aceptación (firmado, expira) |
| `estado` | text | `enviado` / `aceptado` / `expirado` / `invalidado` |
| `enviado_at` | timestamp | Cuándo se envió el mensaje |
| `respondido_at` | timestamp | Cuándo respondió el técnico (si aceptó)

### Tabla `tecnicos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `nombre` | text | Nombre completo |
| `whatsapp` | text | Número WhatsApp |
| `ciudad` | text | Ciudad base |
| `tipo_documento` | text | CC / CE / TI / Pasaporte |
| `numero_documento` | text | Número de documento |
| `foto_perfil_url` | text | URL en Supabase Storage |
| `foto_documento_url` | text | URL en Supabase Storage |
| `estado_verificacion` | text | pendiente / verificado / rechazado |
| `fecha_verificacion` | timestamp | Cuándo fue verificado |
| `nota_verificacion` | text | Nota del verificador |

### Tabla `especialidades_tecnico` (junction)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tecnico_id` | UUID | FK a tecnicos |
| `especialidad` | text | Tipo de equipo que domina |

---

## 🔒 Secretos y configuración sensible

| Secreto | Dónde se usa | Riesgo si se expone |
|---------|-------------|---------------------|
| `GEMINI_API_KEY` | `api/triaje/route.ts` | Cargos en cuenta de Google AI |
| `WHATSAPP_API_TOKEN` | `api/whatsapp/notify/route.ts` | Envío de mensajes no autorizados, cargos en cuenta |
| `WHATSAPP_WEBHOOK_SECRET` | `api/whatsapp/webhook/route.ts` | Cualquiera podría simular aceptaciones falsas de técnicos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Acceso a BD según RLS (riesgo bajo si RLS está configurado) |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | Exposición del endpoint (riesgo bajo) |

> ⚠️ Configurar **Row Level Security (RLS)** en Supabase es crítico para producción, especialmente dado que `NEXT_PUBLIC_SUPABASE_ANON_KEY` es visible en el cliente.

> ⚠️ El webhook de WhatsApp **debe verificar la firma** de cada request entrante usando `WHATSAPP_WEBHOOK_SECRET` antes de procesar cualquier aceptación. Sin esto, cualquiera podría hacer un POST falso y robar servicios.
