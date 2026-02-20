# 🏗️ ARQUITECTURA — Baird Service

## 📐 Diagrama ASCII del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                        │
│                                                                 │
│  ┌────────────────┐        ┌────────────────────────────────┐  │
│  │   / (Home)     │        │      /solicitar                │  │
│  │  Landing Page  │        │   Formulario de Servicio       │  │
│  └────────────────┘        │  + Triaje IA en tiempo real    │  │
│         │                  └──────────────┬─────────────────┘  │
│         │                                 │                     │
│  ┌──────┴──────┐                          │ POST /api/triaje    │
│  │  /registro  │                          │                     │
│  │  Registro   │                          ▼                     │
│  │  Técnicos   │              ┌───────────────────────┐        │
│  └─────────────┘              │   Next.js API Routes  │        │
│                               │  /api/triaje          │        │
│                               │  /api/whatsapp/notify │        │
│                               │  /api/whatsapp/webhook│        │
└───────────────────────────────┼───────────────────────┼────────┘
                                │                       │
          ┌─────────────────────┘                       └──────────────────┐
          │                                                                 │
          ▼                                                                 ▼
┌───────────────────────┐                                    ┌─────────────────────┐
│      SUPABASE         │                                    │   GOOGLE GEMINI     │
│   (PostgreSQL)        │                                    │   2.0 Flash Exp     │
│                       │                                    │                     │
│  ┌─────────────────┐  │                                    │  Análisis técnico   │
│  │solicitudes_serv.│  │                                    │  de equipos         │
│  └─────────────────┘  │                                    │  Diagnóstico IA     │
│  ┌─────────────────┐  │                                    │  Estimación costos  │
│  │    tecnicos     │  │                                    └─────────────────────┘
│  └─────────────────┘  │
│  ┌─────────────────┐  │         ┌──────────────────────────────────────┐
│  │notificaciones_wa│  │         │        WHATSAPP BUSINESS API         │
│  └─────────────────┘  │         │  (Twilio / Meta Cloud API)           │
│  ┌─────────────────┐  │         │                                      │
│  │  Storage Buckets│  │         │  → Envía mensaje al técnico con:     │
│  │ foto_perfil     │  │         │    • Diagnóstico IA del problema      │
│  │ foto_documento  │  │         │    • Dirección exacta del servicio    │
│  └─────────────────┘  │         │    • Pago que recibirá               │
└──────────┬────────────┘         │    • Link único para ACEPTAR         │
           │                      │                                      │
           │  INSERT/UPDATE       │  ← Recibe "ACEPTO" del técnico       │
           └──────────────────────┴──────────────────────────────────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │    TÉCNICO           │
                                  │  (WhatsApp móvil)    │
                                  │                      │
                                  │  Recibe oferta →     │
                                  │  responde ACEPTO →   │
                                  │  gana el servicio    │
                                  └─────────────────────┘
```

---

## 🔄 Flujo de Datos Principal

### Flujo 1: Cliente solicita un servicio

```
Cliente rellena formulario
        │
        ▼
useDebounce (500ms delay)
        │
        ▼
useTriaje.analizarProblema()
        │
        ▼
POST /api/triaje ──► Google Gemini API
        │                    │
        │◄───── JSON análisis ┘
        │         (diagnóstico, costo estimado, urgencia, partes)
        ▼
TriajeDisplay muestra resultados al cliente
        │
        ▼
Cliente envía formulario
        │
        ▼
submitSolicitud()
        │
        ▼
Supabase INSERT → solicitudes_servicio
  (estado: 'pendiente', pago_tecnico calculado, triaje guardado)
        │
        ▼
POST /api/whatsapp/notify
  Busca técnicos compatibles (especialidad + zona)
        │
        ▼
WhatsApp Business API envía mensaje a cada técnico:
  ┌────────────────────────────────────────┐
  │ 🔧 Nueva solicitud - Baird Service     │
  │                                        │
  │ Equipo: Lavadora Samsung               │
  │ Problema: Ruido en centrifugado...     │
  │ Diagnóstico IA: Rodamiento desgastado  │
  │                                        │
  │ 📍 Ubicación: Cra 15 #45-20, Chapinero│
  │    Bogotá - Zona Norte                 │
  │                                        │
  │ 💰 Pago por el servicio: $180.000 COP  │
  │                                        │
  │ ¿Aceptas este servicio?                │
  │ Responde: ACEPTO-{token_único}         │
  └────────────────────────────────────────┘
        │
        ▼
Confirmación al cliente con ID de solicitud
```

### Flujo 2: Técnico acepta un servicio (primer llega, gana)

```
Técnico recibe mensaje WhatsApp con oferta
        │
        ▼
Técnico responde "ACEPTO-{token}" en WhatsApp
        │
        ▼
