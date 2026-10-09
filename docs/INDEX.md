# Índice de documentación — Baird Service

> Hub de navegación para iteraciones futuras (humanas o LLM). Antes de
> escribir nueva documentación o tocar código, **ubica acá la sección
> que corresponde y abre el doc específico**. Esto evita drift y
> duplicación.
>
> **Última revisión: 2026-10-07** (auditoría de 47 docs contra el código en `8c6f442`: RLS Fase 4.1 reflejada, PLAN-RLS enlazado, env vars completas, raíz histórica movida a `docs/historico/`, conteos de plantillas corregidos). Pendiente tanda 2/3: FLOWS particular, MAQUINA-DE-ESTADOS, ARQUITECTURA, TARIFAS, TEST_CARGA_MASIVA — ver `TODO.md` § Documentación.

---

## ⚡ Atajo: ¿qué doc abro para…?

| Tu objetivo | Doc a leer | Sección |
|---|---|---|
| **Entender los flujos completos** (warranty, particular, side flows) | `docs/FLOWS.md` | Todo |
| **Ver la state machine, pricing gate, self-service** | `docs/MAQUINA-DE-ESTADOS.md` | Todo |
| **Ubicar un archivo, ruta, página o función de servicio** | `docs/ARQUITECTURA.md` | Todo |
| **Cambiar una tarifa, bono, margen, fórmula de pago** | `docs/TARIFAS.md` | "Cómo cambiar una tarifa" |
| **Calcular cuánto paga el cliente / recibe el técnico / margen Baird** | `docs/TARIFAS.md` | "Garantía MABE" o "Particular" |
| **Facturar en Siigo, liquidar técnicos cada 15 días, cruzar un pago Wompi con su servicio** | `docs/FACTURACION.md` | Todo (§ 3 exports, § 4 quincena, § 6 repuestos al técnico) |
| **Implementar verificación T-24h / no-show** | `docs/PROTOCOLO-VISITA.md` | Todo |
| **Cambiar un mensaje de WhatsApp** (texto, params, plantilla) | `docs/WHATSAPP_TEMPLATES.md` | "Proceso obligatorio para crear o modificar una plantilla" + catálogo |
| **Agregar un endpoint admin o cambiar auth** | `docs/SEGURIDAD.md` | "Endpoints API" + checklist final |
| **Agregar un estado nuevo** a la state machine | `docs/MAQUINA-DE-ESTADOS.md` § "Solicitud State Machine" + `supabase/migrations/README.md` ("Cómo aplicar las pendientes") |
| **Aplicar migración Supabase** | `supabase/migrations/README.md` | "Cómo aplicar las pendientes" |
| **Ver qué columnas existen** en una tabla | `docs/SUPABASE.md` § "Database Tables" + última migración relevante |
| **Entender RLS y storage** | `docs/SUPABASE.md` § "Supabase Architecture" + **`docs/PLAN-RLS.md`** (fases + bitácora: qué está cerrado y qué falta) |
| **Elegir el cliente Supabase correcto** (anon vs service_role) | `docs/GOTCHAS.md` (primer ítem) + `docs/SUPABASE.md` § "Dos clientes" |
| **Saber qué env vars necesita** | `CLAUDE.md` § "Environment Variables" |
| **Entender por qué un técnico sí/no recibe una oferta** (matching ciudad/especialidad) | `docs/GOTCHAS.md` § Matching + `src/lib/utils/format.ts` (`normalizeForMatch`, `cityTokenForMatch`) + panel "Diagnóstico de matching" en `/admin/solicitudes/[id]` |
| **Reenviar la oferta a técnicos de varias solicitudes a la vez** | `/admin/solicitudes` → filtro "Sin técnico" → seleccionar → "Reenviar a técnicos" (usa `POST /api/whatsapp/notify`) |
| **Cargar órdenes MABE masivamente** (Excel BITÁCORA o PDF TALLER) | `docs/TEST_CARGA_MASIVA.md` + `src/lib/utils/pdf-orden-mapping.ts` |
| **Tocar un cobro online** (anticipo, saldo, abono, webhook Wompi) | `docs/WOMPI.md` |
| **Entender el portal de supervisores** (link mágico, OTP, alcance) | `docs/SEGURIDAD.md` § Supervisores + `src/lib/auth/supervisor.ts` |
| **Especialidades del técnico, gasodomésticos, certificaciones (SENA, gas, CONTE)** | `docs/CERTIFICACIONES.md` + `src/lib/constants/{especialidades,certificaciones}.ts` |
| **Encender o tocar la línea de voz IA** | `docs/DAPTA.md` |
| **Probar el flujo end-to-end** | `docs/FLOWS.md` § "Para validar end-to-end (testing manual)" |
| **Verificar que un cambio de RLS / Storage no rompió flujos** | `scripts/verify-flows.mjs` + `docs/SEGURIDAD.md` § 5.1 |
| **Investigar un error de conexión del cliente** | `/admin/errores` panel + `docs/ARQUITECTURA.md` § "Observabilidad" |
| **Entender el retry con backoff de queries (`querySupabase`)** | `docs/ARQUITECTURA.md` § "Utilidades transversales" |
| **Tocar analítica, conversiones de Ads o el A/B del hero** | `docs/ARQUITECTURA.md` § "Analítica y experimentos" + `src/lib/analytics/experimentoHero.ts` |
| **Auditar deuda técnica / gaps** | `docs/FLOWS.md` § "Gaps conocidos" + `supabase/migrations/README.md` § "Hallazgos del audit" |
| **Convenciones de código** (nombres, idiomas, patrones) | `CLAUDE.md` § "Code Conventions" + `docs/GOTCHAS.md` |
| **Trampas conocidas antes de tocar código sensible** | `docs/GOTCHAS.md` | Todo |
| **Quiénes son los usuarios** y cómo se conecta el negocio | `docs/MAQUINA-DE-ESTADOS.md` § "How the Two Flows Work" |

