# Flujos de servicio — Baird Service

> Documento canónico de los flujos end-to-end con cada plantilla WhatsApp,
> punto de decisión del cliente, y verificación de continuidad de la
> comunicación.
>
> **Última actualización: 2026-05-10** (particular elimina admin pricing gate;
> técnico ingresa costo directo y sistema calcula con IVA + margen Baird).
> Reemplaza a `docs/FLUJOS-USUARIO.md` (obsoleto, state machine v1).

> 🧭 **Ver también**:
> - `docs/INDEX.md` — hub de navegación. Si llegaste acá sin contexto, empezá por ahí.
> - `docs/TARIFAS.md` — modelo MABE garantía (Tipo D + bonos + weekend) y particular (× 1.19 × 1.10).
> - `docs/PROTOCOLO-VISITA.md` — verificación T-24h / T-2h / llegada / no-show.
> - `docs/WHATSAPP_TEMPLATES.md` — catálogo de las plantillas Meta + proceso de cambio.
> - `supabase/migrations/README.md` — estados, columnas, hotfixes pendientes.
> - `CLAUDE.md` — convenciones, gotchas, env vars.

---

## Tabla de contenido

1. [Principios del diseño](#principios-del-diseño)
2. [Flujo GARANTÍA (es_garantia=true)](#flujo-garantía-es_garantiatrue)
3. [Flujo PARTICULAR (es_garantia=false)](#flujo-particular-es_garantiafalse)
4. [Side flow: Cliente cancela / reagenda](#side-flow-cliente-cancela--reagenda)
5. [Puntos de decisión del cliente — verificación](#puntos-de-decisión-del-cliente--verificación)
6. [Catálogo de plantillas WhatsApp](#catálogo-de-plantillas-whatsapp)
7. [Estados terminales y continuidad de comunicación](#estados-terminales-y-continuidad-de-comunicación)
8. [Gaps conocidos](#gaps-conocidos)

---

## Principios del diseño

1. **Customer-first scheduling.** Toda solicitud (garantía o particular) arranca con el cliente proponiendo y confirmando el horario antes de notificar técnicos. No hay diferencia entre los dos flujos en este paso.
2. **Admin pricing gate solo para garantía + esperar_repuesto** (v2 2026-05-10). En garantía con `esperar_repuesto`, el admin debe fijar `tiempo_entrega` antes de notificar al cliente (precio MABE ya está fijo por tarifario). En particular el técnico ingresa su costo y el sistema calcula con IVA + margen Baird automáticamente — sin gate admin. Ver [docs/TARIFAS.md](./TARIFAS.md).
3. **Cliente siempre tiene la última palabra.** En ambos flujos hay un paso de aprobación explícito tras el diagnóstico (verificar paso para garantía, aprobar cotización para particular).
4. **Self-service durante todo el ciclo.** El cliente puede cancelar o reagendar desde `/servicio/{cliente_token}` mientras el estado lo permita.
5. **Audit append-only.** Cancelaciones, reagendamientos y cambios admin escriben en `solicitud_eventos` sin borrado.
6. **Atomic state transitions** para evitar race conditions cuando dos partes actúan al tiempo.

---

## Flujo GARANTÍA (es_garantia=true)

La marca (Mabe/GE) paga a Baird vía tarifa por código de complejidad. El cliente no paga. El técnico recibe pago + bono TSS por pronta solución.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. CREACIÓN DE SOLICITUD                                                 │
│ Origen: /solicitar (cliente) o /admin/carga-masiva (admin Excel)         │
│ POST /api/solicitar  →  src/app/api/solicitar/route.ts                   │
│                                                                           │
│ DB:  estado=pendiente_horario                                            │
│      horario_token=uuid (acción específica)                              │
│      cliente_token=uuid (durable, para /servicio portal)                 │
│                                                                           │
│ 📩 → CLIENTE: cliente_seleccion_horario_v1                               │
│   Header: "Solicitud recibida en Baird Service"                          │
│   Body: cliente, equipo, horario_1, horario_2                            │
│   Botón: "Confirmar horario" → /horario/{horario_token}                  │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (cliente abre webview)
┌──────────────────────────────────────────────────────────────────────────┐
│ 1b. (TIMEOUT — opcional) Si pasan 24h sin confirmar                      │
│ Cron /api/cron/horario-recordatorio ejecuta cada 1h                      │
│                                                                           │
│ 📩 → CLIENTE: recordatorio_horario_v1                                    │
│   Body: cliente, equipo                                                  │
│   Botón: "Confirmar horario" (mismo horario_token)                       │
│                                                                           │
│ Si pasan 36h totales sin confirmar:                                      │
│   → estado=sin_agendar (terminal)                                        │
│   ⚠️ NO se envía plantilla final al cliente — gap conocido (ver §8)     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. CLIENTE CONFIRMA HORARIO                                              │
│ POST /api/confirmar-horario { token, horario }                           │
│                                                                           │
│ DB:  estado=notificada                                                   │
│      horario_confirmado=<string elegido>                                 │
│      tyc_aceptados_at, tyc_version                                       │
│                                                                           │
│ Backend dispara notificarTecnicos(solicitudId).                          │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. NOTIFICAR TÉCNICOS COMPATIBLES                                        │
│ Filtro: especialidad ≈ tipo_equipo + ciudad ≈ ciudad_pueblo +            │
│         estado_verificacion='verificado'                                 │
│                                                                           │
│ Por cada técnico (en paralelo):                                          │
│   notificaciones_whatsapp.insert(token=uuid)                             │
│                                                                           │
│ 📩 → TÉCNICO N: nueva_solicitud_v3                                       │
│   Body: nombre, equipo, problema, ubicacion, horario, "GARANTIA - Sin    │
│         cobro"                                                           │
│   Botón: "Aceptar" → /aceptar/{token_notif}                              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (un técnico hace click)
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. ACEPTACIÓN ATÓMICA                                                    │
│ procesarAceptacion(token) en whatsapp.service.ts:380-660                 │
│                                                                           │
│ UPDATE solicitudes_servicio                                              │
│   SET tecnico_asignado_id=X, estado='asignada'                           │
│   WHERE id=Y AND tecnico_asignado_id IS NULL  ← guard atómico            │
│                                                                           │
│ Solo el primer técnico gana. Los demás reciben:                          │
│ 📩 → TÉCNICOS perdedores: servicio_no_disponible_v3                      │
│                                                                           │
│ Al ganador:                                                              │
│ 📩 → TÉCNICO ganador: servicio_asignado_tecnico_v3                       │
│   Body: nombre, cliente, equipo, direccion, "GARANTIA - Sin cobro",      │
│         teléfono cliente                                                 │
│   Botón: "Ver portal" → /tecnico/{portal_token}                          │
│                                                                           │
│ Al cliente:                                                              │
│ 📩 → CLIENTE: tecnico_asignado_cliente_v5                                │
│   Body: cliente, técnico, equipo, horario, teléfono técnico              │
│                                                                           │
│ 📷 → CLIENTE: imagen tecnico.foto_perfil_url                             │
│      (caption: "📷 {nombre} — Tu técnico asignado")                      │
│ 🪪 → CLIENTE: imagen tecnico.foto_documento_url                          │
│      (caption: "🪪 CC {numero} — Identificación verificada")             │
│                                                                           │
│ ⚠️ Las 2 imágenes son free-form — Meta exige ventana 24h del cliente.    │
│    En customer-first la ventana 24h NO está abierta (cliente solo tocó   │
│    botones URL). Falla con error #131047 "Re-engagement message".        │
│    MITIGACIÓN: las fotos también se renderizan en                        │
│    /servicio/{cliente_token} (server-fetched, sin WhatsApp).             │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (técnico llega al sitio)
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. DIAGNÓSTICO POR EL TÉCNICO                                            │
│ Página /tecnico/{portal_token}/diagnostico/{id}                          │
│                                                                           │
│ Tech firma oath, sube evidencias (foto/video del fallo), describe        │
│ diagnóstico, selecciona complejidad, código de falla, productos          │
│ necesarios (SKU+desc+cantidad) y productos recomendados (sin precio).    │
│ Elige siguiente paso (4 opciones).                                       │
│                                                                           │
│ POST /api/diagnostico                                                    │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────┬───────────┼─────────────┬──────────────┐
            │         │           │             │              │
            ▼         ▼           ▼             ▼              ▼
       reparar   esperar_repuesto  no_reparable  negativa_cliente
            │         │           │             │
            │         ▼           │             │
            │  ┌──────────────┐   │             │
            │  │ pendiente_   │   │             │
            │  │ pricing      │   │             │
            │  │ (admin fija  │   │             │
            │  │  tiempo)     │   │             │
            │  └──────────────┘   │             │
            │         │           │             │
            │         ▼           │             │
            │  POST /api/         │             │
            │  cotizacion-precios │             │
            │         │           │             │
            ▼         ▼           ▼             ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ 6. VERIFICACIÓN POR EL CLIENTE                                       │
   │ DB: estado=verificacion_pendiente                                    │
   │     verificacion_paso_token=uuid                                     │
   │                                                                       │
   │ 📩 → CLIENTE: verificar_siguiente_paso_v1                            │
   │   Body: cliente, técnico, equipo, diagnóstico, acción propuesta      │
   │   Botón: "Aprobar paso" → /verificar-paso/{verificacion_paso_token}  │
   │                                                                       │
   │ Cliente abre el webview y ve:                                        │
   │   - Saludo + nombre del técnico                                      │
   │   - Diagnóstico técnico completo                                     │
   │   - Acción propuesta (con icono según paso) + detalle del repuesto   │
   │     si aplica                                                         │
   │   - Recordatorio T&C ("no pagues directo al técnico")                │
   │   - Botón verde "✅ Aprobar — {acción}"                              │
   │   - Botón rojo "🚫 No estoy de acuerdo" (abre textarea de motivo)    │
   └──────────────────────────────────────────────────────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
                  APROBADO                 RECHAZADO
                       │                     │
                       ▼                     ▼
   ┌──────────────────────────┐  ┌──────────────────────────────────┐
   │ POST /api/verificar-paso │  │ POST /api/verificar-paso         │
   │ { decision: 'aprobado' } │  │ { decision: 'rechazado',         │
   │                          │  │   comentario: '...' }            │
   │ Transiciona según paso:  │  │                                  │
   │  - reparar →             │  │ DB: estado=en_disputa            │
   │    en_proceso            │  │ verificacion_paso_decision=      │
   │  - esperar_repuesto →    │  │   'rechazado'                    │
   │    esperando_repuesto    │  │                                  │
   │  - no_reparable →        │  │ 📩 → TÉCNICO: texto libre        │
   │    finalizado_sin_       │  │   "Cliente RECHAZÓ. No procedas. │
   │    reparacion (terminal) │  │    Admin contactará."            │
   │  - negativa_cliente →    │  │                                  │
   │    cancelada_cliente     │  │ Admin debe intervenir manualmente│
   │    (terminal)            │  │ desde /admin/solicitudes/[id].   │
   │                          │  │                                  │
   │ Plus WhatsApps:          │  │                                  │
   │  Si reparar:             │  │                                  │
   │   📩 → CLIENTE texto:    │  │                                  │
   │     "Aprobaste reparación│  │                                  │
   │      Te avisamos al      │  │                                  │
   │      completar"          │  │                                  │
   │   📩 → TÉCNICO texto:    │  │                                  │
   │     "APROBÓ - procede"   │  │                                  │
   │  Si esperar_repuesto:    │  │                                  │
   │   📩 → CLIENTE:          │  │                                  │
   │     esperando_repuesto_  │  │                                  │
   │     cliente_v1           │  │                                  │
   │     (sku + desc + tiempo)│  │                                  │
   │  Si no_reparable:        │  │                                  │
   │   📩 → CLIENTE:          │  │                                  │
   │     finalizado_sin_      │  │                                  │
   │     reparacion_v1        │  │                                  │
   │     (motivo, terminal)   │  │                                  │
   │  Si negativa_cliente:    │  │                                  │
   │   📩 → CLIENTE texto:    │  │                                  │
   │     "Decisión registrada"│  │                                  │
   └──────────────────────────┘  └──────────────────────────────────┘
                       │
                       ▼  (rama "reparar" o "esperar_repuesto" → en_proceso)
┌──────────────────────────────────────────────────────────────────────────┐
│ 6b. (Si esperar_repuesto) ADMIN MARCA REPUESTO RECIBIDO                  │
│ Página /admin/repuestos                                                  │
│ POST /api/repuesto-recibido { repuestoId }                               │
│                                                                           │
│ Cuando todos los repuestos de la solicitud están 'recibido':             │
│ DB:  estado=esperando_repuesto → en_proceso                              │
│                                                                           │
│ 📩 → CLIENTE: repuesto_recibido_cliente_v1                               │
│   Body: cliente, equipo, técnico                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (técnico hace la reparación)
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. COMPLETAR SERVICIO                                                    │
│ Página /tecnico/{portal_token}/completar/{id}                            │
│ Tech sube fotos finales, checklist, firma del cliente, GPS de salida.    │
│                                                                           │
│ POST /api/completar-servicio                                             │
│ DB:  estado=en_verificacion                                              │
│                                                                           │
│ 📩 → CLIENTE: confirmar_servicio_v3                                      │
│   Body: cliente, técnico, equipo                                         │
│   Botón: "Confirmar servicio" → /confirmar/{confirmacion_token}          │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
             SATISFECHO + rating       REPORTA PROBLEMA
                       │                     │
                       ▼                     ▼
              estado=completada       estado=en_disputa
              (terminal)              (admin)
                                  │
                       ▼  (cron de 10 min)
┌──────────────────────────────────────────────────────────────────────────┐
│ 7b. GPS FOLLOWUP (silencioso)                                            │
│ Cron /api/cron/gps-followup ejecuta cada 10 min.                         │
│ 30+ min después de completar, valida si el ping post-visita del técnico  │
│ está a <100m de la dirección del cliente.                                │
│ Si sí → evidencias_servicio.gps_flagged=true.                            │
│ Visible en /admin/gps-alertas. NO genera notificación al cliente —       │
│ es señal interna para investigación.                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo PARTICULAR (es_garantia=false)

El cliente paga a Baird por el servicio. **Desde 2026-05-10 el técnico ingresa su costo directamente** y el sistema calcula el total al cliente con IVA 19% + margen Baird 10% (`Total_Cliente = costoTecnico × 1.19 × 1.10`). Ya **no** pasa por admin pricing gate.

Ver [docs/TARIFAS.md § "Particular"](./TARIFAS.md#particular-post-garantía-multi-marca) para la fórmula completa.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. CREACIÓN DE SOLICITUD                                                 │
│ Idéntico a garantía. Mismo POST /api/solicitar.                          │
│ DB: estado=pendiente_horario, horario_token, cliente_token               │
│                                                                           │
│ 📩 → CLIENTE: cliente_seleccion_horario_v1 (mismo template)              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
[Pasos 1b–2 idénticos a garantía: timeout, cliente confirma horario, etc.]
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. NOTIFICAR TÉCNICOS                                                    │
│ 📩 → TÉCNICO N: solicitud_particular_tecnico_v1                          │
│   Body: nombre, equipo, problema, ubicacion, horario, pago_diagnostico   │
│   Botón: "Aceptar" → /aceptar/{token_notif}                              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. ACEPTACIÓN ATÓMICA                                                    │
│ Misma lógica atómica que en garantía.                                    │
│ DB: estado=diagnostico_pendiente (NO 'asignada' como en garantía)        │
│                                                                           │
│ Al ganador:                                                              │
│ 📩 → TÉCNICO ganador: servicio_asignado_tecnico_v3                       │
│ Al cliente:                                                              │
│ 📩 → CLIENTE: tecnico_asignado_particular_v1                             │
│   Body: cliente, técnico, equipo, horario, tel, tarifa, anticipo         │
│ 📷🪪 → CLIENTE: fotos del técnico (mismo caveat 24h)                     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (técnico llega)
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. DIAGNÓSTICO + COTIZACIÓN AUTOMÁTICA                                   │
│ Tech firma oath, sube evidencias, escribe diagnóstico, lista productos   │
│ necesarios (SKU+desc+cantidad) y recomendados. Ingresa SU COSTO TOTAL    │
│ (mano de obra + repuestos). Elige siguiente paso (4 opciones).           │
│                                                                           │
│ Sistema calcula:                                                          │
│   Total_Cliente = costoTecnico × 1.19 × 1.10                             │
│   (IVA 19% Colombia + margen Baird 10%)                                   │
│                                                                           │
│ POST /api/diagnostico  (con costoTecnico en el body)                     │
│                                                                           │
│ DB:  estado=cotizacion_enviada (saltamos admin gate)                     │
│      cotizacion={ diagnostico, productos_necesarios[],                   │
│                   productos_recomendados[],                              │
│                   pendiente_precio: false,                               │
│                   costo_tecnico, subtotal_con_iva, margen_baird,         │
│                   total: <Total_Cliente>,                                │
│                   token: uuid }                                          │
│      pago_tecnico=costoTecnico                                           │
│                                                                           │
│ 📩 → CLIENTE: cotizacion_cliente_v1                                      │
│   Body: cliente, técnico, equipo, diagnóstico, mano_obra (=0),           │
│         repuestos (=0), total (=Total_Cliente)                           │
│   Botón: "Aprobar cotización" → /cotizacion/{cotizacion.token}           │
│                                                                           │
│ ⚠️ Cliente VE solo "Total: $X (incluye IVA)". No se le muestra           │
│    desglose costo técnico ni margen Baird (ver docs/TARIFAS.md).         │
│                                                                           │
│ Excepción terminal: si siguiente_paso ∈ { no_reparable, negativa_cliente │
│ }, no hay cotización; estado pasa directo a finalizado_sin_reparacion    │
│ o cancelada_cliente.                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (cliente abre webview)
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. CLIENTE APRUEBA / RECHAZA COTIZACIÓN                                  │
│ Página /cotizacion/{token} muestra:                                      │
│   - Datos del técnico (nombre)                                           │
│   - Diagnóstico técnico completo                                         │
│   - Fotos de evidencia del diagnóstico                                   │
│   - Productos necesarios con SKU + cantidad + subtotal                   │
│   - Productos recomendados (sin precio, opcional)                        │
│   - Desglose: mano de obra + repuestos = total                           │
│   - Tiempo de entrega                                                    │
│   - Aviso de pago via Baird Service                                      │
│   - Botón verde "✅ Aprobar cotización"                                  │
│   - Botón rojo "❌ Rechazar cotización" (con textarea de comentario)     │
│                                                                           │
│ POST /api/aprobar-cotizacion { token, aprobado: bool, comentario? }      │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
                  APROBADA                 RECHAZADA
                       │                     │
                       ▼                     ▼
   ┌──────────────────────────┐  ┌──────────────────────────────────┐
   │ DB:                      │  │ DB: estado=cotizacion_rechazada  │
   │   estado=cotizacion_     │  │     cotizacion.rechazado_at      │
   │   aprobada               │  │     comentario_rechazo           │
   │   cotizacion.aprobado_at │  │   (terminal)                     │
   │                          │  │                                  │
   │ Inmediatamente:          │  │ 📩 → TÉCNICO texto libre:        │
   │   estado=en_proceso      │  │   "Cliente rechazó. {motivo}.    │
   │                          │  │    Servicio cerrado."            │
   │ 📩 → TÉCNICO:            │  │                                  │
   │   cotizacion_aprobada_   │  │ ⚠️ Cliente solo ve in-app        │
   │   tecnico_v1             │  │   confirmación — no recibe       │
   │   Body: tec, cliente,    │  │   plantilla final (gap §8)       │
   │         equipo, total    │  │                                  │
   │   Botón: "Ver portal" →  │  │                                  │
   │   /tecnico/{portal_token}│  │                                  │
   └──────────────────────────┘  └──────────────────────────────────┘
                       │
                       ▼  (técnico procede con la reparación)
[Pasos 6b-7 igual que garantía: si necesita repuesto y admin marca recibido,
 luego completar servicio + confirmación del cliente]
```

---

## Side flow: Cliente cancela / reagenda

Cliente abre `/servicio/{cliente_token}` (URL incluida en plantillas iniciales o copiada por admin desde `/admin/solicitudes/[id]`).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Portal /servicio/{cliente_token}                                         │
│ Servidor (RSC) lee solicitud por cliente_token, muestra:                 │
│   - Estado actual (badge + label)                                        │
│   - Equipo, ubicación, horario_confirmado                                │
│   - Datos del técnico asignado (nombre, foto perfil, foto documento)     │
│   - Botones según estado:                                                │
│       Cancelar (si estado ∈ ESTADOS_CANCELABLES_POR_CLIENTE)             │
│       Reagendar (si estado ∈ ESTADOS_REAGENDABLES_POR_CLIENTE            │
│                  y reagendamientos_count < 2)                            │
└──────────────────────────────────────────────────────────────────────────┘
            │                                       │
   ┌────────┴────────┐                    ┌────────┴────────┐
   ▼                 ▼                    ▼                 ▼
CANCELAR     (modal con motivo)     REAGENDAR     (modal con fecha+franja)
   │                                       │
   ▼                                       ▼
POST /api/solicitud/cancelar          POST /api/solicitud/reagendar
{ token, motivo }                     { token, horario, motivo? }

DB:                                   DB:
  estado=cancelada                      horario_confirmado=<nuevo>
  cancelado_at, cancelado_por='cliente' horario_confirmado_at=now()
  motivo_cancelacion                    reagendamientos_count++
  cancelado_tarde si tenía técnico      ultimo_reagendado_at
                                        Si pre-aceptación:
                                          estado=notificada (mantiene)
                                        Si post-aceptación:
                                          estado conserva (asignada o
                                          diagnostico_pendiente)
                                          tecnico_asignado_id intacto

📩 → CLIENTE texto libre:             📩 → CLIENTE texto libre:
  "Hola {n}, cancelamos tu              "Hola {n}, reagendamos a {h}.
   solicitud de {equipo}. Si             Avisamos al técnico."
   necesitas, crea una nueva
   en /solicitar"

📩 → TÉCNICO texto libre (si hay):    📩 → TÉCNICO texto libre (si hay):
  "Cliente {n} canceló {equipo}        "Cliente {n} reagendó a {h}.
   horario {h}. Si gastaste              Si no puedes asistir, contacta."
   tiempo, repórtalo a Baird"

Notifs activas a otros técnicos       (Notifs ya invalidadas si tech
se invalidan:                          aceptó; si pre-aceptación quedan
  UPDATE notificaciones_whatsapp       activas con horario actualizado
    SET estado='invalidado'            visible en su portal)
    WHERE estado='enviado'

Audit:                                Audit:
  solicitud_eventos.insert(             solicitud_eventos.insert(
    tipo='cancelacion',                   tipo='reagendamiento',
    payload: cancelado_tarde,             payload: horario_previo,
             tenia_tecnico,                        horario_nuevo,
             es_garantia)                          reagendamientos_count)
```

**Caveat textos libres**: dependen de que el cliente/técnico haya enviado un mensaje al negocio en las últimas 24h. Si Meta los rechaza con #131047, queda registrado en log + audit, pero el cliente sí ve el cambio in-app (el portal refresca después de la acción).

---

## Puntos de decisión del cliente — verificación

Confirmaciones explícitas de que **el cliente recibe la URL y puede aceptar/rechazar**:

### 1. Confirmación de horario inicial
| Aspecto | Detalle |
|---|---|
| Plantilla | `cliente_seleccion_horario_v1` |
| URL en botón | `/horario/{horario_token}` |
| Página | `src/app/horario/[token]/page.tsx` + `HorarioSelector.tsx` |
| API | `POST /api/confirmar-horario` |
| Acción | Cliente elige fecha + franja, acepta T&C, confirma |
| ✅ Verificado | Botón Confirmar en HorarioSelector líneas 305-313 |

### 2. Verificación de paso post-diagnóstico (GARANTÍA)
| Aspecto | Detalle |
|---|---|
| Plantilla | `verificar_siguiente_paso_v1` |
| URL en botón | `/verificar-paso/{verificacion_paso_token}` |
| Página | `src/app/verificar-paso/[token]/page.tsx` + `VerificarPasoView.tsx` |
| API | `POST /api/verificar-paso` |
| Acción | Cliente aprueba (botón verde) o rechaza con motivo (botón rojo + textarea) |
| ✅ Verificado | Botones en VerificarPasoView líneas 151-167 |
| ✅ Audit | Decisión queda en `verificacion_paso_decision` y `verificacion_paso_at` |

### 3. Aprobación de cotización (PARTICULAR)
| Aspecto | Detalle |
|---|---|
| Plantilla | `cotizacion_cliente_v1` |
| URL en botón | `/cotizacion/{cotizacion.token}` (token dentro del JSONB) |
| Página | `src/app/cotizacion/[token]/page.tsx` |
| API | `POST /api/aprobar-cotizacion` |
| Acción | Cliente aprueba o rechaza con comentario opcional |
| ✅ Verificado | Botones en cotizacion/[token]/page.tsx líneas 303-316 |
| ✅ Trigger post-diagnóstico | Se envía inmediatamente al guardar el diagnóstico (técnico ingresó costo). Sin admin gate desde 2026-05-10. |

### 4. Confirmación final del servicio (ambos flujos)
| Aspecto | Detalle |
|---|---|
| Plantilla | `confirmar_servicio_v3` |
| URL en botón | `/confirmar/{confirmacion_token}` |
| Página | `src/app/confirmar/[token]/page.tsx` |
| API | `POST /api/confirmar-servicio` |
| Acción | Cliente confirma satisfecho (rating 1-10) o reporta problema |

### 5. Self-service permanente — visible en cada webview
URL: `/servicio/{cliente_token}`. Desde 2026-05-08 el componente `<GestionarServicioLink>` (en `src/components/ui/GestionarServicioLink.tsx`) se renderiza en todos los webviews del cliente:

| Webview | Cuándo lo ve el cliente |
|---|---|
| `/horario/{horario_token}` | Al elegir horario y al ver "horario confirmado" |
| `/verificar-paso/{verificacion_paso_token}` | Al aprobar/rechazar siguiente paso (warranty) |
| `/cotizacion/{cotizacion.token}` | Al aprobar/rechazar cotización (particular) |
| `/servicio/{cliente_token}` | Es el portal mismo |

El componente muestra el copy: *"¿Necesitas cancelar o cambiar la fecha? Aplica para servicios en garantía y servicios particulares. Hasta 4 horas antes del horario podés cancelar sin costo, y reagendar hasta 2 veces."* + link al portal.

**Pendiente**: agregar plantilla `gestionar_servicio_v1` cuando Meta apruebe, para que el link viaje también vía WhatsApp y el cliente pueda llegar al portal sin haber abierto otro webview primero.

---

## Catálogo de plantillas WhatsApp

Idioma: `es`. WABA ID `2354953275016882`. Phone `+57 313 4951164`.

### Pre-asignación (común a ambos flujos)
| Template | Disparo | Destino |
|---|---|---|
| `cliente_seleccion_horario_v1` | POST /api/solicitar | Cliente |
| `recordatorio_horario_v1` | Cron 24h post-creación si no confirmó | Cliente |
| `nueva_solicitud_v3` | notificarTecnicos (warranty) | Técnicos compatibles |
| `solicitud_particular_tecnico_v1` | notificarTecnicos (particular) | Técnicos compatibles |
| `servicio_no_disponible_v3` | procesarAceptacion — perdedores | Técnicos perdedores |
| `servicio_asignado_tecnico_v3` | procesarAceptacion — ganador | Técnico ganador |
| `tecnico_asignado_cliente_v5` | procesarAceptacion (warranty) | Cliente |
| `tecnico_asignado_particular_v1` | procesarAceptacion (particular) | Cliente |
| `solicitud_particular_cliente_v1` | (legacy — verificar uso) | Cliente |
| `registro_bienvenida_v3` | notificarRegistroTecnico | Técnico recién registrado |

### Post-diagnóstico
| Template | Disparo | Destino |
|---|---|---|
| `verificar_siguiente_paso_v1` | enviarVerificacionPasoCliente (warranty) | Cliente |
| `cotizacion_cliente_v1` | enviarCotizacionCliente (particular, post admin pricing) | Cliente |
| `cotizacion_aprobada_tecnico_v1` | notificarCotizacionAprobada | Técnico |
| `esperando_repuesto_cliente_v1` | enviarEsperandoRepuestoCliente (post-aprobación cliente) | Cliente |
| `repuesto_recibido_cliente_v1` | enviarRepuestoRecibidoCliente (admin marca recibido) | Cliente |
| `finalizado_sin_reparacion_v1` | enviarFinalizadoSinReparacion (terminal) | Cliente |

### Final
| Template | Disparo | Destino |
|---|---|---|
| `confirmar_servicio_v3` | POST /api/completar-servicio | Cliente |

### Texto libre (no plantilla)
- Aceptación/rechazo de paso post-verificación → texto al técnico ("Cliente APROBÓ"/"Cliente RECHAZÓ")
- Cancelación cliente → texto al cliente y al técnico
- Reagendamiento cliente → texto al cliente y al técnico
- Cotización rechazada → texto al técnico

⚠️ Todos los textos libres requieren ventana 24h del destinatario. Implementación es best-effort con `.catch(console.error)`.

---

## Estados terminales y continuidad de comunicación

| Estado terminal | Cómo llega aquí | ¿Cliente recibe WhatsApp final? | ¿Resuelto? |
|---|---|---|---|
| `completada` | Cliente confirma satisfecho post-completación | ✅ in-app success page | ✅ |
| `en_disputa` | Cliente reporta problema o rechaza paso | ✅ in-app success page; admin contacta manualmente | ⚠️ depende de admin |
| `cancelada` | Cliente cancela desde /servicio | ✅ texto libre best-effort + in-app | ✅ |
| `cancelada_cliente` | Cliente aprueba "negativa_cliente" en verificar-paso | ✅ texto libre best-effort | ✅ |
| `finalizado_sin_reparacion` | Cliente aprueba "no_reparable" en verificar-paso | ✅ `finalizado_sin_reparacion_v1` (plantilla) | ✅ |
| `cotizacion_rechazada` | Cliente rechaza en /cotizacion | ⚠️ Solo in-app — **NO recibe plantilla final** | gap menor |
| `sin_agendar` | Timeout 36h sin confirmar horario | ⚠️ NO se envía nada — **gap mayor** | ❌ |

---

## Verificación detallada del flujo confirmar-horario → notificar-técnicos (2026-05-08)

Este es el momento más sensible del customer-first scheduling. El cliente
acaba de elegir fecha y aceptar T&C; el sistema debe confirmar y avanzar
inmediatamente a notificar técnicos. Trace verificado paso a paso:

```
HorarioSelector.tsx (webview cliente)
  ├── Usuario elige fecha + franja
  ├── Acepta T&C
  └── POST /api/confirmar-horario { token: horario_token, horario: string }
              │
              ▼
/api/confirmar-horario (server, maxDuration=60s)
  1. Validar token + estado=pendiente_horario           ← rechazo si no aplica
  2. Atomic UPDATE solicitudes_servicio
       SET horario_confirmado, horario_confirmado_at,
           estado='notificada', notificados_at,
           tyc_aceptados_at, tyc_version='2026.04.27'
       WHERE id = sol.id AND horario_confirmado_at IS NULL  ← guard
  3. notificarTecnicos(sol.id):
       - Find técnicos verificados en zona con la especialidad
       - Insert N filas en notificaciones_whatsapp (cada una con UUID token)
       - Send `nueva_solicitud_v3` (warranty) o
              `solicitud_particular_tecnico_v1` (particular)
              en paralelo (Promise.allSettled)
       - Si notificados > 0: re-confirma estado='notificada'
  4. Si notificados == 0: insert en solicitud_eventos
       tipo='nota_admin', payload.requiere_intervencion_admin=true
  5. Response: { success, horario, notificados, matched, errors[], warning? }
              │
              ▼
HorarioSelector.tsx success view
  - Si warning presente: muestra banner amber con la advertencia
  - Si no: muestra "Te avisaremos cuando un técnico acepte"
```

**Estado de la fila en cada caso:**

| Caso | estado tras /api/confirmar-horario | Cliente sabe? | Admin sabe? |
|---|---|---|---|
| Hay técnicos compatibles disponibles | `notificada` | ✅ in-app + cuando técnico acepte por WA | ✅ panel normal |
| 0 técnicos en zona o todos sin especialidad | `notificada` (estado correcto se mantuvo del paso 2) | ✅ in-app warning ("buscando alternativas") | ✅ evento `nota_admin` con `requiere_intervencion_admin: true` |
| Técnicos encontrados pero todos los WA fallan | `notificada` | ⚠️ in-app dice "te avisaremos" pero realmente nadie está al tanto | ✅ evento + errors[] en logs |
| API throw inesperado | atomic UPDATE puede haber pasado o no | ❌ in-app muestra error | ⚠️ solo logs |

**Garantías del flujo:**
- ✅ El UPDATE de horario_confirmado es atómico — un cliente no puede confirmar dos veces (`.is('horario_confirmado_at', null)` como guard).
- ✅ Si el cliente refresca la página después de confirmar, ve la vista de "Horario confirmado" (no permite re-confirmar).
- ✅ La búsqueda de técnicos respeta filtros: `estado_verificacion='verificado'` + especialidad por tipo_equipo + ciudad parcialmente normalizada (accent/case-insensitive).
- ✅ Si `notificarTecnicos` falla por excepción, el catch loguea y la response indica `notificados: 0`. El cliente recibe warning.
- ✅ El estado del flujo es visible al admin: solicitud queda en `notificada` (siempre, post-confirm); si nadie fue notificado, hay un evento `nota_admin` flag para investigar.

**Gaps conocidos del flujo confirmar-horario → técnicos:**

| # | Gap | Severidad | Mitigación actual / Fix futuro |
|---|---|---|---|
| H1 | Cliente NO recibe WhatsApp de confirmación tras elegir horario — solo in-app. Cierra el webview, queda esperando el `tecnico_asignado_*` (puede tardar horas) sin saber que su confirmación se procesó. | 🟡 medio | Plantilla `horario_confirmado_cliente_v1` — JSON listo en `docs/WHATSAPP_TEMPLATES.md` Backlog J. |
| H2 | Si 0 técnicos compatibles, cliente ve warning in-app pero no recibe nada por WA — depende de que abra el webview de nuevo. | 🟡 medio | Cubrir con la misma plantilla J en variante "demora". |
| H3 | Re-notificar tras reagendamiento del cliente en `/servicio/{token}`. Hoy el técnico asignado recibe texto libre, pero los técnicos no-asignados con notif activa ven el horario viejo en su WA (la DB tiene el nuevo). | 🟢 bajo | Idempotente — los técnicos ven el horario actual cuando entran al portal del servicio. |

## Gaps conocidos — flujo GARANTÍA (re-revisado 2026-05-08)

Mapeo de cada momento donde el flujo manda WhatsApp y si la entrega depende de la ventana 24h de Meta. Todas las plantillas siempre llegan; los textos libres y mensajes `image` solo si el destinatario envió mensaje al business en las últimas 24h. Como el cliente solo abre webviews vía botones URL (no abre la ventana 24h), los textos libres al cliente fallan **casi siempre**.

| # | Momento | Hoy | Estado | Fix propuesto |
|---|---|---|---|---|
| 1 | `sin_agendar` (timeout 36h) | NADA al cliente | 🔴 mayor | Plantilla `solicitud_expirada_cliente_v1` (Backlog A) |
| 2 | Aceptación: foto perfil + documento del técnico | `image` free-form | 🔴 mayor | Plantilla `tecnico_asignado_cliente_v6` con HEADER IMAGE (Backlog G) — mitigación actual: fotos también en `/servicio/{cliente_token}` |
| 3 | Cliente aprueba `reparar` en /verificar-paso | texto libre al cliente | 🔴 mayor | `paso_aprobado_cliente_v1` (Backlog B) |
| 4 | Cliente aprueba `negativa_cliente` | texto libre al cliente | 🔴 mayor | `paso_aprobado_cliente_v1` (B) — mismo template, parámetro distinto |
| 5 | Cliente RECHAZA siguiente paso | NADA al cliente (solo in-app) | 🔴 mayor | `paso_rechazado_cliente_v1` (Backlog C) |
| 6 | Cliente decide → técnico se entera | texto libre al técnico | 🟡 medio | `paso_resuelto_tecnico_v1` (Backlog D) |
| 7 | Admin marca repuesto recibido → técnico | texto libre al técnico | 🟡 medio | `repuesto_recibido_tecnico_v1` (Backlog E) |
| 8 | Cliente confirma satisfacción → técnico | NADA al técnico (solo portal) | 🟢 nice-to-have | `servicio_confirmado_tecnico_v1` (Backlog I) |
| 9 | Acceso del cliente al portal de gestión | solo via webviews | 🟡 medio | `gestionar_servicio_v1` (Backlog F) — enviar tras confirmar horario |

**JSON listo para subir** de cada plantilla en `docs/WHATSAPP_TEMPLATES.md` sección "Backlog".

### Gaps que NO requieren plantillas (cambios de código pendientes)

10. **`/api/aprobar-cotizacion` race condition.** Hace dos UPDATEs separados (`cotizacion_aprobada` → `en_proceso`) sin guard atómico. **Fix**: agregar `.eq('estado', 'cotizacion_enviada')` al primer UPDATE o consolidar en uno solo.
11. **JSONB filter antipattern en `/api/aprobar-cotizacion` y `/cotizacion/[token]`.** Cargan toda la tabla y filtran por `cotizacion.token` en JS. **Fix**: columna generada `cotizacion_token` con índice único (ver `supabase/migrations/README.md` sección "M-NEXT-C").
12. **No hay reminder pre-visita** entre confirmación de horario y aceptación del técnico. Si la solicitud queda largo tiempo en `notificada`, el cliente puede perder visibilidad.
13. **Auth de admin API routes.** `/api/cotizacion-precios`, `/api/repuesto-recibido` etc. no validan sesión Supabase Auth — confían en que solo el sidebar admin las invoca.

---

## Para validar end-to-end (testing manual)

Workflow recomendado para QA con `BAIRD_TEST_PHONE_WHITELIST=57<tu-celular>`:

1. **Crear solicitud particular** desde /solicitar con tu teléfono.
2. Recibir `cliente_seleccion_horario_v1`. Click → /horario/{token}.
3. Elegir horario, aceptar T&C, confirmar.
4. (Como técnico) Recibir `solicitud_particular_tecnico_v1`. Click Aceptar.
5. Recibir `tecnico_asignado_particular_v1` + intentar fotos (probable que fallen).
6. Abrir `/servicio/{cliente_token}` desde admin/solicitudes/[id]. Verificar que las fotos del técnico SE MUESTRAN ahí.
7. (Como técnico) Abrir /tecnico/{portal_token}/diagnostico/{id}. Llenar diagnóstico, agregar productos necesarios + recomendados. Submit.
8. Verificar que aparece en `/admin/cotizaciones-pendientes`. Fijar precios y tiempo.
9. Recibir `cotizacion_cliente_v1` con desglose. Click → /cotizacion/{token}.
10. Aprobar la cotización. Verificar que el técnico recibe `cotizacion_aprobada_tecnico_v1`.
11. (Como técnico) Completar servicio en /tecnico/{token}/completar/{id}.
12. Recibir `confirmar_servicio_v3`. Click → /confirmar/{token}. Calificar 10/10.

Para garantía: igual pero `/admin/carga-masiva` o /solicitar con `es_garantia=true`. En el paso 8 admin solo fija tiempo (precio = 0). En paso 9 cliente recibe `verificar_siguiente_paso_v1` (no cotización).

Para self-service: en cualquier paso 2-9, abrir `/servicio/{cliente_token}` y cancelar/reagendar. Verificar que las notifs activas a técnicos se invalidan y que el técnico asignado (si hay) recibe el aviso.
