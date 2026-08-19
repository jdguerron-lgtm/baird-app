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
| Saldo | (futuro — hoy se cobra al completar, en sitio) | Referencia `saldo-{id}` ya soportada por el webhook |

Solo servicios **particulares** (garantía la paga la marca). El monto del
anticipo = `montoAnticipo(precioClienteServicio(...))` = 50% del precio al
cliente — siempre calculado server-side desde la BD.

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
- Cobro del saldo por Wompi al completar (la referencia `saldo-` ya existe).
- Badge "Anticipo pagado" en listados admin (hoy se ve en el historial de la
  ficha, evento 💰 'pago_registrado').
- Factura DIAN sigue pendiente de Siigo (Wompi emite comprobante, no factura).
