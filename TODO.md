# TODO — Baird Service
**Última actualización:** 3 de marzo de 2026

## Estado general

El proyecto está en **fase de integración WhatsApp**. El código del MVP está completo y desplegado en Vercel. La cuenta de Meta está configurada y el webhook verificado. Faltan 4 pasos operacionales (sin código) para que el flujo completo funcione en pruebas.

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

### Flujo del técnico
- [x] Formulario de registro de técnicos
- [x] Selección de múltiples especialidades
- [x] Carga de foto de perfil con validación (JPG/PNG, máx 2MB)
- [x] Carga de foto de documento de identidad (JPG/PNG, máx 5MB)
- [x] Acuerdo de garantía en el registro
- [x] Almacenamiento de imágenes en Supabase Storage
- [x] **FIX:** Especialidades se guardan correctamente en tabla `especialidades_tecnico`
- [x] **FIX:** Si falla subida de fotos, se elimina el técnico insertado (sin registros huérfanos)

### WhatsApp — código
- [x] `whatsapp.service.ts` — `notificarTecnicos()`, `procesarAceptacion()`, `verificarFirmaWebhook()`
- [x] `POST /api/whatsapp/notify` — busca técnicos compatibles y envía mensajes
- [x] `GET /api/whatsapp/webhook` — handshake de verificación con Meta
- [x] `POST /api/whatsapp/webhook` — recibe eventos, verifica firma HMAC, responde 200
- [x] `POST /api/whatsapp/accept` — asignación atómica (primer en aceptar gana)
- [x] `/aceptar/[token]` — página de aceptación para técnicos
- [x] Migración SQL `add_whatsapp_fields.sql` — campos y tabla `notificaciones_whatsapp`
- [x] Mapping especialidades (`Lavadora` → `Lavadoras`, etc.)
- [x] **FIX:** Nombres de columnas corregidos (`nombre_completo`, `ciudad_pueblo`)

### WhatsApp — infraestructura Meta
- [x] Cuenta Meta Business creada
- [x] App "Baird Service" creada en Meta for Developers
- [x] Producto WhatsApp agregado a la app
- [x] Phone Number ID obtenido: `934556439751612`
- [x] WABA ID obtenido: `1839027660132592`
- [x] Token temporal generado (válido 24h — reemplazar)
- [x] Webhook registrado y verificado: `https://baird-app.vercel.app/api/whatsapp/webhook`
- [x] Verify token configurado: `baird_webhook_2025`

### Infraestructura y despliegue
- [x] Proyecto desplegado en Vercel: `https://baird-app.vercel.app`
- [x] Componentes UI reutilizables: Button, InputField, SelectField, TextAreaField, Alert
- [x] Hooks personalizados: useDebounce, useSolicitudForm, useTriaje
- [x] Error boundary `error.tsx` y página 404 `not-found.tsx`
- [x] Loading skeletons para `/solicitar` y `/registro`
- [x] `.gitattributes` para normalización de line endings
- [x] Push en `main` — Vercel redesplegó automáticamente

---

## Pendientes — para activar pruebas (sin código)

Estos 5 pasos son puramente operacionales. No requieren tocar código.

### 1. Activar suscripción "messages" en Meta ⚡ INMEDIATO
Meta for Developers → tu app → WhatsApp → Configuration → Webhook fields
- Activar toggle del campo **`messages`**
- Sin esto, Meta no envía los mensajes entrantes al webhook

### 2. Confirmar variables de entorno en Vercel ⚡ INMEDIATO
Vercel → proyecto → Settings → Environment Variables. Deben estar las 5:
```
WHATSAPP_API_TOKEN        = (token temporal o permanente)
WHATSAPP_PHONE_ID         = 934556439751612
WHATSAPP_WEBHOOK_VERIFY_TOKEN = baird_webhook_2025
WHATSAPP_WEBHOOK_SECRET   = (App Secret de Meta → Settings → Basic)
NEXT_PUBLIC_APP_URL       = https://baird-app.vercel.app
```
Después de agregar, hacer **Redeploy** desde Vercel para que tomen efecto.

### 3. Ejecutar migración SQL en Supabase ⚡ INMEDIATO
Supabase → SQL Editor → pegar y ejecutar:
```
supabase/migrations/add_whatsapp_fields.sql
```
Agrega `pago_tecnico`, `horario_visita_1/2`, `triaje_resultado`, `notificados_at` a `solicitudes_servicio` y crea la tabla `notificaciones_whatsapp`.

### 4. Agregar números de prueba en Meta
Meta → WhatsApp → API Setup → sección "To" → Manage phone number list
- Agregar el WhatsApp del técnico de prueba
- Agregar el WhatsApp del cliente de prueba
- Cada número recibirá un código de verificación

### 5. Crear un técnico de prueba verificado en Supabase
- Registrar un técnico en `/registro` con especialidad y ciudad de prueba
- En Supabase → Table Editor → `tecnicos` → actualizar `estado_verificacion = 'verificado'`
- El sistema solo notifica técnicos verificados

---

## Pendientes — Fase 2 (producción)

### Alta prioridad

- [ ] **Token permanente de WhatsApp** — en business.facebook.com → Configuración → Usuarios del sistema → crear Administrador → asignar app con permisos `whatsapp_business_messaging` + `whatsapp_business_management` → generar token → reemplazar en Vercel
- [ ] **Verificación del negocio en Meta** — puede tomar hasta 5 días hábiles. Necesario para usar número propio y enviar a cualquier número (no solo lista de prueba)
- [ ] **RLS en Supabase** — activar Row Level Security en todas las tablas. Crítico antes de usuarios reales.
- [ ] **Panel de administración** — verificar técnicos (`estado_verificacion`), ver solicitudes activas
- [ ] **Autenticación** — Supabase Auth para sesiones del panel de admin

### Media prioridad

- [ ] **Seguimiento para el cliente** — página pública `/solicitud/{id}` con estado en tiempo real
- [ ] **Número de Baird propio** — registrar el número real de WhatsApp del negocio en Meta

### Baja prioridad

- [ ] **Sistema de reseñas** — cliente califica el servicio al finalizar
- [ ] **Integración de pagos** — PSE / tarjeta (Wompi, Kushki)
- [ ] **Analytics** — dashboard con patrones de fallas más comunes

---

## Deuda técnica

| Área | Descripción | Impacto |
|------|-------------|---------|
| **Testing** | Sin tests (unitario, integración, e2e). Agregar Vitest + Playwright. | Alto |
| **RLS Supabase** | Las tablas no tienen Row Level Security. Cualquiera puede leer/escribir. | Alto |
| **Token permanente** | El token de WhatsApp actual expira en 24h. | Alto |
| **Gestión estado global** | Solo hooks locales. Evaluar Zustand si la app crece. | Bajo |
| **SEO** | Solo metadata básica. Sin Open Graph ni sitemap. | Bajo |
| **Paginación** | Queries sin LIMIT — costosas cuando haya volumen. | Futuro |
