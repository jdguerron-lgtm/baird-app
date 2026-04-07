# Baird Service

Marketplace for white-line appliance repair services in Colombia. Connects customers with verified technicians via AI triage and WhatsApp coordination.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # Production build
npm run lint       # ESLint
npm test           # Vitest (run once)
npm run test:watch # Vitest (watch mode)
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5 (strict)
- **Styling:** Tailwind CSS v4 (inline classes, no CSS modules)
- **Database:** Supabase (PostgreSQL) — singleton client at `src/lib/supabase.ts`
- **AI:** Google Gemini 2.0 Flash (`@google/generative-ai`) — temporarily disabled
- **Messaging:** WhatsApp Business API (Meta Cloud)
- **Validation:** Zod v4
- **Deploy:** Vercel (serverless/edge)

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── solicitar/          # Customer service request form
│   ├── registro/           # Technician registration
│   ├── aceptar/[token]/    # 1-click acceptance page for technicians
│   ├── tecnico/[token]/    # Technician portal (service list, completion)
│   │   └── completar/[id]/ # Service completion form (photos, checklist, signature)
│   ├── confirmar/[token]/  # Customer satisfaction confirmation page
│   ├── admin/              # Admin panel (auth-guarded)
│   │   ├── solicitudes/    # Solicitudes list + detail (with evidence view)
│   │   ├── tecnicos/       # Technician management
│   │   ├── carga-masiva/   # Bulk Excel upload for warranty services
│   │   └── garantias/      # Warranty dashboard (summary by brand/equipment)
│   └── api/                # API routes
│       ├── solicitar/           # Service request: insert + WhatsApp confirm + notify techs
│       ├── diagnostico/         # Technician diagnosis: save + WhatsApp to customer
│       ├── triaje/              # Gemini AI diagnosis
│       ├── health/              # Health check
│       ├── carga-masiva/        # Bulk Excel upload processing + WhatsApp confirm + notify
│       ├── completar-servicio/  # Service completion + WhatsApp to customer
│       ├── confirmar-servicio/  # Customer confirmation + WhatsApp to technician
│       └── whatsapp/            # notify (admin-only), accept, webhook
├── components/ui/          # Reusable UI components (Button, InputField, PhoneInput, etc.)
├── hooks/                  # useDebounce, useSolicitudForm, useTriaje
├── lib/
│   ├── supabase.ts         # Supabase client singleton — always import from here
│   ├── constants/          # TIPO_A_ESPECIALIDAD mapping, ESTADO_ESTILOS/LABELS
│   ├── services/           # whatsapp.service.ts, solicitud.service.ts
│   ├── utils/              # phone.ts, format.ts, excel-mapping.ts
│   └── validations/        # Zod schemas (solicitud.schema.ts)
├── types/                  # Domain types (solicitud.ts)
└── middleware.ts            # Rate limiting + security headers
```

## Key Data Flows

1. **Customer request:** Form → POST /api/solicitar → Zod validation → Supabase insert → WhatsApp confirmation to customer → notificarTecnicos() to all matching techs
2. **Bulk upload:** Excel (.xlsx BITÁCORA format) → parse with `xlsx` → map columns → bulk insert → WhatsApp confirmation to each customer → optional notificarTecnicos()
3. **Technician acceptance:** Unique token link → POST /api/whatsapp/accept → atomic UPDATE (first-wins) → WhatsApp to technician (assignment + client contact) + WhatsApp to customer (technician info)
4. **Technician diagnosis:** Portal → upload evidence + describe problem + select complexity → POST /api/diagnostico → WhatsApp to customer (diagnosis in progress)
5. **Service completion:** Technician portal → upload photos + checklist + signature → Supabase Storage → POST /api/completar-servicio → WhatsApp to customer with confirmation link
6. **Customer confirmation:** Confirmation link → POST /api/confirmar-servicio → estado updates to `completada` or `en_disputa` → WhatsApp to technician (confirmation or dispute notification)
7. **AI triage (disabled):** Description → Gemini API → structured JSON diagnosis

## Solicitud State Machine

```
pendiente → notificada → asignada → en_proceso → en_verificacion → completada
                                                                  → en_disputa
                                                → cancelada
