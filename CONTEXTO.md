# CONTEXTO — Baird Service

## ¿Por qué existe este proyecto?

**Baird Service** es un marketplace de servicios técnicos para electrodomésticos en Colombia. Conecta a clientes que necesitan reparación, mantenimiento o instalación de equipos del hogar con técnicos certificados cercanos.

### Problema que resuelve

- Los clientes no saben si su equipo tiene reparación viable antes de llamar a un técnico
- No existe visibilidad de costos estimados antes del diagnóstico presencial
- Los técnicos no tienen una plataforma centralizada para recibir solicitudes

### Propuesta de valor

- **Para clientes**: Diagnóstico IA previo al servicio con estimación de costos y urgencia. El primer técnico que acepta atiende el caso.
- **Para técnicos**: Reciben ofertas directamente en su WhatsApp con diagnóstico del equipo, dirección exacta y pago. El primero en responder "ACEPTO" gana el servicio.

---

## Dominio de negocio

**Equipos cubiertos:** Lavadora, Nevera, Nevecón, Horno, Estufa, Aire Acondicionado, Secadora, Lavavajillas

**Tipos de servicio:** Diagnóstico, Reparación, Mantenimiento, Instalación

**Zona geográfica:** Colombia (validación de teléfonos colombianos, moneda COP)

---

## Convenciones de código

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

## Seguridad — secretos críticos

| Secreto | Dónde se usa | Riesgo si se expone |
|---------|-------------|---------------------|
| `GEMINI_API_KEY` | `api/triaje/route.ts` | Cargos en cuenta de Google AI |
| `WHATSAPP_API_TOKEN` | `api/whatsapp/notify/route.ts` | Envío de mensajes no autorizados |
| `WHATSAPP_WEBHOOK_SECRET` | `api/whatsapp/webhook/route.ts` | Aceptaciones falsas de técnicos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Acceso a BD (riesgo bajo si RLS activo) |

> Las variables `WHATSAPP_*` NUNCA deben tener el prefijo `NEXT_PUBLIC_`. Solo se usan en API Routes server-side.

> El webhook de WhatsApp debe verificar la firma HMAC con `WHATSAPP_WEBHOOK_SECRET` antes de procesar cualquier aceptación.

> Configurar **Row Level Security (RLS)** en Supabase es crítico para producción.
