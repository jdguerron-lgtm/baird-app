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
│   │   ├── agenda/             # Calendario semanal: servicios Baird + compromisos externos por día/franja
│   │   ├── diagnostico/[id]/   # Diagnosis form (warranty tariff OR particular quote)
│   │   └── completar/[id]/     # Service completion form (photos, checklist, signature)
│   ├── confirmar/[token]/      # Customer satisfaction confirmation page
│   ├── cotizacion/[token]/     # Customer quote approval page (non-warranty only)
│   ├── servicio/[token]/       # Customer self-service portal (cancel/reschedule)
│   ├── horario/[token]/        # Customer schedule selection (after creating request)
│   ├── verificar-paso/[token]/ # Customer approval of next-step (post-diagnosis, warranty)
│   ├── reprogramar-repuesto/[token]/ # Customer picks new tentative date after part arrived
│   ├── terminos/               # Public Terms & Conditions page (v2026.10.09, dictámenes CJI)
│   ├── politica-privacidad/    # Política de privacidad y tratamiento de datos (v2026.10.09)
│   ├── contrato-tecnico/       # Contrato de prestación de servicios para técnicos — imprimible, se firma en físico
│   ├── admin/                  # Admin panel (auth-guarded)
│   │   ├── solicitudes/        # Solicitudes list + detail (with evidence view) + calendario de agenda por franja
│   │   ├── tecnicos/           # Technician management
│   │   ├── repuestos/          # Pending parts dashboard
│   │   ├── cotizaciones-pendientes/ # Admin pricing gate (estado pendiente_pricing)
│   │   ├── gps-alertas/        # Silent flagged services (post-visit GPS within 100m)
│   │   ├── mapa/               # Mapa Leaflet de servicios geolocalizados
│   │   ├── errores/            # Panel de connection_errors (observabilidad)
│   │   ├── carga-masiva/       # Bulk Excel upload for warranty services
│   │   ├── garantias/          # Warranty dashboard (summary by brand/equipment)
│   │   ├── supervisores/       # CRUD supervisores (WhatsApp on state changes)
│   │   ├── guia/               # Guía de operación (RSC: lee docs/GUIA-OPERACION-LOGISTICA.md con fs → GuiaViewer)
│   │   └── test/               # Página interna de testing/debug (no linkeada)
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
│       ├── repuesto-recibido/      # Admin marks parts arrived → estado repuesto_recibido
│       ├── reprogramar-repuesto/   # Public (token): customer picks new tentative date → en_proceso
│       ├── gps-ping/               # Tech browser GPS ping by phase
│       ├── cron/                   # Scheduled jobs (horario reminder, GPS followup, repuesto reminder)
│       ├── triaje/                 # Gemini AI diagnosis (disabled)
│       ├── health/                 # Health check
│       ├── log-error/              # Client connection-error telemetry (fire-and-forget)
│       ├── test-whatsapp/          # GET: diagnóstico de config WhatsApp (token/phone-id/whitelist)
│       ├── dapta/webhook/          # Webhook POST-CALL de la 2ª línea de voz (ver docs/DAPTA.md)
│       ├── carga-masiva/           # Bulk Excel upload processing (POST + DELETE)
│       ├── admin/                  # Endpoints admin (export, editar/cambiar-estado, notas, supervisores, etc.)
│       └── whatsapp/               # notify (admin-only), accept, webhook
├── components/ui/              # Reusable UI: Button, InputField, PhoneInput, SelectorFoto (cámara en vivo + galería), CarnetTecnico (carnet digital, 2026-10-10), etc.
├── components/icons/
│   ├── index.tsx               # Iconos genéricos (UserIcon, PhoneIcon, ...)
│   └── equipos.tsx             # Siluetas de línea blanca — reemplazan los emoji en home y /servicios
├── components/MenuMovil.tsx    # Nav hamburguesa <640px de la home (los links del header están en `hidden sm:*`)
├── hooks/                      # useDebounce, useSolicitudForm, useTriaje
├── lib/
│   ├── supabase.ts             # Supabase client singleton — always import from here
│   ├── analytics/
│   │   ├── googleAds.ts        # trackLeadConversion() — conversión de Ads del form de /solicitar
│   │   ├── googleAnalytics.ts  # trackGaLead() — evento GA4 `generate_lead`
│   │   └── experimentoHero.ts  # A/B del hero móvil; la variante viaja en `generate_lead`
│   ├── constants/
│   │   ├── especialidades.ts   # TIPO_A_ESPECIALIDAD mapping
│   │   ├── estados.ts          # ESTADO_ESTILOS, ESTADO_LABELS (styling + labels per state)
│   │   ├── servicios-seo.ts    # Contenido de las 7 landings /servicios/[slug]
│   │   └── equipos-home.ts     # Los 8 equipos de la home → icono + slug de su landing (valida slugs vs SERVICIOS_SEO)
│   ├── services/
│   │   ├── whatsapp.service.ts # All WhatsApp logic (notify, accept, quote, confirm)
│   │   ├── solicitud.service.ts
│   │   ├── agenda.service.ts   # Cupo por franja + validación de horarios agendables
│   │   ├── tecnicos-elegibles.service.ts # Técnicos elegibles como "técnico de preferencia" (selector de /solicitar + validación server-side)
│   │   ├── transiciones.service.ts # Transiciones de estado compartidas (WhatsApp + voz IA)
│   │   ├── dapta.service.ts    # 2ª línea de voz IA — iniciarLlamada() con guardas (ver docs/DAPTA.md)
│   │   └── geocoding.service.ts # Geocoding Google Maps para /admin/mapa
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
| `enviarEsperandoRepuestoTecnico(solicitudId)` | Plantilla `esperando_repuesto_tecnico_v1`: al aprobarse `esperar_repuesto` el técnico recibe los datos de gestión del repuesto ante la marca — No. de garantía (`numero_serie_factura`), SKU(s) de `repuestos_pendientes` y dirección del cliente. Disparada por `/api/verificar-paso`. | Sí — **solo garantía** (guard interno; en particular el técnico ya recibe `cotizacion_aprobada_tecnico_v2`) |
| `enviarRepuestoRecibidoCliente(solicitudId)` | Plantilla `repuesto_recibido_cliente_v2` (con botón → `/reprogramar-repuesto/{token}`). Auto-genera `reprogramacion_token` si falta. El cliente elige nueva fecha tentativa. | No |
| `enviarRepuestoLlegadoTecnico(solicitudId)` | Plantilla `repuesto_llegado_tecnico_v1`: avisa al técnico que el repuesto ya fue entregado al cliente, apenas lo marca recibido el admin (`/api/repuesto-recibido`) o el supervisor (`/api/supervisor/repuesto-entregado`). Informativo — la fecha tentativa llega después vía `notificarTecnicoVisitaReprogramada`. | No — ambos flujos |
| `notificarTecnicoVisitaReprogramada(solicitudId, horario)` | Avisa al técnico la nueva fecha tentativa elegida por el cliente tras el repuesto. Plantilla `repuesto_recibido_tecnico_v1` (NO texto libre — la ventana 24h del técnico suele estar cerrada tras semanas de espera). | No |
| `notificarCambioEstado(solicitudId, estadoPrevio, estadoNuevo, opciones?)` | (1) **Registra la transición en el historial**: inserta evento `cambio_estado` en `solicitud_eventos` con actor inferido por `inferirActorTransicion(previo, nuevo)` — cliente/tecnico/admin/sistema según el endpoint dueño de la transición (migración `20260612_evento_cambio_estado.sql`; lo muestra "Historial de estados" en `/admin/solicitudes/[id]`). `opciones.registrarEvento:false` lo omite — lo pasan los call-sites que ya insertan su propio evento (cancelacion, reagendamiento, reagendamiento_confirmado, cambio_estado_admin). (2) Notifica por WhatsApp a supervisores activos (tabla `supervisores`) filtrados por ámbito/marca/estados. Plantilla `supervisor_cambio_estado_v1`; para eventos de repuesto en **garantía** (`estadoNuevo` ∈ esperando_repuesto/repuesto_recibido) usa `supervisor_repuesto_garantia_v1` (No. garantía + SKU + dirección) con fallback a la genérica. **Nunca lanza** (atrapa+loguea); corta si previo===nuevo. Ver call-sites abajo. | Sí — flujo repuesto garantía usa plantilla dedicada; además filtra por `ambito` |
| `enviarFinalizadoSinReparacion(solicitudId, motivo)` | Plantilla finalizado_sin_reparacion_v1 | No |
| `enviarCotizacionCliente(solicitudId)` | Send quote to customer via WhatsApp | No — non-warranty only |
| `notificarCotizacionAprobada(solicitudId)` | Notify tech that quote was approved | No — non-warranty only |
| `enviarValorActualizadoCliente(solicitudId)` | Plantilla `valor_actualizado_cliente_v1`: avisa al cliente que el admin reajustó el valor del servicio (botón → `/cotizacion/{token}` para re-aprobar). **Solo envía**, no muta estado (eso lo hace `/api/admin/actualizar-valor`). Guarda `{ok, error?}`. | No — particular únicamente |
| `enviarBienvenidaSupervisor(supervisor)` | Plantilla `supervisor_bienvenida_v1`: da la bienvenida a un supervisor recién creado y le confirma su alcance. El alcance lo describe `describirAmbitoSupervisor(ambito, marca, estados)` en lenguaje natural. Best-effort (no lanza). Disparada por `POST /api/admin/supervisores` si el supervisor queda activo. | Lee `ambito` para describir el alcance |
| `procesarCancelacionCliente(token, motivo)` | Cancela la solicitud desde /servicio portal — actualiza estado, invalida notifs, avisa al cliente y al técnico | Sí (audit en `solicitud_eventos`) |
| `procesarReagendamientoCliente(token, horario, motivo?)` | Reagenda manteniendo técnico asignado si lo hay; incrementa `reagendamientos_count` (max 2) | Sí (audit en `solicitud_eventos`) |
| `enviarVerificacionPasoCliente(solicitudId)` | Plantilla `verificar_siguiente_paso_v2` post-diagnóstico garantía. Genera `verificacion_paso_token` y disparra link `/verificar-paso/{token}`. | No — garantía únicamente |
| `notificarRegistroTecnico(tecnicoId)` | Plantilla `registro_bienvenida_v3` tras registro del técnico, con link al portal. Disparrada por `/api/notificar-registro`. | N/A |
| `describirSiguientePaso(siguientePaso, contexto)` | Helper puro: traduce el código de `siguiente_paso` (`reparar`, `esperar_repuesto`, `no_reparable`, `negativa_cliente`) al texto humano que ve el cliente. | N/A |
| `enviarPlantilla(telefono, nombre, lang, components)` | Primitiva: arma el payload Meta y llama Graph API. Devuelve `{ sent, filtered? }` — `filtered=true` significa que cayó en el `BAIRD_TEST_PHONE_WHITELIST`. **Cualquier llamada que cuente "notificados" debe inspeccionar `sent`, no asumir success por promesa fulfilled.** | N/A |
| `enviarHorarioConfirmadoCliente(solicitudId, horario)` | Plantilla `horario_confirmado_cliente_v1` tras confirmar horario, con botón "Gestionar servicio" → `/servicio/{cliente_token}` (cierra gaps H1 y 9). Disparada por `confirmarHorarioSolicitud` (transiciones.service). | No |
| `enviarSolicitudExpiradaCliente(solicitudId)` | Plantilla `solicitud_expirada_cliente_v1` al transicionar a `sin_agendar` (cron horario-recordatorio). Cierra gap 1. | No |
| `enviarPasoAprobadoCliente(solicitudId, accion, detalle)` / `enviarPasoRechazadoCliente(solicitudId)` | Confirmación al cliente de su decisión en `/verificar-paso` (gaps 3–5). Fallback a texto libre en el caller. | No — garantía (verificar-paso) |
| `enviarPasoResueltoTecnico(solicitudId, decision, detalle)` | Plantilla `paso_resuelto_tecnico_v1` al técnico con la decisión del cliente (APROBÓ/RECHAZÓ) + botón portal (gap 6). Fallback a texto libre en el caller. | No — garantía (verificar-paso) |
| `enviarServicioConfirmadoTecnico(solicitudId, tecnicoId, calificacion)` | Plantilla `servicio_confirmado_tecnico_v1` al cerrar con satisfacción (gap 8); la calificación se parsea del comentario. Fallback a texto libre. Disparada por `confirmarServicioCliente`. | No |
| `enviarMensajeTexto(telefono, texto)` | Send free-form text message (requiere ventana 24h del cliente). | N/A |
| `verificarFirmaWebhook(payload, signature)` | HMAC verification for Meta webhook | N/A |

