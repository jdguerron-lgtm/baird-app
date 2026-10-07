# Facturación y contabilidad — Baird Service

> **Doc canónico** de cómo los servicios de la plataforma se convierten en
> documentos contables (Siigo) y cómo contabilidad cruza cada pago con su
> servicio. Complementa `docs/TARIFAS.md` (cuánto se cobra y se paga),
> `docs/WOMPI.md` (cómo entra la plata) y la pantalla `/admin/liquidaciones`.
>
> Creado 2026-09-09. Estado: exports implementados (fase 1); integración
> automática con Siigo y venta de repuestos al técnico son **opciones a
> decidir** (§ 6 y § 7).

---

## 1. Los documentos contables que genera un servicio

| # | Documento | De → a | Cuándo nace | Fuente en la plataforma | Export |
|---|---|---|---|---|---|
| 1 | **Factura de venta (FV) al cliente particular** | Baird → cliente | Servicio particular `completada` | `cotizacion` JSONB (total, `diagnostico_cliente`, `servicio_cliente`, `base_venta`, `iva_venta`) + `cliente_cedula` + tabla `pagos` | Hoja **FV particulares** |
| 2 | **FV consolidada a la marca (MABE)** | Baird → MABE | Corte del período (garantías `completada`) | `calcularTarifaMABE` con datos reales del cierre (encuesta, TA, días) + `numero_serie_factura` (N° orden MABE) | Hojas **FV MABE** + **Relación órdenes MABE** |
| 3 | **Documento soporte** (adquisiciones con no obligados a facturar) | Técnico → Baird (lo emite Baird) | Liquidación quincenal | `pago_tecnico` (particular) / consolidado MABE (garantía) + `tecnicos.tipo_documento`/`numero_documento` | Hoja **Documento soporte** del export de técnicos |
| 4 | **Ledger de pagos** (cada pago ↔ su servicio) | Cliente → Baird vía Wompi | Cada transacción | Tabla `pagos` (`referencia`, `transaccion_id`, `tipo`, `monto`, `metodo`, `raw.customer_email`) | Hoja **Pagos Wompi** |
| 5 | FV de repuestos al técnico | Baird → técnico | Cuando el técnico compre repuestos a Baird | **No existe todavía** — ver § 6 | — |

