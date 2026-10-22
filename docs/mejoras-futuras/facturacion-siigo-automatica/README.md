# Factura de venta automática en Siigo (particular, 100 % pagado por Wompi)

> **Estado: diseño aprobado 2026-10-20, SIN código. POSPUESTA el 2026-10-22:**
> antes van el seguimiento facturado / no facturado (chip + estado en la ficha,
> logística puede cambiarlo) y los ítems adicionales en la cotización
> (segundos equipos, partes del inventario); mientras tanto contabilidad
> ajusta cada FV a mano en Siigo. Ver `docs/FACTURACION.md` § 10.
> Es la "Fase 3" de
> [`docs/FACTURACION.md`](../../FACTURACION.md) § 7, ya con las decisiones
> tomadas. Cuando se implemente, este doc se promueve a `docs/SIIGO.md` y
> FACTURACION.md § 7 marca la fase como hecha.

## 1. Objetivo y regla de negocio

Todo servicio **particular** que quede `completada` y **100 % pagado por
Wompi** se factura solo en Siigo como FV-2 electrónica, timbrada ante la DIAN
y enviada al correo del cliente. Nadie captura nada en Siigo.

```
facturable(sol) =
      sol.es_garantia = false
  AND sol.estado = 'completada'
  AND totalClienteNetoParaCobro(sol) > 0                      -- cotización o tarifa fija, menos descuento
  AND monto_pagado_online >= totalClienteNetoParaCobro(sol)   -- suma de pagos APPROVED
  AND no existe fila facturas_siigo con estado 'emitida' para sol
```

Fuera de alcance (por decisión):

- **Pagos en sitio** (QR Bre-B, transferencia directa): no existen en `pagos`,
  así que nunca disparan. El plan de Juan es migrar todo el recaudo a Wompi.
- **Garantía MABE:** sigue siendo la FV consolidada mensual que sale del
  export de `/admin/liquidaciones`.
- **Históricas:** no se facturan en bloque. Las 6 que hoy cumplen la regla se
  pueden emitir una a una con el botón del admin (§ 6.6).

## 2. Decisiones tomadas (Juan, 2026-10-20)

| # | Tema | Decisión |
|---|---|---|
| 1 | Disparo | Solo cuando Wompi cubre el 100 %. Sin botón "pago en sitio". |
| 2 | Emisión | Directa a la DIAN (`stamp.send = true`). Sin borrador ni aprobación. Corregir = nota crédito en Siigo. |
| 3 | Sin cédula | Consumidor final `222222222222`. (Particular ya exige cédula en `/solicitar`; aplica a garantía y a datos viejos.) |
| 4 | Email | Se agrega `cliente_email`: opcional en `/solicitar`, obligatorio en `/pago/*` si falta, y backfill automático desde `customer_email` de Wompi (el checkout de Wompi lo pide siempre; 25 de 27 pagos aprobados lo traen). **2026-10-22:** si no hay correo o es inválido, se usa el **correo por defecto de Baird** (`FACTURACION_EMAIL`) y la emisión **nunca se bloquea** por falta de correo; la entrega al cliente va por WhatsApp (decisión 8). |
| 5 | Tipo de documento | Se sigue infiriendo (`identificacionCliente`: 9 dígitos que empiezan por 8/9 = NIT). Sin selector nuevo. Un NIT se crea como `Company` y la FV lleva observación "verificar responsabilidad fiscal". |
| 6 | Ciudad | Mapa fijo `ciudad_pueblo` → código DANE (§ 4.3). Desconocida = Bogotá + observación "verificar ciudad". |
| 7 | Descuento | Se aplica como descuento del ítem "Servicio técnico" en Siigo; la FV cuadra con lo recibido. |
| 8 | PDF al cliente | **2026-10-22 (cambia la decisión del 20):** la FV se entrega al cliente **siempre por WhatsApp** con el PDF adjunto (plantilla nueva `factura_electronica_cliente_v1`, header DOCUMENT, § 4.8), espejada al receptor del servicio. Siigo además la manda por correo (`mail.send = true`) al correo que tenga el tercero, sea el del cliente o el por defecto de Baird; el correo es secundario. |
| 9 | Centro de costo | Crear **"SERVICIOS LINEA BLANCA"** (código 7-3) en Siigo. La FV-2 lo exige (`cost_center_mandatory: true`, verificado por API 2026-10-20). Hoy solo existen 413 "REPUESTOS LINEA BLANCA" y 414 "REPUESTOS IT". |
| 10 | Credenciales | Las mismas del skill `siigo-tools` (`SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_PARTNER_ID`). |