**Test gate:** todas las primitivas (`enviarPlantilla`, `enviarMensajeTexto`, `enviarImagen`, `enviarMensajeInteractivo`) verifican `BAIRD_TEST_PHONE_WHITELIST`. Si la env está definida (CSV de digits con país, p.ej. `573134951164`), los envíos a números fuera de la lista se omiten silenciosamente con un log `[WhatsApp][test-mode] Skipping ...`. Vacío/no definido → comportamiento normal (envía a todos). Útil para probar nuevos flujos sin alertar a técnicos reales.

### Call-sites de `notificarCambioEstado` (notificación a supervisores)

El helper se invoca en cada **transition owner** (la función/route que muta `estado`). Está cableado aditivamente — una línea `await notificarCambioEstado(...)` que nunca rompe el flujo. Cobertura actual:

| Transición | Origen |
|---|---|
| `notificada → asignada` (ambos flujos) | `procesarAceptacion` (`whatsapp.service.ts`) |
| `* → cancelada` | `procesarCancelacionCliente` (`whatsapp.service.ts`) |
| reagendamiento | `procesarReagendamientoCliente` (`whatsapp.service.ts`) |
| `pendiente_horario → notificada` | `/api/confirmar-horario` |
| diagnóstico (garantía + particular) | `/api/diagnostico` (2 ramas) |
| `pendiente_pricing → cotizacion_enviada`/`aprobacion_paso_pendiente` | `/api/cotizacion-precios` |
| `cotizacion_enviada → aprobada`/`rechazada` | `/api/aprobar-cotizacion` |
| `* → en_disputa` y aprobación de paso | `/api/verificar-paso` |
| `esperando_repuesto → repuesto_en_camino` | `/api/supervisor/guia-envio` |
| `esperando_repuesto \| repuesto_en_camino → repuesto_recibido` | `/api/repuesto-recibido` (admin) o `/api/supervisor/repuesto-entregado` (supervisor, 2026-08-25) |
| `repuesto_en_camino \| repuesto_recibido → en_proceso` | `/api/reprogramar-repuesto` |
| `en_proceso → confirmacion_pendiente` | `/api/completar-servicio` |
| `confirmacion_pendiente → completada`/`en_disputa` | `/api/confirmar-servicio` |
| `pendiente_horario → sin_agendar` | `/api/cron/horario-recordatorio` |
| `sin_agendar → pendiente_horario` (revival) | `/api/whatsapp/notify` |
| cualquier cambio manual | `/api/admin/cambiar-estado` |

**NO cableado a propósito:** `notificarTecnicos` y `enviarCotizacionCliente` (re-setean estado de forma idempotente; sus owners ya disparan el evento → evitar doble fire). **Creación de solicitudes** (`/api/solicitar`, `/api/carga-masiva`) tampoco dispara — son inserts sin estado previo. Si se quisiera notificar el alta, es una decisión de producto abierta (ver plan de despliegue) por el riesgo de spam en cargas masivas de garantía.

## API Routes

