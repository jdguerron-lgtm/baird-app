# Índice de documentación — Baird Service

> Hub de navegación para iteraciones futuras (humanas o LLM). Antes de
> escribir nueva documentación o tocar código, **ubica acá la sección
> que corresponde y abre el doc específico**. Esto evita drift y
> duplicación.
>
> **Última revisión: 2026-05-10.**

---

## ⚡ Atajo: ¿qué doc abro para…?

| Tu objetivo | Doc a leer | Sección |
|---|---|---|
| **Entender los flujos completos** (warranty, particular, side flows) | `docs/FLOWS.md` | Todo |
| **Cambiar una tarifa, bono, margen, fórmula de pago** | `docs/TARIFAS.md` | "Cómo cambiar una tarifa" |
| **Calcular cuánto paga el cliente / recibe el técnico / margen Baird** | `docs/TARIFAS.md` | "Garantía MABE" o "Particular" |
| **Implementar verificación T-24h / no-show** | `docs/PROTOCOLO-VISITA.md` | Todo |
| **Cambiar un mensaje de WhatsApp** (texto, params, plantilla) | `docs/WHATSAPP_TEMPLATES.md` | "Proceso obligatorio para crear o modificar una plantilla" + catálogo |
| **Agregar un estado nuevo** a la state machine | `CLAUDE.md` § "Solicitud State Machine" + `supabase/migrations/README.md` ("Cómo aplicar las pendientes") |
| **Aplicar migración Supabase** | `supabase/migrations/README.md` | "Cómo aplicar las pendientes" |
| **Ver qué columnas existen** en una tabla | `CLAUDE.md` § "Database Tables" + última migración relevante |
| **Entender RLS y storage** | `CLAUDE.md` § "Supabase Architecture" |
| **Saber qué env vars necesita** | `CLAUDE.md` § "Environment Variables" |
| **Probar el flujo end-to-end** | `docs/FLOWS.md` § "Para validar end-to-end (testing manual)" |
| **Auditar deuda técnica / gaps** | `docs/FLOWS.md` § "Gaps conocidos" + `supabase/migrations/README.md` § "Hallazgos del audit" |
| **Convenciones de código** (nombres, idiomas, patrones) | `CLAUDE.md` § "Code Conventions" + "Gotchas" |
| **Quiénes son los usuarios** y cómo se conecta el negocio | `CLAUDE.md` § "How the Two Flows Work" |

---

## 📚 Mapa completo de documentación

### Documentación canónica (mantenida)

| Doc | Para qué sirve | Cuándo lo lees | Cuándo lo actualizas |
|---|---|---|---|
| **`CLAUDE.md`** (raíz) | Contexto general del proyecto. Auto-cargado por Claude Code en cada sesión. Resumen de arquitectura, conventions, env vars, gotchas. | Siempre primero. | Cuando agregas un nuevo flujo, env var, gotcha, sección de admin, o convención. |
| **`docs/TARIFAS.md`** | Doc canónico de tarifas. MABE garantía (Tipo D + bonos + weekend + margen 22%) y particular multi-marca (× 1.19 IVA × 1.10 margen Baird). Apéndices: marco tributario 2026, pasarelas, decisión reseller vs marketplace. | Antes de tocar cualquier cálculo de pago, agregar bono/recargo, o cambiar margen. | Tras cambiar una tarifa, modificar el modelo de margen, agregar marca nueva al flujo garantía, o cambiar IVA por reforma DIAN. |
| **`docs/PROTOCOLO-VISITA.md`** | Verificación T-24h / T-2h / llegada / no-show. Estados, columnas DB, plantillas WhatsApp pendientes, política de gracia recurrentes. | Antes de implementar UI técnico para llegada, recordatorios, o gestión de no-shows. | Tras cambiar el SLA de TA, agregar/quitar pasos del protocolo, modificar política de gracia. |
| **`docs/FLOWS.md`** | Diagramas paso-a-paso de cada flujo end-to-end con cada plantilla WhatsApp en su contexto, puntos de decisión del cliente, gaps conocidos, plan de testing manual. | Cuando vas a tocar el state machine, agregar una página customer-facing, o entender dónde se manda qué WhatsApp. | Tras cambiar el state machine, agregar/cambiar una plantilla en el flujo, o mover un disparo de WhatsApp. |
| **`docs/WHATSAPP_TEMPLATES.md`** | Catálogo de las 16 plantillas Meta, parámetros, disparo, copy completo. **Define el proceso obligatorio de cambio de plantilla.** Backlog de plantillas nuevas con JSON listo. | Antes de tocar cualquier mensaje WhatsApp. | Tras cambiar params de una plantilla, agregar una nueva, o subirla a Meta. |
| **`supabase/migrations/README.md`** | Lista ordenada de migraciones, status (aplicada/pendiente), hotfixes, verificación SQL post-apply, backlog de migraciones futuras. | Antes de aplicar una migración o cuando hay drift schema↔código. | Tras crear nueva migración o aplicar una. |
| **`docs/INDEX.md`** (este archivo) | Hub de navegación. Mapea tareas comunes a docs específicos. | Primero al iniciar una iteración. | Cuando creas un nuevo doc o cambias el rol de uno existente. |