## 3. Qué ya existe y se reutiliza

| Pieza | Dónde | Uso |
|---|---|---|
| Cliente HTTP de Siigo (auth, token 24 h, reintentos 429/5xx, `createInvoice`, `createCustomer`, `findCustomerByNit`) | `AppVendedores/api/_lib/siigo.ts` | Se porta a `src/lib/siigo/client.ts` recortado a lo que se usa. |
| IDs de Siigo (`SIIGO`), `identificacionCliente`, `itemsFacturaParticular`, `desglosarIva`, `codigoServicio` | `src/lib/utils/facturacion.ts` | El payload de la FV sale de estas mismas funciones. |
| Total neto y descuento | `totalClienteNetoParaCobro`, `descuentoClienteParaCobro` en `src/lib/constants/pago-cliente.ts` | Única fuente del monto a facturar. |
| Ledger de pagos y resumen | `pagos` + `monto_pagado_online` (`pagos.service.ts`) | Condición "100 % pagado". |
| Punto de cierre | `transiciones.service.ts` → `confirmarServicioCliente`, justo después de `enviarCorreoFacturacionServicio` | Disparador A. |
| Punto de saldo | `pagos.service.ts` → `registrarPagoWompi`, rama `tipo === 'saldo'` | Disparador B. |
| Kill-switch y env | patrón de `wompiHabilitado()` / `DAPTA_ENABLED` | `siigoHabilitado()`. |
| Normalización de ciudad | `normalizeForMatch` / `cityTokenForMatch` (matching pipeline) | Clave del mapa DANE. |
| Verificado en Siigo (API) | FV-2 id 28908, consecutivo actual 1523, ítem `2`, IVA 4399, Bancos 1885, seller 802, consumidor final 222222222222 | Constantes. |

## 4. Diseño

### 4.1 Disparadores

```
A. confirmarServicioCliente (cliente confirma OK)        ─┐
B. registrarPagoWompi(tipo='saldo') con estado completada ─┼─► facturarSolicitudEnSiigo(id, origen)
C. POST /api/admin/facturas-siigo { solicitud_id }        ─┤      best-effort, nunca revierte nada
D. GET /api/cron/siigo-reintentos (diario)                ─┘
```

A y B cubren los dos órdenes posibles (paga antes de confirmar, o confirma y
paga después). C es el botón del admin (reintento o histórico). D reintenta
filas en `error` con `intentos < 5` y rescata hooks que murieron.

### 4.2 Idempotencia y doble disparo

A y B pueden correr casi al mismo tiempo (webhook/redirect + confirmación).
Se reclama la fila antes de hablar con Siigo:

```sql
INSERT INTO facturas_siigo (solicitud_id, estado, origen) VALUES ($1, 'procesando', $2)
ON CONFLICT (solicitud_id) DO UPDATE
  SET estado = 'procesando', origen = EXCLUDED.origen, intentos = facturas_siigo.intentos + 1
  WHERE facturas_siigo.estado IN ('error', 'pendiente')
RETURNING id;
```

Sin fila devuelta = otro proceso la tiene o ya está `emitida` → salir. Una
sola fila por solicitud (`UNIQUE (solicitud_id)`); la FV emitida nunca se
vuelve a crear. Una fila `procesando` con más de 10 min se considera
huérfana y el cron la pasa a `error`.