---

## 📚 Mapa completo de documentación

### Documentación canónica (mantenida)

| Doc | Para qué sirve | Cuándo lo lees | Cuándo lo actualizas |
|---|---|---|---|
| **`CLAUDE.md`** (raíz) | Índice esbelto del proyecto. Auto-cargado por Claude Code en cada sesión. Solo lo esencial inline (commands, stack, conventions, env vars) + navegación a los docs específicos. | Siempre primero. | Cuando agregas una env var, una convención de código, o un doc nuevo a la lista de navegación. |
| **`docs/ARQUITECTURA.md`** | Mapa de archivos: árbol de directorios completo, funciones de `whatsapp.service.ts`, API routes, páginas customer/technician/admin, exportación de resumen Excel. | Cuando necesitás ubicar un archivo, ruta, página o función de servicio. | Tras agregar/mover una página, API route, función de servicio, o cambiar el árbol de directorios. |
| **`docs/MAQUINA-DE-ESTADOS.md`** | Cómo se parte el sistema en dos flujos (`es_garantia`), diagramas warranty/particular, payment model, admin pricing gate, customer self-service, state machine completa. Complementa `FLOWS.md` (narrativo). | Antes de tocar la state machine, el pricing gate o el self-service. | Tras agregar un estado, cambiar una transición, modificar el pricing gate o el self-service. |
| **`docs/SUPABASE.md`** | Capa de datos: tablas, columnas JSONB (`triaje_resultado`, `cotizacion`), cliente único, migraciones, RLS por tabla, storage buckets, patrones de query, tablas append-only, CHECK constraints, auth admin, auditoría. | Antes de tocar el schema, escribir una query, o entender RLS/storage. | Tras agregar tabla/columna, cambiar RLS, agregar bucket, o un patrón de query nuevo. |
| **`docs/GOTCHAS.md`** | Trampas conocidas: Supabase client, atomic acceptance, phone format, WhatsApp 24h window, storage PII, RLS gap, pre-deploy, etc. | Antes de tocar código sensible. | Cuando detectás un patrón a evitar o una trampa nueva. |
| **`docs/TARIFAS.md`** | Doc canónico de tarifas. MABE garantía (Tipo D + bonos + weekend + margen 22%) y particular multi-marca (× 1.13 utilidad Baird × 1.19 IVA, + ½ comisión Wompi en cotizaciones ≈ × 1.3675). Apéndices: marco tributario 2026, pasarelas, decisión reseller vs marketplace. | Antes de tocar cualquier cálculo de pago, agregar bono/recargo, o cambiar margen. | Tras cambiar una tarifa, modificar el modelo de margen, agregar marca nueva al flujo garantía, o cambiar IVA por reforma DIAN. |
| **`docs/PROTOCOLO-VISITA.md`** | **Spec parcialmente implementada** (solo migración, `cumple_ta`, recargo y estado `no_show_cliente`; recordatorios T-24h/T-2h, plantillas y UI de no-show pendientes). Verificación T-24h / T-2h / llegada / no-show, política de gracia recurrentes. | Antes de implementar UI técnico para llegada, recordatorios, o gestión de no-shows. | Tras cambiar el SLA de TA, agregar/quitar pasos del protocolo, modificar política de gracia. |
| **`docs/FLOWS.md`** | Diagramas paso-a-paso de cada flujo end-to-end con cada plantilla WhatsApp en su contexto, puntos de decisión del cliente, gaps conocidos, plan de testing manual. | Cuando vas a tocar el state machine, agregar una página customer-facing, o entender dónde se manda qué WhatsApp. | Tras cambiar el state machine, agregar/cambiar una plantilla en el flujo, o mover un disparo de WhatsApp. |
| **`docs/WHATSAPP_TEMPLATES.md`** | Catálogo de las plantillas Meta (conteo/status reales: `upload-templates.mjs --check`; 10 versiones vigentes viven en `upload-templates-v2.mjs`), parámetros, disparo, copy completo. **Define el proceso obligatorio de cambio de plantilla.** Backlog de plantillas nuevas con JSON listo. | Antes de tocar cualquier mensaje WhatsApp. | Tras cambiar params de una plantilla, agregar una nueva, o subirla a Meta. |
| **`docs/SEGURIDAD.md`** | Mapa de autenticación y autorización: frontend admin, endpoints API (admin/cliente/cron), tokens UUID, RLS, storage, histórico de incidentes, backlog de hardening. | Antes de tocar cualquier endpoint admin, agregar uno nuevo, o auditar seguridad. | Tras agregar/quitar endpoint admin, cambiar el patrón de auth, habilitar RLS, o resolver un incidente. |
| **`docs/CERTIFICACIONES.md`** | Idoneidad del técnico: alcance de cada especialidad, gasodomésticos (Res. 90902/2013), catálogo de certificaciones (competencia en gas, refrigerantes, CONTE, SENA, alturas, antecedentes), modelo JSONB `tecnicos.certificaciones`, estados y regla "el técnico declara, el admin verifica", marco normativo con fuentes, checklist operativo y pendientes (gate en el matching). | Antes de tocar especialidades, el registro del técnico, la ficha admin del técnico o pensar en exigir certificaciones. | Tras agregar/renombrar una especialidad o certificación, cambiar un estado, o implementar el gate de gas en el matching. |
| **`docs/DAPTA.md`** | Segunda línea de voz IA — resumen operativo de la Fase 0 (servicio, webhook, tabla `llamadas`, env vars, cómo encenderla). El doc de decisión/fases/costos vive en `mejoras-futuras/segunda-linea-voz/`. | Antes de tocar `dapta.service.ts`, el webhook o pensar en encender `DAPTA_ENABLED`. | Tras avanzar una fase, cambiar de proveedor o encender/apagar el kill-switch. |
| **`docs/FACTURACION.md`** | Facturación y contabilidad: qué documento contable genera cada servicio (FV cliente, FV MABE, documento soporte técnico, ledger Wompi), qué campos pide Siigo y cuáles faltan, export `tipo: 'facturacion'` de `/admin/liquidaciones`, liquidación quincenal, opciones para venderle repuestos al técnico e integración por fases con Siigo. | Antes de tocar `/api/admin/liquidaciones`, `facturacion.ts`, o proponer algo de contabilidad/Siigo. | Tras cambiar un ID de Siigo, agregar una hoja al export, capturar un dato nuevo del cliente/técnico o decidir una opción de § 6/§ 7. |
| **`docs/WOMPI.md`** | Pasarela de pagos (decisión 2026-08-18): anticipo de reserva, página `/pago/anticipo/{token}`, webhook, tabla `pagos`, reglas de seguridad del checkout firmado, env vars y puesta en marcha. | Antes de tocar cualquier cobro online, `src/lib/wompi.ts` o `pagos.service.ts`. | Tras agregar un cobro nuevo (saldo), cambiar % de anticipo, o activar split al técnico. |
| **`docs/PLAN-RLS.md`** | Plan de cierre de la capa de datos en 5 fases + bitácora de ejecución (Fase 0, 1 y 4.1 aplicadas 2026-07-11; 2–4.2 pendientes). Snapshot de rollback en `supabase/rls-rollback-snapshot-2026-07-11.sql`. | Antes de tocar RLS, policies o el cliente Supabase de una página. | Tras aplicar una fase o mover un write client-side a server. |
| **`supabase/migrations/README.md`** | Lista ordenada de migraciones, status (aplicada/pendiente), hotfixes, verificación SQL post-apply, backlog de migraciones futuras. | Antes de aplicar una migración o cuando hay drift schema↔código. | Tras crear nueva migración o aplicar una. |
| **`docs/INDEX.md`** (este archivo) | Hub de navegación. Mapea tareas comunes a docs específicos. | Primero al iniciar una iteración. | Cuando creas un nuevo doc o cambias el rol de uno existente. |

