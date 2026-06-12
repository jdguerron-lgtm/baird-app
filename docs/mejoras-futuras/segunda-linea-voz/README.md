# Segunda línea de voz IA (llamadas automáticas cuando WhatsApp no responde)

> **Estado:** Fase 0 implementada (código completo, detrás del kill-switch `DAPTA_ENABLED=false`) — **decisión de proveedor PENDIENTE** (Dapta vs. pago-por-uso).
> **Creado:** 2026-06-03.
> 🧭 Ver también: [`docs/PROTOCOLO-VISITA.md`](../../PROTOCOLO-VISITA.md) (T-24h / T-2h),
> [`docs/MAQUINA-DE-ESTADOS.md`](../../MAQUINA-DE-ESTADOS.md) (estados),
> [`docs/FLOWS.md`](../../FLOWS.md) (flujos WhatsApp), env vars en [`CLAUDE.md`](../../../CLAUDE.md) y `.env.example` (bloque `DAPTA_*`).
> Plan aprobado (local, efímero, **no versionado**): `~/.claude/plans/curious-squishing-fountain.md` — su contenido esencial está resumido acá para que sobreviva al repo.

---

## Concepto

WhatsApp es hoy la **única** vía de coordinación con el cliente. Cuando el cliente no
responde, el flujo se atasca y alguien tiene que llamar a mano (no escala, no queda
auditado):

- No elige franja → la solicitud expira a `sin_agendar`.
- No confirma el cierre → queda colgada en `en_verificacion`.
- No aprueba la cotización (particular).
- No reprograma tras recibir el repuesto.

La mejora: una **segunda línea de voz IA** que llama al cliente automáticamente cuando
WhatsApp no tuvo respuesta tras X horas, para cuatro propósitos:

1. **Agendar** — cuando no eligió franja (`pendiente_horario`, antes de expirar a `sin_agendar`).
2. **Verificar citas ya programadas y aceptadas por el técnico** — llamada **T-24h / T-2h**
   confirmando presencia (propósito `presencia`, ligado a `docs/PROTOCOLO-VISITA.md`).
   *(Alcance agregado 2026-06-03 a pedido del usuario.)*
3. **Verificar etapas** — aprobación de cotización, reprogramación tras llegada de repuesto.
4. **Cierre + encuesta** — `en_verificacion → completada/en_disputa` + satisfacción.

**Diseño POST-CALL:** el proveedor de voz **nunca** toca Supabase. Baird dispara la llamada
pasándole variables dinámicas (nombre, franjas, total…); el agente conversa; al colgar hace
POST a `/api/dapta/webhook` con un **resultado estructurado**; **nuestro webhook escribe en
Supabase reusando la función dueña de cada transición** (un solo dueño por transición).

---

## Estado actual — Fase 0 (código completo, apagado)

Implementada y **verificada** (`tsc --noEmit` limpio, lint 0 errores en los archivos nuevos,
`npm run build` exit 0 con las rutas compiladas). Detrás del kill-switch `DAPTA_ENABLED=false`:
**0 filas escritas, 0 POST a ningún proveedor** mientras esté off. Lo construido es
**agnóstico al proveedor** — solo la capa de disparo + parseo del webhook es específica.

| Pieza | Archivo | Qué hace |
|---|---|---|
| **Refactor llave** | `src/lib/services/transiciones.service.ts` (NUEVO) | Extrae la lógica de mutación de estado que vivía embebida en los route handlers a 4 funciones puras (`confirmarHorarioSolicitud`, `confirmarServicioCliente`, `procesarAprobacionCotizacion`, `reprogramarRepuestoSolicitud`) que devuelven `{ ok, httpStatus, body }`. Las llaman **tanto el route original (ahora wrapper delgado) como el webhook de voz** → cero duplicación de transiciones. |
| Routes adelgazados | `confirmar-horario`, `confirmar-servicio`, `aprobar-cotizacion`, `reprogramar-repuesto` (`/route.ts`) | Reescritos como wrappers que reproducen status + JSON **byte-idénticos** → cero cambio de contrato público. |
| Salida hacia el proveedor | `src/lib/services/dapta.service.ts` (NUEVO) | `iniciarLlamada()` — único punto de salida, **nunca lanza**. Cadena de guardas: kill-switch → whitelist (`isPhoneAllowed`, reusa `BAIRD_TEST_PHONE_WHITELIST`) → horario hábil (TZ America/Bogota) → tope de intentos → **cooldown atómico** (cerrojo anti-doble-disparo). |
| Webhook POST-CALL | `src/app/api/dapta/webhook/route.ts` (NUEVO) | Verifica firma (HMAC header o token en query), **idempotente** (claim atómico por `dapta_call_id`), correlaciona contra NUESTRA fila en `llamadas` (no confía en metadata del proveedor), delega al `transiciones.service`. **Responde 200 SIEMPRE.** |
| Migración | `supabase/migrations/20260602_dapta_llamadas.sql` (NUEVO, **PENDIENTE de aplicar**) | Tabla `llamadas` (+ UNIQUE parcial en `dapta_call_id` = idempotencia), columnas `llamada_intentos` / `ultima_llamada_at` / `requiere_confirmacion_llamada` en `solicitudes_servicio`, RLS. No toca el CHECK de `estado` ni el enum de eventos. |
| Whitelist compartida | `src/lib/services/whatsapp.service.ts` (1 línea) | `isPhoneAllowed` exportada para reusar el mismo gate que WhatsApp. |
| Env vars | `.env.example` + `CLAUDE.md` | Bloque `DAPTA_*` documentado (kill-switch, route URL, secreto webhook, topes, horario, umbrales de silencio). |