### 4.3 Tercero en Siigo

1. `identificacionCliente(sol.cliente_cedula)`.
2. Consumidor final → se usa `222222222222` sin crear nada.
3. Cédula/NIT → `GET /v1/customers?identification=`. Si existe, se usa tal
   cual (no se sobreescribe nada en Siigo).
4. Si no existe → `POST /v1/customers`:

```jsonc
{
  "type": "Customer",
  "person_type": "Person",            // "Company" si se infirió NIT
  "id_type": { "code": "13" },        // "31" NIT
  "identification": "1234567890",
  "name": ["Nombres", "Apellidos"],   // split de cliente_nombre: último token = apellidos; Company: [nombre completo]
  "branch_office": 0,
  "active": true,
  "vat_responsible": false,
  "fiscal_responsibilities": [{ "code": "R-99-PN" }],
  "address": { "address": "<direccion>", "city": { "country_code": "Co", "state_code": "11", "city_code": "11001" } },
  "phones": [{ "indicative": "57", "number": "3134951164" }],
  "contacts": [{ "first_name": "Nombres", "last_name": "Apellidos", "email": "<email>", "phone": { "indicative": "57", "number": "3134951164" } }]
}
```

Email del contacto, en orden: `sol.cliente_email` → `customer_email` del
último pago APPROVED (`pagos.raw`) → `FACTURACION_EMAIL` (correo por defecto
de Baird; se deja `mail.send = true` para que Baird reciba la copia y la FV
lleva la observación "cliente sin correo — enviada por WhatsApp"). Cada
candidato pasa por una validación de formato (`z.email()`); uno inválido se
descarta y se sigue con el siguiente. El correo **nunca bloquea** la emisión.

Mapa DANE (`src/lib/siigo/ciudades.ts`, clave = `cityTokenForMatch`):

| Ciudad | state | city | Ciudad | state | city |
|---|---|---|---|---|---|
| Bogotá (todas sus variantes) | 11 | 11001 | Chía | 25 | 25175 |
| Soacha | 25 | 25754 | Cajicá | 25 | 25126 |
| Anapoima | 25 | 25035 | Funza | 25 | 25286 |
| La Mesa | 25 | 25386 | Mosquera | 25 | 25473 |
| Cáqueza | 25 | 25151 | Madrid | 25 | 25430 |
| El Colegio | 25 | 25245 | Facatativá | 25 | 25269 |
| Medellín | 05 | 05001 | Zipaquirá | 25 | 25899 |
| Villavicencio | 50 | 50001 | Fusagasugá | 25 | 25290 |

Las 8 primeras son las que hay hoy en la BD; el resto son municipios de la
sabana que aparecen en la cobertura de los técnicos. Desconocida → Bogotá +
`verificar_ciudad = true`.

### 4.4 Factura

```jsonc
{
  "document": { "id": 28908 },                   // FV-2 electrónica
  "date": "2026-10-21",                          // SIEMPRE el día de emisión (Bogotá); Siigo rechaza fechas anteriores a la última FV del consecutivo
  "customer": { "identification": "...", "branch_office": 0 },
  "cost_center": "<SIIGO_COST_CENTER_ID>",
  "seller": 802,
  "stamp": { "send": true },                     // timbra ante la DIAN
  "mail":  { "send": true },                     // false si no hay email real
  "observations": "Servicio BS-EDCF13A6 · Lavadora Mabe · Técnico: Néstor M. · Pagos Wompi: anticipo-… / saldo-… · [verificar ciudad]",
  "items": [
    { "code": "2", "description": "Visita de diagnóstico — Lavadora Mabe", "quantity": 1, "price": 70588.235294, "taxes": [{ "id": 4399 }] },
    { "code": "2", "description": "Servicio técnico Reparación — Lavadora Mabe", "quantity": 1, "price": 210084.033613, "discount": "<descuento>", "taxes": [{ "id": 4399 }] }
  ],
  "payments": [{ "id": 1885, "value": "<total neto con IVA>", "due_date": "2026-10-21" }]
}
```

