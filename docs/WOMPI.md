# Wompi — pasarela de pagos de la plataforma

> **Decisión 2026-08-18**: Wompi (Bancolombia) es la pasarela ÚNICA de recaudo
> online de la app. Reemplaza el plan de draft orders de Shopify
> (`docs/mejoras-futuras/pagos-shopify/README.md`, archivado) — la tienda
> Shopify queda solo para venta de repuestos. El QR Bre-B del portal del
> técnico sigue como respaldo de pago en sitio.

## Qué cobra hoy

| Cobro | Cuándo | Cómo |
|---|---|---|
| **Anticipo (50%)** | Tras `procesarAceptacion` — el técnico aceptó y el horario quedó fijo | Plantilla `pago_anticipo_cliente_v2` con botón → `/pago/anticipo/{cliente_token}` |
| **Abono repuestos (50% del saldo)** (desde 2026-08-25) | Tras aprobar el cliente una cotización **CON repuestos** (`procesarAprobacionCotizacion`) | Plantilla `abono_repuestos_cliente_v1` (fallback `pago_saldo_cliente_v1` mientras esté PENDING) → `/pago/saldo/{cliente_token}` en **modo abono** (referencia `abono-{id}`, monto = 50% del saldo). Garantiza compromiso del cliente y financia la compra de repuestos por el técnico. Confirmación: evento `pago_registrado` + aviso al técnico "puedes comprar los repuestos" (texto libre). NO marca `saldo_pagado_at` |
| **Saldo** (desde 2026-08-19) | Cotización **SIN repuestos**: tras aprobarla. Con repuestos: al confirmar el cliente el servicio (`confirmarServicioCliente` → completada, saldo restante) | Plantilla `pago_saldo_cliente_v1` + botón en `/cotizacion` aprobada → `/pago/saldo/{cliente_token}` (total − pagos acreditados: anticipos + abonos). Alternativa ONLINE al QR en sitio; no bloquea transiciones. Confirmación marca `saldo_pagado_at` + avisa a cliente (plantilla) y técnico ("no cobres nada en sitio") |

Solo servicios **particulares** (garantía la paga la marca). El monto del
anticipo = `montoAnticipo(precioClienteServicio(...))` = 50% del precio al
cliente — siempre calculado server-side desde la BD.

**Total discriminado (2026-08-25)**: en las cotizaciones nuevas
`cotizacion.total = diagnostico_cliente + servicio_cliente` — la visita de
diagnóstico se **SUMA** al servicio cotizado (antes el anticipo del
diagnóstico se restaba del total del servicio). El cliente ve el desglose en
`/cotizacion/{token}` y `/pago/saldo/{token}`; su anticipo pagado se acredita
contra ese total al pagar. Cotizaciones anteriores (sin los campos nuevos)
conservan su comportamiento histórico. `/pago/saldo` decide server-side entre
modo abono (cotización con repuestos y sin abono APPROVED) y modo saldo.

## Arquitectura (todo aditivo, kill-switch por env vars)

```
src/lib/wompi.ts                  ← core puro: checkout firmado, checksum eventos,
                                    referencias {tipo}-{uuid}, consulta de transacción
src/lib/services/pagos.service.ts ← conciliación idempotente: tabla pagos +
                                    anticipo_pagado_at + WhatsApp de confirmación
src/app/pago/anticipo/[token]/    ← página de pago (Server Component: la firma
                                    usa WOMPI_INTEGRITY_SECRET, nunca va al bundle)
src/app/api/wompi/webhook/        ← POST transaction.updated (checksum verificado)
supabase/migrations/20260818_wompi_pagos.sql  ← tabla pagos (RLS cerrada, solo
                                    service_role) + anticipo_pagado_at + evento
                                    'pago_registrado' (aplicada en prod 2026-08-18)
```

**Doble confirmación, una sola vez**: el webhook es la fuente de verdad
(Wompi reintenta 3×/24h); el redirect de vuelta consulta la transacción por
API para no hacer esperar al cliente. Ambos caminos convergen en
`registrarPagoWompi()` — índice único por `transaccion_id` + guard
`anticipo_pagado_at IS NULL` garantizan que los WhatsApp salen UNA vez.

