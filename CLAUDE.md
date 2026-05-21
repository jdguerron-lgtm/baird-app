# Baird Service

Marketplace for white-line appliance repair services in Colombia. Connects customers with verified technicians via AI triage and WhatsApp coordination. The platform handles two distinct service flows: **warranty repairs** (paid by the brand) and **non-warranty (particular) repairs** (paid by the customer after quote approval).

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
- **Messaging:** WhatsApp Business API (Meta Cloud API v22.0)
- **Validation:** Zod v4
- **Deploy:** Vercel (serverless/edge)

## Documentación de referencia

> 🧭 **Empezá siempre por `docs/INDEX.md`** — es el hub de navegación con la
> tabla "¿qué doc abro para...?" y el pipeline de actualización (qué docs
> tocar cuando cambias X). Diseñado para que iteraciones futuras
> (humanas o LLM) encuentren contexto sin duplicar.

Este `CLAUDE.md` quedó esbelto a propósito: solo lo esencial inline (commands,
stack, conventions, env vars). Todo el detalle vive en docs específicos:

- **`docs/INDEX.md`** — **HUB DE NAVEGACIÓN.** Tabla de tareas comunes ↔ doc específico, mapa completo de docs, pipeline de actualización (qué docs tocar para cada tipo de cambio), tags útiles para grep, health check.
- **`docs/ARQUITECTURA.md`** — Mapa de archivos: árbol de directorios completo, funciones de `whatsapp.service.ts`, API routes, páginas customer/technician/admin, exportación de resumen Excel.
- **`docs/MAQUINA-DE-ESTADOS.md`** — Cómo se parte el sistema en dos flujos (`es_garantia`), diagramas warranty/particular, payment model, admin pricing gate, customer self-service y la state machine completa de `solicitudes_servicio`.
- **`docs/SUPABASE.md`** — Capa de datos: tablas, columnas JSONB (`triaje_resultado`, `cotizacion`), cliente único, migraciones, RLS por tabla, storage buckets, patrones de query, tablas append-only, CHECK constraints, auth admin, auditoría.
- **`docs/GOTCHAS.md`** — Trampas conocidas. Léelo antes de tocar código sensible.
- **`docs/TARIFAS.md`** — **Doc canónico de tarifas.** MABE garantía (Tipo D + bonos por días + encuesta + recargo weekend + margen Baird 22%) y particular multi-marca (técnico ingresa costo, sistema multiplica × 1.19 IVA × 1.10 margen Baird). Apéndices: marco tributario 2026, pasarelas split-payment, decisión reseller vs marketplace. **Léelo antes de tocar cualquier cálculo de pago**.
- **`docs/PROTOCOLO-VISITA.md`** — Protocolo de verificación T-24h / T-2h / llegada / no-show. Modelo "no-show: nadie paga" con evidencia obligatoria. Estados, columnas DB, plantillas WhatsApp pendientes, política de gracia recurrentes.
- **`docs/FLOWS.md`** — Flujos end-to-end (warranty + particular + side flows), todas las plantillas WhatsApp en contexto, puntos de decisión del cliente verificados línea-por-línea, gaps conocidos, plan de testing manual.
- **`docs/WHATSAPP_TEMPLATES.md`** — Catálogo canónico de las 16 plantillas + el **proceso obligatorio de cambio**: (1) revisar dónde está documentada → (2) actualizar en `scripts/upload-templates.mjs` + este doc → (3) subir a Meta para aprobación. Backlog de plantillas nuevas con JSON listo. **Léelo antes de tocar cualquier mensaje WhatsApp**.
- **`docs/SEGURIDAD.md`** — Mapa de autenticación y autorización: frontend admin, endpoints API (admin/cliente/cron), tokens UUID, RLS, storage, histórico de incidentes, backlog de hardening.
- **`supabase/migrations/README.md`** — Orden de aplicación, verificación SQL, hallazgos del audit + backlog de migraciones.
- **`docs/FLUJOS-USUARIO.md`** — DEPRECATED (state machine v1, marzo 2026). No actualizar.

## Architecture

```
src/app/         # Next.js App Router pages (customer, technician, admin, api)
src/components/  # Reusable UI components
src/lib/         # supabase client, services, utils, constants, validations
src/types/       # Domain types, state machine, constants
legal/           # Legal documents (Baird Service SAS) — .docx
docs/            # Documentación canónica (ver "Documentación de referencia")
supabase/        # Migrations + README
```

Mapa completo de archivos, rutas, páginas y funciones de servicio en `docs/ARQUITECTURA.md`.

## Flujos y estados

El sistema entero se parte en **dos flujos** según el booleano `es_garantia` de cada `solicitud_servicio`: **garantía** (la marca le paga a Baird, tarifa fija por código de complejidad) y **particular / no-garantía** (el cliente le paga a Baird tras aprobar la cotización del técnico). Este campo se fija al crear la solicitud y nunca cambia; toda función de servicio lo chequea para decidir qué camino seguir.

