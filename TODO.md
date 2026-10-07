# TODO — Baird Service
**Última actualización:** 7 de octubre de 2026

> Para el estado de salud (build/tests/migraciones) ver `docs/INDEX.md` § "Estado de salud actual". Para migraciones pendientes, la fuente de verdad es `supabase/migrations/README.md`.

## Estado general

El proyecto está en **fase de producción activa** servido desde **`https://lineablanca.bairdservice.com`** (migrado el 2026-05-23 desde `baird-app.vercel.app`, que sigue vivo como alias del mismo deployment como red de seguridad). Flujo **customer-first scheduling (v2)**: el cliente elige horario antes de que se notifique a los técnicos. Implementadas también:
- 4 opciones de siguiente paso post-diagnóstico (reparar / esperar repuesto / no reparable / negativa cliente)
- Oath del técnico con firma digital antes de cada diagnóstico
- Tracking GPS en 4 fases con flagging silencioso 30 min post-visita
- Página pública de Términos y Condiciones (Ley 1480/2011, Ley 1581/2012)
- Plantillas WhatsApp en Meta: ~43 distintas enviadas por el código (46 definiciones en `scripts/upload-templates.mjs` + 10 vigentes en `scripts/upload-templates-v2.mjs`; catálogo canónico en `docs/WHATSAPP_TEMPLATES.md`, status real con `--check`)
- UI admin para gestión de repuestos pendientes y alertas GPS

**Novedades 2026-06/07:** supervisores con avisos WhatsApp por cambio de estado + botón "pedir repuesto a supervisores", resumen semanal PDF a supervisores (`resumen_semanal_supervisores_v1`), mapa admin `/admin/mapa` con geocoding, calendario de agenda con cupo por franja, reagendar/cancelar self-service del cliente, Fase 0 de segunda línea de voz IA (Dapta, apagada tras `DAPTA_ENABLED`), endpoint de diagnóstico `/api/test-whatsapp`, gtag de conversiones.

**Migración 2026-05-23 completada.** Ver `docs/mejoras-futuras/migracion-dominio/runbook-cutover-2026-05-23.md` para detalles + rollback.

---

## Completado

### Flujo del cliente
- [x] Landing page con acceso diferenciado (cliente / técnico)
- [x] Formulario de solicitud de servicio con todos los campos relevantes
- [x] Soporte para solicitudes de garantía (campos condicionales)
- [x] Triaje IA con Google Gemini: diagnóstico, costos, urgencia, partes
- [x] Análisis IA en tiempo real con debounce mientras el usuario escribe
- [x] Validación de formulario con Zod (teléfono colombiano, campos condicionales)
- [x] Persistencia de solicitudes en Supabase (`solicitudes_servicio`)
- [x] Confirmación de solicitud con ID generado
- [x] **Confirmación de servicio por el cliente** — página `/confirmar/{token}` con satisfecho/reportar problema

### Flujo del técnico
- [x] Formulario de registro de técnicos
- [x] Selección de múltiples especialidades
- [x] Carga de foto de perfil con validación (JPG/PNG, máx 2MB)
- [x] Carga de foto de documento de identidad (JPG/PNG, máx 5MB)
- [x] Acuerdo de garantía en el registro
- [x] Almacenamiento de imágenes en Supabase Storage
- [x] **Portal del técnico** — `/tecnico/{token}` con lista de servicios activos e historial
- [x] **Completación de servicio** — `/tecnico/{token}/completar/{id}` con fotos, checklist, firma digital, GPS
- [x] **Portal token** — UUID persistente por técnico, acceso sin login por link