- Ítems: `itemsFacturaParticular(sol, totalClienteParaCobro(sol))` (dos
  renglones cuando la cotización trae `diagnostico_cliente` + `servicio_cliente`,
  uno si no). `price` = total del ítem / 1.19 con **6 decimales** (no el
  `Math.round` del Excel) para que Σ ítems × 1.19 cuadre al peso con
  `payments`.
- Descuento: `descuentoClienteParaCobro(sol)` va en el ítem de servicio.
  ⚠️ **Verificar en la primera prueba real si Siigo interpreta `discount` como
  valor o como porcentaje**; el helper calcula el valor y lo convierte si hace
  falta. Si Siigo no cuadra, plan B: bajar `price` del ítem y anotar
  "incluye descuento CÓDIGO −$X" en la descripción.
- `payments.value` = `totalClienteNetoParaCobro(sol)`; debe ser igual al
  total que calcula Siigo (validación del API).
- Si `monto_pagado_online` supera el total (pago duplicado), la FV sigue
  siendo por el total; la devolución es un proceso aparte (ya avisa `pagos`).

### 4.5 Persistencia — migración `20261021_facturas_siigo.sql`

```sql
CREATE TABLE facturas_siigo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    UUID NOT NULL UNIQUE REFERENCES solicitudes_servicio(id),
  estado          TEXT NOT NULL CHECK (estado IN ('pendiente','procesando','emitida','error','simulada')),
  origen          TEXT,                    -- confirmacion | saldo | admin | cron
  siigo_id        TEXT,                    -- id de la FV en Siigo
  numero          TEXT,                    -- "FV-2-1524"
  cufe            TEXT,
  tercero_identificacion TEXT,
  total           INTEGER, base INTEGER, iva INTEGER, descuento INTEGER DEFAULT 0,
  payload         JSONB,                   -- lo enviado (auditoría / reintento)
  respuesta       JSONB,                   -- lo que devolvió Siigo
  error           TEXT,
  intentos        INTEGER NOT NULL DEFAULT 0,
  emitida_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE facturas_siigo ENABLE ROW LEVEL SECURITY;   -- sin policies: solo service_role (como pagos)

ALTER TABLE solicitudes_servicio ADD COLUMN IF NOT EXISTS cliente_email TEXT;
```

Además, un evento en `solicitud_eventos` por cada emisión (`factura_emitida`,
payload con número y total) y por cada error (`nota_admin` con
`requiere_intervencion_admin`), para que aparezca en el historial del admin.

Columnas extra para la entrega por WhatsApp (§ 4.8): `pdf_path TEXT`
(ruta en el bucket privado `facturas-siigo`), `whatsapp_enviado_at
TIMESTAMPTZ`, `whatsapp_error TEXT`.

### 4.8 Entrega de la FV al cliente por WhatsApp (decisión 2026-10-22)

La idea es que el cliente **siempre** reciba su factura por WhatsApp, tenga
o no correo. Flujo, justo después de que la fila queda `emitida`:

1. `GET /v1/invoices/{siigo_id}/pdf` → Siigo devuelve el PDF en base64. Si
   aún no está listo (el timbrado DIAN puede tardar unos segundos), se deja
   `whatsapp_enviado_at = NULL` y el cron diario lo reintenta.
2. Guardar el PDF en el bucket **privado** `facturas-siigo` como
   `{solicitud_id}/{numero}.pdf` (es PII: nunca público) y anotar `pdf_path`.
   El admin lo descarga desde la ficha con URL firmada.
3. Subir el PDF a Meta (`POST /v22.0/{WHATSAPP_PHONE_ID}/media`, multipart
   `application/pdf`) → `media_id`. Así no hace falta ninguna URL pública.
