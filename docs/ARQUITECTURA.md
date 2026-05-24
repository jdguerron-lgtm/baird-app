# Arquitectura — Baird Service

Mapa de archivos, rutas, páginas y funciones de servicio del proyecto. Acá vive el árbol de directorios completo, las funciones de `whatsapp.service.ts`, las API routes, y las páginas customer/technician/admin. Para los flujos end-to-end y la máquina de estados, ver `docs/MAQUINA-DE-ESTADOS.md` y `docs/FLOWS.md`.

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

## Key Service Functions (whatsapp.service.ts)

| Function | Purpose | Branches on es_garantia? |
|----------|---------|--------------------------|
| `enviarSeleccionHorarioCliente(solicitudId)` | Plantilla cliente_seleccion_horario_v2 al crear solicitud | No |
| `enviarRecordatorioHorario(solicitudId)` | Plantilla recordatorio_horario_v2 (cron 24h) | No |
| `notificarTecnicos(solicitudId)` | Send service request to matching technicians | Yes |
| `procesarAceptacion(token)` | Atomic acceptance (first tech wins) | Yes |
| `enviarEsperandoRepuestoCliente(...)` | Plantilla esperando_repuesto_cliente_v1 con SKU | No |
| `enviarRepuestoRecibidoCliente(solicitudId)` | Plantilla repuesto_recibido_cliente_v1 | No |
| `enviarFinalizadoSinReparacion(solicitudId, motivo)` | Plantilla finalizado_sin_reparacion_v1 | No |
| `enviarCotizacionCliente(solicitudId)` | Send quote to customer via WhatsApp | No — non-warranty only |
| `notificarCotizacionAprobada(solicitudId)` | Notify tech that quote was approved | No — non-warranty only |
| `procesarCancelacionCliente(token, motivo)` | Cancela la solicitud desde /servicio portal — actualiza estado, invalida notifs, avisa al cliente y al técnico | Sí (audit en `solicitud_eventos`) |
| `procesarReagendamientoCliente(token, horario, motivo?)` | Reagenda manteniendo técnico asignado si lo hay; incrementa `reagendamientos_count` (max 2) | Sí (audit en `solicitud_eventos`) |
| `enviarVerificacionPasoCliente(solicitudId)` | Plantilla `verificar_siguiente_paso_v2` post-diagnóstico garantía. Genera `verificacion_paso_token` y disparra link `/verificar-paso/{token}`. | No — garantía únicamente |
| `notificarRegistroTecnico(tecnicoId)` | Plantilla `registro_bienvenida_v3` tras registro del técnico, con link al portal. Disparrada por `/api/notificar-registro`. | N/A |
| `describirSiguientePaso(siguientePaso, contexto)` | Helper puro: traduce el código de `siguiente_paso` (`reparar`, `esperar_repuesto`, `no_reparable`, `negativa_cliente`) al texto humano que ve el cliente. | N/A |
| `enviarPlantilla(telefono, nombre, lang, components)` | Primitiva: arma el payload Meta y llama Graph API. Devuelve `{ sent, filtered? }` — `filtered=true` significa que cayó en el `BAIRD_TEST_PHONE_WHITELIST`. **Cualquier llamada que cuente "notificados" debe inspeccionar `sent`, no asumir success por promesa fulfilled.** | N/A |
| `enviarMensajeTexto(telefono, texto)` | Send free-form text message (requiere ventana 24h del cliente). | N/A |
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
| `/api/admin/editar-solicitud` | POST | Admin: corrige manualmente `tipo_equipo`, horario, dirección, ciudad, zona. Auditado en `solicitud_eventos` con diff. | Both |
| `/api/admin/cambiar-estado` | POST | Admin: fuerza el `estado` de una solicitud cuando el flujo automático quedó atascado. Auditado en `solicitud_eventos` (`tipo='cambio_estado_admin'`). NO envía WhatsApp. | Both |
| `/api/admin/reenviar-ultimo-mensaje` | POST | Admin: re-dispara la plantilla WhatsApp correspondiente al estado actual de la solicitud (útil si el cliente o el técnico borró el mensaje). | Both |
| `/api/whatsapp/accept` | GET | Aceptación 1-click del técnico desde la plantilla WhatsApp. Token único por notificación. Llama `procesarAceptacion()` — atomic update primer-técnico-gana. Redirige al portal del técnico tras aceptar. | Both |
| `/api/whatsapp/notify` | POST | Admin re-notifica técnicos para una solicitud (volver a disparrar el broadcast a técnicos compatibles). Usa `notificarTecnicos()`. | Both |
| `/api/notificar-registro` | POST | Post-registro del técnico: envía `registro_bienvenida_v3` con link al portal. | N/A |
| `/api/log-error` | POST | Telemetría fire-and-forget de errores de conexión del cliente. Inserta en `connection_errors` y loguea a stderr con prefijo `[ConnectionError]`. Siempre responde 200. | N/A |
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
| **Eliminación de datos** | `/eliminacion-datos` | Página pública con formulario / instrucciones para que el cliente solicite la eliminación de sus datos (Ley 1581 de 2012). |

## Technician-Facing Pages