> **Aislamiento de contrato:** todas las asunciones del proveedor sin confirmar viven en
> adaptadores de **un solo lugar** — `parseDaptaPayload` ([SUP-1] forma del payload),
> `autenticado` ([SUP-2] firma), y el parseo de respuesta del fetch ([SUP-4] Public Route URL).
> Cambiar de proveedor = reescribir esos adaptadores + renombrar las env vars. Hasta la columna
> `proveedor` (default `'dapta'`) se dejó para soportar varios.

---

## Hallazgo de costos (2026-06-03) — por qué el proveedor está en revisión

El plan asumió **Dapta** (plan Pro **$99/mes**). Al revisar costos a nuestro volumen real
(**<100 llamadas/mes**, ~1-3 min c/u, a móviles colombianos), aparece el problema:

- Dapta cobra **333 créditos por minuto contestado**; una llamada de ~2 min ≈ **$0.60**.
- El Pro ($99/mes) = ~100.000 créditos ≈ **~300 min ≈ ~150 llamadas de 2 min**. A <100/mes
  usaríamos ~⅓ y el resto se pierde — los créditos **no documentan rollover (úsalo o piérdelo)**.
- Dapta **no tiene tier pago-por-uso puro** (solo "Custom — contactar ventas").

→ **A nuestro volumen, el plan fijo de $99/mes es plata botada (4–10× el uso real).**

### Comparación (per-minuto = plataforma + telefonía a móvil CO)

| Proveedor | Piso mensual | $/min todo incluido | Llamar a móvil CO | Fuente |
|---|---|---|---|---|
| **Dapta** | **$99 fijo** | ~$0.30/min | Sí (empaquetado; nº CO se pide a soporte, marketplace es US) | dapta.ai/pricing |
| **Retell AI** (recomendado) | **$0** (PAYG) | **~$0.13–0.15/min** | Sí, vía tu Twilio (BYOC) + Geo Permissions CO | retellai.com/pricing |
| Vapi | $0 (PAYG) | ~$0.25–0.33/min real | Sí, vía Twilio | retellai.com/blog/vapi-ai-review |

- **Telefonía:** Twilio termina a **móvil colombiano (+57 3XX) a $0.0377/min** (confirmado,
  twilio.com/en-us/voice/pricing/co). Telnyx no publica la tarifa CO (sin confirmar).
- **Español LatAm:** todos lo hacen aceptablemente vía ElevenLabs/Cartesia/Azure; ninguno
  nativo-colombiano.
- **Piloto gratis:** Retell da **$10** (~75–140 min de prueba); Dapta no tiene tier PAYG gratis.

### Estimación a 50–100 llamadas cortas/mes
- **Dapta:** **$99/mes fijos** sin importar uso.
- **Retell:** **~$8–25/mes**, pagando solo lo que se usa, sin piso.

