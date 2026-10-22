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
src/app/api/admin/pagos/          ← GET ledger de una solicitud (ficha admin);
   devolver/                        POST devolución (reembolso V2 / void / manual) — 2026-10-21
supabase/migrations/20260818_wompi_pagos.sql  ← tabla pagos (RLS cerrada, solo
                                    service_role) + anticipo_pagado_at + evento
                                    'pago_registrado' (aplicada en prod 2026-08-18)
```

**Doble confirmación, una sola vez**: el webhook es la fuente de verdad
(Wompi reintenta 3×/24h); el redirect de vuelta consulta la transacción por
API para no hacer esperar al cliente. Ambos caminos convergen en
`registrarPagoWompi()` — índice único por `transaccion_id` + guard
`anticipo_pagado_at IS NULL` garantizan que los WhatsApp salen UNA vez.

> ⚠️ **El webhook NO recibe eventos en prod (hallazgo 2026-10-11).** Wompi
> admite UNA sola "URL de Eventos" por comercio y en el panel está ocupada por
> la integración de Shopify (Conexa):
> `https://wompi-event-shopify.conexa.ai/api/v1/shopify/webhooks/event`.
> `/api/wompi/webhook` no ha recibido ni un request (todas las filas de
> `pagos` tienen `raw._origen = 'redirect'`). Hasta hoy funcionó solo porque
> cada cliente volvió al redirect; el 2026-10-10 un anticipo PSE aprobado
> ($42.000, `anticipo-6c7efe75…`) quedó sin registrar porque el cliente no
> regresó (se registró a mano abriendo
> `/pago/anticipo/{cliente_token}?id={transaccion_id}`). **No cambiar esa URL
> en Wompi sin coordinar la tienda** — rompería la confirmación de pedidos
> Shopify. El hueco lo cierra la **conciliación por cron** (abajo).

### Momentos de cobro, avisos y etapa de pago (2026-10-11)

| Momento | Link al cliente (cuándo) | Al pagar: cliente | Al pagar: técnico |
|---|---|---|---|
| **Anticipo** 50% | `pago_anticipo_cliente_v2` al aceptar el técnico; también el CTA de la pantalla de éxito de `/solicitar` (→ `/pago/anticipo/{token}`) | `anticipo_confirmado_cliente_v1` | `anticipo_confirmado_tecnico_v1` |
| **Abono** repuestos (50% del saldo) | `abono_repuestos_cliente_v1` al aprobar cotización CON repuestos | `abono_confirmado_cliente_v1` (nueva) | `pago_recibido_tecnico_v1` (nueva) |
| **Saldo** | `pago_saldo_cliente_v1` al aprobar cotización SIN repuestos; `saldo_final_cliente_v1` (nueva) al completar y cuando el admin fija el **cobro final** a mano (`/api/admin/cobro-final`, 2026-10-12: escribe `cotizacion.total`, reenvía la encuesta si está pendiente y el link del saldo) | `saldo_confirmado_cliente_v1` | `pago_recibido_tecnico_v1` (nueva) |

- Cada pago APPROVED además: evento 💰 `pago_registrado` en el historial,
  resumen en la solicitud (`monto_pagado_online`, `ultimo_pago_at`,
  `abono_pagado_at` — migración `20261011_resumen_pago_solicitud`) y alerta
  de texto libre al equipo (`WHATSAPP_ALERT_PHONE`, solo con ventana 24h).
- Si un aviso de WhatsApp falla → evento ⚠️ con `requiere_intervencion_admin`.
  Si el cliente paga DOS veces el mismo momento → evento ⚠️ "segundo pago,
  revisar devolución" + alerta.
- Si el anticipo ya estaba pagado cuando el técnico acepta (pagó desde el CTA
  de `/solicitar`), `procesarAceptacion` NO reenvía el link: confirma la
  reserva al cliente y avisa al técnico.
- **Precio fijo** (Mantenimiento / Cambio de filtro): el saldo es el
  catálogo + recargo − anticipo (`totalClienteParaCobro`), cobrado al completar.