| Page | URL | Purpose |
|------|-----|---------|
| **Registro** | `/registro` | Onboarding del técnico: formulario con datos personales, foto, documento, especialidades, ciudad. Inserta en `tecnicos` con `estado_verificacion='pendiente'`. Al final llama `/api/notificar-registro` para mandar `registro_bienvenida_v3`. |
| Accept service | `/aceptar/{token}` | 1-click acceptance from WhatsApp notification (la URL del botón apunta a `/api/whatsapp/accept?token=...` que redirige acá tras procesar) |
| Portal (service list) | `/tecnico/{token}` | View assigned services and history. Auth: `portal_token` UUID en la URL. |
| Diagnosis form | `/tecnico/{token}/diagnostico/{id}` | Oath modal + diagnosis + 4 next-step options + GPS. Fotos se comprimen client-side (`compressImageIfNeeded`) antes de subirlas en paralelo. |
| Completion form | `/tecnico/{token}/completar/{id}` | Upload photos, checklist, signature, GPS. Misma compresión + paralelización que `diagnostico`. |

## Admin Pages

Todas requieren login Supabase Auth en `/admin/login` y validación server-side con `verificarAdmin()` en cada endpoint del que dependen. Ver `docs/SEGURIDAD.md` § 2.

| Page | URL | Purpose |
|------|-----|---------|
| Login | `/admin/login` | Login Supabase Auth (email + password). La sesión queda en `localStorage`; OJO: misma sesión se filtra a portales con token en el mismo browser — ver gotcha en `docs/GOTCHAS.md`. |
| Dashboard | `/admin` | KPIs and recent activity |
| Solicitudes | `/admin/solicitudes` | Service requests list/detail |
| Solicitud detalle | `/admin/solicitudes/[id]` | Detalle + edit + reenviar último mensaje + **cambiar estado manualmente** (escape hatch, ver `docs/MAQUINA-DE-ESTADOS.md`). |
| Técnicos | `/admin/tecnicos` | Listado de técnicos con estado de verificación |
| Técnico detalle | `/admin/tecnicos/[id]` | Detalle del técnico: documento, foto, especialidades, historial de servicios, toggle de verificación. |
| **Repuestos** | `/admin/repuestos` | Pending parts — mark as received |
| **Cotizaciones pendientes** | `/admin/cotizaciones-pendientes` | **Admin pricing gate** — solicitudes en estado `pendiente_pricing` esperando que el admin fije precios + tiempo de entrega antes de notificar al cliente. UI dispara `/api/cotizacion-precios`. |
| **Alertas GPS** | `/admin/gps-alertas` | Silent flagged services (post-visit GPS within 100m) |
| **Errores de conexión** | `/admin/errores` | Observabilidad: panel de `connection_errors` (telemetría enviada por el cliente vía `/api/log-error`). Filtros por rango temporal (1h/24h/7d/30d), tipo de error y actor (técnico/cliente/admin). |
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

## Utilidades transversales

### `querySupabase()` — retry con backoff (`src/lib/utils/retry.ts`)

Wrapper alrededor de cualquier query de Supabase del lado cliente. Reintenta con backoff exponencial cuando detecta fallas transitorias (red caída, timeouts, 5xx). Reporta a `/api/log-error` cada retry y falla final.

```ts
const { data, error } = await querySupabase(() =>
  supabase.from('solicitudes_servicio').select('...').eq('id', id).single()
)
```

**Cuándo usarlo:** queries client-side en páginas (portal técnico, customer pages) donde una red flaky puede dejar al usuario sin datos. **No** es necesario en API routes server-side (Vercel ya tiene buena conectividad a Supabase).

**Por qué importa:** sin este wrapper, una sola falla de red en `/tecnico/[token]` mostraba "Enlace inválido" cuando realmente era un blip momentáneo. Es la razón por la que el portal del técnico hoy se autorecupera.

### `compressImageIfNeeded()` — compresión client-side (`src/lib/utils/media.ts`)

Convierte fotos del teléfono (típicamente HEIC iPhone 5 MB, JPEG Android 3 MB) a JPEG ≤ 2560px, calidad 0.9 → resultado ~700 KB. Las páginas `diagnostico` y `completar` la llaman antes de `supabase.storage.upload`, en paralelo con `Promise.all`.

**Efectos:**
- 5-10× más rápido en 4G colombiano.
- HEIC → JPEG arregla la previa en el panel admin (Chrome/Firefox no decodifican HEIC).
- No comprime videos (requeriría ffmpeg.wasm — backlog).

`inferExtension(file)` deriva la extensión correcta de `file.type` (no del nombre, porque `capture="environment"` a veces devuelve nombres genéricos).

## Observabilidad

Pipeline de telemetría de errores de conexión, agregado en `d0d0b8a`:

```
querySupabase / page-load handler
        │
        ▼ on error
  trackError({ error_type, error_message, actor, ... })
        │
        ▼ fetch POST
   /api/log-error  ──► tabla `connection_errors` + console.error('[ConnectionError]', ...)
        │                          │
        │                          ▼ Vercel Runtime Logs (grepeable)
        │
        ▼
  /admin/errores (UI con filtros temporales/tipo/actor)
```

**`connection_errors` columnas clave:** `url`, `error_type` (`query_retry|query_failed|page_load_error|fetch_failed|unknown`), `error_message`, `attempt_number`, `network_effective_type` (`'4g'|'3g'|'2g'|'slow-2g'`), `network_rtt`, `online`, `actor`, `ip`.

**Diseño fire-and-forget:** `/api/log-error` SIEMPRE retorna 200 (incluso si el insert falla). Telemetría no debe romper la UX de un usuario que ya está sufriendo un error de red.