Modelo fiscal cerrado (`docs/TARIFAS.md` § "Modelo: reseller con IVA
discriminado"): Baird factura al cliente el **total con IVA 19%** y paga al
técnico el costo neto. En garantía Baird factura a MABE la tarifa Tipo D
consolidada; el técnico recibe el 78% de la base + 90% de bonos.

---

## 2. Qué necesita Siigo y qué tenemos

### 2.1 Factura de venta al cliente particular

| Campo Siigo | Origen en la plataforma | Estado |
|---|---|---|
| `document.id` (tipo comprobante) | Constante `SIIGO.DOC_FV_ELECTRONICA` = 28908 (FV-2) | ✅ |
| `date` | Fecha de cierre (`evidencias_servicio.completado_at` → `confirmado_at` → `diagnosticado_at` → `created_at`), día Colombia | ✅ |
| `customer.identification` | `solicitudes_servicio.cliente_cedula` (obligatoria en particular desde 2026-09-02; opcional en garantía) | ✅ nuevas / ⚠️ viejas sin cédula → **consumidor final 222222222222** |
| `customer.id_type` (13 CC / 31 NIT) | **No se pregunta.** Se infiere: 9 dígitos que empiezan por 8/9 → NIT (marcado "verificar") | ⚠️ inferido |
| `customer.name` | `cliente_nombre` | ✅ |
| `customer.address` + ciudad (código DANE) | `direccion`, `ciudad_pueblo` (texto libre, sin código DANE) | ⚠️ contabilidad mapea la ciudad |
| `customer.phones` | `cliente_telefono` (dígitos con 57) | ✅ |
| `customer.contacts[].email` | **No se captura.** Solo llega en `pagos.raw.customer_email` cuando el cliente pagó por Wompi | ❌ gap → la FV electrónica se emite sin correo al cliente |
| `items[].code` | Constante `SIIGO.ITEM_SERVICIO_CODIGO` = "2" (Servicios profesionales / técnicos) | ✅ |
| `items[].description` | "Visita de diagnóstico — {equipo}" + "Servicio técnico {tipo} — {equipo}" (dos ítems cuando la cotización trae `diagnostico_cliente` + `servicio_cliente`; un ítem si no) | ✅ |
| `items[].price` (base sin IVA) | Derivada del total con IVA de cada ítem (`desglosarIva`), mismo criterio de TARIFAS.md | ✅ |
| `items[].taxes[].id` | Constante `SIIGO.IMPUESTO_IVA_19` = 4399 | ✅ |
| `payments[].id` | Sugerida: Bancos (1885) si Wompi cubrió el total, Crédito (1883) si no hubo pago online, Bancos + pendiente si parcial | ✅ sugerida |
| `seller` | 802 (impuestos@, firma las FV-2) | ✅ |
| `observations` | Código de servicio + equipo + técnico + patrón de referencia Wompi | ✅ |

### 2.2 Factura a MABE (garantía)

| Campo Siigo | Origen | Estado |
|---|---|---|
| Tercero (NIT MABE) | Env `FACTURACION_MABE_NIT` / `FACTURACION_MABE_NOMBRE` | ⚠️ **configurar** (MABE no aparece como tercero en Siigo al 2026-09-09) |
| Ítem | "Servicios técnicos de garantía MABE — N órdenes del período" (1 ítem, relación anexa) | ✅ |
| Base | Σ `totalMABE` del período (tarifa base + bonos + recargo finde) | ✅ |
| IVA | 19% sobre la base. **Supuesto: el tarifario Tipo D es antes de IVA** — confirmar con MABE; si liquida IVA incluido, tomar la relación como total | ⚠️ confirmar |
| Anexo | Relación de órdenes: N° orden MABE, cliente final, equipo, complejidad, tarifa, bono, recargo, valor | ✅ |
| Forma de pago | Crédito (MABE paga NET-30/60) | ✅ |

### 2.3 Documento soporte / pago al técnico

| Campo | Origen | Estado |
|---|---|---|
| Tercero (tipo + número de documento) | `tecnicos.tipo_documento` (CC/CE/TI/Pasaporte), `numero_documento` | ✅ |
| Concepto y valor | Servicios de la quincena (garantía: consolidado real; particular: `pago_tecnico`) | ✅ |
| Datos bancarios del técnico | **No se capturan** en `/registro` | ❌ gap (hoy se pagan a mano) |
| Régimen del técnico (declarante / no declarante / RST) | **No se captura** | ❌ gap → define la tarifa de retefuente (4% / 6%) |
| Retención en la fuente | Se marca si el pago quincenal supera 4 UVT ($209.496 en 2026); la tarifa y el cálculo los hace contabilidad | ⚠️ manual |
| Email del técnico | No se captura | ❌ gap (el documento soporte electrónico se envía al tercero) |

### 2.4 Ledger de pagos

Todo lo que Wompi abona a la cuenta tiene fila en `pagos` con
`referencia = "{anticipo|abono|saldo}-{uuid de la solicitud}"`. Los **8
primeros caracteres del uuid** son el **código de servicio `BS-XXXXXXXX`** que
aparece en todas las hojas, en el admin y en el correo de facturación. Con eso
contabilidad cruza cada movimiento del extracto de Wompi con su servicio y con
la FV correspondiente. Los pagos en sitio (QR Bre-B / transferencia) **no**
quedan registrados — la hoja "Datos faltantes" marca el saldo por fuera.

---

## 3. Cómo se descarga

`/admin/liquidaciones` (ítem 💰 del sidebar) → botón **🧾 Facturación (Siigo)**
→ `POST /api/admin/liquidaciones { tipo: 'facturacion', desde, hasta }`.
Presets de rango: quincena anterior, quincena actual, mes actual.

| Hoja | Contenido | Corte |
|---|---|---|
| **FV particulares** | Un renglón por ítem de factura (cabecera repetida): tercero, ítem, base, IVA, total, forma de pago sugerida, recaudado Wompi, pendiente | Servicios particulares `completada` por fecha de cierre |
| **FV MABE** | Campo/valor de la factura consolidada (tercero, ítem, base, IVA, total, observaciones con los N° de orden) | Garantías `completada` por fecha de cierre |
| **Relación órdenes MABE** | Anexo de la FV MABE, una fila por orden | ídem |
| **Pagos Wompi** | Ledger de **todas** las transacciones del período (aprobadas o no) con su servicio, cliente, estado del servicio y FV a la que aplican | Por **fecha de pago** (no exige `completada`) |
| **Datos faltantes** | Checklist por servicio: sin cédula, sin email, tipo de documento inferido, cotización sin desglose, saldo por fuera de Wompi, garantía sin complejidad | — |
| **Parámetros** | Rango, conteos, IDs de Siigo usados, cómo cruzar un pago | — |

**Ficha por servicio (2026-09-11):** en `/admin/solicitudes/[id]` → bloque
"Cuentas del servicio — Particular" → botón **🧾 Ficha de facturación**
(`POST /api/admin/liquidaciones { tipo: 'facturacion', solicitud_id }`). Mismo
Excel acotado a esa sola venta, en cualquier estado (la hoja Parámetros deja
el estado explícito; la FV se emite al completar). Archivo
`ficha-facturacion-BS-XXXXXXXX.xlsx`.

Los otros tres exports (técnicos, MABE, particulares) siguen igual; el de
**técnicos** ganó la hoja **Documento soporte** (una fila por técnico con
tipo/número de documento, concepto, códigos de servicio, valor, bandera de
retefuente y columnas en blanco para retención / neto / fecha de pago).

---

## 4. Liquidación quincenal de técnicos

1. En `/admin/liquidaciones` elegir **Quincena anterior** (1–15 o 16–fin de
   mes) y descargar **Liquidación de técnicos** (opcionalmente filtrada por
   técnico).
2. Hoja "Resumen por técnico" = lo que se gira; "Detalle servicios" = soporte
   por servicio (garantía muestra proyección del diagnóstico vs consolidado
   real); "Documento soporte" = lo que contabilidad captura en Siigo.
3. Contabilidad aplica retención (si supera 4 UVT y según el régimen del
   técnico), emite el documento soporte electrónico y gira.
4. Recomendado: enviar al técnico su hoja de detalle por WhatsApp (hoy manual).

Regla de corte: **fecha de cierre** del servicio (día Colombia). Un servicio
completado el día 15 a las 23:30 cae en la primera quincena; el 16 a las 00:10
en la segunda. Las tarifas se **reconstruyen** con las constantes vigentes al
generar (no hay snapshot al cierre) — si cambia una tarifa, regenerar una
quincena vieja puede dar otro valor. Pendiente: columna `completada_at` +
snapshot inmutable de la liquidación (ver § 8).

---

## 5. Cómo cuadran los pagos con contabilidad

- **Cliente particular:** anticipo (50% al aceptar el técnico) → abono de
  repuestos (50% del saldo, solo con repuestos) → saldo al completar. Los tres
  llegan por Wompi con la misma raíz de referencia; la FV se emite al cierre
  por el **total** y los pagos previos son anticipos recibidos (pasivo hasta
  facturar). Si el cliente pagó en sitio con QR, contabilidad lo ve como
  "pendiente por fuera" y lo cruza con el extracto bancario.
- **MABE:** una FV por período; el ledger no aplica (paga por transferencia a
  30/60 días contra la relación anexa).
- **Comisión Wompi:** Wompi descuenta ≈2.85% + IVA del recaudo. La mitad ya está
  dentro de la base gravable de la cotización (`comision_pasarela`); la otra
  mitad es gasto financiero de Baird. El settlement de Wompi es la fuente para
  registrar ese gasto.

**Mejora recomendada (pendiente de decisión):** consecutivo legible por
servicio (`numero_servicio` serial, p.ej. `BS-000123`) en BD, usado en la
referencia Wompi, en las plantillas y en Siigo. Hoy el código `BS-XXXXXXXX`
cumple la función sin migración, pero un consecutivo es más cómodo para el
contador y evita ambigüedad en el largo plazo. Requiere migración + ajuste de
`referenciaPago`/`parseReferenciaPago` (retrocompatible).

---

## 6. Repuestos que el técnico compra a Baird — opciones

Situación actual: en el diagnóstico particular el técnico lista los repuestos
(SKU + descripción + cantidad, `productos_necesarios`), la cotización va con
todo incluido y el técnico **compra los repuestos por su cuenta** (Baird le da
15% de descuento en la tienda, `DESCUENTO_REPUESTO_TECNICO`). El abono del 50%
del saldo que paga el cliente financia esa compra. No hay registro de a quién
le compró ni documento de venta de Baird al técnico.

Objetivo: que el técnico pueda comprar esos repuestos **a Baird**, pagando por
la pasarela, y que la venta quede facturada y cruzada con el servicio.

| Opción | Cómo funciona | Pros | Contras |
|---|---|---|---|
| **A. Tienda Shopify con código de descuento del técnico** | El portal del técnico arma un link a `tienda.bairdservice.com` con los SKU del diagnóstico en el carrito y un código de descuento 15% personal. Paga por el checkout de Shopify. La orden de Shopify se factura en Siigo como hoy (FV-3 / integración existente). Conciliación: el técnico pone el código `BS-XXXXXXXX` en la nota del pedido, o Baird lo cruza por SKU + fecha | Cero desarrollo de pagos; inventario y facturación ya viven ahí; envío por la tienda | Conciliación semi-manual; dos pasarelas (Shopify + Wompi); descuento por código es fácil de compartir |
| **B. Pedido de repuestos dentro de la plataforma, cobrado por Wompi** | Nueva tabla `pedidos_repuestos` (solicitud, técnico, ítems con precio tienda −15%, total) y página `/tecnico/{token}/repuestos/{id}` con checkout Wompi firmado (referencia `repuestos-{uuid}`, nuevo `TipoPago`). Webhook existente registra el pago en `pagos` con `pagador = 'tecnico'`. Baird despacha; la FV al técnico sale del export (hoja nueva "FV repuestos técnico") o por API | Una sola pasarela y un solo ledger; trazabilidad total servicio ↔ pedido ↔ pago ↔ FV; precios desde el catálogo de Siigo (skill `siigo-tools`) | Desarrollo mediano (tabla, página, tipo de pago, precios); inventario se maneja aparte (Siigo); logística de envío manual |
| **C. Compensación en la liquidación quincenal (sin pasarela)** | El técnico pide los repuestos en el diagnóstico; Baird los despacha y **descuenta** el valor del pago quincenal (FV al técnico + nota en el documento soporte) | Sin fricción de pago para el técnico; un solo giro neto | El usuario pidió explícitamente que salga por pasarela; riesgo de cartera si el técnico no cierra servicios; cruce de cuentas más complejo para contabilidad |

**Decisión (Juan, 2026-09-11): opción A.** B queda como evolución cuando el
volumen lo pida (>~10 pedidos/mes); C descartada.

Cómo opera A:

1. Baird crea en Shopify un **código de descuento del 15% por técnico**
   (uso ilimitado, solo repuestos). Se le entrega por WhatsApp una vez.
2. El técnico compra en `tienda.bairdservice.com` con su código y escribe el
   **código del servicio `BS-XXXXXXXX`** en la nota del pedido. El código se
   lo recuerdan el banner de repuestos del diagnóstico y el WhatsApp de
   "abono de repuestos confirmado" (cableado 2026-09-11).
3. La orden de Shopify se factura al técnico como hoy (FV-3, canal tienda). Es
   una **venta independiente** de la venta del servicio al cliente.
4. Cruce para análisis por servicio: orden Shopify (nota = `BS-…`, cliente =
   técnico) ↔ solicitud. Hoy manual (exportar órdenes de Shopify y filtrar por
   nota); automatizable con el MCP/API de Shopify leyendo `note` (backlog).

**Principio de separación (decisión 2026-09-11):** la **venta del servicio al
cliente final** y la **venta de repuestos al técnico** son dos operaciones con
flujo, tercero, documento y cobro propios. Al cliente se le cobra y factura
**todo incluido** (diagnóstico + servicio con repuestos y mano de obra + IVA);
nunca se le discrimina lo que el técnico compró. Solo se relacionan por el
código de servicio para medir comportamiento por servicio (margen real =
venta al cliente − pago técnico; el técnico a su vez ya descontó sus repuestos
en el costo que cotizó).

Común a todas: la venta de repuestos al técnico es una **FV con IVA** de Baird
al técnico (tercero = técnico con su cédula); el técnico no responsable de IVA
no lo descuenta (ver TARIFAS.md Apéndice A). El precio al cliente ya lo cotizó
el técnico "todo incluido", así que la venta de repuestos **no altera** la FV al
cliente ni el pago del técnico — es una operación aparte.

---

## 7. Opciones de integración con Siigo

| Fase | Qué | Esfuerzo | Estado |
|---|---|---|---|
| **1. Manual asistida** (este doc) | Export Excel con los campos exactos; contabilidad captura en Siigo (o usa la plantilla de importación de Siigo) | Hecho | ✅ 2026-09-09 |
| **2. Capturar lo que falta** | Email del cliente (en `/solicitar` y en `/pago/*`), tipo de documento (CC/NIT) en vez de inferirlo, datos bancarios + régimen + email del técnico en `/registro` y en el admin | Bajo (form + 4 columnas) | ⏳ propuesto |
| **3. Borrador automático en Siigo** | Al pasar a `completada` (particular) crear la FV por API (`POST /v1/invoices`, cliente creado/actualizado con `POST /v1/customers`), guardar `siigo_invoice_id` + número en la solicitud, mostrar en admin y en el correo de facturación. Kill-switch por env (`SIIGO_ENABLED`) como Wompi/Dapta. Garantía: FV MABE mensual por script | Medio | ⏳ propuesto |
| **4. Documento soporte automático** | Al cerrar la quincena, crear en Siigo el documento soporte por técnico + registrar retención | Medio | ⏳ propuesto |
| **5. Conciliación automática Wompi** | Cron que lee el settlement de Wompi (o el webhook) y marca cada pago como conciliado contra la FV | Medio | ⏳ idea |

La fase 3 no cambia la máquina de estados: es un side-effect best-effort al
estilo de `enviarCorreoFacturacionServicio`.

---

## 8. IDs de Siigo verificados (2026-08-23, API)

| Concepto | ID |
|---|---|
| FV-2 electrónica (servicios / manual) | 28908 |
| Factura no electrónica | 8183 |
| FV-3 (tienda / Mercado Libre) | 29783 |
| Ítem "Servicios profesionales / técnicos / otros" | código `2` |
| IVA 19% | 4399 |
| Formas de pago: Bancos / Crédito / Contado / Mercado Libre | 1885 / 1883 / 1882 / 11277 |
| Vendedores: jdguerron / impuestos@ (firma FV-2) / baird@ (FV-3) | 841 / 802 / 835 |
| Consumidor final | NIT 222222222222 |

Patrón de ítem: `price` = base **sin** IVA (6 decimales); `payments` suman el
total **con** IVA. Todo vive en `src/lib/utils/facturacion.ts` (`SIIGO`).

---

## 9. Env vars

```
FACTURACION_MABE_NIT      # NIT de la marca a la que se factura la garantía (sin dígito de verificación)
FACTURACION_MABE_NOMBRE   # Razón social (default "MABE COLOMBIA S.A.S.")
```

Ambas opcionales: si faltan, la hoja "FV MABE" lo deja marcado para completar
a mano.

---

## 10. Pendientes y decisiones abiertas

- [ ] Confirmar con MABE si el tarifario Tipo D es antes o después de IVA.
- [ ] Crear a MABE como tercero en Siigo y poner `FACTURACION_MABE_NIT` en Vercel.
- [x] Opción de repuestos al técnico: **A** (2026-09-11). Pendiente operativo: crear los códigos de descuento por técnico en Shopify y entregarlos.
- [ ] Cruce automático órdenes Shopify (nota `BS-…`) ↔ servicio para el análisis por servicio.
- [ ] Fase 2: capturar email del cliente y tipo de documento; datos bancarios, régimen y email del técnico.
- [ ] Consecutivo legible `numero_servicio` (§ 5) — migración + referencia Wompi.
- [ ] Snapshot inmutable de liquidaciones al cierre (`completada_at` + tabla `liquidaciones`).
- [ ] Registrar pagos en sitio (QR Bre-B) para que el ledger cierre al 100%.
- [ ] Validar con el contador la tarifa de retefuente por técnico (4% / 6%) y reteICA Bogotá.

---

## Archivos

| Archivo | Rol |
|---|---|
| `src/lib/utils/facturacion.ts` | Helpers puros: IDs Siigo, tercero del cliente, ítems de FV, forma de pago, código de servicio, quincenas, base retefuente |
| `src/app/api/admin/liquidaciones/route.ts` | Tipo `facturacion` (4 hojas + parámetros) y hoja "Documento soporte" del tipo `tecnicos` |
| `src/app/admin/liquidaciones/page.tsx` | Tarjeta "Facturación (Siigo)" + presets de quincena |
| `src/app/admin/solicitudes/[id]/page.tsx` | Bloque "Venta al cliente BS-…" + botón Ficha de facturación por servicio |
| `src/lib/services/whatsapp.service.ts` (`enviarAbonoConfirmadoTecnico`) + `src/app/tecnico/[token]/diagnostico/[id]/page.tsx` | Recuerdan al técnico poner el código de servicio en la nota del pedido de la tienda (opción A) |
| `src/lib/services/email.service.ts` | Correo de facturación por servicio al completar (Resend) |
| `src/__tests__/utils/facturacion.test.ts` | Tests de los helpers |