WhatsApp Business API → POST /api/whatsapp/webhook
        │
        ▼
Validar token (existe, no expirado)
        │
        ▼
UPDATE solicitudes_servicio SET
  tecnico_id = tecnico.id,
  estado = 'asignada'
  WHERE id = solicitud_id
    AND tecnico_id IS NULL  ← (condición atómica anti-race)
        │
        ├── Filas afectadas = 1 (ganó la carrera)
        │         │
        │         ▼
        │   Notificar al técnico ganador: "✅ Servicio asignado"
        │   Notificar al cliente: "Técnico asignado: {nombre}, WhatsApp: {número}"
        │   Invalidar tokens de otros técnicos
        │
        └── Filas afectadas = 0 (ya fue tomado)
                  │
                  ▼
            Notificar al técnico: "❌ Este servicio ya fue tomado"
```

### Flujo 3: Técnico se registra

```
Técnico completa formulario de registro
        │
        ├── Sube foto de perfil ──► uploadFotoPerfil() ──► Supabase Storage
        │
        ├── Sube foto de documento ──► uploadFotoDocumento() ──► Supabase Storage
        │
        ▼
INSERT en tabla tecnicos (Supabase)
        │
        ▼
Estado: pendiente de verificación
(admin debe aprobar antes de recibir ofertas)
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI Library | React | 19.2.3 |
| Lenguaje | TypeScript | ^5 |
| Estilos | Tailwind CSS | ^4 |
| Validación | Zod | ^4.3.6 |
| Base de datos | Supabase (PostgreSQL) | ^2.95.3 |
| Almacenamiento | Supabase Storage | — |
| IA / LLM | Google Gemini 2.0 Flash | ^0.24.1 |
| Mensajería | WhatsApp Business API | por definir |
| Compilador | React Compiler (Babel) | 1.0.0 |
| Linting | ESLint | ^9 |

> **Opciones para WhatsApp Business API:**
> - **Twilio** — SDK en Node.js, fácil de integrar en Next.js API Routes, costo por mensaje
> - **Meta Cloud API** — Oficial de Meta, gratuita hasta cierto volumen, requiere aprobación de negocio
> - **360Dialog** — Intermediario BSP (Business Solution Provider), buena relación costo/soporte

---

## 🧩 Patrones de Diseño

### 1. Custom Hooks (separación de responsabilidades)
Los hooks encapsulan lógica de negocio separada de la presentación:
- `useSolicitudForm` — estado del formulario + validación
- `useTriaje` — llamadas a la API de IA + manejo de estado
- `useDebounce` — optimización de llamadas frecuentes

### 2. Composición de Componentes
Componentes UI genéricos (`Button`, `InputField`, `SelectField`) compuestos en páginas específicas. Evita repetición y garantiza consistencia visual.

### 3. Service Layer
`solicitud.service.ts` y `uploadHelpers.ts` encapsulan toda comunicación con Supabase. Las páginas y hooks no interactúan con Supabase directamente.

### 4. Schema-First Validation
Zod define la forma de los datos (`solicitud.schema.ts`) como única fuente de verdad. Los tipos TypeScript se derivan del schema.

### 5. API Route como Backend-for-Frontend (BFF)
`/api/triaje/route.ts` actúa como proxy seguro hacia Google Gemini: mantiene la API key en el servidor, valida entradas y formatea respuestas.

---

## 🔑 Decisiones Arquitectónicas Clave

| Decisión | Justificación |
|----------|--------------|
| Next.js App Router | Renderizado híbrido (server/client), API routes incluidas, mejor DX |
| Supabase como backend | BaaS completo: PostgreSQL + Storage + Auth futura, sin backend propio |
| Google Gemini en API Route | La API key nunca se expone al cliente; proxy seguro desde el servidor |
| Tailwind CSS v4 | Utilidades inline, sin configuración de temas compleja, bundle pequeño |
| Zod para validación | Type-safe en tiempo de ejecución, funciona en cliente y servidor |
| React 19 + React Compiler | Optimización automática de re-renders sin `useMemo`/`useCallback` manual |
| Debounce en triaje | Evita llamadas excesivas a Gemini mientras el usuario escribe |
| WhatsApp como canal del técnico | Los técnicos operan desde el móvil en campo; WhatsApp elimina la necesidad de una app nativa. Es el canal de mensajería dominante en Colombia. |
| "Primer en aceptar gana" via UPDATE atómico | El `WHERE tecnico_id IS NULL` en el UPDATE garantiza que solo un técnico puede tomar el servicio, sin race conditions, sin transacciones complejas. |
| Token único por oferta | Cada técnico recibe un token diferente en el link de aceptación, permitiendo identificar quién aceptó y revocar los demás tokens automáticamente. |