### Documentación operacional (referencia)

| Doc | Para qué sirve |
|---|---|
| `docs/TEST_CARGA_MASIVA.md` | Procedimiento de test de `/admin/carga-masiva`: Excel BITÁCORA y PDF de órdenes TALLER MABE (§ 7; § 7.1 explica el parser paso a paso y § 7.2 los casos reales corregidos, último 2026-10-09). ⚠️ El cuerpo (estado inicial, teléfono, duplicados) está desactualizado — tanda 3. |
| `docs/pagos-tecnico.pdf` | Guía de pagos al técnico (PDF que se comparte por WhatsApp). La versión web es `public/guia-pagos.html`. |
| `docs/flujos-servicio.html` | Mockup visual antiguo del flujo. No es referencia técnica. |
| `legal/*.docx` | Documentos legales (T&C, política privacidad, contratos, etc.) — Colombian SAS compliance. |

### Backlog de mejoras futuras (ideas en discusión, aún no implementadas)

| Subcarpeta | Iniciativa |
|---|---|
| [`docs/mejoras-futuras/`](mejoras-futuras/README.md) | Hub: inventario de proyectos en discusión + convenciones para agregar/promover/descartar. |
| [`docs/mejoras-futuras/segunda-visita/`](mejoras-futuras/segunda-visita/README.md) | Segunda visita técnica sin repuesto. Gap verificado 2026-06-02: la repuesto-arrival ya funciona; falta el camino "reparar requiere otro día sin pieza". 4 opciones para revisar. |
| [`docs/mejoras-futuras/segunda-linea-voz/`](mejoras-futuras/segunda-linea-voz/README.md) | Segunda línea de voz IA (llamadas cuando WhatsApp no responde). Fase 0 código completo apagada tras `DAPTA_ENABLED=false`; decisión de proveedor pendiente (Dapta $99/mes fijo vs Retell PAYG ~$8–25/mes). |

