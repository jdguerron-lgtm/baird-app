# 📋 TODO — Baird Service

## Estado actual del desarrollo

El proyecto está en **fase MVP activa**. La interfaz de cliente y técnico está construida, la integración con IA funciona, y el registro de técnicos incluye verificación de identidad. El canal principal de comunicación con técnicos es **WhatsApp** — los técnicos reciben ofertas con diagnóstico IA, ubicación y pago directamente en su teléfono, y el primero en responder "ACEPTO" se queda con el servicio. Esta lógica aún está pendiente de implementar.

---

## ✅ Features completadas

### Flujo del cliente
- [x] Landing page con acceso diferenciado (cliente / técnico)
- [x] Formulario de solicitud de servicio con todos los campos relevantes
- [x] Soporte para solicitudes de garantía (campos condicionales)
- [x] Triaje IA con Google Gemini: diagnóstico, estimación de costos, urgencia, partes
- [x] Análisis IA en tiempo real con debounce mientras el usuario escribe
- [x] Validación de formulario con Zod (teléfono colombiano, campos condicionales)
- [x] Persistencia de solicitudes en Supabase (`solicitudes_servicio`)
- [x] Confirmación de solicitud con ID generado
- [x] Componente `TriajeDisplay` para mostrar resultados estructurados de la IA

### Flujo del técnico
- [x] Formulario de registro de técnicos
- [x] Selección de múltiples especialidades
- [x] Carga de foto de perfil con validación (JPG/PNG, máx 2MB)
- [x] Carga de foto de documento de identidad (JPG/PNG, máx 5MB)
- [x] Soporte para múltiples tipos de documento (CC, CE, TI, Pasaporte)
- [x] Acuerdo de garantía en el registro
- [x] Almacenamiento de imágenes en Supabase Storage

### Infraestructura y código
- [x] Componentes UI reutilizables: Button, InputField, SelectField, TextAreaField, Alert
- [x] Sistema de iconos SVG custom
- [x] Hooks personalizados: useDebounce, useSolicitudForm, useTriaje
- [x] Service layer para Supabase (submitSolicitud)
- [x] Upload helpers con validación de archivos
- [x] Migraciones SQL para campos de solicitud y verificación
- [x] Configuración TypeScript estricta
- [x] React Compiler habilitado

---

## 🔄 Features en progreso

- [ ] **Estructura de tabla `tecnicos` base** — Las migraciones agregan campos a la tabla pero la creación inicial de la tabla no está en las migraciones del repositorio. Verificar que existe en Supabase.
- [ ] **Tabla `especialidades_tecnico`** — La migración safe la crea, pero no hay lógica de inserción en `registro/page.tsx` para guardar las especialidades seleccionadas en esta tabla junction.

---

## 🐛 Bugs conocidos

- [ ] **Especialidades no se guardan en tabla junction**: El formulario de registro guarda las especialidades pero la lógica de inserción en `especialidades_tecnico` puede estar incompleta. Verificar que se inserten correctamente las filas.
- [ ] **Sin manejo de errores de Storage en registro**: Si falla la subida de imágenes, el formulario puede continuar e insertar el técnico sin las URLs de fotos.
- [ ] **Sin validación de formato de imagen en cliente antes de preview**: La validación de tipo ocurre en el helper de upload, pero el preview se muestra antes de validar.
- [ ] **Timeout de 15s en triaje**: En conexiones lentas o respuestas largas de Gemini, el timeout puede activarse. Considerar aumentarlo o dar feedback progresivo.

---

## 🔜 Próximos pasos priorizados

### Alta prioridad

1. **Sistema de notificación por WhatsApp** — El corazón del flujo de asignación. Al crearse una solicitud, se buscan técnicos compatibles (especialidad + zona) y se les envía un mensaje con:
   - Diagnóstico IA del problema (`posible_falla` del triaje)
   - Dirección completa (`direccion`, `zona_servicio`, `ciudad_pueblo`)
   - Cuánto recibirán (`pago_tecnico` en COP)
   - Un enlace/token único para aceptar
   > Archivos a crear: `src/app/api/whatsapp/notify/route.ts`, `src/lib/services/whatsapp.service.ts`

