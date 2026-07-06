# Pagos vía tienda Shopify — sync automático de precios + link de pago por cotización

> **Estado: PLANEADO** (2026-07-06). Fase 0 ya en producción.
> Objetivo de la sesión siguiente: implementar Fases 1–2 (link de pago automático).
>
> 🧭 Ver también: `docs/TARIFAS.md` § Pendientes #5 (recaudo), Apéndice B (pasarelas).

## Contexto y objetivo

Baird controla por completo la tienda Shopify **tienda.bairdservice.com** (plan Shopify,
COP). Ya se usa para repuestos; ahora también como **canal de recaudo** de los
servicios particulares:

1. **Anticipo de diagnóstico** (monto fijo $42.000) — ✅ ya en producción (Fase 0).
2. **Saldo de cotizaciones** (monto variable por servicio) — vía **draft orders** con
   `invoiceUrl` (link de checkout que Shopify genera por el monto exacto).
3. **Sincronización automática de precios** entre las constantes del repo
   (`TARIFA_DIAGNOSTICO`, etc.) y los productos de servicio en Shopify.
4. **Conciliación**: saber en la app qué solicitud quedó pagada, cuándo y cuánto.

**Lo que Shopify NO resuelve:** el split al técnico (sigue transferencia manual;
ver TARIFAS.md Apéndice B) y la factura DIAN (pendiente Siigo).

## Acceso verificado (2026-07-06)

Probado en vivo con el MCP de Shopify conectado a la sesión de Claude:

- Scopes concedidos: `write_draft_orders`, `write_products`, `write_orders`,
  `read_orders`, `write_discounts`, `write_checkouts` y ~50 más — **acceso total**.
- **Prueba end-to-end OK**: se creó el draft order de prueba `#D1` ($1.000 COP,
  tag `TEST-BORRAR`) → Shopify devolvió `invoiceUrl` funcional → se eliminó
  (`draftOrderDelete`, sin residuos).
- Datos de la tienda: `myshopifyDomain = 1rep53-8r.myshopify.com`,
  dominio público `tienda.bairdservice.com`, moneda COP.
- Producto anticipo: `gid://shopify/Product/9164370706606`, variante
  `48046766850222`, $42.000, handle `diagnostico-linea-blanca-copia`.

⚠️ **El MCP es acceso de Claude en sesión, NO de la app en Vercel.** La app en
producción necesita su propio token Admin API (Fase 1, único paso manual).

## Fase 0 — Anticipo fijo (✅ en producción, commit 10477bc)

- `src/lib/constants/tienda.ts`: `URL_PAGO_ANTICIPO_DIAGNOSTICO`.
- CTA "Pagar anticipo $42.000" en `/solicitar` (particular Diagnóstico/Reparación).
- Limitación conocida: el pedido llega a Shopify **sin** el id de la solicitud
  (conciliación manual por nombre/teléfono). La Fase 4 lo arregla con cart
  permalink + attributes.

## Fase 1 — Token propio de la app (manual, ~15 min de Juan)

1. Shopify admin → **Configuración → Apps y canales de venta → Desarrollar apps**
   → "Crear una app" → nombre `Baird App Backend`.
2. Configurar scopes de Admin API: `read_products`, `write_products`,
   `read_draft_orders`, `write_draft_orders`, `read_orders`.
3. Instalar la app y copiar el **Admin API access token** (`shpat_…`) — se muestra
   UNA sola vez.
4. Env vars (Vercel prod + `.env.local`):
   ```
   SHOPIFY_ADMIN_TOKEN=shpat_...
   SHOPIFY_SHOP_DOMAIN=1rep53-8r.myshopify.com   # endpoint API, NO el dominio público
   SHOPIFY_API_VERSION=2026-01
   ```
5. (Fase 4) En la misma app: webhook `orders/paid` → guardar el secret como
   `SHOPIFY_WEBHOOK_SECRET`.

## Fase 2 — Link de pago automático por cotización (draft orders)

**Nuevo `src/lib/services/shopify.service.ts`** (patrón de `whatsapp.service.ts`:
best-effort, nunca rompe la transición):