| Route | Method | Purpose | Flow |
|-------|--------|---------|------|
| `/api/solicitar` | POST | Create request + send schedule selection | Both |
| `/api/confirmar-horario` | POST | Customer confirms schedule, triggers tech notification. Valida agenda (`validarHorarioAgendable`): mínimo mañana + cupo `MAX_RESERVAS_POR_FRANJA` (5 desde 2026-10-12) por slot día+franja | Both |
| `/api/tecnicos-disponibles` | GET | Público (`?ciudad=&tipo_equipo=`): técnicos elegibles como "técnico de preferencia" en `/solicitar` — verificados, `visible_para_cliente` y con cobertura/especialidad (`listarTecnicosElegibles`, mismo criterio que `notificarTecnicos`). Solo id, nombre corto, foto y especialidades (sin PII). Fail-open `[]`; el guard real del id está en `POST /api/solicitar` | Both |
| `/api/descuentos/validar` | GET | Público (`?codigo=`): valida en vivo el código de descuento que el cliente escribe en `/solicitar` (2026-10-19) vía `validarCodigoDescuento` (`descuentos.service.ts`: existe, activo, vigencia, tope de usos). Devuelve `{ valido, tipo, valor, etiqueta, descripcion }` o `{ valido:false, motivo }` (motivos genéricos, sin enumerar). El guard real es `POST /api/solicitar`, que vuelve a validar y guarda el snapshot `descuento_codigo/tipo/valor` (400 si el código no vale). | Server |
| `/api/admin/descuentos` | GET/POST/PATCH | GET admin + rol lectura (`verificarLectura`): listado de `codigos_descuento` con usos (solicitudes no canceladas) y estado derivado (activo/inactivo/programado/vencido/agotado). POST/PATCH solo admin (`obtenerEmailAdmin`): crear / editar tipo, valor, descripción, vigencia, tope y `activo` (el texto del código no se edita). UI `/admin/descuentos`. | Server |
| `/api/disponibilidad-horario` | GET | Público (`?fecha=YYYY-MM-DD`): franjas llenas del día para que los selectores del cliente las desactiven. Solo agregados, sin PII. El guard real es server-side en la confirmación (`agenda.service`) | Both |
| `/api/tienda/buscar` | GET | Público (`?q=2611`): proxy de la búsqueda predictiva de la tienda Shopify (`suggest.json` + SKU real vía `/products/{handle}.js`) — devuelve `{productos:[{titulo,sku,precio,disponible,url,imagen}]}`. Usado por `ProductosNecesariosForm`: el técnico toca "Usar" y la fila se llena sola (SKU, descripción, foto del catálogo). Fail-open (`{productos:[]}`), cache 5 min por query | Both |
| `/api/diagnostico` | POST | Save diagnosis + oath + siguiente_paso (4 options). Particular Diagnóstico/Reparación admite además `mantenimientoCatalogo: true` con `reparar` ("Reparación con precio predeterminado (mantenimiento)", 2026-10-12): cotización = tabla `TARIFAS_MANTENIMIENTO` + recargo, neto técnico de tarifa fija, marca `cotizacion.mantenimiento_catalogo` | Both |
| `/api/aprobar-cotizacion` | POST | Customer approves/rejects quote | Non-warranty only |
| `/api/completar-servicio` | POST | Tech marks service complete | Both |
| `/api/confirmar-servicio` | POST | Customer confirms satisfaction | Both |
| `/api/verificar-paso` | POST | Customer approves/rejects post-diagnosis next step | Warranty only |
| `/api/solicitud/cancelar` | POST | Cliente cancela desde portal /servicio | Both |
| `/api/solicitud/reagendar` | POST | Cliente reagenda desde portal /servicio | Both |
| `/api/cotizacion-precios` | POST | Admin fija precios + tiempo de entrega tras diagnóstico | Both (lógica difiere) |
| `/api/repuesto-recibido` | POST | Admin marca repuestos llegados. Si todos recibidos → estado `repuesto_recibido` + `repuesto_recibido_at` + `reprogramacion_token`; envía `repuesto_recibido_cliente_v2` (botón reprogramar). | Both |
| `/api/reprogramar-repuesto` | POST | Público (gateado por `reprogramacion_token`). Cliente elige NUEVA fecha tentativa tras el repuesto → estado `repuesto_recibido` → `en_proceso`; notifica al técnico. Body `{ token, horario }`. | Both |
| `/api/gps-ping` | POST | Tech browser sends GPS coords by phase | Both |
| `/api/cron/horario-recordatorio` | GET | Cron 1h: reminder + sin_agendar transition | N/A |
| `/api/cron/gps-followup` | GET | Cron 10min: post-visit GPS flagging | N/A |
| `/api/cron/repuesto-recordatorio` | GET | Cron diario: casos estancados en el ciclo de repuesto. `esperando_repuesto` (solo garantía) → re-avisa a supervisores (`notificarRepuestoSupervisores`, 3/6/9 días, máx 3); `repuesto_en_camino` → re-avisa al cliente para agendar (`repuesto_en_camino_cliente_v1`, cada 3 días, máx 2). Tracking `repuesto_recordatorio_count/at` (mig `20260825`); historial `solicitud_eventos` tipo `recordatorio_repuesto`. | Both |
| `/api/admin/pagos/verificar` | POST | (2026-10-11) Botón "🔄 Verificar pagos en Wompi" de la ficha admin. Body `{ solicitudId, transaccionId? }`: con el N° de transacción la consulta en Wompi (sin llave privada) y la registra si su referencia es de ESA solicitud; sin él, busca por referencia anticipo/abono/saldo (`conciliarSolicitudWompi`, requiere `WOMPI_PRIVATE_KEY`). Todo pasa por `registrarPagoWompi` (idempotente). Auth: `verificarAdmin`. | Particular |
| `/api/admin/pagos` | GET | (2026-10-21) Ledger de pagos online de UNA solicitud (`?solicitudId=`) para la ficha admin — la tabla `pagos` está cerrada al anon. Devuelve tipo/estado/monto/método/transacción y el detalle de la devolución si la fila está `VOIDED`. Auth: `verificarLectura` (admin + rol lectura). | Particular |
| `/api/admin/pagos/devolver` | POST | (2026-10-21) "↩️ Devolver" de la ficha admin. Body `{ solicitudId, pagoId, modo: 'wompi' \| 'manual', nota? }` → `devolverPagoWompi`: `wompi` = reembolso V2 `POST /v1/refunds` (cualquier método, Bearer `WOMPI_PRIVATE_KEY`) con fallback a `/void` si es tarjeta y el reembolso no está disponible; `manual` = constancia de una devolución hecha por el panel de Wompi/transferencia (exige `nota`). Monto siempre del ledger; la misma fila de `pagos` pasa a `VOIDED` y se limpia `{tipo}_pagado_at` si no queda otro pago aprobado. 409 sin llave privada, 422 si Wompi rechaza (BD intacta). Auth: `obtenerEmailAdmin` (actor al historial). Ver `docs/WOMPI.md` § Devoluciones. | Particular |
| `/api/admin/facturacion-estado` | POST | (2026-10-22) Seguimiento facturado / no facturado. Body `{ solicitud_id, facturacion_estado: 'pendiente'\|'facturada'\|'no_aplica', factura_numero?, facturacion_nota? }` (Zod). Solo servicios `completada` (409 si no); `facturada` exige número; `pendiente` limpia número/fecha/quién. Escribe `facturacion_estado/factura_numero/facturada_at/facturada_por/facturacion_nota` (mig `20261022`) con guard atómico sobre el estado y deja evento `nota_admin` `payload.origen='facturacion_estado'` (antes/después, nota, rol). Auth: `obtenerRolRequest` — **admin O rol lectura** (única escritura de logística; `facturada_por` = su email). Reglas puras en `src/lib/services/facturacion-estado.service.ts`. UI: bloque 🧾 de la ficha (`FacturacionSolicitud.tsx`). Doc `docs/FACTURACION.md` § 11. | Both |
| `/api/cron/wompi-conciliar` | GET | Cron cada 15 min (2026-10-11): conciliación de cobros contra Wompi para pagos que ni el webhook (URL de eventos ocupada por Shopify) ni el redirect registraron. `conciliarPagosWompi()` recorre particulares vivas de los últimos 45 días con anticipo/abono/saldo pendiente, consulta `GET /v1/transactions?reference=…` con `WOMPI_PRIVATE_KEY` y pasa las APPROVED por `registrarPagoWompi(tx,'conciliacion')`. Sin llave privada = no-op. `?dias=N` opcional. Ver `docs/WOMPI.md`. | Particular |
| `/api/cron/oferta-escalonada` | GET | Cron cada minuto vía pg_cron `oferta-escalonada-1min` (2026-10-22): segunda ola del reparto escalonado. Reclama atómicamente las solicitudes con `oferta_abierta_at` vencido (lo pone en NULL) y, si siguen en `notificada` sin técnico, llama `notificarTecnicos(id, { soloNoNotificados: true })` → oferta a los candidatos que aún no la tenían. Auth `cronAutorizado`. Ver `docs/GOTCHAS.md` § Reparto escalonado. | Ambos |
| `/api/cron/resumen-movimientos` | GET | Cron diario (2026-10-20; `vercel.json` `0 22 * * *` UTC = **5:00 pm Bogotá**): **resumen diario de movimientos a supervisores** en TEXTO. Lee `solicitud_eventos` de la ventana 5 pm ayer → 5 pm hoy (tipos `cambio_estado`, `cambio_estado_admin`, `cancelacion`, `cancelacion_revertida`, `reagendamiento_confirmado`, `no_show_cliente`; solo `estado_previo ≠ estado_nuevo`), arma UN texto por supervisor activo con SOLO los servicios de su alcance (`solicitudEnAlcance`, ámbito + marca — el mismo del portal; `estados` no filtra) agrupado por servicio: cliente, equipo, No. garantía, ciudad, `HH:mm anterior → nuevo (quién)`, y `🔩 Repuesto: SKU · descripción` si el servicio tocó/quedó en esperando_repuesto / repuesto_en_camino / repuesto_recibido (`repuestos_pendientes`, fallback `cotizacion.productos_necesarios`); "sin movimientos hoy" si no hay. Envío: `enviarMensajeTexto` (partido en mensajes ≤ 3.900 chars; ⚠️ requiere ventana 24h) con fallback a la plantilla `supervisor_resumen_diario_v1` (resumen en una línea + botón al portal; pendiente de subir a Meta). Bitácora + idempotencia por (supervisor, corte) en `supervisor_resumenes` (mig `20261020`). Respeta `BAIRD_TEST_PHONE_WHITELIST`. Query `?dry=1` (arma sin enviar y devuelve los textos), `?force=1`, `?corte=ahora`. Armado puro en `src/lib/services/resumen-movimientos.service.ts`. | Both |
| `/api/supervisor/repuesto-entregado` | POST | Supervisor (portal_token + alcance) marca el repuesto ENTREGADO al cliente: `esperando_repuesto \| repuesto_en_camino → repuesto_recibido`, marca `repuestos_pendientes` recibidos, reusa `reprogramacion_token` si existe y notifica cliente (`repuesto_recibido_cliente_v2`, botón agendar), técnico (`repuesto_llegado_tecnico_v1`) y supervisores. Evento con `actor='supervisor'`. | Both |
| `/api/carga-masiva` | POST, DELETE | Bulk upload for warranty: Excel BITÁCORA **o PDF "TALLER" MABE** (parser `pdf-orden-mapping.ts` vía unpdf; `dryRun=true` devuelve preview sin insertar; dedup por N° de orden contra BD y dentro del archivo). DELETE: borrar solicitudes de una carga | Warranty only |
| `/api/admin/export` | POST | Admin: descarga `.xlsx` con resumen completo de solicitudes (cliente, técnico, evidencias, fotos, eventos, GPS, cotización). Body: `{ ids?: string[] }` — sin IDs exporta todas. | Both |
| `/api/admin/finanzas` | GET | Admin (NO rol lectura): resumen financiero del negocio sobre servicios COMPLETADOS por fecha de cierre (`?desde&hasta`, día Colombia). Por período y por mes, partido garantía/particular: servicios, ventas sin/con IVA (garantía = total MABE base; particular = base gravable), pago a técnicos (costo directo), utilidad, margen, mix %, recaudo Wompi. Cálculo puro en `src/lib/services/finanzas.service.ts` (mismo criterio que liquidaciones). UI: `/admin/finanzas` (2026-10-13). | Server |
| `/api/admin/incumplidos` | GET | Admin + rol lectura (`verificarLectura`): cumplimiento de la fecha de reserva (`?desde&hasta` por día de reserva CO, default últimos 30 días, tope ayer). Carga solicitudes con `fecha_visita_at` vencida + `evidencias_servicio.completado_at` + `gps_pings` + nombres de técnicos y devuelve `{ resumen, por_tecnico, items }` clasificados por `calcularReporteCumplimiento` (`src/lib/services/incumplidos.service.ts`: cumplida / tarde / vencida / sin_tecnico / cerrada_sin_visita / sin_evidencia). Desde 2026-10-21 también carga los eventos de reagendamiento (`solicitud_eventos` tipo `reagendamiento` + `nota_admin` con `payload.origen='reagendamiento_admin'`) y cada item trae `reagendamientos` (máx. contador/eventos), `dias_desde_solicitud` y `prioridad` (alta/media/baja); `items` sale ordenado por `ordenarPorPrioridad` (reagendamientos ↓ → antigüedad ↓ → gravedad → retraso). UI: `/admin/incumplidos` + KPI en `/admin` (2026-10-19). | Server |
| `/api/admin/liquidaciones-tecnicos` | GET, POST | Admin (NO rol lectura): cuentas por pagar a técnicos. GET = servicios completados sin liquidar agrupados por técnico (pago consolidado) + historial de `liquidaciones_tecnico`. POST `{ tecnico_id, solicitud_ids[], nota? }` crea una liquidación PENDIENTE con snapshot del monto por servicio (`liquidaciones_tecnico_items`, índice único por solicitud = no se paga dos veces). `[id]`: GET items; PATCH `{ accion: 'pagar', referencia?, pagada_at? }` \| `{ accion: 'anular' }` (guard atómico solo desde pendiente; anular borra items y libera los servicios). Audit `nota_admin` por servicio. Service `src/lib/services/liquidacion-tecnicos.service.ts`; migración `20261013_liquidaciones_tecnico.sql`. UI: `/admin/pagos-tecnicos` (2026-10-13). | Server |
| `/api/admin/liquidaciones` | POST | Admin: descarga `.xlsx` de liquidación de servicios COMPLETADOS por rango de fecha de cierre (día Colombia). Body `{ tipo: 'tecnicos'\|'mabe'\|'particular'\|'facturacion', desde, hasta, tecnico_id? }`. `solicitud_id?` (2026-09-11) = ficha de facturación de UN servicio en cualquier estado (botón en `/admin/solicitudes/[id]`). `facturacion` (2026-09-09): paquete Siigo — hojas FV particulares (un renglón por ítem), FV MABE + Relación órdenes, Pagos Wompi (ledger por fecha de pago, cruzado con su servicio), Datos faltantes; `tecnicos` suma la hoja Documento soporte. Helpers puros en `src/lib/utils/facturacion.ts`; doc `docs/FACTURACION.md`. `tecnicos`: resumen + detalle de pago por técnico (garantía con consolidado real: encuesta = calificación en `/confirmar`, TA, días pausando repuesto). `mabe`: total a facturar a MABE por garantía (`calcularTarifaMABE` con datos del cierre). `particular`: total/base/IVA (DIAN), cédula/NIT, recaudo Wompi APPROVED vs pendiente, margen Baird. UI: `/admin/liquidaciones`. | Both |
| `/api/admin/editar-solicitud` | POST | Admin: corrige manualmente `tipo_equipo`, horario, dirección, ciudad, zona. Auditado en `solicitud_eventos` con diff. | Both |
| `/api/admin/cambiar-estado` | POST | Admin: fuerza el `estado` de una solicitud cuando el flujo automático quedó atascado. Auditado en `solicitud_eventos` (`tipo='cambio_estado_admin'`). NO envía WhatsApp al cliente/técnico, pero SÍ notifica supervisores (`notificarCambioEstado`). | Both |
| `/api/admin/notas` | POST | Admin: agrega una **nota interna** a una solicitud (sección "Notas del administrador" en `/admin/solicitudes/[id]`). Inserta en `solicitud_eventos` (`tipo='nota_admin'`, `actor`=email del admin, `motivo`=texto, `payload.origen='nota_manual'`). Append-only: sin editar/borrar. NO envía WhatsApp. Body `{solicitudId, texto}` (máx 2000 chars). Auth `obtenerEmailAdmin`. | Both |
| `/api/admin/evidencias` | POST | Admin (2026-10-20): registra **evidencia adicional del equipo** (fotos, videos ≤ 50 MB, PDF) que el admin sube desde `/admin/solicitudes/[id]` § "Evidencia adicional del equipo" (`EvidenciaAdminSeccion`). Los archivos los sube el navegador directo al bucket `evidencias-servicio` bajo `{solicitud_id}/admin_*` (sin pasar por Vercel); el endpoint valida las URLs (`esUrlEvidenciaAdminValida`, `src/lib/utils/evidencia-admin.ts`) y escribe UN evento `nota_admin` con `payload.origen='evidencia_admin'` + `payload.archivos[{url,mime,nombre,bytes}]` (sin migración). Body `{solicitudId, nota?, archivos[]}` (máx 20). Rol lectura rechazado. | Both |
| `/api/admin/reenviar-ultimo-mensaje` | POST | Admin: re-dispara la plantilla WhatsApp correspondiente al estado actual de la solicitud (útil si el cliente o el técnico borró el mensaje). Incluye `repuesto_recibido` → `repuesto_recibido_cliente_v2`. | Both |
| `/api/admin/tecnicos/reenviar-portal` | POST | Admin: reenvía a cada técnico con servicios activos `servicio_asignado_tecnico_v4` de su servicio más reciente (botón Abrir portal). Body opcional `{tecnicoId}`. Recuperación cuando el envío de asignación falló (Meta 132018) | Both |
| `/api/admin/supervisores` | GET/POST/PUT/DELETE | Admin CRUD de la tabla `supervisores` (destinatarios de `notificarCambioEstado`). Auth `verificarAdmin`. En **POST**, si el supervisor queda activo, dispara `enviarBienvenidaSupervisor` (plantilla `supervisor_bienvenida_v1`) y devuelve `whatsapp_bienvenida` en la respuesta. | N/A |
| `/api/admin/reparto` | GET/PATCH | Config del reparto escalonado (`config_reparto`: activo, minutos_ventaja, max_servicios_semana) + técnicos verificados con servicios aceptados en 7 días y si reciben primero + solicitudes en espera de abrirse. GET admin o lectura (`verificarLectura`); PATCH solo admin (`obtenerEmailAdmin`, guarda `updated_by`). Lógica en `src/lib/services/reparto.service.ts`. | Ambos |
| `/api/admin/actualizar-valor` | POST | Admin: ajusta `cotizacion.total` (valor al **cliente**) de un servicio particular. Sobreescribe total + limpia desglose (`mano_obra/repuestos→0`), reabre aprobación (`estado→cotizacion_enviada`), audita en `solicitud_eventos`, notifica supervisores y envía `valor_actualizado_cliente_v1` al cliente. **NO toca `pago_tecnico`.** Body `{id, nuevoValor, motivo?}`. Guard concurrencia `.eq(estado)`. | Particular only |
| `/api/admin/cobro-final` | POST | Admin (2026-10-12): fija a mano el **valor final** que paga el cliente por un servicio particular YA realizado (`confirmacion_pendiente` / `completada`) y se lo manda por Wompi "con encuesta y todo". Escribe `cotizacion.total` (crea una cotización mínima `cobro_final_admin: true` si no había — tarifa fija), **no cambia estado ni `pago_tecnico`**, audita `cambio_estado_admin`, reenvía `confirmar_servicio_v4` si el cliente no ha respondido (`enviarEncuesta !== false`) y envía `saldo_final_cliente_v1` por `valor − pagos online acreditados` (`calcularMontoSaldo`). Rechaza si `saldo_pagado_at` ya está. Body `{id, valor, motivo?, enviarEncuesta?}`. | Particular only |
| `/api/admin/reagendar-solicitud` | POST | Admin: cambia la FECHA del servicio con calendario (fecha + franja). A diferencia de `editar-solicitud` (texto libre, sin aviso): materializa `fecha_visita_at` (aparece en la vista Calendario) y notifica por WhatsApp a cliente, técnico asignado y supervisores. "Hoy" y cupo lleno se devuelven como `avisos` NO bloqueantes (el admin puede forzar); estados terminales sí bloquean. Desde 2026-10-22 responde **400** con `{error, motivo: 'pasada'|'fuera_de_rango'|'formato'}` si la fecha es anterior a hoy CO, queda a más de 180 días o no es un día real (`validarFechaVisita`, `utils/fecha-visita.ts` — la misma función que usan todas las vías del cliente vía `validarHorarioAgendable`; la página usa `rangoFechaVisita()` como `min`/`max` del input) — nunca reservar en el pasado ni con años mal tecleados en `fecha_visita_at`. Body `{id, fecha:'YYYY-MM-DD', franja, motivo?}`. Auth `obtenerEmailAdmin`. | Both |
| `/api/admin/pedir-repuesto-supervisores` | POST | Admin (botón **"Pedir repuestos en garantía"** en `/admin/solicitudes/[id]`, solo `es_garantia`): envía el pedido de repuesto a los supervisores con **visibilidad de la marca** (activos, ámbito todos/garantía, marca null o coincidente) vía `supervisor_repuesto_garantia_v1` (SKU, modelo, No. garantía, dirección, diagnóstico). **NO cambia estado.** Llama `notificarRepuestoSupervisores()`. Auditado en `solicitud_eventos` (`payload.origen='pedido_repuesto_supervisores'`). Auth `obtenerEmailAdmin`. Body `{solicitudId}`. | Warranty only |
| `/api/whatsapp/accept` | GET | Aceptación 1-click del técnico desde la plantilla WhatsApp. Token único por notificación. Llama `procesarAceptacion()` — atomic update primer-técnico-gana. Redirige al portal del técnico tras aceptar. | Both |
| `/api/whatsapp/notify` | POST | Admin re-notifica técnicos para una solicitud (volver a disparrar el broadcast a técnicos compatibles). Usa `notificarTecnicos()`. | Both |
| `/api/notificar-registro` | POST | Post-registro del técnico: envía `registro_bienvenida_v3` con link al portal. | N/A |
| `/api/carnet/[tecnicoId]` | GET | **Carnet digital del técnico** como PNG (`next/og`, 800×420): foto de perfil, nombre, especialidad, ciudad, estado de verificación y tipo + número de documento + código `BS-XXXXXXXX`. Sin auth (el UUID no es enumerable y el contenido es el que ya ve cualquier cliente asignado); 400 si no es UUID, 404 si no existe; cache 10 min. Lo consume `procesarAceptacion` (imagen free-form + HEADER IMAGE de `tecnico_asignado_cliente_v7`/`tecnico_asignado_particular_v2`) y el botón "Compartir" del portal del técnico. Modelo en `src/lib/utils/carnet.ts`; tarjeta React en `components/ui/CarnetTecnico.tsx` (portal cliente + "Mi carnet" del portal técnico). Reemplaza el envío de la **foto de la cédula** (2026-10-10). | N/A |
| `/api/tecnico/receptor` | POST | Receptor del servicio (2026-10-13; auth por `portal_token` + `tecnico_asignado_id`). Registra/actualiza a la persona que recibe al técnico cuando no es el titular (`receptor: {nombre, telefono, relacion}`; valida móvil CO, lista cerrada de relaciones y ≠ titular) o la quita (`quitar: true`, solo si aún no aceptó). Guarda de inmediato, genera `receptor_token`, deja evento `nota_admin` (actor `tecnico`, `payload.origen='receptor'`) y envía `receptor_bienvenida_v1`. Ver `docs/FLOWS.md` § Receptor. | Both |
| `/api/receptor/aceptar` | POST | El receptor acepta T&C + privacidad desde `/receptor/{token}` (`{ token }`). Guard atómico `.is('receptor_acepto_at', null)`; idempotente. Desde `receptor_acepto_at` se le espejan los WhatsApp del titular. | Both |
| `/api/admin/receptor-reenviar` | POST | Admin reenvía al receptor el link de aceptación (`receptor_bienvenida_v1`) si no ha aceptado. | Both |
| `/api/tecnico/perfil` | POST | Autoservicio del técnico (auth por `portal_token`, service_role): especialidades (sync insert/delete en `especialidades_tecnico`), `cubre_gasodomesticos`, `tiene_arl` y **declaración** de certificaciones (solo siembra `declarada`/`sin_revisar`, nunca pisa una verificación del admin). Fija `perfil_actualizado_at`. Ver `docs/CERTIFICACIONES.md`. | N/A |
| `/api/tecnico/agenda` | GET / POST / DELETE | Agenda del técnico (auth por `portal_token`, service_role). GET `?portalToken&desde&hasta` (≤ 62 días) devuelve `cupo` (`MAX_SERVICIOS_TECNICO_POR_FRANJA`), servicios asignados no terminales con `fecha` (día CO) + `franja` resueltos vía `slotDesdeFechaVisita`, `sinFecha` (activos sin `fecha_visita_at`) y bloqueos de `agenda_tecnico_bloqueos`. POST crea un bloqueo externo (`fecha`, `franja`, `titulo`, `nota?`, `bloquea_franja?`); DELETE borra uno propio (scope por `tecnico_id`). | N/A |
| `/api/tecnico/equipo` | GET / POST / PATCH / DELETE | Equipo de trabajo del técnico (2026-10-13; auth por `portal_token`, service_role sobre `tecnico_auxiliares`). GET devuelve sus auxiliares + `equipoPorServicio` (`auxiliares_ids` de sus servicios no terminales). POST crea un auxiliar en `pendiente` (valida nombre, documento, foto obligatoria del bucket `tecnicos-fotos`, declaración de autorización de datos; máx 3 activos, sin documento repetido). PATCH edita (cambiar nombre/documento/foto vuelve a `pendiente` y lo saca de servicios activos) o solo `acompana_por_defecto`. DELETE = baja lógica. | N/A |
| `/api/tecnico/equipo-servicio` | PATCH | Quién va a UN servicio (`{ portalToken, solicitudId, auxiliaresIds }`). Solo auxiliares propios, activos y verificados; solo servicios propios no terminales. Escribe `auxiliares_ids`, deja evento `nota_admin` (`payload.origen='equipo'`) y avisa al cliente con `equipo_servicio_actualizado_v1` (fallback texto libre) vía `enviarEquipoActualizadoCliente`. | N/A |
| `/api/admin/auxiliares` | GET / PATCH | Verificación manual de auxiliares (auth admin Bearer). GET `?tecnicoId` lista con documento completo. PATCH `{ auxiliarId, estado_verificacion | activo, nota? }`; al dejar de ser visible (rechazado / baja) lo saca de `auxiliares_ids` de los servicios activos del técnico. | N/A |
| `/api/carnet/{tecnicoId}` | GET | PNG del carnet digital (2026-10-10). Desde 2026-10-13 acepta `?aux=id1,id2`: agrega una fila con los auxiliares del servicio (solo activos + verificados de ESE técnico; hasta 3). | N/A |
| `/api/log-error` | POST | Telemetría fire-and-forget de errores de conexión del cliente. Inserta en `connection_errors` y loguea a stderr con prefijo `[ConnectionError]`. Siempre responde 200. | N/A |
| `/api/whatsapp/webhook` | GET/POST | Meta webhook handshake + events. POST: alerta al admin por cada mensaje entrante, log `UNDELIVERED` por cada `status=failed` y, desde 2026-10-09, ese fallo queda como evento `mensaje_cliente` (payload `entrega:'failed'`) en la solicitud activa del cliente | N/A |
| `/api/test-whatsapp` | GET | Diagnóstico de configuración WhatsApp (presencia/forma de token, phone ID, whitelist) — para descartar env vars rotas en Vercel sin enviar mensajes. Agregado tras el falso "no se envía" del 2026-07-01. | N/A |
| `/api/dapta/webhook` | POST | Webhook POST-CALL de la segunda línea de voz IA. Firma HMAC (`DAPTA_WEBHOOK_SECRET`) + idempotencia por `dapta_call_id`. Fase 0 — apagada tras `DAPTA_ENABLED`. Ver `docs/DAPTA.md`. | N/A |
| `/api/triaje` | POST | AI diagnosis (disabled) | N/A |
| `/api/health` | GET | Health check | N/A |