- **Etiqueta de etapa** (`etapaPagoCliente` en `src/lib/constants/pago-cliente.ts`,
  componente `BadgePagoCliente` / `ProgresoPagoCliente`): sin cobro →
  anticipo pendiente → anticipo pagado → abono pendiente → abono pagado →
  saldo pendiente → pagado total (+ "sin pago online" y "pago parcial ·
  cerrado"). Admin y supervisor ven montos; el técnico solo la etapa.
- **Tiempo real**: el listado admin se refresca cada 30 s y la ficha cada
  10 s (sigue polleando tras completar mientras haya cobro pendiente). Botón
  "🔄 Verificar pagos en Wompi" en la ficha → `POST /api/admin/pagos/verificar`
  (con el N° de transacción funciona sin llave privada).
- **Pagos por la tienda Shopify** (referencia `r…` de Conexa) NO se concilian
  solos: el CTA viejo de `/solicitar` mandaba el anticipo a la tienda. El
  2026-10-11 se registraron a mano 2 (Tatiana Moreno, Ana Prieto) con
  `_origen: 'tienda_shopify_manual'`. Desde ese día el CTA usa el checkout de
  la app.
- **Código de descuento (2026-10-19)**: si la solicitud trae snapshot
  (`descuento_codigo/tipo/valor`, lo escribe el cliente en `/solicitar`),
  `calcularMontoSaldo` resta el descuento **solo en el saldo final**
  (`saldoPendiente(total − descuento, acreditados)`); el anticipo y el abono de
  repuestos (`calcularMontoSaldoBruto`) no cambian. `/pago/saldo` muestra el
  renglón "🏷️ Descuento CÓDIGO". El monto esperado al confirmar un `saldo-…`
  ya es el neto (test 11–12 de `pagos-contrato`). Reglas y ejemplo en
  `docs/TARIFAS.md` § "Códigos de descuento".

### Conciliación por cron (tercer camino, 2026-10-11)

```
src/app/api/cron/wompi-conciliar/route.ts   ← GET, guard x-vercel-cron / Bearer CRON_SECRET
pagos.service.ts → conciliarPagosWompi()    ← solicitudes particulares vivas (45 días)
                                               con cobro pendiente → 1 consulta por referencia
wompi.ts → listarTransaccionesPorReferencia ← GET /v1/transactions?reference=… (Bearer PRIVADA)
```

- Referencias que se consultan: `anticipo` (técnico asignado y
  `anticipo_pagado_at` vacío), `abono` (cotización aprobada con repuestos y sin
  abono APPROVED), `saldo` (`completada`, con total y `saldo_pagado_at` vacío).
- Solo las transacciones **APPROVED** pasan por `registrarPagoWompi(tx,
  'conciliacion')` — misma validación de monto, idempotencia y WhatsApp una
  sola vez que el webhook. **Solo lee de Wompi**, nunca crea ni anula.
- Kill-switch: sin `WOMPI_PRIVATE_KEY` responde `{ habilitada: false }` y no
  consulta nada. La misma llave se manda como Bearer en `consultarTransaccion`
  (Wompi anunció que las consultas sin autenticación dejarán de responder).
- Programación (2026-10-11): **`pg_cron` + `pg_net` en Supabase cada 5 min**
  (job `wompi-conciliar-5min`, migración `20261011_pg_cron_conciliacion_pagos`),
  porque Vercel Hobby solo permite crons diarios. El Bearer sale de Vault
  (`cron_secret`); la misma cadena debe estar en Vercel como `CRON_SECRET`
  (`src/lib/auth/cron.ts`). Primera corrida real: registró el anticipo de
  Eliana Muñoz ($63.000 Nequi) que llevaba 5 h sin regreso al redirect.
  Verificar: `select * from cron.job_run_details order by start_time desc limit 5;`
  y `select status_code, content::text from net._http_response order by id desc limit 3;`
  Prueba manual:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://lineablanca.bairdservice.com/api/cron/wompi-conciliar?dias=45`
- Consistencia en la BD (misma fecha): trigger `pagos_resumen_aiud` recalcula
  `monto_pagado_online`/`ultimo_pago_at` en cada INSERT/UPDATE/DELETE de
  `pagos` (nunca `*_pagado_at`, que son los guards de "avisar una vez");
  `auditar_pagos()` corre a diario (`auditar-pagos-diario`, 03:15 UTC) y deja
  un evento ⚠️ por solicitud incoherente. Migración
  `20261011_pagos_trigger_resumen_y_auditoria`.
- Alternativa descartada por ahora: apuntar la URL de eventos a la app y que
  `/api/wompi/webhook` reenvíe a Conexa los eventos ajenos (proxy). Vuelve a la
  app punto único de falla de la tienda.

### Devoluciones desde el admin (2026-10-21; en prod 2026-10-22, PR #5)

> Instructivo operativo (admin + cliente) y mejoras pendientes en
> `docs/DEVOLUCIONES.md`. Ojo: el centro de ayuda de Wompi dice que el
> reembolso requiere saldo en "Disponible" de la cuenta Wompi, aplica a
> tarjetas Visa/Mastercard/Amex y **no devuelve la comisión de Wompi**.

Caso típico: el servicio se cancela después de que el cliente pagó el
anticipo. En la ficha admin (`/admin/solicitudes/[id]` → "Cobros al
cliente") aparece el **ledger de pagos online** (`GET /api/admin/pagos`) y,
para cada pago APPROVED, dos acciones (solo admin con escritura; el rol
lectura solo ve la lista):

| Acción | Qué hace | Cuándo usarla |
|---|---|---|
| **↩️ Devolver por Wompi** | `POST /api/admin/pagos/devolver` `{ modo: 'wompi' }` → `devolverPagoWompi` → **reembolso V2** `POST /v1/refunds` (Bearer `WOMPI_PRIVATE_KEY`, monto COMPLETO del ledger) y, si ese endpoint responde 403/404/405 y el pago fue con **tarjeta**, **anulación** `POST /v1/transactions/{id}/void`. El dinero regresa al medio de pago original. | Siempre que haya llave privada. Aplica a tarjeta, PSE, Nequi y Bancolombia (el reembolso V2 es por transacción, no por método). |
| **Registrar devolución manual** | `{ modo: 'manual', nota }` → misma marca en la BD **sin llamar a Wompi**. Exige una nota ("reembolso desde el panel de Wompi #…", "transferencia …"). | Ya devolviste por el panel de Wompi o por transferencia; o Wompi rechazó el reembolso automático. |

Lo que permite y NO permite el API de Wompi (verificado en docs.wompi.co
§ Transacciones y § Reembolsos V2, 2026-10-21):

- **Reembolsos V2** (`POST /v1/refunds` `{ transaction_id, amount_in_cents,
  reason, reference }`): total o parcial sobre una transacción APPROVED de
  cualquier método; SOLO con llave privada (`pub_*` → 401/403). Es un objeto
  aparte con su propio estado (`APPROVED | DECLINED | ERROR | CANCELLED`); la
  transacción original sigue APPROVED en Wompi. La doc lo presenta como
  "(Sandbox)": si en producción el comercio no lo tiene habilitado, Wompi
  responde 403/404 y la app lo dice ("hazlo desde el panel y regístralo como
  manual"). Los tiempos de abono al cliente dependen del banco (tarjeta
  1–15 días hábiles; PSE/Nequi según la entidad).
- **Anulación** (`/void`): SOLO tarjeta y "solo para ciertos estados" (misma
  jornada, antes del cierre del adquirente) → después responde 422. Deja la
  transacción en `VOIDED`.
- **No hay anulación por API para PSE / Nequi / Bancolombia**: solo el
  reembolso V2 o el panel de Wompi.
- **Sin `WOMPI_PRIVATE_KEY`** ambas llamadas son no-op con error claro (409
  en la ruta) — queda la devolución manual.

Efecto en la BD (contrato, tests 14–22 de `pagos-contrato`): la **misma
fila** de `pagos` pasa a `estado = 'VOIDED'` (una transacción = una fila;
nunca se inserta otra) con `raw._devolucion = { via: 'reembolso_wompi' |
'anulacion_wompi' | 'manual', at, actor, nota, referencia_wompi, respuesta }`
y el `raw` original intacto; el trigger `pagos_resumen_aiud` descuenta el
monto de `monto_pagado_online`; si no queda otro pago APPROVED del mismo
tipo se limpia `{anticipo|abono|saldo}_pagado_at` (coherencia con
`auditar_pagos()` y, si el cliente vuelve a pagar, se le avisa de nuevo);
evento ↩️ `pago_registrado` (`payload.devolucion = true`), **WhatsApp al
cliente** con la plantilla `devolucion_confirmada_cliente_v1` (monto,
concepto, equipo, medio de devolución y plazo bancario; fallback a texto
libre; si falla queda evento ⚠️ `requiere_intervencion_admin`) y alerta de
texto al equipo. Un pago ya VOIDED responde `yaDevuelto` sin llamar a Wompi. Si
Wompi rechaza (DECLINED/ERROR/HTTP), **nada cambia en la BD**: solo queda un
evento ⚠️ `devolucion_fallida` y el admin ve el motivo. La devolución es
siempre por el monto completo del pago (parcial = hacerla en el panel y
registrar manual con nota).

Para el cron de conciliación una solicitud `cancelada` no se consulta; si
el servicio sigue vivo y el guard quedó vacío, volver a encontrar la misma
transacción APPROVED en Wompi es un no-op (índice único por
`transaccion_id`) — no se "re-registra" un pago devuelto.

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
WOMPI_PRIVATE_KEY       prv_prod_… (conciliación por cron + Bearer en consultas +
                                    devoluciones/anulaciones desde el admin; sin ella el
                                    cron y "Devolver por Wompi" son no-op — desde 2026-10-11)
```

Sin las dos primeras: `wompiHabilitado()` = false y todo degrada al
comportamiento previo (plantilla v1 con link a la tienda en Diagnóstico/
Reparación; página de pago muestra "el equipo te contactará").

## Puesta en marcha (pasos manuales de Juan)

1. Panel Wompi → Configuración → copiar llaves y secretos → pegarlos en
   `.env.local` y en Vercel (Production, como Sensitive).
2. ~~Panel Wompi → Eventos → URL `https://lineablanca.bairdservice.com/api/wompi/webhook`~~
   → **ocupada por Shopify/Conexa, no tocar** (ver advertencia arriba). En su
   lugar: (a) Panel Wompi → Desarrollo → Programadores → "Llave privada" →
   `WOMPI_PRIVATE_KEY` en Vercel (Production, Sensitive) — hecho 2026-10-11;
   (b) `CRON_SECRET` en Vercel con el MISMO valor que Vault `cron_secret`
   (Supabase → Project Settings → Vault → revelar) y redeploy; (c) la
   programación vive en Supabase (`pg_cron`), no en `vercel.json`.
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
