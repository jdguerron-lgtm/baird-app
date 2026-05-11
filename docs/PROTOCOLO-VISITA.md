# Protocolo de visita y no-show — Baird Service

> Procedimiento de verificación de presencia del cliente antes y durante
> la visita técnica, y manejo de no-show con evidencia documentada.
>
> **Última actualización: 2026-05-10.**
>
> 🧭 **Ver también**:
> - [docs/TARIFAS.md](./TARIFAS.md) — modelo "no-show: nadie paga".
> - [docs/FLOWS.md](./FLOWS.md) — flujo end-to-end donde encaja este protocolo.

---

## Tabla de contenido

1. [Por qué existe este protocolo](#por-qué-existe-este-protocolo)
2. [Lado Baird — automatización WhatsApp + cron](#lado-baird--automatización-whatsapp--cron)
3. [Lado técnico — en la app](#lado-técnico--en-la-app)
4. [Protocolo de no-show](#protocolo-de-no-show)
5. [Estados, columnas y tablas DB](#estados-columnas-y-tablas-db)
6. [Política de gracia con clientes recurrentes](#política-de-gracia-con-clientes-recurrentes)
7. [Plantillas WhatsApp pendientes](#plantillas-whatsapp-pendientes)
8. [Cláusula informativa en T&C](#cláusula-informativa-en-tc)

---

## Por qué existe este protocolo

**No-show: nadie paga.** Si el cliente no está al momento de la visita confirmada, ni MABE ni Baird ni el cliente cubren el costo. El técnico pierde transporte y tiempo.

Aún así, el protocolo de evidencia es **obligatorio** porque:

1. **Protege al técnico contra acusaciones falsas.** Si MABE o el cliente alegan "el técnico nunca fue", Baird tiene foto + GPS + timestamps + intentos de contacto que prueban lo contrario.
2. **Permite reportar a MABE.** Aunque no se cobre, MABE necesita el reporte para su métrica interna y gestión de su cliente final. Sin evidencia, MABE descuenta el caso a Baird.
3. **Identifica clientes problemáticos recurrentes.** Si un cliente acumula 2–3 no-shows, Baird puede pedir confirmación obligatoria por llamada antes de aceptar nueva solicitud, o reportar a MABE para que decidan si lo siguen atendiendo en garantía.

**No es cobro — es gestión de riesgo operativo y trazabilidad.**

---

## Lado Baird — automatización WhatsApp + cron

### Momento 1 — T-24h antes de la visita (cron)

**Trigger:** cron `/api/cron/recordatorio-visita` ejecuta cada 1h y dispara cuando faltan ~24h para `horario_confirmado`.

**Mensaje:** plantilla `recordatorio_visita_v1` (pendiente aprobación Meta — ver § Plantillas pendientes).

**Acción del cliente:** botón "✅ Confirmo" (no requiere acción) o "📅 Reagendar" (abre `/servicio/{cliente_token}` para reagendar — usa flujo existente).

**Si el cliente no responde:** el cron del momento 2 intenta de nuevo a T-2h.

### Momento 2 — T-2h antes (mismo cron)

**Mensaje:** plantilla `recordatorio_visita_inminente_v1`.

**Si el cliente no confirma en 1h:** se inserta evento en `solicitud_eventos` con `tipo='alerta_visita'` y aparece en `/admin/alertas-visita` (página nueva). Permite a admin llamar al cliente preventivamente.

### Momento 3 — Llegada del técnico (al ping GPS `llegada`)

**Trigger:** cuando el técnico envía `POST /api/gps-ping { fase: 'llegada' }`.

**Mensaje:** plantilla `tecnico_llegando_v1` al cliente: "[Nombre] está en tu puerta. Por favor abrir o responder en 10 min."

**Lado técnico:** en `/tecnico/{token}/diagnostico/{id}` aparece un badge:
- 🟢 **Cliente confirmó** (cliente respondió YES o ya había confirmado en T-2h)
- 🟡 **Pendiente** (mensaje enviado, sin respuesta aún)
- 🔴 **No respondió 10min** (activa el protocolo de no-show)

---

## Lado técnico — en la app

### Antes de llegar (opcional)

- Botón "Voy en camino" en `/tecnico/{token}` que dispara WhatsApp libre al cliente con ETA. Best-effort (depende de ventana 24h del cliente).
- Llamada telefónica rápida del técnico al cliente — recomendada pero no obligatoria.

### Al llegar (GPS llegada activado)

1. Técnico pulsa botón "Llegué" en el portal → frontend captura GPS y envía `POST /api/gps-ping { fase: 'llegada' }`.
2. Sistema dispara `tecnico_llegando_v1` al cliente.
3. UI del técnico muestra el badge de estado de confirmación del cliente.
4. Si el badge sigue en 🟡 después de 10 minutos:
   - Técnico llama al cliente desde la app (botón con `tel:` link).
   - El log de llamadas (timestamp + número + duración aproximada) se registra manualmente con un toggle "Llamada intentada".

### Cuando entra al inmueble

- Confirma presencia con botón "Cliente presente" → estado pasa a 🟢 manualmente.
- Procede al diagnóstico normal.

---

## Protocolo de no-show

Si después de 10 minutos en sitio el cliente no responde y no abre, el técnico inicia el protocolo de 15 minutos:

### Pasos obligatorios (todos requeridos para que la evidencia sea válida)

1. **Selfie del técnico frente a la dirección** — foto con cara del técnico visible y número del inmueble en el fondo. Subida a `evidencias-servicio` con timestamp y GPS automáticos.
2. **Foto del frente del inmueble** — número visible. Misma carga.
3. **Tres timbrazos espaciados** — uno cada 5 minutos. Cada uno con foto del intento (o video corto si el técnico prefiere).
4. **GPS pings cada 5 min** — automáticos (cada vez que el técnico permanece en sitio se envía un ping `fase: 'no_show'`).
5. **Intentos de contacto** — al menos 1 llamada y 1 WhatsApp del técnico al teléfono del cliente, registrados con timestamp.

### Después de 15 minutos

- Botón "Marcar no-show" en el portal del técnico.
- Modal de confirmación: "¿Confirmas que has cumplido todos los pasos? Esta acción cierra el servicio sin pago."
- Al confirmar:
  - `evidencias_servicio.evidencia_no_show` (JSONB) se persiste con todos los datos recolectados.
  - `solicitudes_servicio.estado = 'no_show_cliente'` (terminal).
  - `solicitud_eventos` registra evento `tipo='no_show_cliente'` con payload completo.
  - `cliente_historial` incrementa contador del cliente.
  - WhatsApp libre al cliente: "No pudimos completar tu servicio porque no estabas. Si necesitas otro horario, crea una nueva solicitud en /solicitar."
  - WhatsApp libre al admin: "Servicio NO-SHOW de [cliente] documentado. Ver /admin/solicitudes/[id]."
- Técnico puede salir del sitio con su evidencia documentada.

### Qué NO se hace

- No se penaliza al cliente económicamente (cláusula informativa en T&C, no penal).
- No se factura a MABE (la solicitud queda en estado terminal).
- No se paga al técnico por la visita (decisión del 2026-05-10).

---

## Estados, columnas y tablas DB

Ver `supabase/migrations/20260510_no_show_protocolo.sql` (pendiente de aplicación).

### Nuevos estados

| Estado | Tipo | Significado |
|---|---|---|
| `no_show_cliente` | terminal | Cliente no estuvo presente, técnico documentó evidencia, servicio cerrado sin pago |

### Nuevas columnas en `evidencias_servicio`

| Columna | Tipo | Notas |
|---|---|---|
| `evidencia_no_show` | JSONB | Payload con: selfie_url, inmueble_url, timbrazos[], llamadas[], wa_intentos[], pings_no_show[], notas_tecnico, marcado_at |

### Nuevas columnas en `solicitudes_servicio`

Para soportar el cálculo de bonos y reparto de pagos según las reglas de TARIFAS.md:

| Columna | Tipo | Notas |
|---|---|---|
| `cumple_ta` | boolean | true si diagnóstico < 24h de horario_confirmado_at; computado al diagnosticar |
| `cumple_encuesta` | boolean | true si el cliente contestó encuesta de satisfacción; null hasta el cierre |
| `dias_solucion_efectivos` | integer | días desde creación hasta completada, descontando esperando_repuesto |
| `pago_tecnico_total` | integer | computado al cerrar el servicio (base × 0.78 + bono + recargo_weekend) |
| `margen_baird` | integer | computado (base × 0.22) |
| `recargo_weekend_aplicado` | integer | computado (0 o 5k/6k/7k según complejidad) |

### Tabla nueva `cliente_historial`

```sql
CREATE TABLE cliente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text,                          -- cédula o NIT
  telefono text,                            -- formato pipe "57|3134951164"
  nombre_ultimo_visto text,
  no_shows_count integer DEFAULT 0,
  cancelaciones_tarde_count integer DEFAULT 0,
  servicios_completados_count integer DEFAULT 0,
  bloqueado boolean DEFAULT false,
  bloqueado_motivo text,
  bloqueado_at timestamptz,
  ultimo_evento_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cliente_historial_documento ON cliente_historial(documento) WHERE documento IS NOT NULL;
CREATE INDEX idx_cliente_historial_telefono ON cliente_historial(telefono) WHERE telefono IS NOT NULL;
```

Lookup: por documento (preferido) o teléfono. Update: trigger en `solicitudes_servicio` cuando entra a estado terminal.

---

## Política de gracia con clientes recurrentes

Para reducir churn por "se me olvidó una vez" pero pegar duro a abusadores recurrentes:

| No-shows acumulados | Acción |
|---|---|
| 1 (primero) | Sin penalidad. Mensaje cordial: "No pudimos hacer tu servicio. Crea una nueva solicitud cuando puedas." |
| 2 | Mensaje firme: "Notamos que es la segunda vez que no estás presente. Para tu próxima solicitud necesitaremos confirmar por llamada antes de despachar técnico." Flag `requiere_confirmacion_llamada=true` en `cliente_historial`. |
| 3 o más | Cliente queda en lista negra: `bloqueado=true` con motivo `'no_show_recurrente'`. No puede crear nuevas solicitudes en la plataforma sin que admin lo desbloquee manualmente. Admin puede notificar a MABE para que decidan si los siguen atendiendo en garantía. |

Endpoint admin para gestión: `/admin/clientes-historial` (página pendiente).

---

## Plantillas WhatsApp pendientes

Las siguientes plantillas Meta deben crearse y aprobarse antes de activar el protocolo automatizado. JSON listo en `docs/WHATSAPP_TEMPLATES.md` § "Backlog".

| Nombre | Disparo | Destino | Backlog ID |
|---|---|---|---|
| `recordatorio_visita_v1` | Cron T-24h | Cliente | (nuevo, agregar) |
| `recordatorio_visita_inminente_v1` | Cron T-2h | Cliente | (nuevo, agregar) |
| `tecnico_llegando_v1` | GPS llegada | Cliente | (nuevo, agregar) |
| `no_show_aviso_cliente_v1` | Tras marcar no-show | Cliente | (nuevo, agregar) |

Mientras Meta no apruebe estas plantillas, el protocolo funciona en modo manual (admin avisa por teléfono o WhatsApp libre cuando aplique). Recordatorios automáticos T-24h/T-2h quedan deshabilitados.

---

## Cláusula informativa en T&C

Sin penalidad económica al cliente, pero con consecuencias claras. Texto base para `legal/01-terminos-y-condiciones.docx` y `src/app/terminos/page.tsx`:

> **8. Visita programada y compromiso de presencia**
>
> 8.1. Al confirmar un horario, el cliente se compromete a estar presente o tener un mayor de edad autorizado en la dirección registrada durante toda la franja horaria seleccionada.
>
> 8.2. El cliente puede cancelar o reagendar la visita sin costo hasta 4 horas antes del inicio de la franja, a través del portal `/servicio/{token}` o respondiendo al WhatsApp de confirmación.
>
> 8.3. Si el técnico llega a la dirección dentro de la franja confirmada y no encuentra al cliente, y el cliente no canceló con al menos 4 horas de anticipación, el servicio quedará cerrado y deberá solicitarse nuevamente.
>
> 8.4. La acumulación de **2 inasistencias** a visitas confirmadas faculta a Baird Service para exigir confirmación adicional por llamada en futuras solicitudes. La acumulación de **3 o más inasistencias** faculta a Baird Service para suspender el acceso del cliente a la plataforma.
>
> 8.5. Excepciones (caso fortuito o fuerza mayor comprobable): emergencia médica del cliente o familiar, evento de fuerza mayor declarado por autoridad, o error del técnico/Baird (dirección errónea, llegada fuera de franja). Reclamos por excepción se evalúan caso a caso por Baird en máximo 48 horas.

---

## Roadmap de implementación

| Fase | Trabajo | Bloqueador |
|---|---|---|
| 1 | Migración SQL: `no_show_cliente` estado + columnas evidencia + tabla `cliente_historial` | — |
| 2 | UI técnico: botón "Llegué" → ping GPS + protocolo no-show (foto, llamadas, espera 15 min, marcar) | Migración Fase 1 |
| 3 | Plantillas WhatsApp: subir 4 plantillas a Meta y esperar aprobación | Diseño copy + JSON |
| 4 | Cron T-24h y T-2h: nuevo `/api/cron/recordatorio-visita` | Plantillas aprobadas |
| 5 | UI cliente en `/servicio/{token}`: ver botón rápido "Confirmar presencia" | — |
| 6 | UI admin: `/admin/alertas-visita`, `/admin/clientes-historial` | Migración Fase 1 |
| 7 | T&C update: cláusula sección 8 | Revisión legal |
| 8 | Backfill `cliente_historial` con histórico actual | Migración Fase 1 + script |

Cada fase es independiente excepto donde se indica el bloqueador.