4. `enviarPlantillaCliente(sol, 'factura_electronica_cliente_v1', …)` con
   header `{ type: 'document', document: { id: media_id, filename: 'Factura-FV-2-1524.pdf' } }`
   y body: nombre, número de FV, código de servicio `BS-…`, equipo y total.
   Al usar `enviarPlantillaCliente` se espeja sola al receptor del servicio
   (`receptor_acepto_at`), igual que los cobros.
5. `whatsapp_enviado_at = now()`. Si falla, `whatsapp_error` + evento
   `nota_admin` + botón **Reenviar factura** en la ficha del admin.

Plantilla nueva (seguir el proceso de `docs/WHATSAPP_TEMPLATES.md`: definir
en `scripts/upload-templates.mjs`, subir con `getHeaderHandle` y un PDF de
muestra como se hizo con el resumen semanal de supervisores, #23, y esperar
APPROVED antes de activar `SIIGO_ENABLED`):

```
factura_electronica_cliente_v1 — HEADER DOCUMENT
BODY: Hola {{1}} 👋, ya quedó emitida tu factura electrónica {{2}} del servicio {{3}}
      ({{4}}) por {{5}}. Te la adjuntamos en PDF; también la tienes en el correo si
      nos dejaste uno. Gracias por confiar en Baird Service.
FOOTER: Baird Service S.A.S. · NIT 830.024.646-2
```

Emojis solo en el BODY (regla de la casa). El correo de Siigo sigue saliendo
en paralelo; si el cliente no dejó correo, la copia llega al correo por
defecto de Baird y queda como respaldo.

### 4.6 Código nuevo / tocado