## Customer-Facing Pages

| Page | URL | Purpose |
|------|-----|---------|
| **Home / landing** | `/` | Landing comercial. Nav hamburguesa <640px vía `MenuMovil` — el nav del header y el link a la tienda están en `hidden sm:*`. Footer con identificación del proveedor (Ley 1480 art. 50), links legales y tienda. Las 8 tarjetas de `#equipos` enlazan a su landing SEO (`EQUIPOS_HOME`). Corre el A/B del hero móvil (ver abajo). |
| **Índice de servicios** | `/servicios` | Grid de las 7 landings SEO. Iconos compartidos con la home vía `ICONO_POR_SLUG`. |
| **Landing SEO por equipo** | `/servicios/[slug]` | Página estática indexable por equipo (fallas, precios, cobertura, FAQ). Contenido en `servicios-seo.ts`; el sitemap se genera de ahí. |
| Service request form | `/solicitar` | Customer creates a new request |
| **Schedule confirmation** | `/horario/{horario_token}` | Customer picks fecha + franja + accepts T&C |
| **Self-service portal** | `/servicio/{cliente_token}` | Cancela / reagenda. Token durable, vive en `solicitudes_servicio.cliente_token`. Sección "Quién te visita" (2026-10-13): carnet del técnico + una tarjeta `CarnetAuxiliar` por auxiliar verificado del servicio (`equipoDeServicioPorId`, import dinámico de `equipo.service`, fail-soft) |
| **Verificar siguiente paso** | `/verificar-paso/{verificacion_paso_token}` | Cliente aprueba/rechaza el siguiente paso post-diagnóstico (garantía) |
| Quote approval | `/cotizacion/{cotizacion.token}` | Customer approves/rejects repair quote (non-warranty) |
| **Reprogramar tras repuesto** | `/reprogramar-repuesto/{reprogramacion_token}` | Cliente elige nueva fecha tentativa cuando el repuesto llegó (estado `repuesto_recibido`). POST a `/api/reprogramar-repuesto` → `en_proceso`. |
| Service confirmation | `/confirmar/{confirmacion_token}` | Customer confirms service was completed satisfactorily |
| **Terms & Conditions** | `/terminos` | Public T&C page (Colombian law-compliant) |
| Privacy Policy | `/politica-privacidad` | Política de privacidad y tratamiento de datos (Ley 1581/2012), versión `PRIVACIDAD_VERSION` en `src/lib/constants/legal.ts`. |
| **Contrato técnico** | `/contrato-tecnico` | Contrato de prestación de servicios para técnicos, versión `CONTRATO_TECNICO_VERSION`. Se imprime y firma en físico; el admin lo marca en `/admin/tecnicos/[id]` (`contrato_firmado`), requisito para verificar, y puede subir la copia escaneada al bucket privado `tecnicos-contratos` (`uploadContratoFirmado` / `urlContratoFirmado` en `uploadHelpers.ts`). |
| **Eliminación de datos** | `/eliminacion-datos` | Página pública con formulario / instrucciones para que el cliente solicite la eliminación de sus datos (Ley 1581 de 2012). |