## Reglas de seguridad (no negociables)

1. El monto NUNCA viene del cliente: checkout firmado
   (SHA-256 `referencia+centavos+COP+WOMPI_INTEGRITY_SECRET`).
2. El pago se confirma solo con datos de Wompi: checksum del webhook
   (`WOMPI_EVENTS_SECRET`) o consulta directa al API — jamás por query string.
3. En el redirect se valida que `transaction.reference` corresponda a ESA
   solicitud (anti-suplantación con ids de transacciones ajenas).
4. Pago menor al esperado → NO confirma reserva; queda en `pagos` + evento
   `requiere_intervencion_admin` para resolución manual.
5. Secretos como env vars Sensitive en Vercel; solo `WOMPI_PUBLIC_KEY` puede
   viajar en URLs (es pública por diseño).

## Env vars

```
WOMPI_PUBLIC_KEY        pub_prod_… (o pub_test_… → apunta solo a sandbox)
WOMPI_INTEGRITY_SECRET  prod_integrity_…  (firma del checkout)
WOMPI_EVENTS_SECRET     prod_events_…     (verificación del webhook)
WOMPI_PRIVATE_KEY       prv_prod_… (OPCIONAL — reservada para API futura)
```

Sin las dos primeras: `wompiHabilitado()` = false y todo degrada al
comportamiento previo (plantilla v1 con link a la tienda en Diagnóstico/
Reparación; página de pago muestra "el equipo te contactará").

## Puesta en marcha (pasos manuales de Juan)

1. Panel Wompi → Configuración → copiar llaves y secretos → pegarlos en
   `.env.local` y en Vercel (Production, como Sensitive).
2. Panel Wompi → Eventos → URL:
   `https://lineablanca.bairdservice.com/api/wompi/webhook`
3. Subir las 3 plantillas nuevas a Meta:
   `node --env-file=.env.local scripts/upload-templates.mjs pago_anticipo_cliente_v2`
   (ídem `anticipo_confirmado_cliente_v1`, `anticipo_confirmado_tecnico_v1`).
   Mientras estén PENDING, el código usa los fallbacks (v1 / texto libre).
4. Probar primero con llaves `pub_test_`/sandbox + `BAIRD_TEST_PHONE_WHITELIST`.

## Pendientes conocidos

- ~~Comisión Wompi sin modelar~~ → **modelada el 2026-08-19**: reparto 50/50 —
  la mitad se suma a la cotización del cliente (`COMISION_PASARELA` en
  `tarifas/particular.ts`, multiplicador efectivo ≈1.3675) y la otra mitad la
  absorbe Baird; en precios fijos de catálogo Baird absorbe todo. Queda
  validar el 2.85% nominal contra el primer settlement real.
- ~~Cobro del saldo por Wompi al completar~~ → **hecho el 2026-08-25**:
  `confirmarServicioCliente` envía el link del saldo restante si queda
  pendiente (cierra el ciclo del abono de repuestos).
- Plantilla `abono_repuestos_cliente_v1` pendiente de subir a Meta
  (`node --env-file=.env.local scripts/upload-templates.mjs abono_repuestos_cliente_v1`);
  mientras esté PENDING el código usa `pago_saldo_cliente_v1` con el monto
  del abono.
- ~~Badge "Anticipo pagado" en listados admin~~ → **hecho el 2026-08-23**:
  estado de pago como capa PARALELA (no es un estado del flujo) en admin
  (listado + ficha), portal del técnico y portal del supervisor (listado +
  detalle). Derivado de `anticipo_pagado_at`/`saldo_pagado_at` — helper
  `estadoPagoCliente()` en `src/lib/constants/pago-cliente.ts` + componente
  `BadgePagoCliente`. Solo particulares; refleja únicamente recaudo ONLINE
  (un pago en sitio con QR no aparece).
- Factura DIAN sigue pendiente de Siigo (Wompi emite comprobante, no factura).