### Documentación operacional (referencia)

| Doc | Para qué sirve |
|---|---|
| `docs/TEST_CARGA_MASIVA.md` | Procedimiento de test del upload de Excel BITÁCORA (warranty bulk). |
| `docs/flujos-servicio.html` | Mockup visual antiguo del flujo. No es referencia técnica. |
| `legal/*.docx` | Documentos legales (T&C, política privacidad, contratos, etc.) — Colombian SAS compliance. |

### Documentación deprecated (no actualizar)

| Doc | Por qué está deprecado |
|---|---|
| `docs/FLUJOS-USUARIO.md` | State machine v1 (marzo 2026). Usar `FLOWS.md`. |

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
5. `CLAUDE.md` § "Solicitud State Machine" — actualizar diagrama
6. `docs/FLOWS.md` — actualizar flujos afectados
7. Aplicar migración en Supabase **antes** del deploy

### Agregas una nueva tabla / columna
1. Crear migración en `supabase/migrations/` (timestamped, idempotente con `IF NOT EXISTS`)
2. Si es columna que también existe en código pero no en DB: agregar `NOTIFY pgrst, 'reload schema';` al final de la migración
3. `supabase/migrations/README.md` — agregar a la lista
4. `CLAUDE.md` § "Database Tables" — actualizar
5. Si afecta RLS o storage: `CLAUDE.md` § "Supabase Architecture"

### Agregas un nuevo flujo customer-facing (página + API)
1. Crear página + componente cliente
2. Crear API route con guards (auth, atomic update si aplica)
3. Si requiere nueva plantilla WhatsApp → seguir el pipeline de plantillas
4. `CLAUDE.md` § "Architecture" + "API Routes" + "Customer-Facing Pages"
5. `docs/FLOWS.md` — agregar diagrama del flujo

### Cambias un endpoint admin
1. Editar API route + UI
2. Verificar el guard de auth (Supabase session check)
3. `CLAUDE.md` § "API Routes" si el endpoint cambia de propósito
4. `docs/FLOWS.md` § "Admin Pages" si cambia el rol del admin

### Agregas una env var
1. `CLAUDE.md` § "Environment Variables"
2. Si afecta tests: `src/__tests__/setup.ts`
3. Si tiene default por seguridad (e.g., `BAIRD_TEST_PHONE_WHITELIST`): documentar el comportamiento sin la env

### Detectas un bug
1. Reproducir + fix en código
2. Si requiere migración: crear y agregar a `supabase/migrations/README.md` como HOTFIX URGENTE
3. Documentar la causa raíz en el commit message (no en docs — es ruido a 3 meses)
4. Si es un patrón a evitar: agregar a `CLAUDE.md` § "Gotchas"