## Technician-Facing Pages

| Page | URL | Purpose |
|------|-----|---------|
| **Registro** | `/registro` | Onboarding del técnico: formulario con datos personales, foto, documento, especialidades (con descripción de alcance desde `ESPECIALIDADES_INFO`), ciudad, ARL, **gasodomésticos (obligatorio) + ¿tiene certificado de competencia en gas?** (siembra `certificaciones.competencia_gas` como `declarada`). Inserta en `tecnicos` con `estado_verificacion='pendiente'`. Al final llama `/api/notificar-registro` para mandar `registro_bienvenida_v3`. |
| Perfil del técnico | `/tecnico/{token}/perfil` | Autoservicio: revisar especialidades, gasodomésticos, ARL y declarar certificaciones aplicables (+ nº). Guarda vía `POST /api/tecnico/perfil`. El portal muestra banner "Completa tu perfil" mientras `perfil_actualizado_at` sea NULL. `/tecnico/perfil/{token}` redirige aquí (destino del botón de `tecnico_actualizar_perfil_v1`). |
| Agenda del técnico | `/tecnico/{token}/agenda` | Calendario semanal (lunes a domingo × 4 franjas) con los servicios Baird aceptados (azul) y los compromisos externos que el técnico registra (gris), con conteo `n/cupo` por franja (`MAX_SERVICIOS_TECNICO_POR_FRANJA` = 5 desde 2026-10-12, el mismo guard de `procesarAceptacion`). "+ Agregar" crea un bloqueo (título, nota, "cerrar toda la franja"); "Quitar" lo borra. Sección aparte para servicios activos sin fecha confirmada. Datos vía `/api/tecnico/agenda`; tarjeta de acceso en el portal. |
| Equipo del técnico | `/tecnico/{token}/equipo` | "Mi equipo de trabajo" (2026-10-13): alta/edición/baja de auxiliares (nombre, tipo y número de documento, foto obligatoria comprimida con `prepararFoto` → `uploadFotoAuxiliar`, celular opcional, "me acompaña por defecto") con declaración obligatoria de autorización de datos del auxiliar. Muestra el estado de verificación de Baird. Datos vía `/api/tecnico/equipo`. En el portal, cada card de servicio activo tiene el bloque "¿Quién va a este servicio?" (`components/tecnico/EquipoServicioSelector.tsx`) que guarda vía `PATCH /api/tecnico/equipo-servicio` y avisa al cliente. |
| Accept service | `/aceptar/{token}` | 1-click acceptance from WhatsApp notification (la URL del botón apunta a `/api/whatsapp/accept?token=...` que redirige acá tras procesar) |
| Portal (service list) | `/tecnico/{token}` | View assigned services and history. Auth: `portal_token` UUID en la URL. |
| Receptor (aceptación) | `/receptor/{receptor_token}` | Webview para la persona que recibe el servicio cuando no es el titular (botón de `receptor_bienvenida_v1`): muestra titular, técnico y equipo, checkbox T&C + privacidad y `POST /api/receptor/aceptar`. Tras aceptar, link al portal `/servicio/{cliente_token}`. RSC con cliente anon (mismo patrón que `/verificar-paso`). |
| Diagnosis form | `/tecnico/{token}/diagnostico/{id}` | **Bloque "¿Quién recibe el servicio?"** al inicio (2026-10-13, `components/tecnico/ReceptorServicio.tsx`): titular (default) u otra persona (nombre + celular + relación); guarda al instante vía `POST /api/tecnico/receptor` y la lectura de `receptor_*` es una query aparte best-effort. El mismo bloque vive en `/completar/{id}` (tarifa fija sin diagnóstico). Oath modal + diagnosis + 4 next-step options + GPS. Fotos se comprimen client-side (`compressImageIfNeeded`) antes de subirlas en paralelo. **Productos necesarios** (`ProductosNecesariosForm`) admite **foto opcional por SKU** (ambos flujos): se sube al bucket `evidencias-servicio` y su URL pública se guarda en `imagen_url` dentro del JSONB (`triaje_resultado`/`cotizacion`). Visible en `/admin/cotizaciones-pendientes` y `/admin/solicitudes/{id}`. |
| Completion form | `/tecnico/{token}/completar/{id}` | Upload photos, checklist, signature, GPS. Misma compresión + paralelización que `diagnostico`. |

