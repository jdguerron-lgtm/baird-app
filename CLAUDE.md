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

## Architecture

```
src/
├── app/                        # Next.js App Router pages
│   ├── solicitar/              # Customer service request form
│   ├── registro/               # Technician registration
│   ├── aceptar/[token]/        # 1-click acceptance page for technicians
│   ├── tecnico/[token]/        # Technician portal (service list, history)
│   │   ├── diagnostico/[id]/   # Diagnosis form (warranty tariff OR particular quote)
│   │   └── completar/[id]/     # Service completion form (photos, checklist, signature)
│   ├── confirmar/[token]/      # Customer satisfaction confirmation page
│   ├── cotizacion/[token]/     # Customer quote approval page (non-warranty only)
│   ├── servicio/[token]/       # Customer self-service portal (cancel/reschedule)
│   ├── horario/[token]/        # Customer schedule selection (after creating request)
│   ├── verificar-paso/[token]/ # Customer approval of next-step (post-diagnosis, warranty)
│   ├── terminos/               # Public Terms & Conditions page
│   ├── admin/                  # Admin panel (auth-guarded)
│   │   ├── solicitudes/        # Solicitudes list + detail (with evidence view)
│   │   ├── tecnicos/           # Technician management
│   │   ├── repuestos/          # Pending parts dashboard
│   │   ├── gps-alertas/        # Silent flagged services (post-visit GPS within 100m)
│   │   ├── carga-masiva/       # Bulk Excel upload for warranty services
│   │   └── garantias/          # Warranty dashboard (summary by brand/equipment)
│   └── api/                    # API routes
│       ├── solicitar/              # Service request: insert + WhatsApp confirm + notify techs
│       ├── confirmar-horario/      # Customer schedule confirmation → notify techs
│       ├── diagnostico/            # Technician diagnosis: warranty tariff OR particular quote
│       ├── aprobar-cotizacion/     # Quote approval/rejection by customer (non-warranty)
│       ├── completar-servicio/     # Service completion + WhatsApp to customer
│       ├── confirmar-servicio/     # Customer confirmation + WhatsApp to technician
│       ├── verificar-paso/         # Customer approval of post-diagnosis next step
│       ├── solicitud/              # Customer self-service (NEW 2026-05-06)
│       │   ├── cancelar/           #   POST: cancel service request from /servicio portal
│       │   └── reagendar/          #   POST: reschedule from /servicio portal
│       ├── repuesto-recibido/      # Admin marks parts arrived → reactivates service
│       ├── gps-ping/               # Tech browser GPS ping by phase
│       ├── cron/                   # Scheduled jobs (horario reminder, GPS followup)
│       ├── triaje/                 # Gemini AI diagnosis (disabled)
│       ├── health/                 # Health check
│       ├── carga-masiva/           # Bulk Excel upload processing
│       └── whatsapp/               # notify (admin-only), accept, webhook
├── components/ui/              # Reusable UI: Button, InputField, PhoneInput, etc.
├── hooks/                      # useDebounce, useSolicitudForm, useTriaje
├── lib/
│   ├── supabase.ts             # Supabase client singleton — always import from here
│   ├── constants/
│   │   ├── especialidades.ts   # TIPO_A_ESPECIALIDAD mapping
│   │   └── estados.ts          # ESTADO_ESTILOS, ESTADO_LABELS (styling + labels per state)
│   ├── services/
│   │   ├── whatsapp.service.ts # All WhatsApp logic (notify, accept, quote, confirm)
│   │   └── solicitud.service.ts
│   ├── utils/
│   │   ├── phone.ts            # Phone parsing/formatting utilities
│   │   ├── format.ts           # formatCOP() and other formatters
│   │   └── excel-mapping.ts    # BITACORA Excel → solicitud mapper
│   └── validations/            # Zod schemas (solicitud.schema.ts)
├── types/
│   └── solicitud.ts            # Domain types, state machine, constants
└── middleware.ts               # Rate limiting + security headers

legal/                          # Legal documents (Baird Service SAS)
├── 01-terminos-y-condiciones.docx
├── 02-politica-de-privacidad.docx
├── 03-contrato-tecnico.docx
├── 04-acuerdo-cliente.docx
├── 05-politica-tratamiento-datos.docx
├── 06-politica-cookies.docx
├── 07-exoneracion-responsabilidad.docx
└── 08-acuerdo-nivel-servicio-tecnicos.docx
```

## Documentación de referencia

> 🧭 **Empezá siempre por `docs/INDEX.md`** — es el hub de navegación con la
> tabla "¿qué doc abro para...?" y el pipeline de actualización (qué docs
> tocar cuando cambias X). Diseñado para que iteraciones futuras
> (humanas o LLM) encuentren contexto sin duplicar.

- **`docs/INDEX.md`** — **HUB DE NAVEGACIÓN.** Tabla de tareas comunes ↔ doc específico, mapa completo de docs, pipeline de actualización (qué docs tocar para cada tipo de cambio), tags útiles para grep, health check.
- **`docs/TARIFAS.md`** — **Doc canónico de tarifas.** MABE garantía (Tipo D + bonos por días + encuesta + recargo weekend + margen Baird 22%) y particular multi-marca (técnico ingresa costo, sistema multiplica × 1.19 IVA × 1.10 margen Baird). Apéndices: marco tributario 2026, pasarelas split-payment, decisión reseller vs marketplace. **Léelo antes de tocar cualquier cálculo de pago**.
- **`docs/PROTOCOLO-VISITA.md`** — Protocolo de verificación T-24h / T-2h / llegada / no-show. Modelo "no-show: nadie paga" con evidencia obligatoria. Estados, columnas DB, plantillas WhatsApp pendientes, política de gracia recurrentes.
- **`docs/FLOWS.md`** — Flujos end-to-end (warranty + particular + side flows), todas las plantillas WhatsApp en contexto, puntos de decisión del cliente verificados línea-por-línea, gaps conocidos, plan de testing manual.
- **`docs/WHATSAPP_TEMPLATES.md`** — Catálogo canónico de las 16 plantillas + el **proceso obligatorio de cambio**: (1) revisar dónde está documentada → (2) actualizar en `scripts/upload-templates.mjs` + este doc → (3) subir a Meta para aprobación. Backlog de plantillas nuevas con JSON listo. **Léelo antes de tocar cualquier mensaje WhatsApp**.
- **`supabase/migrations/README.md`** — Orden de aplicación, verificación SQL, hallazgos del audit + backlog de migraciones.
- **`docs/FLUJOS-USUARIO.md`** — DEPRECATED (state machine v1, marzo 2026). No actualizar.

## How the Two Flows Work