```

## Code Conventions

- **Language:** Spanish for domain terms (`solicitud`, `tecnico`, `ciudad_pueblo`), English for technical terms
- **Phone format:** Stored as `"countryCode|number"` (e.g., `"57|3001234567"`). Use `formatearTelefono()` to convert to digits.
- **Components:** PascalCase filenames. `'use client'` directive where needed.
- **Hooks:** camelCase with `use` prefix
- **Services:** camelCase + `.service.ts` suffix
- **Constants:** SCREAMING_SNAKE_CASE

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon key (public)
GEMINI_API_KEY                    # Google Generative AI
WHATSAPP_API_TOKEN                # Meta WhatsApp Business token
WHATSAPP_PHONE_ID                 # WhatsApp phone number ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN     # Webhook handshake token
WHATSAPP_WEBHOOK_SECRET           # App Secret for HMAC verification
NEXT_PUBLIC_APP_URL               # Base URL (https://baird-app.vercel.app)
```

## Gotchas

- **Supabase client:** Always import from `src/lib/supabase.ts`. Never create new clients with `createClient()`.
- **WhatsApp token:** Temporal tokens expire in 24h. Production needs a permanent system user token.
- **Serverless constraints:** In-memory state (Maps, setInterval) does NOT persist across Vercel invocations. Use external stores for rate limiting.
- **Phone pipe format:** The `|` separator is used everywhere. `parsePhone()`, `phoneToDigits()`, and `formatearTelefono()` all handle this — consolidate to a single utility.
- **Atomic acceptance:** `procesarAceptacion()` uses `UPDATE ... WHERE tecnico_asignado_id IS NULL` to prevent race conditions. Don't change this pattern.
- **RLS not enabled:** Supabase tables have NO Row Level Security yet. Critical before production.
- **ILIKE injection:** Always use `escapeLikePattern()` before interpolating user input into `.ilike()` queries.
- **Security headers:** Define in ONE place only (middleware.ts or next.config.ts), not both.
- **Portal token:** Each technician gets a `portal_token` UUID on first acceptance. Used for passwordless access to `/tecnico/{token}`. Never expose technician IDs in URLs.
- **Evidence storage:** Photos and signatures stored in Supabase Storage bucket `evidencias-servicio` (public). Path pattern: `{solicitud_id}/{timestamp}_{index}.{ext}`.
- **Excel mapping:** `excel-mapping.ts` parses the specific Mabe/GE BITÁCORA format. Column indices are hardcoded to match that format — different Excel layouts will need a new mapper.
- **Image domains:** All external image hosts must be in `next.config.ts` `remotePatterns` (Unsplash, Supabase Storage buckets).

## WhatsApp Templates (Approved - Meta Business)

All templates use language `es` (Spanish). Names follow `_v3` suffix convention.

| Template | Used In | Parameters | Purpose |
|----------|---------|------------|---------|
| `nueva_solicitud_v3` | `notificarTecnicos()` | nombre, equipo, problema, ubicacion, horario, pago + button(token) | Notify technician of new service request |
| `servicio_no_disponible_v3` | `procesarAceptacion()` | nombre | Tell late technician the service was taken |
| `servicio_asignado_tecnico_v3` | `procesarAceptacion()` | nombre, cliente, equipo, direccion, pago, telefono + button(portal_token) | Assignment details + client contact to technician |
| `tecnico_asignado_cliente_v3` | `procesarAceptacion()` | cliente, tecnico, equipo, telefono | Tell customer their assigned technician |
| `registro_bienvenida_v3` | `notificarRegistroTecnico()` | nombre, ciudad, especialidad | Welcome message to new technician |
| `confirmar_servicio_v3` | `POST /api/completar-servicio` | cliente, tecnico, equipo + button(token) | Ask customer to confirm service completion |

**Important:** Template names must match exactly what's approved in Meta Business Manager > WhatsApp Manager > Message Templates. If a template is renamed or re-created, update the name in code.

## Testing

Vitest is configured but no tests exist yet. Test files should be colocated or in a `__tests__` directory.

## Database Tables

- **solicitudes_servicio** — Main service request table (form fields + state + assignment)
- **notificaciones_whatsapp** — One record per tech notification (token, estado, timestamps)
- **tecnicos** — Technician profiles (includes `portal_token` for portal access)
- **especialidades_tecnico** — Many-to-many linking technicians to skills
- **evidencias_servicio** — Completion evidence (photos, checklist, signature, GPS, confirmation)

## Current Status

MVP deployed on Vercel. Full service lifecycle implemented: request → notify → accept → complete → confirm. Bulk warranty upload via Excel operational. Pending: Meta business verification for production WhatsApp with own number. See TODO.md for full roadmap.