### Proyectos completados (registro histórico, no actualizar)

| Subcarpeta | Iniciativa | Completado |
|---|---|---|
| [`docs/mejoras-futuras/migracion-dominio/`](mejoras-futuras/migracion-dominio/README.md) | Migración del app a `lineablanca.bairdservice.com`. Runbook + rollback documentado. | 2026-05-23 |
| [`docs/mejoras-futuras/mapa-admin/`](mejoras-futuras/mapa-admin/README.md) | Mapa admin de servicios geolocalizados en `/admin/mapa`. Pipeline geocoding + 9 mejoras UI. Fase 2 (GPS en vivo, heatmap, rutas) diferida. | 2026-05-23 |
| [`docs/mejoras-futuras/supervisores-y-repuesto-recibido/`](mejoras-futuras/supervisores-y-repuesto-recibido/plan-despliegue-2026-05-29.md) | Supervisores con avisos WhatsApp por cambio de estado + estado `repuesto_recibido` + botón "pedir repuesto a supervisores". Desplegado en iteraciones sucesivas. | 2026-05-29 → 06-16 |
| [`docs/mejoras-futuras/pagos-shopify/`](mejoras-futuras/pagos-shopify/README.md) | **ARCHIVADO 2026-08-18** — superseded por Wompi como pasarela única (`docs/WOMPI.md`). Shopify queda solo para repuestos. ⚠️ El CTA de anticipo Shopify en `/solicitar` sigue en el código (decisión pendiente, tanda 2). | archivado |

