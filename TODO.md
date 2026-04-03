# TODO — Baird Service
**Última actualización:** 2 de abril de 2026

## Estado general

El proyecto está en **fase de producción activa**. El ciclo de vida completo del servicio está implementado: solicitud → notificación → aceptación → completación → confirmación del cliente. Carga masiva de garantías operativa. Verificación de negocio en Meta completada (vía Shopify). Verificación de acceso enviada y en revisión. RLS habilitado en Supabase. Número propio registrado (+57 313 4951164). Token permanente del System User activo. WhatsApp Cloud API v22.0 operativa con número propio. Notificación de bienvenida para técnicos implementada.

---

## Completado

### Flujo del cliente
- [x] Landing page con acceso diferenciado (cliente / técnico)
- [x] Formulario de solicitud de servicio con todos los campos relevantes
- [x] Soporte para solicitudes de garantía (campos condicionales)
- [x] Triaje IA con Google Gemini: diagnóstico, costos, urgencia, partes
- [x] Análisis IA en tiempo real con debounce mientras el usuario escribe
- [x] Validación de formulario con Zod (teléfono colombiano, campos condicionales)
- [x] Persistencia de solicitudes en Supabase (`solicitudes_servicio`)
- [x] Confirmación de solicitud con ID generado
- [x] **Confirmación de servicio por el cliente** — página `/confirmar/{token}` con satisfecho/reportar problema

### Flujo del técnico
- [x] Formulario de registro de técnicos
- [x] Selección de múltiples especialidades
- [x] Carga de foto de perfil con validación (JPG/PNG, máx 2MB)
- [x] Carga de foto de documento de identidad (JPG/PNG, máx 5MB)
- [x] Acuerdo de garantía en el registro
- [x] Almacenamiento de imágenes en Supabase Storage
- [x] **Portal del técnico** — `/tecnico/{token}` con lista de servicios activos e historial
- [x] **Completación de servicio** — `/tecnico/{token}/completar/{id}` con fotos, checklist, firma digital, GPS
- [x] **Portal token** — UUID persistente por técnico, acceso sin login por link

### WhatsApp — código
- [x] `whatsapp.service.ts` — `notificarTecnicos()`, `procesarAceptacion()`, `verificarFirmaWebhook()`
- [x] `POST /api/whatsapp/notify` — busca técnicos compatibles y envía mensajes
- [x] `GET /api/whatsapp/webhook` — handshake de verificación con Meta
- [x] `POST /api/whatsapp/webhook` — recibe eventos, verifica firma HMAC, responde 200
- [x] `POST /api/whatsapp/accept` — asignación atómica (primer en aceptar gana)
- [x] `/aceptar/[token]` — página de aceptación para técnicos
- [x] Mensaje de aceptación incluye link al portal del técnico
- [x] `POST /api/completar-servicio` — envía WhatsApp al cliente pidiendo confirmación
- [x] `POST /api/confirmar-servicio` — procesa confirmación del cliente
- [x] Mapping especialidades (`Lavadora` → `Lavadoras`, etc.)
- [x] **Bienvenida por WhatsApp al registrarse** — `POST /api/notificar-registro` envía mensaje interactivo al técnico
- [x] WhatsApp API actualizada a v22.0 con constante centralizada

### WhatsApp — infraestructura Meta
- [x] Cuenta Meta Business creada
- [x] App "Baird Service" creada en Meta for Developers
- [x] Producto WhatsApp agregado a la app
- [x] Phone Number ID obtenido: `1148716061648720` (número propio +57 313 4951164)
- [x] WABA ID obtenido: `2354953275016882`
- [x] Webhook registrado y verificado: `https://baird-app.vercel.app/api/whatsapp/webhook`
- [x] Verificación de negocio completada (vía Shopify: 1rep538r 1768612310)
- [x] Verificación de acceso (tech provider) enviada — en revisión, deadline 2026-05-31
- [x] System User `baird-api` creado con acceso Admin
- [x] Número propio +57 313 4951164 registrado en la API

### Admin panel
- [x] Dashboard con estadísticas generales
- [x] Lista y detalle de solicitudes con filtros por estado
- [x] Lista y detalle de técnicos con verificar/rechazar
- [x] Autenticación Supabase Auth (email/password)
- [x] **Carga masiva** — `/admin/carga-masiva` upload de Excel (formato BITÁCORA Mabe/GE)
- [x] **Dashboard de garantías** — `/admin/garantias` resumen por marca, equipo y estado
- [x] **Vista de evidencia** — en detalle de solicitud: fotos, checklist, firma, estado de confirmación
- [x] Botón re-notificar con diagnóstico de matching
- [x] Nuevos estados: `en_verificacion`, `en_disputa` con estilos y labels