### WhatsApp — código
- [x] `whatsapp.service.ts` — `notificarTecnicos()`, `procesarAceptacion()`, `verificarFirmaWebhook()`
- [x] `POST /api/whatsapp/notify` — busca técnicos compatibles y envía mensajes
- [x] `GET /api/whatsapp/webhook` — handshake de verificación con Meta
- [x] `POST /api/whatsapp/webhook` — recibe eventos, verifica firma HMAC, responde 200
- [x] `POST /api/whatsapp/accept` — asignación atómica (primer en aceptar gana)
- [x] `/aceptar/[token]` — página de aceptación para técnicos
- [x] Mensaje de aceptación incluye link al portal del técnico
- [x] `POST /api/completar-servicio` — envía WhatsApp al cliente pidiendo confirmación
- [x] `POST /api/confirmar-servicio` — procesa confirmación del cliente
- [x] Mapping especialidades (`Lavadora` → `Lavadoras`, etc.)
- [x] **Bienvenida por WhatsApp al registrarse** — `POST /api/notificar-registro` envía mensaje interactivo al técnico
- [x] WhatsApp API actualizada a v22.0 con constante centralizada

### WhatsApp — infraestructura Meta
- [x] Cuenta Meta Business creada
- [x] App "Baird Service" creada en Meta for Developers
- [x] Producto WhatsApp agregado a la app
- [x] Phone Number ID obtenido: `1148716061648720` (número propio +57 313 4951164)
- [x] WABA ID obtenido: `2354953275016882`
- [x] Webhook registrado y verificado: `https://baird-app.vercel.app/api/whatsapp/webhook` (sin cambiar tras la migración del 2026-05-23 — ambos dominios sirven el mismo deployment, ver runbook-cutover-2026-05-23.md)
- [x] Verificación de negocio completada (vía Shopify: 1rep538r 1768612310)
- [x] Verificación de acceso (tech provider) enviada — en revisión, deadline 2026-05-31
- [x] System User `baird-api` creado con acceso Admin
- [x] Número propio +57 313 4951164 registrado en la API

### Admin panel
- [x] Dashboard con estadísticas generales
- [x] Lista y detalle de solicitudes con filtros por estado
- [x] Lista y detalle de técnicos con verificar/rechazar
- [x] Autenticación Supabase Auth (email/password)
- [x] **Carga masiva** — `/admin/carga-masiva` upload de Excel (formato BITÁCORA Mabe/GE)
- [x] **Dashboard de garantías** — `/admin/garantias` resumen por marca, equipo y estado
- [x] **Vista de evidencia** — en detalle de solicitud: fotos, checklist, firma, estado de confirmación
- [x] Botón re-notificar con diagnóstico de matching
- [x] Nuevos estados: `en_verificacion`, `en_disputa` con estilos y labels

### Infraestructura y despliegue
- [x] Proyecto desplegado en Vercel: `https://lineablanca.bairdservice.com` (dominio principal desde 2026-05-23) + `https://baird-app.vercel.app` (alias del mismo deployment, red de seguridad)
- [x] Componentes UI reutilizables: Button, InputField, SelectField, TextAreaField, Alert
- [x] Hooks personalizados: useDebounce, useSolicitudForm, useTriaje
- [x] Error boundary `error.tsx` y página 404 `not-found.tsx`
- [x] Loading skeletons para `/solicitar` y `/registro`
- [x] Imágenes Unsplash configuradas en `remotePatterns`
- [x] Storage bucket `evidencias-servicio` para fotos de completación
- [x] Lint cleanup completo — 26 problemas resueltos (commit 3f771c9)
- [x] RLS habilitado en 7 de 9 tablas (sigue **off** en `solicitudes_servicio` y `especialidades_tecnico` — ver pendiente §5 abajo y `docs/GOTCHAS.md`)

