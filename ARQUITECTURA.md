# ARQUITECTURA — Baird Service

## Diagrama del sistema

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
│  solicitudes_servicio │                                    │  Diagnóstico IA     │
│  tecnicos             │                                    │  Estimación costos  │
│  especialidades_tec.  │                                    │  Urgencia           │
│  notificaciones_wa    │                                    └─────────────────────┘
│  Storage Buckets      │
└──────────┬────────────┘         ┌──────────────────────────────────────┐
           │                      │        WHATSAPP BUSINESS API         │
           │  INSERT/UPDATE       │  (Meta Cloud API)                    │
           └──────────────────────│  → Envía oferta al técnico           │
                                  │  ← Recibe "ACEPTO" del técnico       │
                                  └──────────────────┬───────────────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │    TÉCNICO           │
                                          │  (WhatsApp móvil)    │
                                          │  Recibe oferta →     │
                                          │  responde ACEPTO →   │
                                          │  gana el servicio    │
                                          └─────────────────────┘
```

---

## Flujos de datos

### Flujo 1 — Cliente solicita un servicio

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
  Busca técnicos compatibles (especialidad + zona, estado_verificacion = 'verificado')
        │
        ▼
WhatsApp Business API envía mensaje a cada técnico:
  ┌────────────────────────────────────────┐
  │ 🔧 Nueva solicitud - Baird Service     │
  │                                        │
  │ Equipo: Lavadora Samsung               │
  │ Diagnóstico IA: Rodamiento desgastado  │
  │                                        │
  │ 📍 Cra 15 #45-20, Chapinero, Bogotá   │
  │                                        │
  │ 💰 Pago: $180.000 COP                  │
  │                                        │
  │ ¿Aceptas? Responde: ACEPTO-{token}     │
  └────────────────────────────────────────┘
        │
        ▼
Confirmación al cliente con ID de solicitud
```

### Flujo 2 — Técnico acepta (primer llega, gana)

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
Validar token (existe, no expirado, firma HMAC válida)
        │
        ▼
UPDATE solicitudes_servicio SET
  tecnico_id = tecnico.id,
  estado = 'asignada'
  WHERE id = solicitud_id
    AND tecnico_id IS NULL  ← (condición atómica anti-race)
        │
        ├── rowCount = 1 (ganó)
        │       │
        │       ▼
        │   Notificar técnico: "✅ Servicio asignado — Cliente: {nombre}, Tel: {tel}"
        │   Notificar cliente: "Tu técnico {nombre} está en camino"
        │   Invalidar todos los demás tokens de esa solicitud
        │
        └── rowCount = 0 (ya fue tomado)
                │
                ▼
          Notificar técnico: "❌ Este servicio ya fue asignado"
```

### Flujo 3 — Técnico se registra

```
Técnico completa formulario de registro
        │
        ├── Sube foto de perfil ──► uploadFotoPerfil() ──► Supabase Storage
        │
        ├── Sube foto de documento ──► uploadFotoDocumento() ──► Supabase Storage
        │
        ▼
INSERT en tabla tecnicos + INSERT en especialidades_tecnico
        │
        ▼
Estado: pendiente de verificación
(admin debe aprobar antes de que reciba ofertas)
```

---

## Stack tecnológico

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
| Mensajería | WhatsApp Business API (Meta Cloud) | — |
| Compilador | React Compiler (Babel) | 1.0.0 |
| Linting | ESLint | ^9 |

---

## Esquema de base de datos

### Tabla `solicitudes_servicio`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK generado automáticamente |
| `created_at` | timestamp | Fecha de creación |
| `cliente_nombre` | text | Nombre del cliente |
| `cliente_telefono` | text | Teléfono colombiano |
| `direccion` | text | Dirección completa del servicio |
| `ciudad_pueblo` | text | Ciudad o municipio |
| `zona_servicio` | text | Zona/barrio |
| `marca_equipo` | text | Marca del electrodoméstico |
| `tipo_equipo` | text | Tipo de equipo |
| `tipo_solicitud` | text | Tipo de servicio |
| `novedades_equipo` | text | Descripción del problema |
| `es_garantia` | boolean | ¿Es solicitud de garantía? |
| `numero_serie_factura` | text | Número de serie (si es garantía) |
| `estado` | text | `pendiente` / `notificada` / `asignada` / `en_progreso` / `completada` / `cancelada` |
| `tecnico_id` | UUID | FK al técnico asignado (NULL hasta que alguien acepta) |
| `pago_tecnico` | integer | ⏳ Monto COP para el técnico |
| `triaje_resultado` | jsonb | ⏳ JSON del análisis IA guardado |
| `notificados_at` | timestamp | ⏳ Cuándo se enviaron los mensajes WhatsApp |

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
| `estado_verificacion` | text | `pendiente` / `verificado` / `rechazado` |
| `fecha_verificacion` | timestamp | Cuándo fue verificado |
| `nota_verificacion` | text | Nota del verificador |

### Tabla `especialidades_tecnico` (junction)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tecnico_id` | UUID | FK a `tecnicos` |
| `especialidad` | text | Tipo de equipo que domina |

### Tabla `notificaciones_whatsapp` ⏳ (pendiente)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `solicitud_id` | UUID | FK a `solicitudes_servicio` |
| `tecnico_id` | UUID | FK a `tecnicos` |
| `token` | text | Token único de aceptación |
| `estado` | text | `enviado` / `aceptado` / `expirado` / `invalidado` |
| `enviado_at` | timestamp | Cuándo se envió |
| `respondido_at` | timestamp | Cuándo respondió el técnico |

---

## Patrones de diseño

### 1. Custom Hooks (separación de responsabilidades)
Los hooks encapsulan lógica de negocio separada de la presentación:
- `useSolicitudForm` — estado del formulario + validación
- `useTriaje` — llamadas a la API de IA + manejo de estado
- `useDebounce` — optimización de llamadas frecuentes

### 2. Service Layer
`solicitud.service.ts` y `uploadHelpers.ts` encapsulan toda comunicación con Supabase. Las páginas y hooks no interactúan con Supabase directamente.

### 3. Schema-First Validation
Zod define la forma de los datos como única fuente de verdad. Los tipos TypeScript se derivan del schema.

### 4. API Route como Backend-for-Frontend (BFF)
`/api/triaje/route.ts` actúa como proxy seguro hacia Google Gemini: mantiene la API key en el servidor, valida entradas y formatea respuestas.

### 5. UPDATE atómico anti-race condition
El `WHERE tecnico_id IS NULL` en el UPDATE garantiza que solo un técnico puede ganar el servicio, sin transacciones complejas ni locks explícitos.

---

## Decisiones arquitectónicas clave

| Decisión | Justificación |
|----------|--------------|
| Next.js App Router | Renderizado híbrido, API routes incluidas, mejor DX |
| Supabase como backend | BaaS completo: PostgreSQL + Storage + Auth futura |
| Google Gemini en API Route | La API key nunca se expone al cliente |
| WhatsApp como canal del técnico | Canal dominante en Colombia, elimina necesidad de app nativa |
| Token único por oferta | Permite identificar quién aceptó y revocar los demás tokens |
| React 19 + React Compiler | Optimización automática de re-renders sin `useMemo`/`useCallback` |
| Zod para validación | Type-safe en tiempo de ejecución, funciona en cliente y servidor |