| Archivo | Cambio |
|---|---|
| `src/lib/siigo/client.ts` **(nuevo)** | Port de AppVendedores: `siigoHabilitado()`, `siigoDryRun()`, auth con cache del token en módulo, `get`, `post`, `findCustomerByIdentification`, `createCustomer`, `createInvoice`. Reintentos 429/5xx; 400 falla de una con el mensaje de Siigo. |
| `src/lib/siigo/ciudades.ts` **(nuevo)** | Mapa DANE + `ciudadSiigo(ciudad_pueblo)`. |
| `src/lib/utils/facturacion.ts` | `facturableAutomaticamente(sol)`, `armarTerceroSiigo(sol, email)`, `armarFacturaSiigo(sol, pagos, opts)`. Puras, con tests. |
| `src/lib/services/facturacion-siigo.service.ts` **(nuevo)** | `facturarSolicitudEnSiigo(solicitudId, origen)`: carga, regla, claim, tercero, FV, guarda, evento, alerta WhatsApp al equipo si falla (`alertarPagoEquipoBaird`). En `SIIGO_DRY_RUN` guarda el payload con estado `simulada` y no llama a Siigo. |
| `src/lib/services/transiciones.service.ts` | Disparador A tras el correo de facturación (mismo try/catch). |
| `src/lib/services/pagos.service.ts` | Disparador B en la rama `saldo` si `sol.estado === 'completada'`. Backfill de `cliente_email` desde `tx.customer_email` cuando la solicitud no lo tiene. ⚠️ Módulo congelado `[pagos]`: cambio aditivo + test de contrato. |
| `src/app/api/cron/siigo-reintentos/route.ts` **(nuevo)** + `vercel.json` | Diario 06:00 Bogotá. `verificarCron` (`CRON_SECRET`). |
| `src/app/api/admin/facturas-siigo/route.ts` **(nuevo)** | `POST { solicitud_id }` → `facturarSolicitudEnSiigo(id, 'admin')`. `verificarAdmin`; rol lectura rechazado. |
| `src/app/admin/solicitudes/[id]/page.tsx` | En "Cuentas del servicio — Particular": estado de la FV (emitida: número + fecha; error: mensaje + botón **Reintentar**; no aplica: razón, p. ej. "pago online 60 %"); botón **Facturar en Siigo** cuando cumple la regla y no hay FV. |
| `src/lib/services/email.service.ts` | El correo de facturación agrega la línea "FV Siigo: FV-2-1524" o "no emitida: <razón>" y si se envió por WhatsApp. |
| `src/lib/siigo/client.ts` + `src/lib/services/facturacion-siigo.service.ts` | `getInvoicePdf(id)` (base64) y `entregarFacturaCliente(facturaId)`: guarda el PDF en el bucket privado `facturas-siigo`, lo sube a Meta como media y manda `factura_electronica_cliente_v1` vía `enviarPlantillaCliente` (§ 4.8). Reintento desde el cron y botón **Reenviar factura** en el admin. |
| `src/lib/services/whatsapp.service.ts` | `subirMediaWhatsApp(buffer, mime, filename)` (multipart a `/{phone_id}/media`) y `enviarFacturaCliente(sol, factura, mediaId)`; respeta `BAIRD_TEST_PHONE_WHITELIST`. |
| `scripts/upload-templates.mjs` + `docs/WHATSAPP_TEMPLATES.md` | Plantilla `factura_electronica_cliente_v1` (HEADER DOCUMENT con PDF de muestra, BODY con 5 parámetros, FOOTER). |
| `supabase/migrations/20261021_facturas_siigo.sql` | Además de la tabla: bucket privado `facturas-siigo` (sin policies anon) y columnas `pdf_path`, `whatsapp_enviado_at`, `whatsapp_error`. |
| `src/lib/validations/solicitud.schema.ts` + `src/app/solicitar/page.tsx` + `src/app/api/solicitar/route.ts` | `cliente_email` opcional (email válido, trim, lowercase), hint "para enviarte la factura electrónica". |
| `src/app/pago/anticipo/[token]` y `src/app/pago/saldo/[token]` + `POST /api/pago/email` **(nuevo)** | Si la solicitud no tiene email, campo obligatorio antes del botón de pago; se guarda por `cliente_token`. También se pasa `customer-data:email` al checkout de Wompi (`construirCheckoutUrl`). |
| `src/app/api/admin/liquidaciones/route.ts` | Hoja "FV particulares" gana columna "FV Siigo". |
| Tests `src/__tests__/utils/facturacion.test.ts`, `src/__tests__/services/facturacion-siigo.test.ts` | Regla, payloads (dos ítems, descuento, consumidor final, NIT, ciudad desconocida), cuadre al peso, claim idempotente, dry-run. |
| Docs | `docs/FACTURACION.md` § 7 (fase 3 hecha), `docs/SUPABASE.md` (tabla), `docs/GOTCHAS.md` (sin sandbox, fecha, discount), `CLAUDE.md` (env vars), `docs/INDEX.md`. |

### 4.7 Variables de entorno

```
SIIGO_ENABLED=true              # kill-switch. Ausente/false = todo no-op (como Wompi/Dapta)
SIIGO_DRY_RUN=true              # arma y guarda el payload (estado 'simulada') sin llamar a Siigo
SIIGO_USERNAME=                 # usuario API (mismo del skill siigo-tools)
SIIGO_ACCESS_KEY=               # Sensitive
SIIGO_PARTNER_ID=BairdApp       # solo letras y números (Siigo rechaza guiones)
SIIGO_COST_CENTER_ID=           # id del centro "SERVICIOS LINEA BLANCA" (crear en Siigo, § 6.1)
```