### Flujo particular (no-garantía)
- [x] Diferenciación completa WARRANTY vs PARTICULAR en todo el stack
- [x] `notificarTecnicos()` — envía template diferente según `es_garantia`
- [x] `procesarAceptacion()` — estado `diagnostico_pendiente` para particular
- [x] Formulario de diagnóstico con cotización (mano de obra + repuestos)
- [x] `POST /api/diagnostico` — branch WARRANTY (tarifa) vs PARTICULAR (cotización)
- [x] `enviarCotizacionCliente()` — envía cotización al cliente con template WhatsApp
- [x] Página `/cotizacion/{token}` — cliente aprueba o rechaza cotización
- [x] `POST /api/aprobar-cotizacion` — procesa aprobación/rechazo
- [x] `notificarCotizacionAprobada()` — notifica al técnico
- [x] Nuevos estados: `diagnostico_pendiente`, `cotizacion_enviada`, `cotizacion_aprobada`, `cotizacion_rechazada`
- [x] Constantes: `TARIFA_DIAGNOSTICO = $80,000 COP`, `ANTICIPO_PORCENTAJE = 50%`

### Customer-first scheduling v2 (2026-04-27) — NEW
- [x] Tipos `EstadoSolicitud` con 5 estados nuevos: `pendiente_horario`, `sin_agendar`, `esperando_repuesto`, `finalizado_sin_reparacion`, `cancelada_cliente`
- [x] Tipo `SiguientePasoDiagnostico` con 4 valores
- [x] Migración SQL completa lista (`20260427_customer_first_scheduling.sql`)
- [x] 6 nuevas plantillas Meta aprobadas: `cliente_seleccion_horario_v1`, `recordatorio_horario_v1`, `tecnico_asignado_cliente_v5`, `esperando_repuesto_cliente_v1`, `repuesto_recibido_cliente_v1`, `finalizado_sin_reparacion_v1`
- [x] Página `/horario/[token]` — cliente elige 1 de 2 horarios + acepta T&C
- [x] Endpoint `/api/confirmar-horario` — atomic update + dispara `notificarTecnicos`
- [x] Cron `/api/cron/horario-recordatorio` — recordatorio 24h + transición `sin_agendar` 36h
- [x] Página `/terminos` — T&C completos alineados con legislación colombiana
- [x] OathModal — declaración bajo juramento + firma digital del técnico antes del diagnóstico
- [x] SiguientePasoSelector — 4 opciones con SKU obligatorio para `esperar_repuesto`
- [x] Hook `useGps` + endpoint `/api/gps-ping` para tracking en 4 fases
- [x] Cron `/api/cron/gps-followup` — flagging silencioso 30 min post-visita (radio 100m)
- [x] UI admin `/admin/repuestos` — gestión de repuestos pendientes
- [x] UI admin `/admin/gps-alertas` — visualización de servicios flagged
- [x] Endpoint `/api/repuesto-recibido` — admin marca repuesto + reactiva estado + notifica cliente
- [x] Tabla `repuestos_pendientes` con SKU, descripción, costo, tiempo_estimado
- [x] Tabla `gps_pings` con auditoría completa de fases
- [x] `vercel.json` con cron schedules

### Migraciones SQL
- [x] `add_whatsapp_fields.sql` — campos WhatsApp y tabla `notificaciones_whatsapp`
- [x] `20260327_portal_evidencias.sql` — `portal_token` en tecnicos, tabla `evidencias_servicio`
- [x] `20260427_customer_first_scheduling.sql` — aplicada (v2 en producción)
- Estado de todas las demás migraciones: **`supabase/migrations/README.md`** (fuente de verdad)

---

## Pendientes — para activar producción

### 1. Templates WhatsApp para flujo particular — ✅ APROBADAS
- [x] `solicitud_particular_cliente_v1` — APPROVED
- [x] `solicitud_particular_tecnico_v1` — APPROVED
- [x] `tecnico_asignado_particular_v1` — APPROVED
- [x] `cotizacion_cliente_v1` — APPROVED
- [x] `cotizacion_aprobada_tecnico_v1` — APPROVED

### 1b. Templates v2 customer-first scheduling — ✅ APROBADAS
- [x] `cliente_seleccion_horario_v1` — APPROVED
- [x] `recordatorio_horario_v1` — APPROVED
- [x] `tecnico_asignado_cliente_v5` — APPROVED (reemplaza v4)
- [x] `esperando_repuesto_cliente_v1` — APPROVED
- [x] `repuesto_recibido_cliente_v1` — APPROVED
- [x] `finalizado_sin_reparacion_v1` — APPROVED

