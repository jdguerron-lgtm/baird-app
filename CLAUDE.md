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
- **Database:** Supabase (PostgreSQL) — **dos clientes**: `src/lib/supabase.ts` (anon key, SOLO páginas client-side/browser) y `src/lib/supabase-admin.ts` (`supabaseAdmin`, service_role, TODO el código server-side: API routes, services, crons — desde RLS Fase 1, 2026-07-11). Ver `docs/PLAN-RLS.md`.
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
- **`docs/SUPABASE.md`** — Capa de datos: tablas, columnas JSONB (`triaje_resultado`, `cotizacion`), clientes anon vs service_role, migraciones, RLS por tabla, storage buckets, patrones de query, tablas append-only, CHECK constraints, auth admin, auditoría.
- **`docs/GOTCHAS.md`** — Trampas conocidas. Léelo antes de tocar código sensible.
- **`docs/TARIFAS.md`** — **Doc canónico de tarifas.** MABE garantía (Tipo D + bonos por días + encuesta + recargo weekend + margen Baird 22%) y particular multi-marca (técnico ingresa lo que quiere ganar; sistema multiplica × 1.13 utilidad Baird × 1.19 IVA = × 1.3447; visita de diagnóstico paga $35.000 fijos al técnico — cambio 2026-07-05). Apéndices: marco tributario 2026, pasarelas split-payment, decisión reseller vs marketplace. **Léelo antes de tocar cualquier cálculo de pago**.
- **`docs/PROTOCOLO-VISITA.md`** — **Spec parcialmente implementada** (auditoría 2026-10-07: solo migración, `cumple_ta`, recargo weekend y estado `no_show_cliente` existen; recordatorios T-24h/T-2h, plantillas y UI de no-show siguen pendientes). Protocolo de verificación T-24h / T-2h / llegada / no-show. Modelo "no-show: nadie paga" con evidencia obligatoria.
- **`docs/FLOWS.md`** — Flujos end-to-end (warranty + particular + side flows), todas las plantillas WhatsApp en contexto, puntos de decisión del cliente verificados línea-por-línea, gaps conocidos, plan de testing manual.
- **`docs/WHATSAPP_TEMPLATES.md`** — Catálogo canónico de las plantillas Meta (el conteo y el status reales salen de `node --env-file=.env.local scripts/upload-templates.mjs --check`; ojo: las 10 versiones bumpeadas por la migración de dominio viven en `scripts/upload-templates-v2.mjs`) + el **proceso obligatorio de cambio**: (1) revisar dónde está documentada → (2) actualizar en `scripts/upload-templates.mjs` + este doc → (3) subir a Meta para aprobación. Backlog de plantillas nuevas con JSON listo. **Léelo antes de tocar cualquier mensaje WhatsApp**.
- **`docs/SEGURIDAD.md`** — Mapa de autenticación y autorización: frontend admin, endpoints API (admin/cliente/cron), tokens UUID, RLS, storage, histórico de incidentes, backlog de hardening.
- **`docs/DAPTA.md`** — Segunda línea de voz IA (llamadas cuando WhatsApp no responde). Fase 0 desplegada pero apagada (`DAPTA_ENABLED=false`). Resume lo operativo; el doc de decisión/fases/costos es `docs/mejoras-futuras/segunda-linea-voz/README.md`.
- **`docs/WOMPI.md`** — Pasarela de pagos (decisión 2026-08-18: Wompi única pasarela; Shopify solo repuestos). Anticipo de reserva post-aceptación del técnico, página `/pago/anticipo/{token}`, webhook, tabla `pagos`, reglas de seguridad y puesta en marcha. **Léelo antes de tocar cualquier cobro online**.
- **`docs/FACTURACION.md`** — Facturación y contabilidad: qué documento contable genera cada servicio (FV cliente particular, FV consolidada a MABE, documento soporte del técnico, ledger de pagos Wompi), campos que pide Siigo y gaps, export `tipo: 'facturacion'` en `/admin/liquidaciones`, liquidación quincenal de técnicos, opciones para venderle repuestos al técnico y fases de integración con Siigo. **Léelo antes de tocar liquidaciones o proponer algo de contabilidad**.
- **`docs/PLAN-RLS.md`** — Plan de cierre de la capa de datos (5 fases) + **bitácora de ejecución**: Fase 0, Fase 1 (server → service_role) y Fase 4.1 (cierre de `supervisores`, `llamadas`, `gps_pings`, `solicitud_eventos`, `connection_errors` + writes de `notificaciones`/`repuestos`) aplicadas en prod el 2026-07-11. Fases 2–4.2 pendientes (`tecnicos`, `evidencias_servicio`, `solicitudes_servicio`, `especialidades_tecnico`). **Léelo antes de tocar RLS o policies**.
- **`docs/TEST_CARGA_MASIVA.md`** — Procedimiento de prueba de `/admin/carga-masiva`: Excel BITÁCORA y PDF de órdenes TALLER MABE (`pdf-orden-mapping.ts`), dedup por orden.
- **`supabase/migrations/README.md`** — Orden de aplicación, verificación SQL, hallazgos del audit + backlog de migraciones.
- **`docs/historico/`** — Snapshots deprecados (FLUJOS-USUARIO v1, COWORK, CONTEXTO, DIAGNOSTIC 2026-04-05). No actualizar.

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
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon key (public) — browser / páginas client-side
SUPABASE_SERVICE_ROLE_KEY         # OBLIGATORIA — service_role para TODO el server-side (src/lib/supabase-admin.ts
                                  # lanza si falta; ~35 rutas API/services la usan desde RLS Fase 1, 2026-07-11).
                                  # Nunca con prefijo NEXT_PUBLIC. Ver docs/PLAN-RLS.md.