## Admin Pages

Todas requieren login Supabase Auth en `/admin/login` y validación server-side con `verificarAdmin()` en cada endpoint del que dependen. Ver `docs/SEGURIDAD.md` § 2.

| Page | URL | Purpose |
|------|-----|---------|
| Login | `/admin/login` | Login Supabase Auth (email + password). La sesión queda en `localStorage`; OJO: misma sesión se filtra a portales con token en el mismo browser — ver gotcha en `docs/GOTCHAS.md`. |
| Dashboard | `/admin` | KPIs and recent activity. KPI **🧾 Sin facturar** (2026-10-22): completadas con `facturacion_estado='pendiente'`, enlaza a `/admin/solicitudes?filtro=sin_facturar` |
| **Guía** | `/admin/guia` | Admin + rol lectura. **Guía de operación** para operadores del panel (2026-10-22): Server Component que lee `docs/GUIA-OPERACION-LOGISTICA.md` del repo con `fs` (incluido en el bundle de Vercel vía `outputFileTracingIncludes` en `next.config.ts`) y lo renderiza con `src/components/admin/GuiaViewer.tsx` (react-markdown + remark-gfm, estilos Tailwind, índice lateral con anclas h2/h3 y buscador client-side que filtra secciones). Única fuente de verdad: el `.md`. Ítem 📘 Guía del sidebar. |
| Solicitudes | `/admin/solicitudes` | Service requests list/detail. Filtros (2026-10-20): chips de estado + virtuales **📣 Sin técnico** (`notificada` sin `tecnico_asignado_id`) y **🔩 Pendientes por repuesto** (`esperando_repuesto` \| `repuesto_en_camino` \| `repuesto_recibido`; cada fila muestra bajo el estado el repuesto que espera — `repuestos_pendientes` sin cancelados, fallback `cotizacion.productos_necesarios`, o "Sin repuesto especificado"), **selector de técnico** (`tecnico_asignado_id`, convive con el chip de estado) y búsqueda libre. Toggle **Lista \| Calendario**: el calendario (`src/components/admin/AgendaCalendario.tsx`) muestra por día+franja el conteo `n/cupo` de servicios agendados (semana = detalle por franja con los servicios; mes = resumen por día). `n` y `cupo` espejan `agenda.service` (no-terminales con ese `fecha_visita_at`, tope `MAX_RESERVAS_POR_FRANJA`). Solo lectura. **Facturación (2026-10-22):** chip **🧾 Sin facturar** (completadas con `facturacion_estado='pendiente'`; `?filtro=sin_facturar` lo activa desde el KPI del dashboard), selector **Facturación** (todas / sin facturar / facturadas / no aplica, convive con chip y técnico) y badge `🧾 FV-2-…` bajo el estado de las completadas facturadas. El estado se cambia en la ficha, bloque **🧾 Facturación** (`FacturacionSolicitud.tsx`, operable también por el rol lectura). |
| **Incumplidos** | `/admin/incumplidos` | Admin + rol lectura. **Cumplimiento de la fecha de reserva** (2026-10-19): reservas (`fecha_visita_at`) ya vencidas que NO se atendieron el día reservado — "Vencida sin atender" (técnico asignado, sigue abierta), "Vencida sin técnico" (`notificada`), "Atendida tarde" (evidencia días después) — vs "A tiempo". Evidencia = ping GPS, `diagnosticado_at`/`siguiente_paso_at` o `evidencias_servicio.completado_at` el mismo día CO. KPIs, tabla por técnico (clic filtra) y detalle con link a la solicitud; rango por día de reserva (default últimos 30 días; hoy y futuro no se evalúan). **Priorizado (2026-10-21)**: columna "Prioridad" (alta ≥2 reagendamientos o ≥15 días desde la solicitud; media ≥1 o ≥7; `PRIORIDAD_UMBRALES`) con veces reagendada y días desde la solicitud; orden por defecto Prioridad (reagendamientos ↓ → antigüedad ↓), alternables Urgencia (retraso) y Fecha de reserva. Datos de `GET /api/admin/incumplidos`; clasificación pura en `src/lib/services/incumplidos.service.ts`. El dashboard `/admin` muestra el KPI "Sin atender" (30 días). |
| **Descuentos** | `/admin/descuentos` | Admin (rol lectura solo ve). **Códigos de descuento** (2026-10-19): crear/editar/activar códigos (`porcentaje` del total o `valor` fijo, descripción visible al cliente, vigencia desde/hasta, máximo de usos) y ver usos y estado. El cliente lo escribe en `/solicitar`; se aplica solo en el **saldo final** y lo asume Baird — reglas en `docs/TARIFAS.md` § "Códigos de descuento". La ficha `/admin/solicitudes/[id]` muestra el código, el monto y el total neto en "Cuentas del servicio" y en el bloque de cobro final. |
| Solicitud detalle | `/admin/solicitudes/[id]` | Detalle + edit + reenviar último mensaje + **cambiar estado manualmente** (escape hatch, ver `docs/MAQUINA-DE-ESTADOS.md`). |
| Técnicos | `/admin/tecnicos` | Listado de técnicos con estado de verificación + badge `🔥 gas` / `gas: ?` (gasodomésticos declarados / no informado) |
| Técnico detalle | `/admin/tecnicos/[id]` | Detalle del técnico: documento, foto, **especialidades editables**, ciudades de cobertura, **gasodomésticos (sí/no/no informado) con alerta si cubre gas sin certificado**, **checklist manual de certificaciones** (estado, entidad, nº, vencimiento, nota, link "Verificar" a la entidad — `docs/CERTIFICACIONES.md`), toggle de verificación, **equipo de trabajo** (`components/admin/EquipoAuxiliaresAdmin.tsx`, 2026-10-13: auxiliares con foto y documento completo, botones Verificar / Rechazar / Volver a pendiente / Dar de baja vía `/api/admin/auxiliares`). |
| **Repuestos** | `/admin/repuestos` | Pending parts — mark as received |
| **Cotizaciones pendientes** | `/admin/cotizaciones-pendientes` | **Admin pricing gate** — solicitudes en estado `pendiente_pricing` esperando que el admin fije precios + tiempo de entrega antes de notificar al cliente. UI dispara `/api/cotizacion-precios`. |
| **Alertas GPS** | `/admin/gps-alertas` | Silent flagged services (post-visit GPS within 100m) |
| **Errores de conexión** | `/admin/errores` | Observabilidad: panel de `connection_errors` (telemetría enviada por el cliente vía `/api/log-error`). Filtros por rango temporal (1h/24h/7d/30d), tipo de error y actor (técnico/cliente/admin). |
| **Mapa** | `/admin/mapa` | Servicios geolocalizados en mapa Leaflet + OSM con clusters. Se alimenta de las columnas de geocoding (`direccion_lat/lng`, migración `20260523`); el pipeline geocodifica en `/api/solicitar` y `editar-solicitud` (Google Maps, `GOOGLE_MAPS_API_KEY`). Filtro por día vía `fecha_visita_at`. |
| Carga Masiva | `/admin/carga-masiva` | BITÁCORA Excel upload |
| Garantías | `/admin/garantias` | Warranty dashboard by brand/equipment |
| Pagos técnicos | `/admin/pagos-tecnicos` | Solo admin (oculta al rol lectura). Cuentas por pagar por técnico (servicios completados sin liquidar, seleccionables) → crear liquidación pendiente → marcar pagada con referencia del giro / anular. KPIs: por liquidar, liquidado sin pagar, deuda total, pagado en el mes (`/api/admin/liquidaciones-tecnicos`) |
| Finanzas | `/admin/finanzas` | Solo admin (oculta al rol lectura). Cómo va el negocio: KPIs del período, tabla garantía vs particular (servicios, ventas, pago técnicos, utilidad, margen, % mix) y evolución mensual, con filtro de fechas y atajos (`GET /api/admin/finanzas`) |
| Liquidaciones | `/admin/liquidaciones` | Descarga Excel: liquidación técnicos (quincenal, con documento soporte) / facturación MABE / ventas particulares / paquete de facturación Siigo, por rango de fechas con presets de quincena (`POST /api/admin/liquidaciones`) |
| **Supervisores** | `/admin/supervisores` | CRUD de supervisores que reciben notificaciones WhatsApp en cada cambio de estado. Por cada uno: nombre, WhatsApp, activo, ámbito (todos/garantía/particular), marca (opcional), estados (opcional). UI dispara `/api/admin/supervisores`. |
| **Reparto de ofertas** | `/admin/reparto` | Interruptor del reparto escalonado, minutos de ventaja, tope de servicios por semana, tabla de técnicos (servicios 7 días → "Primero" / "Después de X min") y ofertas en espera con cuenta regresiva. UI dispara `/api/admin/reparto`. |