### 2. Verificación del negocio en Meta ✅ COMPLETADO
- [x] Verificación de negocio completada vía Shopify (1rep538r 1768612310)
- [x] Verificación de acceso (tech provider) enviada — en revisión (deadline 2026-05-31)

### 3. Registrar número propio de WhatsApp ✅ COMPLETADO
- [x] Número +57 313 4951164 registrado en Meta API
- [x] Phone Number ID: `1148716061648720`
- [x] WABA ID: `2354953275016882`

### 4. Token permanente (System User) ✅ COMPLETADO
- [x] System User `baird-api` con token permanente activo

### 5. RLS en Supabase — Fases 0, 1 y 4.1 HECHAS (2026-07-11), 2–4.2 PENDIENTES (plan en `docs/PLAN-RLS.md`)
- [x] Fase 0/1: todo el server-side escribe con `service_role` (`supabaseAdmin`); self-signup apagado
- [x] Fase 4.1: `supervisores`, `llamadas`, `gps_pings`, `solicitud_eventos`, `connection_errors` y `pagos` cerradas al anon; writes anon de `notificaciones_whatsapp`/`repuestos_pendientes` quitados
- [ ] Fase 2: `/registro` y edición admin de técnicos → API route server-side; cerrar writes anon de `tecnicos`
- [ ] Fase 3: insert de evidencias (`completar/[id]`) y lecturas de `/aceptar`, `/verificar-paso` → server; cerrar `evidencias_servicio` y los SELECT anon que quedan
- [ ] Fase 4.2: habilitar RLS en `solicitudes_servicio` (tabla principal) y `especialidades_tecnico` con policies anon por token
- [ ] Borrar la rama `seguridad/rls-fase1` (ya mergeada en `a32fdd3`) local y en origin

---

## Pendientes — Fase 2

### Alta prioridad
- [ ] **Segunda visita sin repuesto** — Gap verificado 2026-06-02. La segunda visita CON repuesto ya funciona end-to-end; falta el camino "la reparación necesita otro día pero no requiere pieza" (`reparar` cierra en la misma visita, `esperar_repuesto` exige SKU). 4 opciones para revisar en `docs/mejoras-futuras/segunda-visita/README.md` (recomendación tentativa: nuevo `siguiente_paso = agendar_segunda_visita`).
- [ ] **Auto-cierre 24h** — Si el cliente no confirma en 24h, marcar automáticamente como completada (cron job o edge function)
- [ ] **Seguimiento para el cliente** — página pública `/solicitud/{id}` con estado en tiempo real
- [ ] **Notificación de disputa** — cuando el cliente reporta problema, avisar al admin por WhatsApp/email
- [ ] **Hardening de seguridad** (ver `docs/SEGURIDAD.md` § 7 "Backlog priorizado"):
  - RLS en 5 tablas críticas
  - `tecnicos-documentos` → signed URLs (PII de cédulas hoy público)
  - Rate limiting en `/api/solicitar` y `/api/admin/login`
  - MFA (TOTP) en login admin
  - Audit log de acciones admin

### Media prioridad
- [ ] **Mappers de Excel adicionales** — para otros formatos de proveedores (no solo Mabe/GE BITÁCORA)
- [x] **Exportar reportes** — `/api/admin/export` genera resumen Excel (complejidad derivada de `codigos-falla.ts`)
- [ ] **Automatizar resumen semanal** — el PDF a supervisores hoy se dispara manualmente (`scripts/enviar-resumen-supervisores.mjs`); falta cron
- [ ] **Paginación** — queries sin LIMIT actuales serán lentas con volumen

### Modelo de pago

> **Aclaración:** El pago se realiza directamente a Baird Service (la empresa) por medios electrónicos. **No se acepta efectivo.** El técnico no recibe pago directo del cliente.