### Documentación deprecated (no actualizar)

Vive en [`docs/historico/`](historico/README.md) con su propio índice: `FLUJOS-USUARIO-v1.md` (state machine v1), `COWORK.md`, `CONTEXTO.md`, `DIAGNOSTIC_2026-04-05.md`. Los punteros de raíz `API.md` / `ARQUITECTURA.md` / `MODULOS.md` se eliminaron el 2026-10-07 (recuperables con `git log`).

---

## 🔄 Pipeline de actualización (qué docs tocar cuando cambias algo)

### Cambias una tarifa, bono, margen o fórmula de pago
1. Editar el módulo correspondiente en `src/lib/constants/tarifas/`:
   - MABE garantía → `tarifas/mabe.ts`
   - Particular → `tarifas/particular.ts`
2. `docs/TARIFAS.md` — actualizar la tabla y los ejemplos de "casos extremos"
3. Si afecta cálculos persistidos: validar que `triaje_resultado` y `cotizacion` JSONB sigan compatibles con datos viejos
4. Si cambia `MARGEN_BAIRD_*` o `IVA_TARIFA`: comunicar al equipo de operaciones
5. `npm test` para confirmar
6. Si agrega columna nueva (`cumple_ta`, `cumple_encuesta`, etc.): seguir pipeline "Agregas una nueva tabla / columna"

### Cambias un mensaje WhatsApp (texto, params)
1. `scripts/upload-templates.mjs` — actualizar el JSON de la plantilla
2. `docs/WHATSAPP_TEMPLATES.md` — actualizar la entrada del catálogo
3. `docs/FLOWS.md` — si el cambio afecta el flujo (qué se manda cuándo)
4. Subir a Meta: `node --env-file=.env.local scripts/upload-templates.mjs <nombre>`
5. Esperar `APPROVED` antes de deployar el código que la invoca

### Agregas un estado nuevo a la state machine
1. `src/types/solicitud.ts` — agregar al union type `EstadoSolicitud`
2. `src/lib/constants/estados.ts` — label + color
3. Nueva migración SQL en `supabase/migrations/` reemplazando el CHECK constraint completo
4. `supabase/migrations/README.md` — agregar a la tabla y a la verificación SQL
5. `docs/MAQUINA-DE-ESTADOS.md` § "Solicitud State Machine" — actualizar diagrama
6. `docs/FLOWS.md` — actualizar flujos afectados
7. Aplicar migración en Supabase **antes** del deploy

### Agregas una nueva tabla / columna
1. Crear migración en `supabase/migrations/` (timestamped, idempotente con `IF NOT EXISTS`)
2. Si es columna que también existe en código pero no en DB: agregar `NOTIFY pgrst, 'reload schema';` al final de la migración
3. `supabase/migrations/README.md` — agregar a la lista
4. `docs/SUPABASE.md` § "Database Tables" — actualizar
5. Si afecta RLS o storage: `docs/SUPABASE.md` § "Supabase Architecture"

### Agregas un nuevo flujo customer-facing (página + API)
1. Crear página + componente cliente
2. Crear API route con guards (auth, atomic update si aplica)
3. Si requiere nueva plantilla WhatsApp → seguir el pipeline de plantillas
4. `docs/ARQUITECTURA.md` § "Architecture" + "API Routes" + "Customer-Facing Pages"
5. `docs/FLOWS.md` — agregar diagrama del flujo

### Cambias o agregas un endpoint admin
1. Editar API route + UI
2. **Auth obligatorio**: `verificarAdmin` desde `@/lib/auth/admin` como primera línea del handler. Ver checklist completo en `docs/SEGURIDAD.md` § "Cómo agregar un endpoint admin nuevo"
3. UI envía `Authorization: Bearer ${session.access_token}`
4. `docs/ARQUITECTURA.md` § "API Routes" si el endpoint cambia de propósito
5. `docs/ARQUITECTURA.md` § "Admin Pages" si cambia el rol del admin (FLOWS.md no tiene esa sección)
6. `docs/SEGURIDAD.md` § "Endpoints API → Admin" — agregar a la tabla