The entire platform splits into two flows based on the `es_garantia` boolean field on each `solicitud_servicio`. This field is set at creation time and never changes. Every service function checks this field to decide which path to follow.

### Key Difference

| Aspect | Warranty | Non-Warranty (Particular) |
|--------|----------|---------------------------|
| **Who pays** | Brand (e.g. Mabe/GE) pays Baird | Customer pays Baird |
| **Pricing** | Fixed tariff by complexity code | Technician quotes after diagnosis |
| **Customer pays upfront** | Nothing | 50% of diagnostic fee ($40,000 COP) |
| **Diagnosis result** | Tech proceeds to repair immediately | Quote sent to customer for approval |
| **Extra step** | None | Customer must approve/reject quote |
| **WhatsApp templates** | `nueva_solicitud_v3`, `tecnico_asignado_cliente_v4` | `solicitud_particular_*`, `cotizacion_cliente_v1` |

### WARRANTY Flow (es_garantia = true) — Customer-first scheduling (v2 2026-04-27)

```
1. REQUEST        Customer form (or bulk Excel upload)
                  → Supabase insert (estado: pendiente_horario, horario_token: uuid)
                  → WhatsApp cliente_seleccion_horario_v1 (CTA → /horario/{token})
                  → NO tech notification yet

2. SCHEDULE       Customer opens /horario/{token}, picks 1 of 2 horarios
   CONFIRMATION   → Reads T&C + signs acceptance checkbox
                  → POST /api/confirmar-horario { token, opcion: 1|2 }
                  → estado: notificada, tyc_aceptados_at, tyc_version, horario_confirmado
                  → notificarTecnicos() sends nueva_solicitud_v3 to matching techs
                  → If timeout 24h+12h: state → sin_agendar (cron horario-recordatorio)

3. ACCEPTANCE     Tech clicks "Aceptar" in WhatsApp
                  → GET /aceptar/{token} → atomic UPDATE (first wins)
                  → estado: asignada
                  → WhatsApp servicio_asignado_tecnico_v3 to tech
                  → WhatsApp tecnico_asignado_cliente_v5 to customer (T&C link)

4. DIAGNOSIS      Tech opens /tecnico/{token}/diagnostico/{id}
                  → Oath modal (sworn statement + digital signature) → BLOCKING
                  → GPS ping (fase: 'llegada')
                  → Fills warranty tariff form
                  → Picks SIGUIENTE PASO (4 options):
                    a. reparar              → estado: en_proceso (text "trabajando en reparación")
                    b. esperar_repuesto     → estado: esperando_repuesto + SKU obligatorio
                                              + plantilla esperando_repuesto_cliente_v1
                                              + insert in repuestos_pendientes
                    c. no_reparable         → estado: finalizado_sin_reparacion (terminal)
                                              + plantilla finalizado_sin_reparacion_v1
                    d. negativa_cliente     → estado: cancelada_cliente (terminal)
                  → POST /api/diagnostico (incluye oath + siguiente_paso)
                  → GPS ping (fase: 'diagnostico')

4b. PARTS RCV     Admin marks parts as received in /admin/repuestos
                  → POST /api/repuesto-recibido
                  → If all parts received: estado → en_proceso
                  → WhatsApp repuesto_recibido_cliente_v1 to customer

5. COMPLETION     Tech opens /tecnico/{token}/completar/{id}
                  → Uploads photos, checklist, digital signature
                  → GPS ping (fase: 'completado')
                  → POST /api/completar-servicio → estado: en_verificacion
                  → WhatsApp confirmar_servicio_v3 to customer

5b. GPS FOLLOWUP  Cron /api/cron/gps-followup runs every 10 min
                  → 30+ min after completion, checks last GPS ping vs customer location
                  → If within 100m → evidencia.gps_flagged = true (silent admin alert)

6. CONFIRMATION   Customer clicks → /confirmar/{token}
                  → Satisfied → estado: completada
                  → Problem → estado: en_disputa
```

### NON-WARRANTY (Particular) Flow (es_garantia = false)

```
1. REQUEST        Customer form
                  → Supabase insert (estado: pendiente)
                  → WhatsApp solicitud_particular_cliente_v1 to customer
                    (includes diagnostic fee: $80,000 COP + 50% advance: $40,000 COP)
                  → notificarTecnicos() sends solicitud_particular_tecnico_v1 to matching techs
                  → estado: notificada

2. ACCEPTANCE     Technician clicks "Aceptar" button in WhatsApp
                  → GET /aceptar/{token} → atomic UPDATE (first wins)
                  → estado: diagnostico_pendiente    ← DIFFERENT from warranty
                  → WhatsApp servicio_asignado_tecnico_v3 to tech
                  → WhatsApp tecnico_asignado_particular_v1 to customer
                    (includes tech info + diagnostic fee + advance payment info)

3. DIAGNOSIS      Technician opens portal → /tecnico/{token}/diagnostico/{id}
   + QUOTE        → Fills diagnostic + quote form (mano de obra + repuestos)
                  → POST /api/diagnostico (non-warranty branch)
                  → Generates cotizacion with unique approval token (UUID)
                  → estado: cotizacion_enviada
                  → enviarCotizacionCliente() sends cotizacion_cliente_v1 to customer
                    (includes cost breakdown + "Aprobar" button linking to /cotizacion/{token})

4. QUOTE          Customer clicks button → /cotizacion/{token}
   APPROVAL       → Sees: diagnosis, evidence photos, cost breakdown
                  → APPROVE: POST /api/aprobar-cotizacion {aprobado: true}
                    → estado: cotizacion_aprobada → en_proceso
                    → WhatsApp cotizacion_aprobada_tecnico_v1 to tech
                  → REJECT: POST /api/aprobar-cotizacion {aprobado: false, comentario}
                    → estado: cotizacion_rechazada
                    → WhatsApp rejection text to tech

5. COMPLETION     Same as warranty from here (photos, checklist, signature)
                  → estado: en_verificacion → completada or en_disputa
```

### Payment Model

All payments go through Baird Service. The customer NEVER pays the technician directly.

**Warranty:** The brand pays Baird a fixed tariff based on the complexity code. Baird pays the technician `totalServicio` (tariff + bonus).

**Non-warranty:** The customer pays Baird the quoted total (mano de obra + repuestos). The diagnostic fee ($80,000 COP) with 50% advance ($40,000 COP) is collected before the technician visits. These constants are in `src/types/solicitud.ts` as `TARIFA_DIAGNOSTICO` and `ANTICIPO_PORCENTAJE`.

## Admin Pricing Gate (v2 2026-05-10) — solo Garantía + esperar_repuesto

A partir del 2026-05-10, el admin pricing gate aplica **solo** a un caso:

- **Garantía + `esperar_repuesto`**: el admin fija `tiempo_entrega` antes de notificar al cliente. El precio MABE ya está fijo por tarifario (Tipo D, ver `docs/TARIFAS.md`).

**Particular (v2)** ya **NO** pasa por admin gate. El técnico ingresa su `costoTecnico` (mano de obra + repuestos) en el formulario de diagnóstico, y `/api/diagnostico` calcula automáticamente el total al cliente con la fórmula `costoTecnico × 1.19 IVA × 1.10 margen Baird`. La cotización se envía al cliente inmediatamente. Ver `docs/TARIFAS.md` § "Particular".

**Estado `pendiente_pricing`** — solo se usa hoy para garantía con `esperar_repuesto`. Para particular el flujo va directo a `cotizacion_enviada`.

**Flujo (v2 2026-05-10):**
```
Diagnóstico técnico
       │
       ├── PARTICULAR: técnico también ingresa costoTecnico ─→ /api/diagnostico
       │                                                            │
       │                                                            ▼
       │                                              cotizacion_enviada (auto)
       │                                                            │
       │                                                            ▼
       │                                                   cliente decide
       │
       └── GARANTÍA: solo SKUs + descripción ─→ /api/diagnostico
                              │
                              ├── reparar/no_reparable/negativa → verificacion_pendiente
                              └── esperar_repuesto → pendiente_pricing
                                                           │
                                                           ▼
                                          /admin/cotizaciones-pendientes
                                          (admin fija solo tiempo_entrega)
                                                           │
                                                           ▼
                                                  verificacion_pendiente
                                                  → cliente aprueba paso
```

**Componentes UI:**
- `src/components/ui/ProductosNecesariosForm.tsx` — lista de SKUs (link a Serviplus visible para Mabe/GE).
- `src/components/ui/ProductosRecomendadosForm.tsx` — lista informativa sin precio.
- `src/app/tecnico/[token]/diagnostico/[id]/page.tsx` — particular: campo "Tu costo total" → muestra desglose IVA + margen + total cliente al técnico (no al cliente).
- `src/app/admin/cotizaciones-pendientes/page.tsx` — admin fija tiempo_entrega para garantía + esperar_repuesto. Particular ya no pasa por aquí.
- `src/app/cotizacion/[token]/page.tsx` — cliente ve solo "Total: $X (incluye IVA)" sin desglose.

**Estructura JSONB `cotizacion`** (v2 2026-05-10, con back-compat):
```ts
{
  diagnostico_tecnico: string,
  productos_necesarios: [{ sku, descripcion, cantidad, precio_unitario?, subtotal? }],
  productos_recomendados: [{ nombre, descripcion }],
  pendiente_precio: boolean,        // false en particular (auto), true en garantía + esperar_repuesto hasta que admin fija tiempo
  pricing_set_at?: string,
  tiempo_entrega?: string,           // solo garantía
  // Particular v2: el técnico ingresa costoTecnico, sistema calcula:
  costo_tecnico?: number,            // lo que recibe el técnico íntegro
  subtotal_con_iva?: number,         // costo_tecnico × 1.19
  margen_baird?: number,             // 10% sobre subtotal_con_iva
  total: number,                     // total que paga el cliente (IVA incluido)
  // Compat con flujo viejo (mano_obra + repuestos):
  mano_obra: number,                 // 0 en particular v2
  repuestos: number,                 // 0 en particular v2
  // Legacy: repuestos_detalle (texto libre, queda para back-compat)
  evidencias_diagnostico, cotizado_at, aprobado_at, rechazado_at, comentario_rechazo, token
}
```

## Customer Self-Service (v1 2026-05-06)

Toda solicitud expone un portal `/servicio/{cliente_token}` donde el cliente puede ver el estado actual, **cancelar** o **reagendar** sin pasar por admin. El token (`cliente_token`) es UUID durable y se incluye en el response de `POST /api/solicitar`.

**Política aplicada:**
- **Cutoff 4h** antes del horario para "cancelación a tiempo". Pasado ese punto la cancelación es válida pero queda con `cancelado_tarde=true` (impacta liquidación al técnico para garantía y no-reembolso del anticipo para particular).
- **Token único por solicitud** (no por acción) — más simple para el cliente y para el admin.
- **Reagendar conserva técnico:** si ya había aceptación, se mantiene `tecnico_asignado_id` y se le notifica el cambio por WhatsApp libre. Si pasamos por `reagendamiento_pendiente` la transición es transitoria y vuelve a `asignada`/`diagnostico_pendiente`.
- **Máximo 2 reagendamientos por solicitud** (`MAX_REAGENDAMIENTOS_CLIENTE`). Pasado el tope, fall-back a admin.
- **Audit append-only** en `solicitud_eventos` — cada cancelación/reagendamiento registra `tipo`, `estado_previo/nuevo`, `actor`, `motivo`, `payload` JSONB. No se borra nada.

**Decisiones explícitas (NO baked-in):**
- No se cambian las plantillas Meta existentes (mantener compatibilidad). El portal se descubre vía URL admin / referencia futura en plantillas.
- `/api/confirmar-horario` no se modifica. El reagendamiento usa su propio endpoint que setea `horario_confirmado` directo.
- La cancelación tardía no se distingue como estado separado; queda como `cancelada` con flag en audit.

## Solicitud State Machine (v5 2026-05-10 — particular sin admin gate)

```
WARRANTY:
  pendiente_horario ─┬─→ notificada → asignada → diagnóstico
                     │                              │
                     │      ┌── reparar/no_reparable/negativa ──→ verificacion_pendiente
                     │      │
                     │      └── esperar_repuesto ──→ pendiente_pricing → admin fija tiempo
                     │                                     │
                     │                                     ▼
                     │                              verificacion_pendiente
                     │                                     │
                     │              cliente aprueba ──┬────┘
                     │                                 ▼
                     │                          en_proceso o esperando_repuesto
                     │                                 │
                     │                                 ▼
                     │                          en_verificacion → completada | en_disputa
                     │                          ↘ finalizado_sin_reparacion (terminal)
                     │                          ↘ cancelada_cliente (terminal)
                     │                          ↘ reagendamiento_pendiente ↻ asignada
                     │                          ↘ cancelada (cliente desde /servicio, terminal)
                     │                          ↘ no_show_cliente (terminal — pendiente migración)
                     └─→ sin_agendar (timeout 24h+12h, terminal)

NON-WARRANTY (v2 2026-05-10):
  pendiente_horario ─┬─→ notificada → diagnostico_pendiente → diagnóstico técnico
                     │                       │           (incluye costoTecnico)
                     │                       │
                     │      ┌── no_reparable ──→ finalizado_sin_reparacion (terminal)
                     │      │
                     │      ├── negativa_cliente ──→ cancelada_cliente (terminal)
                     │      │
                     │      └── reparar/esperar_repuesto ──→ cotizacion_enviada (auto)
                     │                                              │
                     │                                              ├─ aprobada → en_proceso (o esperando_repuesto)
                     │                                              └─ rechazada → cotizacion_rechazada (terminal)
                     │                                              ↘ reagendamiento_pendiente ↻ diagnostico_pendiente
                     │                                              ↘ no_show_cliente (terminal — pendiente migración)
                     └─→ sin_agendar
```

