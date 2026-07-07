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
| **WhatsApp templates** | `nueva_solicitud_v4`, `tecnico_asignado_cliente_v6` | `solicitud_particular_*`, `cotizacion_cliente_v3` |

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
                  → If all parts received: estado → repuesto_recibido
                                           + repuesto_recibido_at = now()
                                           + reprogramacion_token (uuid) generado
                  → WhatsApp repuesto_recibido_cliente_v2 to customer (con botón)
                  ⚠️ Bug fix 2026-05-29: antes saltaba directo a en_proceso con la
                     fecha vieja. Entre diagnóstico y llegada del repuesto pasan
                     semanas → la fecha original queda obsoleta.

4c. REPROGRAM     Customer clicks botón → /reprogramar-repuesto/{reprogramacion_token}
                  → Elige NUEVA fecha (tentativa) + franja
                  → POST /api/reprogramar-repuesto (UPDATE atómico WHERE estado=repuesto_recibido)
                  → estado: repuesto_recibido → en_proceso
                  → notificarTecnicoVisitaReprogramada → plantilla repuesto_recibido_tecnico_v1
                    (la fecha es TENTATIVA: el técnico la confirma según disponibilidad)

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

### NON-WARRANTY (Particular) Flow (es_garantia = false) — Auto-agendamiento (v3 2026-07-06)

```
1. REQUEST        Customer form (los 2 DateTimeSlotPicker emiten el formato
   + AUTO-AGENDA  canónico "lunes, 7 de julio · 8am-12pm" y OCULTAN las franjas
                  sin cupo vía GET /api/disponibilidad-horario; TyC se aceptan
                  en el mismo formulario)
                  → Supabase insert (estado: pendiente_horario, horario_token)
                  → /api/solicitar AUTO-CONFIRMA la opción 1 vía
                    confirmarHorarioSolicitud (fallback opción 2): valida cupo
                    por franja + mínimo mañana, estado → notificada,
                    horario_confirmado + fecha_visita_at + tyc_aceptados_at,
                    envía confirmación WhatsApp al cliente y notificarTecnicos()
                  → Solo si AMBAS opciones quedaron sin cupo (carrera):
                    fallback al flujo previo — plantilla
                    cliente_seleccion_horario_v2 (CTA → /horario/{token}) y la
                    solicitud queda en pendiente_horario

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
                  → enviarCotizacionCliente() sends cotizacion_cliente_v3 to customer
                    (includes cost breakdown + "Aprobar" button linking to /cotizacion/{token})

4. QUOTE          Customer clicks button → /cotizacion/{token}
   APPROVAL       → Sees: diagnosis, evidence photos, cost breakdown
                  → APPROVE: POST /api/aprobar-cotizacion {aprobado: true}
                    → estado: cotizacion_aprobada → en_proceso
                    → WhatsApp cotizacion_aprobada_tecnico_v3 to tech
                  → REJECT: POST /api/aprobar-cotizacion {aprobado: false, comentario}
                    → estado: cotizacion_rechazada
                    → WhatsApp rejection text to tech

5. COMPLETION     Same as warranty from here (photos, checklist, signature)
                  → estado: en_verificacion → completada or en_disputa
```

### Payment Model

All payments go through Baird Service. The customer NEVER pays the technician directly.

**Warranty:** The brand pays Baird a fixed tariff based on the complexity code. Baird pays the technician `totalServicio` (tariff + bonus).

**Non-warranty:** The customer pays Baird the quoted total. The diagnostic fee ($84,000 COP — `TARIFA_DIAGNOSTICO`) with 50% advance ($42,000 COP — `ANTICIPO_PORCENTAJE`) is collected before the technician visits; the technician receives a fixed $35,000 for the diagnostic visit (`PAGO_TECNICO_DIAGNOSTICO`, 2026-07-05). Constants in `src/types/solicitud.ts` and `src/lib/constants/tarifas/particular.ts`.

## Admin Pricing Gate (v2 2026-05-10) — solo Garantía + esperar_repuesto

A partir del 2026-05-10, el admin pricing gate aplica **solo** a un caso:

- **Garantía + `esperar_repuesto`**: el admin fija `tiempo_entrega` antes de notificar al cliente. El precio MABE ya está fijo por tarifario (Tipo D, ver `docs/TARIFAS.md`).

**Particular (v2)** ya **NO** pasa por admin gate. El técnico ingresa su `costoTecnico` (lo que quiere ganar: mano de obra + repuestos) en el formulario de diagnóstico, y `/api/diagnostico` calcula automáticamente el total al cliente con la fórmula `costoTecnico × 1.13 utilidad Baird × 1.19 IVA` (= × 1.3447, desde 2026-07-05). La cotización se envía al cliente inmediatamente. Ver `docs/TARIFAS.md` § "Particular".

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
                     │                                 │           │
                     │                                 │           ▼ admin marca repuesto recibido
                     │                                 │      repuesto_recibido
                     │                                 │           │ cliente elige nueva fecha (tentativa)
                     │                                 ▼◄──────────┘ /api/reprogramar-repuesto
                     │                          en_verificacion → completada | en_disputa
                     │                          ↘ finalizado_sin_reparacion (terminal)
                     │                          ↘ cancelada_cliente (terminal)
                     │                          ↘ reagendamiento_pendiente ↻ asignada
                     │                          ↘ cancelada (cliente desde /servicio, terminal)
                     │                          ↘ no_show_cliente (terminal)
                     └─→ sin_agendar (timeout 24h+12h, terminal)