### Baja prioridad
- [ ] **Sistema de reseñas** — calificación con estrellas al confirmar servicio
- [ ] **Integración de pagos** — PSE / tarjeta (ver apéndice de pasarelas en `docs/TARIFAS.md`)
- [x] **Términos y condiciones** — página `/terminos` publicada
- [ ] **Analytics** — gtag de conversiones ya integrado (2026-07-03); GA4 `G-DXSC4J9RGF` en todas las páginas + evento `generate_lead` en /solicitar (2026-07-17, `src/lib/analytics/googleAnalytics.ts`); falta dashboard con patrones de fallas más comunes
- [ ] **SEO** — Open Graph, sitemap, meta tags completos

---

## Deuda técnica

| Área | Descripción | Impacto |
|------|-------------|---------|
| **Testing** | Vitest con 19 archivos / ~320 casos en `src/__tests__/` (utils, validations, services, lib/wompi, pdf) — sin integración real ni e2e (Playwright pendiente). | Medio |
| **RLS Supabase** | Fases 0/1/4.1 hechas (server con service_role; 6 tablas cerradas al anon). Off en `solicitudes_servicio` + `especialidades_tecnico`; writes anon en `tecnicos`/`evidencias_servicio`. Ver pendiente §5 y `docs/PLAN-RLS.md`. | Alto |
| **Rate limiting** | In-memory per-isolate (best-effort en serverless). Fix real: Upstash/Vercel KV. Cubre 10 paths en `middleware.ts` (solicitar, log-error, triaje, notify, accept, carga-masiva, OTP supervisor…). `/api/notificar-registro` sigue sin auth ni límite. | Medio |
| **Gestión estado global** | Solo hooks locales. Evaluar Zustand si la app crece. | Bajo |
| **Phone utilities** | ~~Resuelto~~ — consolidadas en `src/lib/utils/phone.ts` + trigger BD `normalizar_telefono_co()` (2026-05-13). | ✅ |
| **Excel mapper** | Hardcoded para formato BITÁCORA Mabe/GE. No flexible para otros proveedores. | Medio |
| **Paginación** | Queries sin LIMIT — costosas cuando haya volumen. | Futuro |

---

## Documentación — pendientes de la auditoría 2026-10-07

Auditoría de 47 `.md` contra el código (`8c6f442`). La **tanda 1** (hecha 2026-10-07) cerró: env vars completas en `CLAUDE.md`/`.env.example`/`GUIA_RAPIDA`, guía del cliente Supabase (anon vs service_role), estado RLS post-Fase 4.1 en 6 docs, `PLAN-RLS.md` enlazado, conteos de plantillas, raíz histórica → `docs/historico/`, `no_show_cliente` en `EstadoSolicitud`.

### Tanda 2 — requieren decisión de negocio
- [ ] **CTA Shopify "Pagar anticipo $42.000" en `/solicitar`** (`src/app/solicitar/page.tsx` ~l.249): contradice "Wompi pasarela única" y permite doble cobro (Shopify + link Wompi tras aceptación). Quitar / gatear por `wompiHabilitado()` / documentar que sigue vivo. Luego alinear `docs/WOMPI.md`, `docs/TARIFAS.md` § pendiente 5 y `pagos-shopify/README.md`.
- [ ] **Unificar scripts de plantillas**: las 10 versiones vigentes viven solo en `scripts/upload-templates-v2.mjs`; el canónico conserva las superseded. Mover las vigentes al principal (o borrar las viejas) y corregir los "En script ✅" de `docs/WHATSAPP_TEMPLATES.md`.
- [ ] **`/api/notificar-registro`**: público, sin auth ni rate limit, dispara WhatsApp para cualquier `tecnicoId`. Acotar (token del registro, rate limit o verificación server-side).