### Infraestructura y despliegue
- [x] Proyecto desplegado en Vercel: `https://baird-app.vercel.app`
- [x] Componentes UI reutilizables: Button, InputField, SelectField, TextAreaField, Alert
- [x] Hooks personalizados: useDebounce, useSolicitudForm, useTriaje
- [x] Error boundary `error.tsx` y página 404 `not-found.tsx`
- [x] Loading skeletons para `/solicitar` y `/registro`
- [x] Imágenes Unsplash configuradas en `remotePatterns`
- [x] Storage bucket `evidencias-servicio` para fotos de completación
- [x] Lint cleanup completo — 26 problemas resueltos (commit 3f771c9)
- [x] RLS habilitado en las 5 tablas de Supabase con políticas apropiadas

### Migraciones SQL
- [x] `add_whatsapp_fields.sql` — campos WhatsApp y tabla `notificaciones_whatsapp`
- [x] `20260327_portal_evidencias.sql` — `portal_token` en tecnicos, tabla `evidencias_servicio`

---

## Pendientes — para activar producción

### 1. Verificación del negocio en Meta ✅ COMPLETADO
- [x] Verificación de negocio completada vía Shopify (1rep538r 1768612310)
- [x] Verificación de acceso (tech provider) enviada — en revisión (respuesta en ~5 días hábiles, deadline 2026-05-31)

### 2. Registrar número propio de WhatsApp ✅ COMPLETADO
- [x] Número +57 313 4951164 registrado en Meta API
- [x] Phone Number ID: `1148716061648720`
- [x] WABA ID: `2354953275016882`
- [x] `WHATSAPP_PHONE_ID` en Vercel actualizado al nuevo ID

### 3. Token permanente (System User) ✅ COMPLETADO
- [x] System User `baird-api` creado en business.facebook.com
- [x] Permisos seleccionados: `whatsapp_business_messaging` + `whatsapp_business_management`
- [x] Caducidad: Nunca (token permanente)
- [x] Token permanente generado y configurado en Vercel
- [x] `WHATSAPP_API_TOKEN` actualizado en Vercel
- [x] Redeploy completado — mensajes enviándose correctamente

### 4. Ejecutar migración de evidencias en Supabase
- [ ] Ejecutar `supabase/migrations/20260327_portal_evidencias.sql` en SQL Editor
- [ ] Crear bucket `evidencias-servicio` en Storage (público)

### 5. RLS en Supabase ✅ COMPLETADO
- [x] Row Level Security habilitado en las 5 tablas
- [x] Políticas creadas: anon INSERT/SELECT/UPDATE, authenticated ALL en cada tabla

---

## Pendientes — Fase 2

### Alta prioridad
- [ ] **Auto-cierre 24h** — Si el cliente no confirma en 24h, marcar automáticamente como completada (cron job o edge function)
- [ ] **Seguimiento para el cliente** — página pública `/solicitud/{id}` con estado en tiempo real
- [ ] **Notificación de disputa** — cuando el cliente reporta problema, avisar al admin por WhatsApp/email

### Media prioridad
- [ ] **Mappers de Excel adicionales** — para otros formatos de proveedores (no solo Mabe/GE BITÁCORA)
- [ ] **Exportar reportes** — descargar garantías/solicitudes como Excel desde admin
- [ ] **Paginación** — queries sin LIMIT actuales serán lentas con volumen

### Modelo de pago

> **Aclaración:** El pago se realiza directamente a Baird Service (la empresa) por medios electrónicos. **No se acepta efectivo.** El técnico no recibe pago directo del cliente.

### Baja prioridad
- [ ] **Sistema de reseñas** — calificación con estrellas al confirmar servicio
- [ ] **Integración de pagos** — PSE / tarjeta (Wompi, Kushki)
- [ ] **Términos y condiciones** — página legal
- [ ] **Analytics** — dashboard con patrones de fallas más comunes
- [ ] **SEO** — Open Graph, sitemap, meta tags completos

---

## Deuda técnica

| Área | Descripción | Impacto |
|------|-------------|---------|
| **Testing** | Sin tests (unitario, integración, e2e). Agregar Vitest + Playwright. | Alto |
| **RLS Supabase** | ~~Resuelto~~ — RLS habilitado con políticas en las 5 tablas (2026-04-01). | ✅ |
| **Gestión estado global** | Solo hooks locales. Evaluar Zustand si la app crece. | Bajo |
| **Phone utilities** | `parsePhone()`, `phoneToDigits()`, `formatearTelefono()` — consolidar en una sola utilidad. | Bajo |
| **Excel mapper** | Hardcoded para formato BITÁCORA Mabe/GE. No flexible para otros proveedores. | Medio |
| **Paginación** | Queries sin LIMIT — costosas cuando haya volumen. | Futuro |