NON-WARRANTY (v3 2026-07-06 — /api/solicitar auto-confirma la opción 1 del
formulario, así que pendiente_horario dura milisegundos salvo que ambas
opciones estén sin cupo, donde cae al flujo de link /horario como antes):
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

**Escape hatch del admin** — `POST /api/admin/cambiar-estado` (UI en `/admin/solicitudes/[id]` → "Cambiar estado manualmente") permite forzar cualquier estado de `ESTADOS_VALIDOS` cuando el flujo automático quedó atascado (p. ej. el técnico o el cliente perdió señal y la transición nunca se disparó). **No** valida la transición contra la state machine ni envía WhatsApp al cliente/técnico — solo mueve el estado en BD con guard de concurrencia (`.eq('estado', estadoActual)`) y audita en `solicitud_eventos` (`tipo='cambio_estado_admin'`). **Sí** dispara `notificarCambioEstado` (notificación a supervisores). `ESTADOS_VALIDOS` (en `src/lib/constants/estados.ts`) debe coincidir con el CHECK constraint `solicitudes_servicio_estado_check`.

**Ajuste de valor al cliente (solo particular)** — `POST /api/admin/actualizar-valor` (UI en `/admin/solicitudes/[id]` → "Actualizar valor del servicio", visible solo si `es_garantia=false` y la solicitud ya tiene `cotizacion.token`) deja al admin reajustar el precio que paga el **cliente**. Sobreescribe `cotizacion.total` con el nuevo valor, limpia el desglose (`mano_obra/repuestos → 0` para mostrar un total único), guarda `valor_anterior`/`valor_actualizado_at`/`valor_actualizado_motivo` para auditoría, **reabre la aprobación** moviendo el estado a `cotizacion_enviada` (el cliente re-confirma en `/cotizacion/{token}`), audita en `solicitud_eventos` (`tipo='cambio_estado_admin'`, `payload` con valor anterior/nuevo), dispara `notificarCambioEstado` y envía al cliente la plantilla `valor_actualizado_cliente_v1`. Bloqueado en estados terminales y en garantía (ahí paga la marca). **No toca `pago_tecnico`** — el pago al técnico se fijó en el diagnóstico; esto ajusta el precio al cliente / margen Baird. Guard de concurrencia `.eq('estado', estadoPrevio)`.

State labels and CSS classes are defined in `src/lib/constants/estados.ts`.

## Notificación a supervisores en cada cambio de estado (v1 2026-05-29)

Toda transición de `estado` puede notificar por WhatsApp a supervisores internos (tabla `supervisores`, CRUD en `/admin/supervisores`). El helper `notificarCambioEstado(solicitudId, estadoPrevio, estadoNuevo)` (en `whatsapp.service.ts`) se invoca en **cada función/route que muta `estado`** (el *transition owner*, no en los helpers de envío compartidos que re-setean estado de forma idempotente — eso causaría doble disparo).

- **Filtrado por supervisor:** `ambito` (todos/garantia/particular vía `es_garantia`), `marca` (NULL=todas, comparada con `normalizeForMatch`), `estados` (text[], NULL/[]=todos). Ej.: un supervisor general (ámbito `todos`, sin marca) ve todo; otro con ámbito `garantia` + marca `MABE` solo ve garantías MABE.
- **Nunca rompe el flujo:** el helper atrapa y loguea todos los errores; corta si `estadoPrevio === estadoNuevo`. Los call-sites hacen `await` sin try/catch.
- **NO se dispara en la creación** de solicitudes (`/api/solicitar`, `/api/admin/carga-masiva`) — son inserts sin estado previo. Decisión de producto abierta: ver plan de despliegue en `supabase/migrations/README.md`.
- Plantilla: `supervisor_cambio_estado_v1` (ver `docs/WHATSAPP_TEMPLATES.md`). Lista completa de call-sites en `docs/ARQUITECTURA.md`.

## Gap conocido: segunda visita sin repuesto (verificado 2026-06-02)

La **segunda visita CON repuesto** está completa (ver bloque "4b PARTS RCV" / "4c REPROGRAM" arriba: `esperar_repuesto → … → repuesto_recibido → /reprogramar-repuesto → en_proceso`, garantía y particular).

**Lo que NO existe:** un camino para agendar una segunda visita cuando la reparación necesita otro día pero **no** requiere repuesto. El diagnóstico solo tiene 4 `siguiente_paso` (`reparar`, `esperar_repuesto`, `no_reparable`, `negativa_cliente`); `reparar` cierra en la misma visita (`→ en_proceso`) y `esperar_repuesto` **exige SKU** (`diagnostico/route.ts:91`). Workaround actual: escape-hatch admin (`/api/admin/cambiar-estado`) + WhatsApp libre.

Opciones para cerrar el gap (A: nuevo `siguiente_paso = agendar_segunda_visita` + estado `pendiente_segunda_visita`; B: generalizar la máquina de reprogramación; C: disparar desde el portal a mitad de reparación; D: solo admin) → ver **[`docs/mejoras-futuras/segunda-visita/README.md`](mejoras-futuras/segunda-visita/README.md)**.