---

## 🧠 Convenciones que cubre cada doc

| Tema | Doc principal | Nota |
|---|---|---|
| Tokens UUID y por qué | `CLAUDE.md` § "Gotchas" + `docs/FLOWS.md` | `cliente_token`, `horario_token`, `verificacion_paso_token`, `portal_token`, `confirmacion_token` |
| Atomic update pattern (anti-race) | `CLAUDE.md` § "Supabase Architecture" → "Patrones de query" | El modelo es `procesarAceptacion` en `whatsapp.service.ts` |
| Antipatrón JSONB filter-in-JS | Idem ↑ | Hay que migrar `cotizacion.token` a columna generada |
| Storage buckets y PII | `CLAUDE.md` § "Supabase Architecture" → "Storage buckets" | `tecnicos-documentos` es público hoy → backlog signed URLs |
| Phone format `57\|3134951164` | `CLAUDE.md` § "Code Conventions" | `parsePhone`, `phoneToDigits`, `formatearTelefono` |
| Test mode whitelist | `CLAUDE.md` § "Environment Variables" + memoria | `BAIRD_TEST_PHONE_WHITELIST` |
| WhatsApp 24h window | `CLAUDE.md` § "Gotchas" + `docs/WHATSAPP_TEMPLATES.md` § "Texto libre" | Las plantillas siempre llegan; texto libre depende de 24h |

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
| `calcularTarifaParticular` | Cálculo completo particular — costo técnico × 1.19 IVA × 1.10 margen Baird |
| `TARIFAS_MABE_TIPO_D` / `BONOS_CON_ENCUESTA` / `RECARGO_FIN_DE_SEMANA` | Constantes MABE |
| `MARGEN_BAIRD_GARANTIA` / `MARGEN_BAIRD_PARTICULAR` | Constantes de margen |
| `parseExcelData` | Mapeo BITÁCORA Excel → solicitud |

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

## 🚦 Estado de salud actual (2026-05-08)

- **Build**: ✅ pasa
- **Typecheck**: ✅ pasa
- **Lint**: ✅ pasa
- **Tests**: ✅ 112/112
- **Migraciones pendientes** (verifica antes de deploy):
  - `20260508_fix_completado_at_default.sql` — drop DEFAULT NOW() de evidencias_servicio.completado_at
  - `20260508_fix_cotizacion_column.sql` — agrega columna cotizacion JSONB faltante
  - `20260508_fix_tecnicos_columns.sql` — agrega acepta_garantias + especialidad_principal
  - `20260508_backfill_horario_token.sql` — backfill UUID a filas sin token
  - `20260510_no_show_protocolo.sql` — estado no_show_cliente + columnas auditoría tarifas + tabla cliente_historial
- **Plantillas Meta pendientes**: 9 plantillas en backlog (A-I + J en `docs/WHATSAPP_TEMPLATES.md`). Ninguna bloquea producción — son mejoras de comunicación.

---

## 🤝 Para iteraciones futuras

Cuando el siguiente LLM (o tú mismo en una nueva sesión) abra este proyecto:

1. **CLAUDE.md ya se carga automáticamente** — leerá la sección "Documentación de referencia" que apunta acá.
2. **Este INDEX es el segundo paso obligatorio** — antes de hacer queries random al código, identificá la sección "¿qué doc abro para…?" y abrí el doc indicado.
3. **No dupliques documentación.** Si querés agregar un detalle nuevo, primero leé qué doc ya cubre el tema y agregalo ahí.
4. **Pipeline de actualización es ley** — si tocás un mensaje WA, el script + `WHATSAPP_TEMPLATES.md` van juntos. Si tocás el state machine, los 7 lugares de la sección "Agregas un estado nuevo" van juntos.