El detalle — "Key Difference", diagramas paso a paso de cada flujo, payment model, admin pricing gate, customer self-service y la state machine completa — está en `docs/MAQUINA-DE-ESTADOS.md`. Para los flujos narrativos con plantillas WhatsApp en contexto, ver `docs/FLOWS.md`.

## Gotchas

Trampas conocidas (Supabase client, atomic acceptance, phone format, WhatsApp 24h window, storage PII, RLS gap, etc.): ver `docs/GOTCHAS.md`. Léelo antes de tocar código sensible.

## WhatsApp Templates

Catálogo canónico de las plantillas Meta aprobadas, parámetros, disparo y el proceso obligatorio de cambio: `docs/WHATSAPP_TEMPLATES.md`. **Antes de tocar cualquier mensaje WhatsApp, lee ese archivo.** Subir nuevas plantillas: `node --env-file=.env.local scripts/upload-templates.mjs`.

## Database & Supabase

Tablas, columnas JSONB, migraciones, RLS, storage buckets, patrones de query, CHECK constraints, auth admin y auditoría: ver `docs/SUPABASE.md` y `supabase/migrations/README.md`.

## Code Conventions

- **Language:** Spanish for domain terms (`solicitud`, `tecnico`, `ciudad_pueblo`), English for technical terms
- **Phone format:** Hay drift histórico. `tecnicos.whatsapp` se guarda como dígitos puros (`573134951164`) vía `phoneToDigits` en `/registro`. `solicitudes_servicio.cliente_telefono` se guardaba en formato pipe (`57|3134951164`) sin normalizar — fixado el 2026-05-13. Desde la migración `20260513_normalizar_telefonos.sql`, **ambas columnas pasan por un trigger BD `normalizar_telefono_co()`** que limpia `+`, espacios, guiones, pipe y asegura prefijo `57` para móviles colombianos. **Para enviar a Meta, usar siempre `phoneToDigits()`** (o `formatearTelefono`, alias del mismo). Si tocas el algoritmo de normalización, sincroniza el código TS (`src/lib/utils/phone.ts`) con la función SQL (`supabase/migrations/20260513_normalizar_telefonos.sql`). Detección de drift: `isMobileColombiano(digits)` retorna `true` solo si matchea `573XXXXXXXXX` — `enviarPlantilla` ya emite warn si el destino no es móvil válido.
- **Components:** PascalCase filenames. `'use client'` directive where needed.
- **Hooks:** camelCase with `use` prefix
- **Services:** camelCase + `.service.ts` suffix
- **Constants:** SCREAMING_SNAKE_CASE
- **Flow branching:** Always use `sol.es_garantia` to determine which flow to follow. Never hardcode state transitions without checking this field.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon key (public)
GEMINI_API_KEY                    # Google Generative AI
WHATSAPP_API_TOKEN                # Meta WhatsApp Business permanent token
WHATSAPP_PHONE_ID                 # WhatsApp phone number ID (1148716061648720)
WHATSAPP_WEBHOOK_VERIFY_TOKEN     # Webhook handshake token
WHATSAPP_WEBHOOK_SECRET           # App Secret for HMAC verification
NEXT_PUBLIC_APP_URL               # Base URL (https://baird-app.vercel.app)
BAIRD_TEST_PHONE_WHITELIST        # OPCIONAL — CSV de digits con país (p.ej. "573134951164").
                                  # Si está definida, las primitivas WhatsApp omiten cualquier
                                  # envío a un número fuera de la lista. Útil en dev para no
                                  # alertar a técnicos reales. Vacío/no definido = comportamiento
                                  # normal (envía a todos).
```

## Testing

Vitest is configured but no tests exist yet. Test files should be colocated or in a `__tests__` directory.

## Legal Framework

All legal documents are in the `legal/` directory as .docx files, in Spanish, aligned with Colombian law.

- **Entity:** Baird Service SAS (Colombian SAS corporation). Placeholders [NIT], [DIRECCION REGISTRADA], [REPRESENTANTE LEGAL] need to be filled in.
- **Platform role:** Marketplace intermediary — NOT the service provider. Critical for liability.
- **Data protection:** Ley 1581 de 2012 + Decreto 1377 de 2013.
- **Technician relationship:** Independent contractor (contrato de prestacion de servicios), NOT employment.
- **Data processors:** Supabase (AWS), Meta/WhatsApp, Google (Gemini AI), Vercel — documented as international data transfers.
- **Dispute resolution:** Service disputes go through `en_disputa` state with evidence review before escalation.

## Current Status

MVP deployed on Vercel with full dual-flow lifecycle. Warranty flow fully operational. Non-warranty flow code complete — pending Meta template approval for non-warranty WhatsApp templates. WhatsApp Cloud API v22.0 operational with permanent System User token and own number (+57 313 4951164). RLS enabled on all 5 Supabase tables. See TODO.md for full roadmap.