**Exportación de resumen** (botón **📥 Descargar resumen Excel**):
- En `/admin/solicitudes` → exporta TODAS las visibles. Si hay filas seleccionadas con checkbox, aparece **📥 Descargar selección** que solo exporta esas.
- En `/admin/solicitudes/[id]` → botón en el header exporta solo esa solicitud.
- Endpoint server-side: `POST /api/admin/export` (auth admin via `Authorization: Bearer <session.access_token>`). Genera `.xlsx` con 7 hojas:
  1. **Solicitudes** — fila plana por solicitud con todas las columnas + nombre/whatsapp/documento del técnico asignado + URLs hyperlink (portal cliente, selección horario, verificar paso, detalle admin). La columna `Complejidad` se resuelve mirando `CODIGOS_FALLA` (catálogo MABE en `src/lib/constants/codigos-falla.ts`) por el número de falla — **no** usa `triaje_resultado.complejidad`, que es la percepción del técnico. Junto al `Código falla` aparecen `Descripción falla`, `Familia falla`, `Sistema falla` y `Componente falla` del catálogo (vacíos si no hay código).
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

## Analítica y experimentos

El tag de gtag se carga UNA vez en `src/app/layout.tsx` y sirve a los dos destinos:
Google Ads (`AW-18163777075`, conversiones) y GA4 (`G-DXSC4J9RGF`, tráfico y eventos).
La pantalla de éxito de `/solicitar` dispara ambos: `trackLeadConversion()` (Ads) y
`trackGaLead()` (evento GA4 `generate_lead`, marcado como evento clave).

