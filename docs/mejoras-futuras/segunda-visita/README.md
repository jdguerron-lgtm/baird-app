# Segunda visita técnica (reprogramación sin repuesto)

> **Estado:** en discusión — opciones para revisar, sin implementar.
> **Creado:** 2026-06-02.
> 🧭 Ver también: [`docs/MAQUINA-DE-ESTADOS.md`](../../MAQUINA-DE-ESTADOS.md) (state machine),
> [`docs/FLOWS.md`](../../FLOWS.md) (flujo parts-arrival ya implementado).

---

## Concepto

El sistema necesita agendar una **segunda visita** del técnico en dos escenarios:

1. **Llegada de repuesto** (cliente pidió pieza, el fabricante la despacha, llega
   semanas después → hay que coordinar nueva visita).
2. **Reparación que requiere otro día** (el técnico diagnostica, pero la reparación
   no se puede hacer en la misma visita por razones que **no son** un repuesto:
   falta tiempo en la franja, requiere herramienta especial, necesita un segundo
   técnico, el cliente no está listo, etc.).

El escenario **(1) ya está completamente implementado**. El escenario **(2) es el gap**.

---

## Verificación del estado actual (2026-06-02)

### ✅ Escenario 1 — Llegada de repuesto: completo, sin bloqueo

Flujo end-to-end funcional para **garantía y particular**:

```
diagnóstico (esperar_repuesto, SKU obligatorio)
   → pendiente_pricing            (admin fija tiempo_entrega / precios)
   → esperando_repuesto
   → [admin marca recibido en /admin/repuestos]  POST /api/repuesto-recibido
   → repuesto_recibido + reprogramacion_token (UUID)
   → [cliente elige fecha tentativa]  /reprogramar-repuesto/{token}  POST /api/reprogramar-repuesto
   → en_proceso  (+ notifica al técnico)
```

Archivos clave:
- `src/app/api/diagnostico/route.ts` — branch `esperar_repuesto` (warranty L210-265, particular L365-422).
- `src/app/api/cotizacion-precios/route.ts` — admin pricing gate.
- `src/app/api/repuesto-recibido/route.ts` — transición atómica `esperando_repuesto → repuesto_recibido` (guard `.eq('estado','esperando_repuesto')`).
- `src/app/api/reprogramar-repuesto/route.ts` — transición atómica `repuesto_recibido → en_proceso`, token single-use (se limpia a `null`).
- `src/app/reprogramar-repuesto/[token]/page.tsx` + `ReprogramarSelector.tsx` — UI cliente.
- `src/app/admin/repuestos/page.tsx` — admin marca recibido.
- Plantillas Meta subidas: `esperando_repuesto_cliente_v1`, `repuesto_recibido_cliente_v2`, `repuesto_recibido_tecnico_v1`.

**Nota — falso positivo descartado:** una auditoría previa marcó como "P0 bug:
falta `import crypto`" en `repuesto-recibido/route.ts:70`. **No es un bug.**
`crypto.randomUUID()` resuelve como global de Node (verificado con `node -e`), y
`cotizacion-precios/route.ts:110` usa el mismo patrón sin import y está en prod.
Solo es una inconsistencia de estilo (otros archivos sí hacen `import crypto from 'crypto'`).

### ❌ Escenario 2 — Segunda visita sin repuesto: NO existe

El diagnóstico tiene exactamente **4** opciones de `siguiente_paso`
(`src/app/api/diagnostico/route.ts:58`):

```ts
['reparar', 'esperar_repuesto', 'no_reparable', 'negativa_cliente']
```

- `reparar` asume reparación **en la misma visita** → salta directo a `en_proceso`.
- `esperar_repuesto` **exige al menos un SKU** (`diagnostico/route.ts:91`), así que
  no sirve para "vuelvo otro día sin pieza".

→ **No hay camino** para agendar una segunda visita cuando la reparación necesita
otro día pero **no** requiere repuesto. Hoy el único workaround es el escape-hatch
admin (`/api/admin/cambiar-estado` + WhatsApp libre), que es manual y sin
self-service del cliente.

---