**Estados terminales** (set en `ESTADOS_TERMINALES` en `src/lib/constants/estados.ts`):
`sin_agendar`, `finalizado_sin_reparacion`, `cancelada_cliente`, `cancelada`, `completada`, `cotizacion_rechazada`.

**Estado transitorio `reagendamiento_pendiente`** — usado solo si el cliente reagenda mientras el técnico ya estaba asignado; vuelve inmediatamente a `asignada`/`diagnostico_pendiente` con `horario_confirmado` actualizado.

**Estados desde los que el cliente puede cancelar/reagendar** están definidos en `src/types/solicitud.ts` como `ESTADOS_CANCELABLES_POR_CLIENTE` y `ESTADOS_REAGENDABLES_POR_CLIENTE`. Tope: `MAX_REAGENDAMIENTOS_CLIENTE = 2` por solicitud.

State labels and CSS classes are defined in `src/lib/constants/estados.ts`.

## Key Service Functions (whatsapp.service.ts)

| Function | Purpose | Branches on es_garantia? |
|----------|---------|--------------------------|
| `enviarSeleccionHorarioCliente(solicitudId)` | Plantilla cliente_seleccion_horario_v1 al crear solicitud | No |
| `enviarRecordatorioHorario(solicitudId)` | Plantilla recordatorio_horario_v1 (cron 24h) | No |
| `notificarTecnicos(solicitudId)` | Send service request to matching technicians | Yes |
| `procesarAceptacion(token)` | Atomic acceptance (first tech wins) | Yes |
| `enviarEsperandoRepuestoCliente(...)` | Plantilla esperando_repuesto_cliente_v1 con SKU | No |
| `enviarRepuestoRecibidoCliente(solicitudId)` | Plantilla repuesto_recibido_cliente_v1 | No |
| `enviarFinalizadoSinReparacion(solicitudId, motivo)` | Plantilla finalizado_sin_reparacion_v1 | No |
| `enviarCotizacionCliente(solicitudId)` | Send quote to customer via WhatsApp | No — non-warranty only |
| `notificarCotizacionAprobada(solicitudId)` | Notify tech that quote was approved | No — non-warranty only |
| `procesarCancelacionCliente(token, motivo)` | Cancela la solicitud desde /servicio portal — actualiza estado, invalida notifs, avisa al cliente y al técnico | Sí (audit en `solicitud_eventos`) |
| `procesarReagendamientoCliente(token, horario, motivo?)` | Reagenda manteniendo técnico asignado si lo hay; incrementa `reagendamientos_count` (max 2) | Sí (audit en `solicitud_eventos`) |
| `enviarMensajeTexto(telefono, texto)` | Send free-form text message | N/A |
| `verificarFirmaWebhook(payload, signature)` | HMAC verification for Meta webhook | N/A |

**Test gate:** todas las primitivas (`enviarPlantilla`, `enviarMensajeTexto`, `enviarImagen`, `enviarMensajeInteractivo`) verifican `BAIRD_TEST_PHONE_WHITELIST`. Si la env está definida (CSV de digits con país, p.ej. `573134951164`), los envíos a números fuera de la lista se omiten silenciosamente con un log `[WhatsApp][test-mode] Skipping ...`. Vacío/no definido → comportamiento normal (envía a todos). Útil para probar nuevos flujos sin alertar a técnicos reales.

## API Routes

| Route | Method | Purpose | Flow |
|-------|--------|---------|------|
| `/api/solicitar` | POST | Create request + send schedule selection | Both |
| `/api/confirmar-horario` | POST | Customer confirms schedule, triggers tech notification | Both |
| `/api/diagnostico` | POST | Save diagnosis + oath + siguiente_paso (4 options) | Both |
| `/api/aprobar-cotizacion` | POST | Customer approves/rejects quote | Non-warranty only |
| `/api/completar-servicio` | POST | Tech marks service complete | Both |
| `/api/confirmar-servicio` | POST | Customer confirms satisfaction | Both |
| `/api/verificar-paso` | POST | Customer approves/rejects post-diagnosis next step | Warranty only |
| `/api/solicitud/cancelar` | POST | Cliente cancela desde portal /servicio | Both |
| `/api/solicitud/reagendar` | POST | Cliente reagenda desde portal /servicio | Both |
| `/api/cotizacion-precios` | POST | Admin fija precios + tiempo de entrega tras diagnóstico | Both (lógica difiere) |
| `/api/repuesto-recibido` | POST | Admin marks parts arrived → reactivates service | Both |
| `/api/gps-ping` | POST | Tech browser sends GPS coords by phase | Both |
| `/api/cron/horario-recordatorio` | GET | Cron 1h: reminder + sin_agendar transition | N/A |
| `/api/cron/gps-followup` | GET | Cron 10min: post-visit GPS flagging | N/A |
| `/api/carga-masiva` | POST | Bulk Excel upload for warranty | Warranty only |
| `/api/admin/export` | POST | Admin: descarga `.xlsx` con resumen completo de solicitudes (cliente, técnico, evidencias, fotos, eventos, GPS, cotización). Body: `{ ids?: string[] }` — sin IDs exporta todas. | Both |
| `/api/whatsapp/webhook` | GET/POST | Meta webhook handshake + events | N/A |
| `/api/triaje` | POST | AI diagnosis (disabled) | N/A |
| `/api/health` | GET | Health check | N/A |

## Customer-Facing Pages

| Page | URL | Purpose |
|------|-----|---------|
| Service request form | `/solicitar` | Customer creates a new request |
| **Schedule confirmation** | `/horario/{horario_token}` | Customer picks fecha + franja + accepts T&C |
| **Self-service portal** | `/servicio/{cliente_token}` | Cancela / reagenda. Token durable, vive en `solicitudes_servicio.cliente_token` |
| **Verificar siguiente paso** | `/verificar-paso/{verificacion_paso_token}` | Cliente aprueba/rechaza el siguiente paso post-diagnóstico (garantía) |
| Quote approval | `/cotizacion/{cotizacion.token}` | Customer approves/rejects repair quote (non-warranty) |
| Service confirmation | `/confirmar/{confirmacion_token}` | Customer confirms service was completed satisfactorily |
| **Terms & Conditions** | `/terminos` | Public T&C page (Colombian law-compliant) |
| Privacy Policy | `/politica-privacidad` | Existing |