GEMINI_API_KEY                    # Google Generative AI
WHATSAPP_API_TOKEN                # Meta WhatsApp Business permanent token
WHATSAPP_PHONE_ID                 # WhatsApp phone number ID (1148716061648720)
WHATSAPP_WEBHOOK_VERIFY_TOKEN     # Webhook handshake token
WHATSAPP_WEBHOOK_SECRET           # App Secret for HMAC verification
NEXT_PUBLIC_APP_URL               # Base URL (https://lineablanca.bairdservice.com)
                                  # baird-app.vercel.app sigue vivo como alias del mismo deployment
                                  # (red de seguridad post-cutover 2026-05-23 — ver docs/mejoras-futuras/migracion-dominio/runbook-cutover-2026-05-23.md)
WHATSAPP_ALERT_PHONE              # OPCIONAL — número (digits con país) que recibe una alerta
                                  # por cada mensaje entrante al webhook (default 573153019192).
                                  # Mensaje libre: requiere ventana de 24h abierta con la línea.
BAIRD_TEST_PHONE_WHITELIST        # OPCIONAL — CSV de digits con país (p.ej. "573134951164").
                                  # Si está definida, las primitivas WhatsApp omiten cualquier
                                  # envío a un número fuera de la lista. Útil en dev para no
                                  # alertar a técnicos reales. Vacío/no definido = comportamiento
                                  # normal (envía a todos). La 2ª línea de voz (Dapta) reusa
                                  # esta misma whitelist vía isPhoneAllowed.

# Admin, cron, mapas y analítica
ADMIN_EMAILS                      # CSV de emails admin (server). Default jdguerron@bairdservice.com. Ver docs/SEGURIDAD.md.
NEXT_PUBLIC_ADMIN_EMAILS          # Mismo CSV para el cliente (login + guard del layout /admin).
CRON_SECRET                       # Bearer que exigen /api/cron/* (Vercel Cron) y /api/test-whatsapp.
ENABLE_TEST_ENDPOINTS             # 'true' habilita /api/test-whatsapp en prod (default apagado).
GOOGLE_MAPS_API_KEY               # Geocoding de direcciones para /admin/mapa (geocoding.service.ts).
NEXT_PUBLIC_GA_MEASUREMENT_ID     # OPCIONAL — GA4 (default G-DXSC4J9RGF hardcodeado).
NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL # OPCIONAL — label de conversión Ads (default hardcodeado en googleAds.ts).

# Wompi — pasarela de pagos (anticipo de reserva + recaudo online). Ver docs/WOMPI.md.
WOMPI_PUBLIC_KEY                  # pub_prod_… / pub_test_… (test → sandbox automático)
WOMPI_INTEGRITY_SECRET            # Firma SHA-256 del Web Checkout (Sensitive)
WOMPI_EVENTS_SECRET               # Verificación del webhook /api/wompi/webhook (Sensitive)
WOMPI_PRIVATE_KEY                 # OPCIONAL — reservada para API transaccional futura
                                  # Sin PUBLIC_KEY + INTEGRITY_SECRET todo Wompi es no-op
                                  # (kill-switch, mismo patrón que Dapta).

# Resend — correos transaccionales (correo de facturación al completar servicio).
RESEND_API_KEY                    # API key de Resend. Ausente = correos no-op (kill-switch).
FACTURACION_EMAIL                 # Destino del correo de facturación al completar
                                  # (default logistica@encompasslatam.com)
EMAIL_FROM                        # Remitente verificado en Resend
                                  # (default "Baird Service <facturacion@bairdservice.com>")