**Dato clave:** irónicamente, el camino para marcar a móviles colombianos está **más
confirmado** en Retell+Twilio (BYOC documentado) que en Dapta (cuyo marketplace de números es
solo US). Esto ataca directo el **[RIESGO #1]** del plan. El único costo extra de Retell es
conectar un Twilio propio una vez.

---

## Verificación de citas ya aceptadas (alcance agregado 2026-06-03)

Encaja directo en el propósito **`presencia`** ya contemplado en `dapta.service.ts` y en la
migración (CHECK de `proposito` incluye `'presencia'`). Para una cita aceptada por el técnico
ya tenemos **`fecha_visita_at`** en la solicitud → el cron selecciona candidatos por esa fecha
y dispara la llamada a **T-24h y T-2h** confirmando que el cliente estará. Es el
`docs/PROTOCOLO-VISITA.md` ejecutado por voz. **Aditivo:** no toca nada de la Fase 0, solo suma
un selector de candidatos por `fecha_visita_at` + las variables de la llamada (Fase 3 del plan).

---

## Fases (resumen del plan aprobado)

| Fase | Alcance | Criterio de "hecho" |
|---|---|---|
| **0** ✅ | Infra + extracción a `transiciones.service`, `dapta.service` (guardas), webhook (firma + idempotencia), migración, env vars. `DAPTA_ENABLED=false`. | **Hecho** — los 4 endpoints originales responden idéntico; build/tsc/lint OK. |
| **1** | Agendar: cron `dapta-segunda-linea` + `llamarParaAgendar` + webhook→`confirmarHorarioSolicitud` + aviso a supervisores (`notificarDisparoLlamada`/`notificarResultadoLlamada`, reusan `filtrarSupervisores`). | Prueba en `pendiente_horario` recibe llamada (whitelist), pasa a `notificada`, notifica técnicos+supervisores. |
| **2** | Cierre + encuesta: `llamarParaCerrar` → `confirmarServicioCliente` + `registrarEncuestaSatisfaccion`. **Depende de aplicar la columna `cumple_encuesta`** (hoy en la migración PENDIENTE `20260510_no_show_protocolo.sql`). | Pasa a `completada`/`en_disputa` y `cumple_encuesta` escrito; idempotente. |
| **3** | Verificación de etapas: **presencia T-24h/T-2h (citas aceptadas)** + cotización + repuesto. | Llamada a `fecha_visita_at` confirma presencia; cotización/repuesto avanzan por voz. |
| **4** | Producción gradual: vaciar whitelist, `DAPTA_ENABLED=true`, monitorear `llamadas` y costo. | Disparo real a número propio, audio + transición + aviso supervisor OK. |

---

## Costos

- **Dev:** Fase 0 ya hecha. Fase 1 ~1-1.5 días; Fase 2 ~1 día (+ aplicar `cumple_encuesta`);
  Fase 3 ~1.5 días; Fase 4 ~0.5 día. **Si se pivota a Retell:** +0.5-1 día (reescribir los 2
  adaptadores aislados + renombrar env vars + conectar Twilio BYOC).
- **Operativo:** Dapta **$99/mes fijos** vs. Retell **~$8–25/mes pago-por-uso** a nuestro
  volumen. + 1 plantilla Meta `supervisor_llamada_v1` (lead time de aprobación).

---

## Decisiones pendientes

- **PROVEEDOR (bloqueante para Fase 1+):** ¿Pilotar Retell con los $10 gratis primero? ¿Pivotar
  ya a Retell pago-por-uso? ¿Quedarnos con Dapta $99/mes? — *Usuario aún no decide (2026-06-03).*
- Confirmar con el proveedor elegido los supuestos del plan **[SUP-1..6]** antes de codear más:
  forma del payload del webhook, mecanismo de firma, si espeja metadata, contrato de la route de
  disparo, límite de crons del plan Vercel.
- ¿La llamada de presencia (T-24h/T-2h) es solo al cliente, o también al técnico?
- Umbrales de silencio por propósito (defaults en env: agendar 12h, cierre/cotización/repuesto 24h).

---

## Riesgos

- **[RIESGO #1]** que el proveedor marque a móviles colombianos y a qué costo — **mitigado** si
  se va por Retell+Twilio BYOC ($0.0377/min confirmado). Con Dapta queda algo abierto (nº CO por
  soporte).
- Plantilla Meta nueva (`supervisor_llamada_v1`) = dependencia de aprobación (días de lead time).
- Migración `20260602_dapta_llamadas.sql` está **sin aplicar**; Fase 2 además necesita
  `cumple_encuesta`.
- Si se pivota de proveedor después de Fase 1+, crece el costo de renombrado (por eso conviene
  decidir antes de seguir codeando).

---

## Esfuerzo estimado

- **Fase 0:** hecha.
- **Pivote a Retell (si se aprueba):** ~0.5-1 día dev + setup Twilio.
- **Fases 1–4:** ~4-5 días dev en total + plantilla Meta (aprobación aparte).