## Technician-Facing Pages

| Page | URL | Purpose |
|------|-----|---------|
| Accept service | `/aceptar/{token}` | 1-click acceptance from WhatsApp notification |
| Portal (service list) | `/tecnico/{token}` | View assigned services and history |
| Diagnosis form | `/tecnico/{token}/diagnostico/{id}` | Oath modal + diagnosis + 4 next-step options + GPS |
| Completion form | `/tecnico/{token}/completar/{id}` | Upload photos, checklist, signature, GPS |

## Admin Pages

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/admin` | KPIs and recent activity |
| Solicitudes | `/admin/solicitudes` | Service requests list/detail |
| Técnicos | `/admin/tecnicos` | Technician management |
| **Repuestos** | `/admin/repuestos` | Pending parts — mark as received |
| **Alertas GPS** | `/admin/gps-alertas` | Silent flagged services (post-visit GPS within 100m) |
| Carga Masiva | `/admin/carga-masiva` | BITÁCORA Excel upload |
| Garantías | `/admin/garantias` | Warranty dashboard by brand/equipment |

**Exportación de resumen** (botón **📥 Descargar resumen Excel**):
- En `/admin/solicitudes` → exporta TODAS las visibles. Si hay filas seleccionadas con checkbox, aparece **📥 Descargar selección** que solo exporta esas.
- En `/admin/solicitudes/[id]` → botón en el header exporta solo esa solicitud.
- Endpoint server-side: `POST /api/admin/export` (auth admin via `Authorization: Bearer <session.access_token>`). Genera `.xlsx` con 7 hojas:
  1. **Solicitudes** — fila plana por solicitud con todas las columnas + nombre/whatsapp/documento del técnico asignado + URLs hyperlink (portal cliente, selección horario, verificar paso, detalle admin).
  2. **Notificaciones WA** — cada `notificaciones_whatsapp` con técnico, estado, timestamps + URL `/aceptar/{token}` clickeable.
  3. **Eventos** — `solicitud_eventos` (audit log: cancelaciones, reagendamientos, notas admin).
  4. **Evidencias** — checklist + firma cliente + oath técnico + GPS (4 fases) + fotos expandidas como columnas separadas con hyperlinks.
  5. **GPS pings** — todos los `gps_pings` con link directo a Google Maps.
  6. **Repuestos** — `repuestos_pendientes` con SKU, costo, tiempo, estado.
  7. **Cotizaciones** — productos necesarios y recomendados de cada cotización JSONB, expandidos a una fila por producto.
- Filename: `baird-resumen-todas-{ts}.xlsx` o `baird-resumen-{N}-solicitudes-{ts}.xlsx`.

## Code Conventions

- **Language:** Spanish for domain terms (`solicitud`, `tecnico`, `ciudad_pueblo`), English for technical terms
- **Phone format:** Stored as `"countryCode|number"` (e.g., `"57|3001234567"`). Use `formatearTelefono()` to convert to digits.
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

## Gotchas

- **Supabase client:** Always import from `src/lib/supabase.ts`. Never create new clients with `createClient()`.
- **WhatsApp permanent token:** Using System User `baird-api` token. Never expires. If rotated, update `WHATSAPP_API_TOKEN` in Vercel + redeploy.
- **Serverless constraints:** In-memory state (Maps, setInterval) does NOT persist across Vercel invocations. Use external stores for rate limiting.
- **Phone pipe format:** The `|` separator is used everywhere. `parsePhone()`, `phoneToDigits()`, and `formatearTelefono()` all handle this — consolidate to a single utility.
- **Atomic acceptance:** `procesarAceptacion()` uses `UPDATE ... WHERE tecnico_asignado_id IS NULL` to prevent race conditions. Don't change this pattern.
- **ILIKE injection:** Always use `escapeLikePattern()` before interpolating user input into `.ilike()` queries.
- **Security headers:** Define in ONE place only (middleware.ts or next.config.ts), not both.
- **Portal token:** Each technician gets a `portal_token` UUID on first acceptance. Used for passwordless access to `/tecnico/{token}`. Never expose technician IDs in URLs.
- **Evidence storage:** Photos and signatures stored in Supabase Storage bucket `evidencias-servicio` (public). Path pattern: `{solicitud_id}/{timestamp}_{index}.{ext}`.
- **Excel mapping:** `excel-mapping.ts` parses the specific Mabe/GE BITÁCORA format. Column indices are hardcoded to match that format — different Excel layouts will need a new mapper.
- **Image domains:** All external image hosts must be in `next.config.ts` `remotePatterns` (Unsplash, Supabase Storage buckets).
- **Cotizacion token:** For non-warranty, the quote approval token is stored inside the `cotizacion` JSONB column. The `/cotizacion/{token}` page scans all `cotizacion_enviada` records to find the match — there's no direct column index on this token. **Antipatrón conocido**: ver "Filtros JSONB" en sección Supabase Architecture; refactorizar a columna generada `cotizacion_token` con índice cuando crezca el volumen.
- **Estado pre-deploy:** antes de deployar verifica que las migraciones pendientes en `supabase/migrations/` ya estén aplicadas en producción. Si una migración falta, código nuevo que escribe a un estado inexistente o columna nueva fallará en runtime con un `CHECK violation` o `column does not exist`. **Cuidado especial con columnas JSONB**: si agregas un campo a un tipo TS (ej. `cotizacion`, `triaje_resultado`) que se persiste en una columna que aún no existe en la base, Supabase responde con `"Could not find the 'X' column of 'Y' in the schema cache"` y rompe el endpoint. Si creas una columna nueva, agrega `NOTIFY pgrst, 'reload schema';` al final de la migración para que PostgREST la reconozca sin esperar al refresh automático.
- **Storage público y PII:** los buckets `tecnicos-documentos`, `tecnicos-fotos`, `evidencias-servicio` están todos públicos via `getPublicUrl()`. La cédula del técnico es accesible a quien tenga la URL — pendiente migrar a `createSignedUrl()` (TTL 1h) en `src/lib/uploadHelpers.ts`. **No publicar URLs de documentos en lugares públicos**.
- **RLS gap:** `solicitudes_servicio`, `tecnicos`, `notificaciones_whatsapp`, `evidencias_servicio`, `especialidades_tecnico` aún no tienen RLS habilitado. Toda la seguridad depende de tokens UUID en URLs y validación en API routes. Nunca expongas IDs sin token.
- **WhatsApp 24h window:** Free-form text messages require the customer to have messaged the business within the last 24 hours. Template messages can be sent anytime. Always use templates for proactive outreach.
- **Meta template names:** Must match exactly what's approved in Meta Business Manager. If deleted, there's a 4-week cooldown before reusing the same name — version the name instead (v1 → v2).
- **Cliente self-service token:** `solicitudes_servicio.cliente_token` es UUID durable, distinto de los demás tokens por acción (`horario_token`, `verificacion_paso_token`, `cotizacion.token`). Usado por `/servicio/{token}` y por las APIs `/api/solicitud/cancelar` + `/api/solicitud/reagendar`. Se genera al crear la solicitud (default DB + override server-side en `/api/solicitar`).
- **Link explícito al cliente para cancelar/reagendar** (2026-05-08): el componente `src/components/ui/GestionarServicioLink.tsx` se renderiza en TODOS los webviews del cliente (`/horario`, `/verificar-paso`, `/cotizacion`) con un copy que aplica a garantía y particular. Aplica a ambos flujos por igual. Se renderiza solo si la página tiene `cliente_token` en su data — ya cargado por todos los webviews relevantes. Mientras Meta no apruebe `gestionar_servicio_v1`, el link no llega por WhatsApp directo, pero sí está visible cada vez que el cliente abre un webview.
- **WhatsApp 24h y fotos del técnico:** las plantillas se pueden enviar en cualquier momento, pero los mensajes de tipo `image` (free-form) requieren que el cliente haya enviado un mensaje en las últimas 24h. Como el flujo customer-first no garantiza que el cliente escriba, las fotos del técnico se exponen también en `/servicio/{cliente_token}` para que la verificación de identidad no dependa del envío de imagen.

## WhatsApp Templates (Approved - Meta Business)

All templates use language `es` (Spanish). Phone: +57 313 4951164 (WABA ID: 2354953275016882).

> 📋 **Documento canónico**: `docs/WHATSAPP_TEMPLATES.md` lista todas las plantillas con sus parámetros y el **proceso obligatorio para crear/modificar**: (1) revisar dónde está documentada → (2) actualizarla en `scripts/upload-templates.mjs` + el doc → (3) subir a Meta vía script y esperar aprobación. **Antes de tocar cualquier mensaje, lee ese archivo.**
>
> La tabla resumen abajo es solo referencia rápida.

### Customer-first scheduling (NEW v2 2026-04-27)
| Template | Used In | Parameters | Purpose |
|----------|---------|------------|---------|
| `cliente_seleccion_horario_v1` | `enviarSeleccionHorarioCliente()` | cliente, equipo, horario_1, horario_2 + button(horario_token) | Cliente elige horario tras crear solicitud |
| `recordatorio_horario_v1` | cron `horario-recordatorio` | cliente, equipo + button(horario_token) | Recordatorio si cliente no confirmó tras 24h |
| `tecnico_asignado_cliente_v5` | `procesarAceptacion()` | cliente, tecnico, equipo, horario, telefono | REEMPLAZA v4 — agrega aviso de aprobar siguiente paso post-diagnóstico + link T&C |

### Post-diagnóstico (NEW v2 2026-04-27)
| Template | Used In | Parameters | Purpose |
|----------|---------|------------|---------|
| `esperando_repuesto_cliente_v1` | `enviarEsperandoRepuestoCliente()` | cliente, tecnico, equipo, sku, descripcion, tiempo_estimado | Aviso al cliente que se necesita repuesto (incluye SKU) |
| `repuesto_recibido_cliente_v1` | `enviarRepuestoRecibidoCliente()` | cliente, equipo, tecnico | Repuesto llegó, técnico contactará para reagendar |
| `finalizado_sin_reparacion_v1` | `enviarFinalizadoSinReparacion()` | cliente, equipo, motivo, tecnico | Equipo no es reparable (terminal) |

### Warranty Templates (existentes — sin cambios)
| Template | Used In | Parameters | Purpose |
|----------|---------|------------|---------|
| `nueva_solicitud_v3` | `notificarTecnicos()` | nombre, equipo, problema, ubicacion, horario, pago + button(token) | Notify technician of warranty request |
| `servicio_no_disponible_v3` | `procesarAceptacion()` | nombre | Tell late technician the service was taken |
| `servicio_asignado_tecnico_v3` | `procesarAceptacion()` | nombre, cliente, equipo, direccion, pago, telefono + button(portal_token) | Assignment details + client contact to technician |
| `registro_bienvenida_v3` | `notificarRegistroTecnico()` | nombre, ciudad, especialidad | Welcome message to new technician |
| `confirmar_servicio_v3` | `POST /api/completar-servicio` | cliente, tecnico, equipo + button(token) | Ask customer to confirm service completion |
| `tecnico_asignado_cliente_v4` | DEPRECATED | — | Reemplazada por v5 |

### Non-Warranty (Particular) Templates
| Template | Used In | Parameters | Purpose |
|----------|---------|------------|---------|
| `solicitud_particular_cliente_v1` | `POST /api/solicitar` | cliente, equipo, tarifa_diagnostico, anticipo | Confirm request + diagnostic fee to customer |
| `solicitud_particular_tecnico_v1` | `notificarTecnicos()` | nombre, equipo, problema, ubicacion, horario, pago_diagnostico + button(token) | Notify tech of non-warranty request |
| `tecnico_asignado_particular_v1` | `procesarAceptacion()` | cliente, tecnico, equipo, horario, telefono, tarifa, anticipo | Tell customer tech assigned + fee info |
| `cotizacion_cliente_v1` | `enviarCotizacionCliente()` | cliente, tecnico, equipo, diagnostico, mano_obra, repuestos, total + button(token) | Send repair quote for approval |
| `cotizacion_aprobada_tecnico_v1` | `notificarCotizacionAprobada()` | tecnico, cliente, equipo, total + button(portal_token) | Notify tech that quote was approved |

**Important:** Template names must match exactly what's approved in Meta Business Manager > WhatsApp Manager > Message Templates. If a template is renamed or re-created, update the name in code.

**Subir nuevas plantillas:** `node --env-file=.env.local scripts/upload-templates.mjs` (lista en `scripts/upload-templates.mjs`).

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `solicitudes_servicio` | Main service request | estado, es_garantia, horario_token, cliente_token, horario_confirmado, siguiente_paso, tyc_aceptados_at, tecnico_asignado_id, triaje_resultado (JSONB), cotizacion (JSONB), cancelado_at, cancelado_por, motivo_cancelacion, cancelado_tarde, reagendamientos_count |
| `notificaciones_whatsapp` | One record per tech notification | token, estado, timestamps |
| `tecnicos` | Technician profiles | portal_token, whatsapp, especialidades, verificado |
| `especialidades_tecnico` | Many-to-many: technicians ↔ skills | tecnico_id, especialidad |
| `evidencias_servicio` | Completion evidence | fotos, checklist, firma, oath_firma, gps_(diagnostico/completado/post_visita)_lat/lng, gps_flagged |
| `repuestos_pendientes` | Spare parts pending arrival | solicitud_id, sku, descripcion, costo, tiempo_estimado, estado |
| `gps_pings` | All GPS pings from technician browsers | solicitud_id, tecnico_id, lat, lng, fase, capturado_at |
| `solicitud_eventos` (NEW 2026-05-06) | Append-only audit log para cancelaciones, reagendamientos y cambios manuales de admin | solicitud_id, tipo, estado_previo, estado_nuevo, actor, motivo, payload (JSONB), ocurrido_at |

### Important JSONB Columns on solicitudes_servicio

**`triaje_resultado`** — Diagnóstico del técnico. Forma según flujo:
- Warranty (v2 2026-05-07): `{ diagnostico_tecnico, complejidad, codigo_complejidad, tarifa_mano_obra, bono_incentivo, total_servicio, productos_necesarios[], productos_recomendados[], codigo_falla, ... }`
- Non-warranty (v2 2026-05-07): `{ diagnostico_tecnico, complejidad, productos_necesarios[], productos_recomendados[], evidencias_diagnostico }`
- Legacy (pre-2026-05-07): `{ ..., requiere_repuestos, repuestos_detalle }` — el código maneja ambas formas con fallback.

**`cotizacion`** (non-warranty only, v2 2026-05-07):
```
{
  diagnostico_tecnico,
  productos_necesarios: [{ sku, descripcion, cantidad, precio_unitario?, subtotal? }],
  productos_recomendados: [{ nombre, descripcion }],
  pendiente_precio: boolean,           // true hasta que admin completa
  pricing_set_at?, pricing_set_by?,
  tiempo_entrega?,                     // admin lo fija
  mano_obra, repuestos, total,         // 0 hasta que admin completa
  repuestos_detalle?,                  // legacy back-compat
  evidencias_diagnostico, cotizado_at, aprobado_at?, rechazado_at?, comentario_rechazo?,
  token                                // para /cotizacion/{token}
}
```

## Supabase Architecture

### Cliente único + anon key
Todo el código (tanto API routes server-side como páginas client-side) usa **un único Supabase client** con `NEXT_PUBLIC_SUPABASE_ANON_KEY` declarado en `src/lib/supabase.ts`. Nunca crees clientes nuevos con `createClient()`. Para operaciones privilegiadas usaríamos un client con `service_role` — actualmente no está configurado, así que todas las operaciones pasan por las políticas RLS (donde existen).

### Migraciones — orden y aplicación
Todas las migraciones viven en `supabase/migrations/`. **No usamos el Supabase CLI**; se aplican manualmente en el SQL Editor del dashboard. Son idempotentes (`IF NOT EXISTS`, `DROP IF EXISTS` antes de `CREATE`).

| Migración | Lo que cambia |
|---|---|
| `add_solicitud_fields.sql` | Tabla `solicitudes_servicio` base |
| `add_whatsapp_fields.sql` | Tabla `notificaciones_whatsapp` |
| `add_verification_fields*.sql` | Verificación de técnicos |
| `fix_especialidades_table.sql` | Many-to-many `especialidades_tecnico` |
| `20260327_portal_evidencias.sql` | Bucket evidencias + portal_token |
| `20260427_customer_first_scheduling.sql` | Customer-first flow + `repuestos_pendientes` + `gps_pings` |
| `20260428_verificacion_paso.sql` | Verificación de siguiente paso post-diagnóstico |
| `20260506_cliente_self_service.sql` | `cliente_token` + cancelar/reagendar + `solicitud_eventos` |
| `20260507_admin_pricing_gate.sql` | Estado `pendiente_pricing` + `repuestos_pendientes.tiempo_estimado` nullable |
| `20260508_fix_cotizacion_column.sql` | **HOTFIX** — agrega columna `cotizacion JSONB` que estaba referenciada en código pero nunca creada |
| `20260508_fix_tecnicos_columns.sql` | **HOTFIX** — agrega `acepta_garantias` + `especialidad_principal` en `tecnicos` (mismo bug histórico que el de `cotizacion`) |

Detalle paso a paso de aplicación + verificación SQL en `supabase/migrations/README.md`.

### RLS por tabla (estado actual)

| Tabla | RLS | Acceso anon | Notas |
|---|---|---|---|
| `solicitudes_servicio` | ❌ | full (sin RLS) | Toda la seguridad depende de tokens UUID en URLs |
| `tecnicos` | ❌ | full | Idem — `portal_token` es el secret |
| `especialidades_tecnico` | ❌ | full | OK, datos no sensibles |
| `evidencias_servicio` | ❌ | full | Token `confirmacion_token` para cliente |
| `notificaciones_whatsapp` | ❌ | full | Riesgo: token único como secret; sin RLS un atacante podría aceptar masivamente |
| `repuestos_pendientes` | ✅ | `SELECT true` | service_role = ALL |
| `gps_pings` | ✅ | `INSERT true` | service_role = ALL; SELECT requiere service_role |
| `solicitud_eventos` | ✅ | `SELECT true`, `INSERT true` | service_role = ALL |

**Pendiente para producción seria** (ver `improvement-plan.md`): habilitar RLS en las 5 tablas con ❌ y políticas que filtren por `cliente_token`/`portal_token`.

### Storage buckets

| Bucket | Contenido | Acceso |
|---|---|---|
| `evidencias-servicio` | Fotos del diagnóstico y completación | **Público** (`getPublicUrl`) |
| `tecnicos-fotos` | Foto de perfil del técnico | **Público** |
| `tecnicos-documentos` | Documento de identidad del técnico (PII) | **Público** ⚠️ |

⚠️ **Riesgo conocido:** `tecnicos-documentos` es público — cualquiera con la URL puede descargar la cédula. **Pendiente migrar a signed URLs** (TTL 1h) usando `createSignedUrl()` en `src/lib/uploadHelpers.ts`. Mismo aplica con menor severidad a las otras dos.

Path pattern (todos):
- evidencias: `{solicitud_id}/{timestamp}_{index}.{ext}` o `{solicitud_id}/diagnostico_{timestamp}_{i}.{ext}`
- fotos/documentos técnicos: `{tecnico_id}/...`

### Patrones de query

#### Atomic update (anti race-condition) — **patrón modelo**
Cuando dos requests pueden mutar la misma fila, usa un `WHERE` adicional que actúe como guard. Ejemplo en `procesarAceptacion` (`src/lib/services/whatsapp.service.ts`):

```ts
// Solo el primer técnico que llega gana la asignación.
const { data: updated, error } = await supabase
  .from('solicitudes_servicio')
  .update({ tecnico_asignado_id: tecId, estado: 'asignada' })
  .eq('id', solicitudId)
  .is('tecnico_asignado_id', null)   // ← guard: solo si nadie ganó aún
  .select('*')
  .single()

