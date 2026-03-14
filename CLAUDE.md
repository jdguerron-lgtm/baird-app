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
│   ├── admin/              # Admin panel (auth-guarded)
│   └── api/                # API routes
│       ├── triaje/         # Gemini AI diagnosis
│       ├── health/         # Health check
│       └── whatsapp/       # notify, accept, webhook
├── components/ui/          # Reusable UI components (Button, InputField, PhoneInput, etc.)
├── hooks/                  # useDebounce, useSolicitudForm, useTriaje
├── lib/
│   ├── supabase.ts         # Supabase client singleton — always import from here
│   ├── constants/          # TIPO_A_ESPECIALIDAD mapping
│   ├── services/           # whatsapp.service.ts, solicitud.service.ts
│   └── validations/        # Zod schemas (solicitud.schema.ts)
├── types/                  # Domain types (solicitud.ts)
└── middleware.ts            # Rate limiting + security headers
```

## Key Data Flows

1. **Customer request:** Form → Zod validation → Supabase insert → WhatsApp notifications
2. **Technician acceptance:** Unique token link → POST /api/whatsapp/accept → atomic UPDATE (first-wins) → confirmations to both parties
3. **AI triage (disabled):** Description → Gemini API → structured JSON diagnosis

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

## Testing

Vitest is configured but no tests exist yet. Test files should be colocated or in a `__tests__` directory.

## Current Status

MVP deployed on Vercel. WhatsApp integration code complete. Pending: operational setup (Meta webhook subscription, Supabase migration, test phone numbers). See TODO.md for full roadmap.
