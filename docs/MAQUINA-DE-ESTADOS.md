# Máquina de estados y flujos — Baird Service

Doc canónico de cómo se parte el sistema en dos flujos (`es_garantia`), el admin pricing gate, el self-service del cliente y la state machine completa de `solicitudes_servicio`.

> Para el detalle narrativo paso-a-paso de cada flujo con plantillas WhatsApp en contexto, ver `docs/FLOWS.md`.

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
| **WhatsApp templates** | `nueva_solicitud_v4`, `tecnico_asignado_cliente_v6` | `solicitud_particular_*`, `cotizacion_cliente_v2` |

### WARRANTY Flow (es_garantia = true) — Customer-first scheduling (v2 2026-04-27)

```
1. REQUEST        Customer form (or bulk Excel upload)
                  → Supabase insert (estado: pendiente_horario, horario_token: uuid)
                  → WhatsApp cliente_seleccion_horario_v2 (CTA → /horario/{token})
                  → NO tech notification yet

2. SCHEDULE       Customer opens /horario/{token}, picks 1 of 2 horarios
   CONFIRMATION   → Reads T&C + signs acceptance checkbox
                  → POST /api/confirmar-horario { token, opcion: 1|2 }
                  → estado: notificada, tyc_aceptados_at, tyc_version, horario_confirmado
                  → notificarTecnicos() sends nueva_solicitud_v4 to matching techs
                  → If timeout 24h+12h: state → sin_agendar (cron horario-recordatorio)

3. ACCEPTANCE     Tech clicks "Aceptar" in WhatsApp
                  → GET /aceptar/{token} → atomic UPDATE (first wins)
                  → estado: asignada
                  → WhatsApp servicio_asignado_tecnico_v4 to tech
                  → WhatsApp tecnico_asignado_cliente_v6 to customer (T&C link)

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
                  → WhatsApp confirmar_servicio_v4 to customer

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
                  → notificarTecnicos() sends solicitud_particular_tecnico_v2 to matching techs
                  → estado: notificada

2. ACCEPTANCE     Technician clicks "Aceptar" button in WhatsApp
                  → GET /aceptar/{token} → atomic UPDATE (first wins)
                  → estado: diagnostico_pendiente    ← DIFFERENT from warranty
                  → WhatsApp servicio_asignado_tecnico_v4 to tech
                  → WhatsApp tecnico_asignado_particular_v1 to customer
                    (includes tech info + diagnostic fee + advance payment info)

3. DIAGNOSIS      Technician opens portal → /tecnico/{token}/diagnostico/{id}
   + QUOTE        → Fills diagnostic + quote form (mano de obra + repuestos)
                  → POST /api/diagnostico (non-warranty branch)
                  → Generates cotizacion with unique approval token (UUID)
                  → estado: cotizacion_enviada
                  → enviarCotizacionCliente() sends cotizacion_cliente_v2 to customer
                    (includes cost breakdown + "Aprobar" button linking to /cotizacion/{token})

4. QUOTE          Customer clicks button → /cotizacion/{token}
   APPROVAL       → Sees: diagnosis, evidence photos, cost breakdown
                  → APPROVE: POST /api/aprobar-cotizacion {aprobado: true}
                    → estado: cotizacion_aprobada → en_proceso
                    → WhatsApp cotizacion_aprobada_tecnico_v2 to tech
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
                     │                          ↘ no_show_cliente (terminal)
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
                     │                                              ↘ no_show_cliente (terminal)
                     └─→ sin_agendar
```

**Estados terminales** (set en `ESTADOS_TERMINALES` en `src/lib/constants/estados.ts`):
`sin_agendar`, `finalizado_sin_reparacion`, `cancelada_cliente`, `no_show_cliente`, `cancelada`, `completada`, `cotizacion_rechazada`.

**Estado transitorio `reagendamiento_pendiente`** — usado solo si el cliente reagenda mientras el técnico ya estaba asignado; vuelve inmediatamente a `asignada`/`diagnostico_pendiente` con `horario_confirmado` actualizado.

**Estados desde los que el cliente puede cancelar/reagendar** están definidos en `src/types/solicitud.ts` como `ESTADOS_CANCELABLES_POR_CLIENTE` y `ESTADOS_REAGENDABLES_POR_CLIENTE`. Tope: `MAX_REAGENDAMIENTOS_CLIENTE = 2` por solicitud.

**Escape hatch del admin** — `POST /api/admin/cambiar-estado` (UI en `/admin/solicitudes/[id]` → "Cambiar estado manualmente") permite forzar cualquier estado de `ESTADOS_VALIDOS` cuando el flujo automático quedó atascado (p. ej. el técnico o el cliente perdió señal y la transición nunca se disparó). **No** valida la transición contra la state machine ni envía WhatsApp — solo mueve el estado en BD con guard de concurrencia (`.eq('estado', estadoActual)`) y audita en `solicitud_eventos` (`tipo='cambio_estado_admin'`). `ESTADOS_VALIDOS` (en `src/lib/constants/estados.ts`) debe coincidir con el CHECK constraint `solicitudes_servicio_estado_check`.

State labels and CSS classes are defined in `src/lib/constants/estados.ts`.
