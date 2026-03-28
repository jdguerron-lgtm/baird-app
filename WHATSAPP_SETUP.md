# 📱 GUÍA DE CONFIGURACIÓN — WhatsApp Business API (Meta Cloud)

Esta guía explica paso a paso cómo obtener las credenciales, configurar el webhook y probar la integración de WhatsApp en Baird Service.

---

## ⏱️ Tiempo estimado de configuración

| Paso | Tiempo |
|------|--------|
| Crear cuenta Meta Business + App | 15–30 min |
| Configurar número y obtener tokens | 10 min |
| Configurar webhook | 10 min |
| Agregar números de prueba | 5 min |
| **Total (sandbox funcional)** | **~1 hora** |

> ⚠️ Para usar números **reales** (no de prueba) en producción, Meta puede requerir verificación del negocio (hasta 5 días hábiles). Para el sandbox, todo funciona inmediatamente.

---

## PASO 1 — Crear cuenta Meta Business

1. Ir a [business.facebook.com](https://business.facebook.com)
2. Clic en **"Crear cuenta"**
3. Ingresar: nombre del negocio, tu nombre, correo corporativo
4. Verificar el correo electrónico

> Si ya tienes una cuenta de Facebook personal, puedes usarla para acceder al Business Manager.

---

## PASO 2 — Crear una App en Meta for Developers

1. Ir a [developers.facebook.com](https://developers.facebook.com)
2. Clic en **"Mis Apps"** → **"Crear App"**
3. Seleccionar tipo: **"Empresa" (Business)**
4. Ingresar:
   - Nombre de la app: `Baird Service`
   - Correo de contacto
   - Vincular con tu cuenta de Meta Business del Paso 1
5. Clic en **"Crear App"**

---

## PASO 3 — Agregar el producto WhatsApp

1. En el dashboard de tu app, buscar la sección **"Agregar productos"**
2. Encontrar **"WhatsApp"** → clic en **"Configurar"**
3. Crear o vincular una **WhatsApp Business Account (WABA)**
   - Si es la primera vez: Meta crea una automáticamente
   - Aceptar los términos de servicio de WhatsApp Business

---

## PASO 4 — Obtener las credenciales

### 4a. Phone Number ID y WABA ID

1. En el menú lateral: **WhatsApp → Configuración de la API**
2. Sección **"Configuración de la API"**, verás:
   - **`Phone number ID`** → copiar → `WHATSAPP_PHONE_ID`
   - **`WhatsApp Business Account ID`** (solo referencia)
3. También hay un **número de prueba gratuito** que Meta provee para testing

### 4b. Token de acceso temporal (para desarrollo)

En la misma pantalla de **"Configuración de la API"**:
- Sección **"Token de acceso"** → clic en **"Generar"**
- Este token dura **24 horas**, útil solo para pruebas rápidas
- Copiarlo como `WHATSAPP_API_TOKEN`

### 4c. Token permanente (para producción) ⭐ Recomendado

1. Ir a [business.facebook.com](https://business.facebook.com) → **Configuración** → **Usuarios** → **Usuarios del sistema**
2. Clic en **"Agregar"** → Tipo: **Administrador**
3. Asignar a la app **Baird Service** con permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Clic en **"Generar token"** → copiar → `WHATSAPP_API_TOKEN`
5. Este token **no expira** (a menos que lo revoques manualmente)

### 4d. App Secret

1. En el dashboard de la app → **Configuración** → **Básica**
2. Copiar el campo **"App Secret"** → `WHATSAPP_WEBHOOK_SECRET`
   - Este valor se usa para verificar la firma de los webhooks entrantes

---

## PASO 5 — Configurar el Webhook

El webhook es la URL donde Meta enviará los mensajes entrantes de los usuarios.

### 5a. Para desarrollo local (usar ngrok)

Los webhooks requieren HTTPS. Instalar y ejecutar ngrok:

```bash
# Instalar ngrok (si no lo tienes)
npm install -g ngrok
# o descargar desde https://ngrok.com

# Exponer el servidor local
ngrok http 3000
```

ngrok generará una URL pública como:
```
https://abc123.ngrok-free.app
```

> ⚠️ Cada vez que reinicies ngrok, la URL cambia. Deberás actualizar el webhook en Meta.

### 5b. Registrar el webhook en Meta

1. En el dashboard de la app → **WhatsApp** → **Configuración**
2. Sección **"Webhooks"** → clic en **"Configurar webhooks"**
3. Ingresar:
   - **URL de devolución de llamada**: `https://abc123.ngrok-free.app/api/whatsapp/webhook`
   - **Token de verificación**: un string que tú defines, ej: `baird_webhook_2025`
     → guardar este mismo string como `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Clic en **"Verificar y guardar"**
   - Meta hará un GET a tu URL con `hub.challenge`, Next.js responderá automáticamente ✅
5. En **"Campos de webhook"**, suscribirse a: **`messages`**

---

## PASO 6 — Agregar números de prueba

En el sandbox, solo puedes enviar mensajes a números pre-aprobados:

1. En **WhatsApp → Configuración de la API** → sección **"A"**
2. Clic en **"Administrar lista de números de teléfono"**
3. Agregar el WhatsApp del técnico (y cliente) de prueba
4. El número recibirá un **código de verificación** por WhatsApp para confirmar

> 🚨 **Importante**: El número de prueba de Meta solo puede enviar mensajes a números en esta lista. En producción (número verificado), puedes enviar a cualquier número.

---

## PASO 7 — Variables de entorno

Con todas las credenciales, actualizar `.env.local`:

```env
# WhatsApp Business API
WHATSAPP_API_TOKEN=EAABrI...       # Token permanente del Sistema de Usuarios
WHATSAPP_PHONE_ID=1234567890       # Phone Number ID del panel
WHATSAPP_WEBHOOK_VERIFY_TOKEN=baird_webhook_2025   # El que definiste en el webhook
WHATSAPP_WEBHOOK_SECRET=abc123...  # App Secret de Configuración Básica

# URL del sitio (para generar links /aceptar/{token})
NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app  # En dev: URL de ngrok
```

---

## PASO 8 — Probar el flujo completo

### 8a. Iniciar el servidor
```bash
npm run dev
```

### 8b. En otra terminal, iniciar ngrok
```bash
ngrok http 3000
```

### 8c. Verificar que el webhook responde
```bash
# Test manual del webhook verification
curl "https://tu-url.ngrok-free.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=baird_webhook_2025&hub.challenge=test123"
# Debe responder: test123
```

### 8d. Crear una solicitud de prueba
1. Abrir `http://localhost:3000/solicitar`
2. Completar el formulario con un número de WhatsApp real (que esté en tu lista de prueba)
3. Ingresar un valor de pago y dos horarios
4. Enviar la solicitud

### 8e. Verificar que llega el mensaje
- El técnico con la especialidad y ciudad correcta debe recibir un WhatsApp
- El mensaje incluye: problema, ubicación, horarios, pago y link `/aceptar/{token}`

### 8f. El técnico acepta
- El técnico abre el link desde su teléfono
- Ve los detalles y toca "Aceptar este servicio"
- El técnico recibe: confirmación con link a su portal `/tecnico/{token}`
- El cliente recibe por WhatsApp:
  1. Mensaje con datos del técnico (nombre, número, documento)
  2. Foto de perfil del técnico
  3. Foto del documento de identidad verificado

### 8g. El técnico completa el servicio
1. El técnico abre el link "Ver mis servicios" del WhatsApp
2. Ve su portal con los servicios asignados
3. Toca "Completar servicio" en el servicio correspondiente
4. Sube fotos (equipo funcionando, placa, repuesto, antes/después)
5. Llena el checklist técnico
6. El cliente firma con el dedo en la pantalla
7. Envía la evidencia

### 8h. El cliente confirma
- El cliente recibe un WhatsApp: "Tu servicio ha sido completado. Confirma si quedaste satisfecho"
- El cliente abre el link y ve: resumen + fotos del técnico
- Puede confirmar satisfacción o reportar un problema
- El estado cambia a `completada` o `en_disputa`

---

## 💰 Costos (Meta Cloud API)

| Tipo | Costo |
|------|-------|
| Primeras 1,000 conversaciones/mes | **Gratis** |
| Conversación de servicio (respuesta a mensaje del usuario en 24h) | ~$0.005–0.025 USD |
| Conversación de negocio (mensaje iniciado por el negocio) | ~$0.014–0.065 USD |
| Colombia (categoría "Utility") | ~$0.021 USD por conversación |

> Una "conversación" = todas las mensajes en una ventana de 24 horas. Enviar 3 mensajes al técnico en una misma solicitud cuenta como **1 conversación**.

**Estimación mensual para 500 solicitudes:**
- 500 técnicos notificados (1 conv. cada uno) = ~$10.50 USD
- 500 clientes notificados al aceptar (3 mensajes = 1 conv.) = ~$10.50 USD
- **Total: ~$21 USD/mes**

---

## ❓ Problemas comunes

### "Verification token mismatch" al configurar webhook
→ El `WHATSAPP_WEBHOOK_VERIFY_TOKEN` en `.env.local` debe ser **exactamente igual** al string ingresado en Meta.

### El técnico no recibe el mensaje
→ Verificar:
1. El número está en la lista de números de prueba de Meta
2. `WHATSAPP_PHONE_ID` y `WHATSAPP_API_TOKEN` son correctos
3. El teléfono del técnico en la BD está en formato `3001234567` o `+573001234567`
4. El técnico tiene `estado_verificacion = 'verificado'` y la especialidad correcta en `especialidades_tecnico`

### Error 401 al enviar mensaje
→ El token expiró (si es temporal). Generar uno nuevo o usar el token permanente.

### Link de aceptación no funciona
→ `NEXT_PUBLIC_APP_URL` no está configurado correctamente. En desarrollo debe ser la URL de ngrok.

### El cliente no recibe la foto del técnico
→ Las URLs de Supabase Storage deben ser **públicas**. Verificar en Supabase → Storage → Políticas que el bucket `fotos-perfil` tenga acceso de lectura pública.