if (error || !updated) {
  // alguien más ya ganó la carrera; tratar como "ya tomado"
}
```

Aplica también a transiciones de estado donde el actor anterior podría disparar dos veces. Patrón seguro:
```ts
.eq('estado', 'cotizacion_enviada')   // guard: solo si todavía está en este estado
```

**Lugares donde se necesita revisar este patrón** (audit 2026-05-07):
- `src/app/api/aprobar-cotizacion/route.ts:57-80` — hace dos UPDATEs separados sin guard, race posible.
- `src/app/api/confirmar-horario/route.ts:54` — agregar `.is('horario_confirmado_at', null)` al UPDATE.
- `src/app/api/cron/horario-recordatorio/route.ts:56,65` — UPDATE sin guard.

#### Filtros JSONB — **antipatrón a evitar**
**No** cargues toda la tabla y filtres en JS por un campo dentro de un JSONB. Hoy ocurren dos casos con `cotizacion->>'token'`:

```ts
// ❌ ANTIPATTERN — escala mal:
const { data: solicitudes } = await supabase
  .from('solicitudes_servicio')
  .select('*')
  .eq('estado', 'cotizacion_enviada')
const sol = solicitudes?.find(s => (s.cotizacion as { token?: string })?.token === token)
```

Lugares afectados (2026-05-07):
- `src/app/api/aprobar-cotizacion/route.ts:21-38`
- `src/app/cotizacion/[token]/page.tsx:58-67`

Fix preferido: **columna generada + índice único**:
```sql
ALTER TABLE solicitudes_servicio
  ADD COLUMN cotizacion_token uuid GENERATED ALWAYS AS ((cotizacion->>'token')::uuid) STORED;