# Facturación — ver docs/FACTURACION.md
FACTURACION_MABE_NIT              # OPCIONAL — NIT de la marca a la que se factura la garantía (hoja "FV MABE")
FACTURACION_MABE_NOMBRE           # OPCIONAL — razón social (default "MABE COLOMBIA S.A.S.")

# Dapta — segunda línea de voz IA (llamadas automatizadas). Ver docs/DAPTA.md.
DAPTA_ENABLED                     # Kill-switch global: 'true' habilita disparar llamadas. Default off.
DAPTA_PUBLIC_ROUTE_URL            # Public Route URL del Flow de Dapta (POST con variables + metadata)
DAPTA_WEBHOOK_SECRET              # Secreto para verificar firma HMAC / token del webhook POST-CALL
DAPTA_MAX_INTENTOS                # Tope de llamadas por solicitud (default 2)
DAPTA_REINTENTO_COOLDOWN_HORAS    # Horas entre reintentos a la misma solicitud (default 4)
DAPTA_HORARIO_INICIO              # Hora hábil inicio, TZ America/Bogota 0–23 (default 8)
DAPTA_HORARIO_FIN                 # Hora hábil fin, TZ America/Bogota 0–23 (default 19)
# RESERVADAS (Fase 1 del plan de voz) — hoy NINGÚN código las lee (auditoría 2026-10-07):
DAPTA_SILENCIO_AGENDAR_HORAS      # Silencio WhatsApp antes de escalar — agendar (default 12)
DAPTA_SILENCIO_CIERRE_HORAS       # Silencio WhatsApp antes de escalar — cierre (default 24)
DAPTA_SILENCIO_COTIZACION_HORAS   # Silencio WhatsApp antes de escalar — cotización (default 24)
DAPTA_SILENCIO_REPUESTO_HORAS     # Silencio WhatsApp antes de escalar — repuesto (default 24)
```

## Testing

Vitest con **19 archivos de test (~320 casos) en `src/__tests__/`** (utils, validations, services, lib/wompi, pdf). `npm test` corre todo en ~1 s. Un fallo SÍ es regresión (verificado 2026-10-07). Tests nuevos van en `src/__tests__/<area>/`.

## Legal Framework

All legal documents are in the `legal/` directory as .docx files, in Spanish, aligned with Colombian law.

- **Entity:** Baird Service SAS (Colombian SAS corporation). Placeholders [NIT], [DIRECCION REGISTRADA], [REPRESENTANTE LEGAL] need to be filled in.
- **Platform role:** Marketplace intermediary — NOT the service provider. Critical for liability.
- **Data protection:** Ley 1581 de 2012 + Decreto 1377 de 2013.
- **Technician relationship:** Independent contractor (contrato de prestacion de servicios), NOT employment.
- **Data processors:** Supabase (AWS), Meta/WhatsApp, Google (Gemini AI), Vercel — documented as international data transfers.
- **Dispute resolution:** Service disputes go through `en_disputa` state with evidence review before escalation.

## Current Status

MVP deployed on Vercel with full dual-flow lifecycle — both warranty and non-warranty flows operational end-to-end. WhatsApp Cloud API v22.0 operational with permanent System User token and own number (+57 313 4951164); plantillas Meta: 46 definiciones en `scripts/upload-templates.mjs` + 10 versiones vigentes en `scripts/upload-templates-v2.mjs` (el código envía ~43 distintas; status real con `--check`, catálogo en `docs/WHATSAPP_TEMPLATES.md`). Supervisores con avisos por cambio de estado + resumen semanal PDF (manual, cron pendiente). Particular con auto-agendamiento (2026-07-06): `/api/solicitar` confirma la opción 1 del formulario y notifica técnicos inline — `pendiente_horario` solo persiste en garantía o si ambas opciones quedaron sin cupo (ver `docs/MAQUINA-DE-ESTADOS.md` y `docs/FLOWS.md`). Segunda línea de voz IA en Fase 0 apagada (`docs/DAPTA.md`). RLS (Fase 1 + 4.1 aplicadas 2026-07-11, ver `docs/PLAN-RLS.md`): todo el server-side escribe con service_role; `supervisores`, `llamadas`, `gps_pings`, `solicitud_eventos`, `connection_errors` y `pagos` cerradas al anon; `notificaciones_whatsapp` y `repuestos_pendientes` solo SELECT anon. Sigue **off** en `solicitudes_servicio` y `especialidades_tecnico`, y `tecnicos`/`evidencias_servicio` conservan writes anon (`/registro` y evidencias client-side) — Fases 2–4.2 pendientes. Admin de solicitudes con filtro "Sin técnico" + reenvío masivo de la oferta a técnicos (2026-10-07). See TODO.md for full roadmap.