## 5. Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| Siigo **no tiene sandbox**: cada FV es real y va a la DIAN | `SIIGO_DRY_RUN` para validar payloads en prod con datos reales antes de emitir; la primera emisión real se hace a mano desde el admin con un servicio de bajo monto. Error = nota crédito. |
| Fecha de la FV anterior a la última del consecutivo → Siigo rechaza | Siempre fecha de emisión (hoy Bogotá), nunca la de cierre. |
| Semántica de `discount` (valor vs %) | Verificar en la primera FV con descuento; plan B en § 4.4. |
| Doble disparo A + B | Claim atómico en `facturas_siigo` (§ 4.2). |
| Base × 1.19 no cuadra con `payments` por redondeo | `price` con 6 decimales; test de cuadre al peso. |
| Token de Siigo en serverless (cold start = re-auth) | Cache en módulo + reintentos; si Siigo limita auth, mover el token a Supabase. |
| Cliente sin email o con email mal escrito | Validación de formato por candidato; contacto con `FACTURACION_EMAIL` como último recurso y observación "cliente sin correo — enviada por WhatsApp". La entrega real es por WhatsApp (§ 4.8), así que un correo malo nunca deja al cliente sin factura. |
| El PDF no está listo justo después de timbrar / Meta rechaza el media | `whatsapp_enviado_at` queda NULL; el cron diario reintenta `entregarFacturaCliente`; botón **Reenviar factura** en el admin. La FV ya está emitida y el correo de Siigo salió igual. |
| Plantilla `factura_electronica_cliente_v1` sin aprobar | `SIIGO_ENABLED` no se enciende hasta que `--check` la muestre APPROVED; mientras, la emisión funciona y la entrega queda pendiente para el cron. |
| NIT inferido mal (cédula de 9 dígitos que empieza por 8/9) | Observación "verificar tipo de documento"; corregir el tercero en Siigo y nota crédito si ya se emitió. |
| Hook muere (timeout, deploy) | Cron diario de reintentos + botón manual. |
| Rol lectura intenta facturar | `verificarAdmin` rechaza. |

## 6. Puesta en marcha (orden)

1. **Siigo (Juan/contabilidad):** crear centro de costo "SERVICIOS LINEA
   BLANCA" (7-3) y confirmar que el usuario API puede emitir FV-2 (resolución
   DIAN vigente, consecutivo 1523).
2. **BD:** aplicar `20261021_facturas_siigo.sql` (aditiva) y crear el bucket
   privado `facturas-siigo`.
3. **Meta:** subir `factura_electronica_cliente_v1` con
   `node --env-file=.env.local scripts/upload-templates.mjs` y esperar
   APPROVED (`--check`).
4. **Deploy** sin `SIIGO_ENABLED` → no-op; el formulario ya captura email.
5. **Vercel:** `SIIGO_*` con `SIIGO_DRY_RUN=true`. Esperar 2 o 3 cierres
   reales; revisar las filas `simulada` (payload, tercero, ciudad, cuadre).
6. **Primera FV real:** `SIIGO_DRY_RUN=false`; emitir desde el botón del admin
   un servicio pequeño ya pagado; validar en Siigo Nube (PDF, CUFE, correo)
   y que el cliente recibió el PDF por WhatsApp (`whatsapp_enviado_at`).
7. **Automático:** desde ahí todo cierre pagado factura solo. Las 5
   históricas elegibles (2026-10-22) se emiten una a una desde el admin si
   contabilidad aún no las capturó.

## 7. Esfuerzo

| Fase | Contenido | Estimado |
|---|---|---|
| A | Migración + cliente Siigo + helpers puros + tests | 0,5 día |
| B | Service + disparadores A/B + cron + API admin + UI admin | 1 día |
| C | `cliente_email` (form, pago, backfill Wompi, checkout prefill) + correo | 0,5 día |
| D | Dry-run en prod, primera FV real, docs | 0,5 día |
| E | Entrega por WhatsApp: PDF de Siigo, bucket privado, media Meta, plantilla, reenvío admin (§ 4.8) | 0,5 día |
| | **Total** | **~3 días** |

## 8. Datos de contexto (prod, 2026-10-20)

| Dato | Valor |
|---|---|
| Particulares `completada` | 21 (10 en los últimos 30 días) |
| Con cédula | 10 |
| Con algún pago Wompi APPROVED | 11 |
| Con saldo final pagado por Wompi (elegibles hoy) | 6 |
| Pagos Wompi con `customer_email` | 24 de 26 |
| Ciudades en BD | Bogotá (109), Soacha (26), Anapoima (3), La Mesa (2), Cáqueza, El Colegio, Medellín, Villavicencio (1 c/u) |