### A/B del hero móvil (`src/lib/analytics/experimentoHero.ts`)

**Qué prueba.** El mockup de WhatsApp del hero es `hidden lg:flex`, así que por debajo
de 1024px el hero es solo texto. La variante `b` llena ese hueco con la foto de un
técnico trabajando; la `a` es el hero actual. Reparto 50/50.

**Cómo se mide.** La variante viaja como parámetro `hero_variante` (`a` | `b`) dentro
del evento `generate_lead`. En GA4 se compara la conversión de una contra otra
**segmentando por móvil** — en desktop las dos variantes son idénticas, así que incluir
desktop solo diluye la señal.

**Tres decisiones que hay que respetar si se toca esto:**

1. La asignación la hace un script inline con `strategy="beforeInteractive"` que escribe
   `data-hero` en el `<html>` antes del primer paint. Si corriera después de hidratar se
   vería la variante `a` un instante. Por ese atributo el `<html>` lleva
   `suppressHydrationWarning`: el servidor no lo emite y React lo reportaría como
   desajuste.
2. La foto de la variante `b` se pinta con `background-image` desde una regla CSS bajo
   `[data-hero='b']` en `globals.css`, **no** con `<Image>` de Next. El navegador no
   descarga imágenes de reglas que no aplican, así que el grupo `a` no paga esos KB ni
   ensucia su LCP. Con `<Image>` ambos grupos la bajarían y el test mediría peso de
   página, no diseño.
3. El bloque de la foto es `h-36` en móvil a propósito: más alto empuja el CTA primario
   fuera del fold y el test pasaría a medir posición del botón en vez de la foto.

**Cerrar el experimento** = borrar el `<Script id="hero-experimento">`, las reglas
`.hero-variante-b` / `.hero-tecnico-foto` de `globals.css`, el bloque del hero en
`page.tsx` y el parámetro en `trackGaLead()`. Dejar la variante ganadora fija.