2. **Lógica "primer en aceptar gana"** — Webhook que recibe la respuesta del técnico desde WhatsApp y ejecuta el UPDATE atómico:
   ```sql
   UPDATE solicitudes_servicio
   SET tecnico_id = $1, estado = 'asignada'
   WHERE id = $2 AND tecnico_id IS NULL
   ```
   Si `rowCount = 0`, el servicio ya fue tomado. Notificar al técnico que llegó tarde.
   > Archivos a crear: `src/app/api/whatsapp/webhook/route.ts`

3. **Migración SQL para campos WhatsApp** — Agregar a `solicitudes_servicio`: `pago_tecnico`, `triaje_resultado` (jsonb), `notificados_at`. Crear tabla `notificaciones_whatsapp`.
   > Archivo a crear: `supabase/migrations/add_whatsapp_fields.sql`

4. **Guardar especialidades en tabla junction** — Completar la lógica en `registro/page.tsx` para insertar en `especialidades_tecnico`.

5. **Row Level Security (RLS)** — Activar y configurar políticas RLS en todas las tablas de Supabase. Crítico para producción.

6. **Autenticación de usuarios** — Implementar Supabase Auth. Sin esto no hay sesiones ni seguridad real para el panel del técnico.

### Media prioridad

7. **Confirmación al cliente cuando se asigna técnico** — Una vez que un técnico acepta, notificar al cliente por WhatsApp (o SMS) con el nombre y número de contacto del técnico asignado.

8. **Panel de administración** — Dashboard para verificar técnicos (`estado_verificacion`), ver solicitudes y gestionar usuarios. Solo técnicos `verificado` deben recibir ofertas.

9. **Seguimiento de estado para el cliente** — Página pública `/solicitud/{id}` donde el cliente puede ver el estado actual de su solicitud sin necesidad de autenticarse.

10. **Cálculo automático de `pago_tecnico`** — Definir la lógica de negocio: porcentaje del `costo_estimado_min` del triaje, o tabla de tarifas fijas por tipo de equipo/servicio.

### Baja prioridad

11. **Sistema de reseñas** — Calificación del servicio por parte del cliente al finalizar.
12. **Integración de pagos** — PSE / tarjeta para pagos en línea (Wompi, Kushki, etc.).
13. **Analytics de triaje** — Dashboard para ver patrones de fallos más comunes por tipo de equipo.
14. **App móvil** — PWA o React Native para técnicos en campo (aunque WhatsApp ya elimina la necesidad de app propia).

---

## 🔧 Deuda técnica identificada

| Área | Descripción | Impacto |
|------|-------------|---------|
| **Testing** | No hay ningún test (unitario, integración, e2e). Agregar Vitest + Testing Library. | Alto |
| **Error boundaries** | No hay `error.tsx` ni `not-found.tsx` en el App Router. Errores no manejados muestran pantalla en blanco. | Alto |
| **Loading states** | No hay `loading.tsx` a nivel de ruta. Transiciones de navegación sin feedback visual. | Medio |
| **RLS de Supabase** | Las tablas no tienen Row Level Security configurado. Cualquier usuario puede leer/escribir todo. | Alto |
| **Gestión de estado global** | Actualmente solo local con hooks. Si crece, evaluar Zustand o React Context para estado compartido. | Bajo |
| **Internacionalización** | Todo el texto está hardcodeado en español. Sin preparación para i18n. | Bajo |
| **SEO** | Solo metadata básica en `layout.tsx`. Sin Open Graph, sitemap, ni metadata dinámica por ruta. | Bajo |
| **Imágenes Next.js** | El logo usa `<img>` nativo. Debería usar `next/image` para optimización automática. | Bajo |
| **Variables de entorno tipadas** | No hay validación de entorno con Zod en tiempo de build (e.g., `@t3-oss/env-nextjs`). | Medio |
| **Paginación** | Cuando haya muchas solicitudes/técnicos, las queries sin LIMIT serán costosas. | Futuro |