CREATE UNIQUE INDEX idx_cotizacion_token ON solicitudes_servicio(cotizacion_token)
  WHERE cotizacion_token IS NOT NULL;
```
Luego: `.eq('cotizacion_token', token)`.

#### Tokens en columnas dedicadas
Usa columnas UUID dedicadas (con índice) para todo lo que se busque por token. Hoy: `horario_token`, `cliente_token`, `verificacion_paso_token`, `portal_token` (en `tecnicos`), `confirmacion_token` (en `evidencias_servicio`). Todos tienen índices o son `UNIQUE`.

### Tablas append-only — crecimiento y limpieza

Tres tablas crecen indefinidamente sin política de borrado:

| Tabla | Volumen estimado/solicitud | Proyección 5 años (5k sol/año) |
|---|---|---|
| `gps_pings` | 4–20 rows | ~100k–500k rows |
| `notificaciones_whatsapp` | 1–20 rows | ~25k–500k rows |
| `solicitud_eventos` | 5–20 rows | ~125k–500k rows |

A escala actual no es problema. Para producción de largo plazo, agregar un cron de limpieza:
```sql
DELETE FROM gps_pings WHERE capturado_at < NOW() - INTERVAL '2 years';
DELETE FROM notificaciones_whatsapp
  WHERE enviado_at < NOW() - INTERVAL '6 months'
  AND estado IN ('expirado', 'invalidado', 'error');
