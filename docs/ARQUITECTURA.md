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
| `/api/admin/editar-solicitud` | POST | Admin: corrige manualmente `tipo_equipo`, horario, dirección, ciudad, zona. Auditado en `solicitud_eventos` con diff. | Both |
| `/api/admin/cambiar-estado` | POST | Admin: fuerza el `estado` de una solicitud cuando el flujo automático quedó atascado. Auditado en `solicitud_eventos` (`tipo='cambio_estado_admin'`). NO envía WhatsApp. | Both |
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