### Agregas una env var
1. `CLAUDE.md` § "Environment Variables"
2. Si afecta tests: `src/__tests__/setup.ts`
3. Si tiene default por seguridad (e.g., `BAIRD_TEST_PHONE_WHITELIST`): documentar el comportamiento sin la env

### Detectas un bug
1. Reproducir + fix en código
2. Si requiere migración: crear y agregar a `supabase/migrations/README.md` como HOTFIX URGENTE
3. Documentar la causa raíz en el commit message (no en docs — es ruido a 3 meses)
4. Si es un patrón a evitar: agregar a `docs/GOTCHAS.md`

---

## 🧠 Convenciones que cubre cada doc

| Tema | Doc principal | Nota |
|---|---|---|
| Tokens UUID y por qué | `docs/GOTCHAS.md` + `docs/FLOWS.md` | `cliente_token`, `horario_token`, `verificacion_paso_token`, `portal_token`, `confirmacion_token` |
| Atomic update pattern (anti-race) | `docs/SUPABASE.md` § "Supabase Architecture" → "Patrones de query" | El modelo es `procesarAceptacion` en `whatsapp.service.ts` |
| Antipatrón JSONB filter-in-JS | Idem ↑ | Hay que migrar `cotizacion.token` a columna generada |
| Storage buckets y PII | `docs/SUPABASE.md` § "Supabase Architecture" → "Storage buckets" | `tecnicos-documentos` es público hoy → backlog signed URLs |
| Phone format (dígitos puros `573134951164`, trigger BD) | `CLAUDE.md` § "Code Conventions" + `docs/GOTCHAS.md` | `phoneToDigits`, `isMobileColombiano`; pipe `57\|...` es legacy |
| Test mode whitelist | `CLAUDE.md` § "Environment Variables" + memoria | `BAIRD_TEST_PHONE_WHITELIST` |
| WhatsApp 24h window | `docs/GOTCHAS.md` + `docs/WHATSAPP_TEMPLATES.md` § "Texto libre" | Las plantillas siempre llegan; texto libre depende de 24h |

---

## 🔍 Tags útiles para grep en código

Cuando busques referencias en código, estos son los identificadores estables:

| Buscar | Qué es |
|---|---|
| `procesarAceptacion` | Atomic accept, patrón modelo de race condition |
| `enviarPlantilla` | Único punto que envía templates Meta |
| `enviarMensajeTexto` | Texto libre (24h-window dependiente) |
| `enviarSeleccionHorarioCliente` | Plantilla que abre customer-first scheduling |
| `notificarTecnicos` | Disparo masivo a técnicos compatibles |
| `enviarVerificacionPasoCliente` | Cliente aprueba siguiente paso (warranty post-diag) |
| `enviarCotizacionCliente` | Cotización final particular (post admin pricing) |
| `procesarCancelacionCliente` / `procesarReagendamientoCliente` | Self-service cliente |
| `logEvento` | Audit append-only en `solicitud_eventos` |
| `isPhoneAllowed` / `BAIRD_TEST_PHONE_WHITELIST` | Filtro de envíos en dev |
| `ESTADOS_TERMINALES` / `ESTADOS_CANCELABLES_POR_CLIENTE` / `ESTADOS_REAGENDABLES_POR_CLIENTE` | Sets de estados con semántica |
| `TIPO_A_ESPECIALIDAD` | Mapping tipo_equipo → especialidad técnico |
| `calcularPagoTecnico` | Lógica de tarifa servicio (legacy) |
| `calcularTarifaMABE` | Cálculo completo garantía MABE Tipo D — tarifa + bono + weekend + margen Baird 22% |
| `calcularTarifaParticular` | Cálculo completo particular — costo técnico × 1.13 utilidad Baird × 1.19 IVA (+ ½ comisión Wompi en cotizaciones) |
| `normalizeForMatch` / `cityTokenForMatch` | Pipeline de normalización para matching (ciudad, especialidad, marca): sin tildes, minúsculas, sin caracteres especiales; D.C. = Bogotá. Único criterio permitido — nunca `.ilike()` en BD para ciudad |
| `supabaseAdmin` | Cliente service_role (`src/lib/supabase-admin.ts`) — TODO el server-side. Si ves `from '@/lib/supabase'` en una API route, es un bug |
| `TARIFAS_MABE_TIPO_D` / `BONOS_CON_ENCUESTA` / `RECARGO_FIN_DE_SEMANA` | Constantes MABE |
| `MARGEN_BAIRD_GARANTIA` / `MARGEN_BAIRD_PARTICULAR` | Constantes de margen |
| `parseExcelData` | Mapeo BITÁCORA Excel → solicitud |
| `CODIGOS_FALLA` / `lookupFalla` | Catálogo MABE de fallas (`src/lib/constants/codigos-falla.ts`). Fuente canónica de **complejidad por número de falla** — usado por `/api/admin/export` para resolver la columna `Complejidad` del resumen Excel (no se confía en `triaje_resultado.complejidad`, que es percepción del técnico). |