```

### CHECK constraints
Cada migración que agrega un nuevo `estado` reemplaza el constraint completo (`DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT`). El último vigente está en `20260507_admin_pricing_gate.sql:11-33` y enumera 20 estados — sincronizado 1:1 con `EstadoSolicitud` en `src/types/solicitud.ts`. Si agregas un nuevo estado **debes**:
1. Sumarlo al union type en `solicitud.ts`.
2. Crear nueva migración con el constraint completo (no `ADD ... IN (...)` parcial).
3. Agregar label/color en `src/lib/constants/estados.ts`.
4. Aplicar en Supabase **antes** del deploy.

Otros constraints relevantes: `siguiente_paso`, `verificacion_paso_decision`, `cancelado_por`, `repuestos_pendientes.estado`, `gps_pings.fase`, `solicitud_eventos.tipo`. Todos en sus respectivas migraciones.

### Auth admin

> 🔒 **Doc canónico**: `docs/SEGURIDAD.md` — mapa de auth por endpoint, modelo de tokens, backlog (RLS, rate limit, MFA).

**Frontend** — `src/app/admin/layout.tsx` llama `supabase.auth.getSession()`; sin sesión redirect a `/admin/login`. Login usa `supabase.auth.signInWithPassword`. Las cuentas admin se crean manualmente desde el dashboard de Supabase (no hay self-signup).

**API routes admin** — todas validan `Authorization: Bearer ${session.access_token}` con el helper compartido `verificarAdmin()` de `src/lib/auth/admin.ts`. Llamadas UI obtienen el token con `supabase.auth.getSession()` y lo envían en el header.

Endpoints con `verificarAdmin`: `/api/admin/export`, `/api/admin/reenviar-ultimo-mensaje`, `/api/carga-masiva` (POST + DELETE), `/api/whatsapp/notify`, `/api/cotizacion-precios`, `/api/repuesto-recibido`.

**Patrón nuevo** (cualquier endpoint admin futuro):
```ts
import { verificarAdmin } from '@/lib/auth/admin'

export async function POST(req: NextRequest) {
  const isAdmin = await verificarAdmin(req)
  if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // ...
}
```

**Gotcha histórico** (2026-05-12): `/api/cotizacion-precios` y `/api/repuesto-recibido` se crearon sin auth check (asumiendo "solo el admin tiene la URL"). Cualquiera con la URL podía fijar precios y disparar cotizaciones, o transicionar estados marcando repuestos. Fix en este commit. **Cuando agregues un endpoint nuevo bajo `/api/admin/` o que muta estado admin, agrega `verificarAdmin` ANTES de cualquier parse de body.**

### Auditoría / observabilidad
Todo cambio relevante (cancelación, reagendamiento, cambio manual de admin) escribe a `solicitud_eventos` (append-only). Pattern:
```ts
await supabase.from('solicitud_eventos').insert({
  solicitud_id, tipo, estado_previo, estado_nuevo,
  actor: 'cliente' | 'tecnico' | 'admin' | 'sistema',
  motivo, payload: { ... }
})
```
Implementación en `logEvento()` de `src/lib/services/whatsapp.service.ts`. Los inserts NUNCA bloquean el flujo principal — siempre dentro de try/catch.

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