## Opciones para cerrar el gap

| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| **A. Nuevo `siguiente_paso = agendar_segunda_visita`** | 5ta opción de diagnóstico. Nuevo estado `pendiente_segunda_visita`; reusa el token + `/reprogramar` (sin el gate de repuesto/pricing) → cliente elige fecha → `en_proceso`. | Limpio, explícito, audita el motivo. Reusa máquina existente. | Suma 1 estado + 1 plantilla Meta. |
| **B. Generalizar la maquinaria de reprogramación** | Renombrar `repuesto_recibido` → estado genérico "needs reschedule" y `/reprogramar-repuesto` → `/reprogramar`; la llegada de repuesto pasa a ser solo un disparador más. | Mínima infraestructura nueva. | Refactor con riesgo; conflaciona dos motivos distintos en un estado; toca código en prod que ya funciona. |
| **C. Disparar desde el portal a mitad de reparación** | Técnico va `reparar → en_proceso`, y si no termina pulsa "agendar continuación" → genera token → cliente reprograma. | Cubre también "empecé pero se me acabó el tiempo", no solo el momento-diagnóstico. | Nueva transición desde `en_proceso`; UI nueva en portal técnico. |
| **D. Solo admin, cero código** | Usar el escape-hatch `/api/admin/cambiar-estado` + WhatsApp libre para coordinar manualmente. | Disponible hoy. | Manual, sin self-service del cliente, sin camino auditado limpio. |

**Recomendación tentativa:** Opción A para el caso diagnóstico + considerar C como
extensión si "no terminé hoy" resulta frecuente. Decidir con el equipo operativo.

---

## Fases (si se aprueba Opción A)

| Fase | Trabajo | Bloqueador |
|---|---|---|
| 1 | Migración: nuevo estado `pendiente_segunda_visita` en CHECK constraint + `ESTADOS_VALIDOS` + `estados.ts` (label/clase). | — |
| 2 | `/api/diagnostico`: aceptar 5to `siguiente_paso`; generar `reprogramacion_token` y pasar a `pendiente_segunda_visita` (sin SKU obligatorio, sin pricing gate en garantía). | Fase 1 |
| 3 | UI técnico: 5to radio en `tecnico/[token]/diagnostico/[id]/page.tsx` ("Agendar segunda visita") con campo motivo. | Fase 2 |
| 4 | Reusar `/reprogramar-repuesto` (o `/reprogramar` genérico) aceptando `pendiente_segunda_visita` además de `repuesto_recibido`. | Fase 2 |
| 5 | Plantilla Meta `segunda_visita_cliente_v1` (botón → `/reprogramar/{token}`) + reuso de `repuesto_recibido_tecnico_v1` o `segunda_visita_tecnico_v1`. | Diseño copy + aprobación Meta |
| 6 | Auditoría en `solicitud_eventos` + `notificarCambioEstado` a supervisores (ya disparan en los call-sites que mutan estado). | Fases 2-4 |

---

## Decisiones pendientes

- ¿Opción A, B, C o combinación? (impacta esfuerzo y riesgo).
- ¿La fecha de segunda visita es **tentativa** (técnico confirma) igual que en repuesto, o firme?
- ¿Aplica el tope `MAX_REAGENDAMIENTOS_CLIENTE`, o token single-use como repuesto (1 sola reprogramación)?
- Garantía: ¿la segunda visita afecta `dias_solucion_efectivos` / bonos de TA? (ver `docs/TARIFAS.md`).
- Particular: ¿segunda visita sin repuesto cambia el precio cotizado? (probablemente no).

---

## Riesgos

- Conflación de estados (Opción B) puede romper el flujo de repuesto que ya está en prod.
- Nueva plantilla Meta = dependencia de aprobación (días de lead time).
- Si la segunda visita no descuenta del SLA, hay que ajustar el cálculo de bonos garantía.

---

## Esfuerzo estimado

- **Opción A:** ~1-1.5 días dev + 1 plantilla Meta (lead time aprobación aparte).
- **Opción C (extensión):** +0.5 día.
- **Opción D:** 0 (ya existe, solo proceso operativo).