### Tanda 3 — reescritura de docs con drift funcional
- [ ] `docs/FLOWS.md` § particular (l. ~387–520, 686–751, 845–864): Wompi anticipo v2 + saldo + abono 50%, cotización discriminada (diagnóstico + servicio), fórmula × 1.3675, `esperar_repuesto → pendiente_pricing`, plantillas `_v3` y `paso_*`, camino del supervisor `repuesto-entregado`. Header fecha.
- [ ] `docs/MAQUINA-DE-ESTADOS.md`: l. 308 (`esperar_repuesto → pendiente_pricing`), transición supervisor `repuesto-entregado`, timeout garantía 84h (l. 42/296/329), modelo de pago (l. 17/172) + saldo/abono, JSONB `cotizacion` con `diagnostico_cliente`/`servicio_cliente`/`base_venta`/`iva_venta`/`comision_pasarela`.
- [ ] `docs/ARQUITECTURA.md`: 11 rutas API sin documentar (`/api/admin/llamadas`, `/api/admin/supervisores/enviar-acceso`, `/api/supervisor/*` ×6, `/api/tecnico/llamada-intento`, `/api/wompi/webhook`), páginas `/pago/*` y `/supervisor/*`, 15 funciones de `whatsapp.service.ts`, crons son diarios (no 1h/10min), `cotizacion_aprobada_tecnico_v3`.
- [ ] `docs/TARIFAS.md`: l. 221 pricing gate invertido (es particular, no garantía), recargo en cotizaciones $7.261 (no $7.140), anticipo tras aceptación (l. 257), `calcularTarifaGarantia` no existe (l. 341), pendiente 5 y l. 472 pre-Wompi. Comentario `mabe.ts:93-96` (recargo 90% al técnico, incluye festivos).
- [ ] `docs/TEST_CARGA_MASIVA.md` cuerpo: estado inicial `pendiente_horario`, teléfono en dígitos, PDF aceptado, duplicados rechazados (§ 5.1, 5.5, l. 179–181, 236–237).
- [ ] `docs/SUPABASE.md` + `supabase/migrations/README.md`: 7 migraciones sin documentar (`20260711_rls_fase4_1`, `20260807_llamadas_y_recordatorios`, `20260807_mensaje_cliente`, `20260811_comprobante_envio`, `20260818_wompi_pagos`, `20260819_saldo_pagado`, `20260825_cliente_cedula`) y columnas `cliente_cedula`, `anticipo_pagado_at`, `saldo_pagado_at`, `horario_recordatorio_*`, `repuesto_recordatorio_*`; queries de verificación #2/#10 con estados purgados; refs a `aprobar-cotizacion/route.ts:57-80` → `transiciones.service.ts`.
- [ ] `docs/SEGURIDAD.md` § 2: 4 rutas admin faltantes, rutas con token de supervisor/técnico/reprogramar, webhook Wompi, tabla de crons (3 diarios, falta `repuesto-recordatorio`).
- [ ] `docs/PROTOCOLO-VISITA.md`: marcar como spec no implementada, l. 130 (migración aplicada), puntero al backlog de plantillas. `docs/WHATSAPP_TEMPLATES.md`: status contradictorios (l. 48 vs 280/423/173/182/189), triggers l. 103/113/274/282, entradas `supervisor_acceso_v1` y `resumen_semanal_supervisores_v1`.
- [ ] `docs/WOMPI.md` (agregar `/pago/saldo` + 20260819), `docs/FACTURACION.md` (5 hojas, env vars Resend), `docs/PLAN-RLS.md` (header de estado, § 4 resuelto), `segunda-linea-voz/README.md` (migraciones aplicadas), `segunda-visita/README.md` (flujo actual sin pricing gate garantía). Anclas rotas: `INDEX` → FLOWS "Admin Pages", FLOWS:832 → "Estado de cobertura", `estados.ts:97` → "Estados terminales".
- [ ] Código menor: `cliente_historial` y `requiere_confirmacion_llamada` sin uso (documentar o quitar); comentario `1.3447` en `transiciones.service.ts:419`.