---

## 🩺 Health check rápido — comandos pegados

```bash
# Build + typecheck + lint + tests (todo en uno, secuencial)
npm run lint && npx tsc --noEmit && npm test && npm run build

# Solo typecheck rápido
npx tsc --noEmit

# Subir/verificar plantillas Meta
node --env-file=.env.local scripts/upload-templates.mjs --check

# Smoke test self-service (necesita .env.local + BAIRD_TEST_PHONE_WHITELIST)
node --env-file=.env.local scripts/test-self-service.mjs 57<celular> --mode=interactivo
```

Verificación SQL post-migración: ver `supabase/migrations/README.md` § "Verificación post-aplicación".

---

## 🚦 Estado de salud actual (2026-10-07 — verificado contra producción)

- **Código**: producción (Vercel `lineablanca.bairdservice.com`) corre el commit `8c6f442` = `origin/main` (deploy READY 2026-10-07).
- **Build / Typecheck / Lint / Tests**: verificar con los comandos del health check de arriba antes de deploy — no confiar en snapshots viejos de esta sección.
- **Migraciones**: **todas las del repo verificadas APLICADAS contra la BD de producción (2026-07-05)** — detalle y evidencia en **`supabase/migrations/README.md`** (fuente de verdad; esta sección no duplica esa lista).
- **Plantillas Meta**: el código envía ~43 plantillas distintas; 46 definiciones en `scripts/upload-templates.mjs` + 10 versiones vigentes en `scripts/upload-templates-v2.mjs` (⚠️ los dos scripts están partidos — unificar es tanda 2). Status real: `--check`. El portal de supervisores está en prod desde 2026-07-06. Ver `docs/WHATSAPP_TEMPLATES.md`.
- **RLS**: Fase 1 + 4.1 aplicadas 2026-07-11 (server con service_role; `supervisores`, `llamadas`, `gps_pings`, `solicitud_eventos`, `connection_errors`, `pagos` cerradas al anon). Sigue off en `solicitudes_servicio` y `especialidades_tecnico`; `tecnicos` y `evidencias_servicio` con writes anon por páginas client-side — ver `docs/PLAN-RLS.md`.
- **Dapta (2ª línea de voz)**: Fase 0 desplegada pero apagada (`DAPTA_ENABLED=false`); decisión de proveedor pendiente — ver `docs/mejoras-futuras/segunda-linea-voz/README.md`.
- **Resumen semanal a supervisores**: operativo pero manual (`scripts/enviar-resumen-supervisores.mjs` + `scripts/resumen-semanal-pdf.py`); automatización pendiente.

---

## 🤝 Para iteraciones futuras

Cuando el siguiente LLM (o tú mismo en una nueva sesión) abra este proyecto:

1. **CLAUDE.md ya se carga automáticamente** — leerá la sección "Documentación de referencia" que apunta acá.
2. **Este INDEX es el segundo paso obligatorio** — antes de hacer queries random al código, identificá la sección "¿qué doc abro para…?" y abrí el doc indicado.
3. **No dupliques documentación.** Si querés agregar un detalle nuevo, primero leé qué doc ya cubre el tema y agregalo ahí.
4. **Pipeline de actualización es ley** — si tocás un mensaje WA, el script + `WHATSAPP_TEMPLATES.md` van juntos. Si tocás el state machine, los 7 lugares de la sección "Agregas un estado nuevo" van juntos.