- `shopifyGraphQL(query, variables)` — fetch a
  `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  con header `X-Shopify-Access-Token`. Si no hay token configurado → no-op con warn
  (mismo patrón kill-switch que Dapta).
- `crearLinkPagoCotizacion(solicitudId)`:
  1. Lee la solicitud + `cotizacion` (guard: particular, `cotizacion.total > 0`).
  2. `draftOrderCreate` con:
     - line item custom: `"Reparación {tipo_equipo} {marca} — Servicio #{id8}"`,
       `originalUnitPriceWithCurrency: { amount: cotizacion.total, currencyCode: COP }`
     - `tags: ["solicitud:" + solicitud.id, "cotizacion"]`
     - `note`: cliente + teléfono + diagnóstico corto
     - anticipo ya pagado → línea de descuento `appliedDiscount` por $42.000
       (solo si `tipo_solicitud` Diagnóstico/Reparación y el anticipo se cobró —
       mientras no haya conciliación automática, decidirlo con un check manual/admin).
  3. Persiste en el JSONB `cotizacion`: `shopify_draft_id`, `invoice_url`,
     `invoice_creado_at` (campos nuevos opcionales en `CotizacionReparacion`).
  4. Devuelve `invoiceUrl`.

**Disparo automático:** en `procesarAprobacionCotizacion` (transiciones.service),
tras la aprobación → `crearLinkPagoCotizacion` best-effort.

**Superficies al cliente:**
- `/cotizacion/{token}` en estado aprobado: botón **"Pagar ahora → invoiceUrl"**
  (cero fricción con Meta: la página ya existe, no toca plantillas).
- (Opcional, después) plantilla `pago_cotizacion_cliente_v1` con botón URL. Ojo:
  los botones URL de Meta exigen dominio fijo + un solo sufijo `{{1}}`; el
  `invoiceUrl` es `tienda.bairdservice.com/72231321774/invoices/{hash}` — el
  sufijo con `/` funciona, pero validar en un envío de prueba antes de asumirlo.

**Admin:** botón "Generar/copiar link de pago" en `/admin/solicitudes/[id]`
(reusa el mismo service; útil para reenviar o para ajustes de valor).

## Fase 3 — Sync automático de precios

- Mapa canónico en `src/lib/constants/tienda.ts`:
  ```ts
  PRODUCTOS_SERVICIO_SHOPIFY = [
    { variantId: 'gid://shopify/ProductVariant/48046766850222',
      descripcion: 'Anticipo diagnóstico',
      precioEsperado: () => TARIFA_DIAGNOSTICO * ANTICIPO_PORCENTAJE },
    // + mantenimientos / cambio de filtro cuando se creen los productos
  ]
  ```
- `scripts/sync-precios-shopify.mjs` (mismo estilo que upload-templates.mjs):
  lee el mapa, consulta precios reales (`productVariant.price`), reporta drift y
  con `--fix` los actualiza (`productVariantsBulkUpdate`). Correr tras cualquier
  cambio de tarifa (documentar en TARIFAS.md § "Cómo cambiar una tarifa").
- Test Vitest de paridad del mapa (que `precioEsperado` cuadre con las constantes).
- (Opcional) check semanal vía cron existente: si hay drift → WhatsApp al admin.

## Fase 4 — Conciliación automática (webhook `orders/paid`)

- Endpoint `POST /api/shopify/webhook`: verificación HMAC (`SHOPIFY_WEBHOOK_SECRET`,
  header `X-Shopify-Hmac-Sha256`) — patrón ya usado con `WHATSAPP_WEBHOOK_SECRET`.
- Al llegar `orders/paid`:
  - order con tag `solicitud:{id}` (viene del draft de Fase 2) → registrar pago.
  - order del producto anticipo → matchear por attribute `solicitud_id` (ver abajo).
- **Migración `pagos`** (cierra el gap #8 de la auditoría 2026-07-05):
  `id, solicitud_id, tipo ('anticipo'|'cotizacion'), monto, moneda,
  shopify_order_id, shopify_draft_id, metodo, pagado_at, raw (jsonb), created_at`.
  Append-only, RLS como las demás.
- Mejora del CTA de anticipo (Fase 0): cambiar la URL del producto por el cart
  permalink `https://tienda.bairdservice.com/cart/48046766850222:1?attributes[solicitud_id]={id}`
  para que el pedido llegue amarrado a la solicitud.
- Notificaciones: pago confirmado → aviso al admin (y opcional al técnico:
  "el cliente ya pagó, procede").

## Orden sugerido y estimación

| Fase | Qué | Depende de | Esfuerzo |
|---|---|---|---|
| 1 | Token custom app + env vars | Juan (manual) | 15 min |
| 2 | shopify.service + draft order al aprobar + botón en /cotizacion + admin | Fase 1 | ½ día |
| 3 | Sync de precios (script + test + doc) | Fase 1 | 2-3 h |
| 4 | Webhook orders/paid + tabla `pagos` + permalink con attributes | Fases 1-2 | ½–1 día |

## Riesgos / decisiones abiertas

- **Comisión de la pasarela** de Shopify Payments/ Wompi según config de la tienda —
  hoy no está modelada en el margen del 13% (validar % real con el primer pago).
- **Anticipo acreditado al total**: la lógica de descuento en el draft (Fase 2)
  necesita saber si el anticipo se pagó — hasta la Fase 4 eso es un check manual.
- **Draft orders vencidos**: definir si se cancelan al rechazar/expirar la cotización
  (`draftOrderDelete` en la transición de rechazo).
- Factura DIAN: Shopify emite recibo, no factura electrónica — sigue el pendiente
  Siigo (TARIFAS.md Pendientes #2).
