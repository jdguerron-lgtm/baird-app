# Auditoría del flujo de pagos y plan de aislamiento (2026-10-11)

> **Estado 2026-10-11 (tarde): aplicado.** §§ 3–4 (trigger de resumen,
> CHECKs, `auditar_pagos()`, `pg_cron` cada 5 min + auditoría diaria) y § 6
> (tests de contrato `pagos-contrato.test.ts`, marcador 🔒, guard
> `scripts/check-pagos-frontera.mjs` en `npm run lint` y `npm run check:pagos`)
> están en prod. También el helper `cronAutorizado` (cierra el bypass
> `x-vercel-cron`) y el aviso "Regresar al comercio" en las páginas de pago.
> La primera corrida del job registró un pago real que llevaba 5 h sin
> registrar. **Pendiente del user:** `CRON_SECRET` en Vercel con el valor de
> Vault `cron_secret`. **Pendientes sin fecha:** mejora 6 (URL de eventos) y
> mejora 7 (`/admin/pagos`). El estado operativo vigente del recaudo está en
> [`docs/WOMPI.md`](../../WOMPI.md); léase junto con
> [`docs/GOTCHAS.md`](../../GOTCHAS.md) § "El webhook de Wompi NO llega".

## 1. Qué pasó: ayer funcionó, hoy no

**No cambió ningún código del camino del pago entre ayer y hoy.** El último
commit que tocó `wompi.ts` / `pagos.service.ts` / `/pago/*` antes de hoy fue
`317528a` (2026-08-25); prod ayer era `548e196`, que solo tocó la home.

Lo que cambió fue **cómo pagó el cliente**. El sistema tiene dos caminos para
enterarse de un pago, y en prod solo uno ha funcionado desde agosto:

| Camino | Estado real | Evidencia |
|---|---|---|
| Webhook `POST /api/wompi/webhook` | **Nunca ha recibido un evento.** La única "URL de Eventos" del comercio en Wompi la ocupa la app de Shopify (`wompi-event-shopify.conexa.ai`). | 0 requests a esa ruta en logs; las 9 filas históricas de `pagos` tienen `raw._origen = 'redirect'` o manual. |
| Redirect de vuelta `/pago/{anticipo,saldo}/{token}?id=…` | Funciona siempre que el **navegador del cliente vuelva** a la app. | 5 pagos entre ago-20 y oct-09 registrados en **13–22 s** por este camino. Incluye 2 PSE (Claudia, Erika) cuyos clientes sí regresaron. |

Ayer (Lynn Mari Bonilla) pagó con **tarjeta**: Wompi redirige solo al terminar
el 3DS → 19 s y 22 s hasta el registro. Hoy pasaron tres cosas distintas:

1. **PSE sin regreso** (anticipo y saldo de la prueba): tras pagar en el banco,
   PSE deja al cliente en la página de resultado de Wompi con un botón
   "Regresar al comercio". Si no lo toca, no hay redirect y nadie registra.
   Registro manual a los 457 s y 1.644 s.
2. **Pago por la tienda Shopify** (Tatiana Moreno, Ana Prieto): el CTA de la
   pantalla de éxito de `/solicitar` llevaba al producto "anticipo" de la
   tienda. Esa transacción tiene referencia de Conexa (`r…`), no
   `anticipo-{id}`: para la app era invisible por diseño. Corregido hoy (el
   CTA usa `/pago/anticipo/{token}`), pero vale la regla: **un pago solo es
   "de la app" si su referencia es `{tipo}-{uuid}`**.
3. El CHECK de `tipo_solicitud` sin "Cambio de filtro" (ajeno a pagos, pero
   detectado en la misma revisión de logs).

Conclusión: el sistema era **frágil pero no estaba roto**; dependía de un
comportamiento del cliente que con tarjeta es automático y con PSE/Nequi no.
Lo que se desplegó hoy (`a609d5f`, `8164db2`) añade el tercer camino
(conciliación) y mejora visibilidad, sin cambiar los dos existentes.

## 2. Estado de la base de datos (verificado en prod)

- `pagos`: ledger append-only. Índice único **parcial** sobre
  `transaccion_id WHERE NOT NULL` → la idempotencia depende de que toda fila
  traiga `transaccion_id` (hoy siempre lo trae; los 2 registros manuales de
  Shopify también). RLS cerrada: solo `service_role`.
- `solicitudes_servicio`: columnas derivadas `anticipo_pagado_at`,
  `abono_pagado_at`, `saldo_pagado_at` (guards de "notificar una vez", las
  escribe la app con `UPDATE … IS NULL`) y `monto_pagado_online` /
  `ultimo_pago_at` (resumen, las recalcula `actualizarResumenPago`).
- **No existe ningún trigger** sobre `pagos` ni sobre esas columnas: la
  coherencia ledger ↔ resumen depende 100 % de que el código llame a la
  función. Hoy, tras el backfill, **0 inconsistencias** (query de cruce en § 4).
- `CRON_SECRET` **no está configurado en Vercel**: todos los `/api/cron/*`
  responden sin autenticación (`if (cronSecret && …)`). La conciliación solo
  lee de Wompi y es idempotente, pero `horario-recordatorio` y
  `repuesto-recordatorio` **envían WhatsApp** — cualquiera con la URL puede
  dispararlos. Es el hallazgo de seguridad de esta auditoría.

## 3. ¿Trigger por cada pago? Sí, con un límite claro

**Sí para el dinero, no para las notificaciones.** Un trigger `AFTER INSERT OR
UPDATE ON pagos` que recalcule `monto_pagado_online` y `ultimo_pago_at` desde
el ledger hace que el resumen sea correcto **sin importar quién insertó**
(webhook, redirect, cron, botón admin o un `INSERT` manual como los de hoy).
Elimina la clase de bug "alguien insertó en `pagos` y olvidó el resumen".

Lo que el trigger **no debe tocar**: `anticipo_pagado_at`, `abono_pagado_at`,
`saldo_pagado_at`. Son el mecanismo de "avisar una sola vez": la app hace
`UPDATE … SET x_pagado_at = … WHERE x_pagado_at IS NULL` y solo notifica si
tocó una fila. Si el trigger las llenara al insertar, la app encontraría la
columna ya puesta, concluiría "duplicado" y **nadie recibiría el WhatsApp**.
Si algún día se quiere que también eso viva en la BD, hay que separar antes
"pagado" de "notificado" (columna `notificado_at`), lo cual es un cambio de
contrato — ver § 6.

Propuesta (aditiva, reversible, no aplicada):

```sql
-- supabase/migrations/2026MMDD_trigger_resumen_pago.sql (PROPUESTA)
CREATE OR REPLACE FUNCTION recalcular_resumen_pago(p_solicitud uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE solicitudes_servicio s SET
    monto_pagado_online = COALESCE((SELECT SUM(monto) FROM pagos
                                    WHERE solicitud_id = p_solicitud AND estado = 'APPROVED'), 0),
    ultimo_pago_at      = (SELECT MAX(pagado_at) FROM pagos
                           WHERE solicitud_id = p_solicitud AND estado = 'APPROVED')
  WHERE s.id = p_solicitud;
$$;

CREATE OR REPLACE FUNCTION trg_pagos_resumen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recalcular_resumen_pago(COALESCE(NEW.solicitud_id, OLD.solicitud_id));
  RETURN NULL;
END $$;

CREATE TRIGGER pagos_resumen_aiu
  AFTER INSERT OR UPDATE OF estado, monto, pagado_at OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pagos_resumen();
```

Con esto `actualizarResumenPago()` en la app pasa a ser redundante (se deja
como está: hace lo mismo, es idempotente; quitarla sería un cambio de código
innecesario).

Endurecimiento del ledger en la misma migración:

```sql
ALTER TABLE pagos ALTER COLUMN transaccion_id SET NOT NULL;   -- hoy ninguna fila es NULL
ALTER TABLE pagos ADD CONSTRAINT pagos_tipo_check
  CHECK (tipo IN ('anticipo','abono','saldo'));
ALTER TABLE pagos ADD CONSTRAINT pagos_referencia_formato_check
  CHECK (referencia ~ '^(anticipo|abono|saldo)-[0-9a-f-]{36}$');
```

## 4. ¿Trigger por cada solicitud para "validar y cruzar"? Dos niveles

**Nivel 1 — cruce interno (ledger ↔ solicitud), sin red.** No es un trigger
sino una función de auditoría que corre en la BD y deja rastro cuando algo no
cuadra. Es la que se usó hoy para verificar prod:

```sql
-- Devuelve 0 filas = todo coherente
SELECT s.id, s.cliente_nombre, s.monto_pagado_online,
       COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.solicitud_id=s.id AND p.estado='APPROVED'),0) AS suma_ledger
FROM solicitudes_servicio s
WHERE s.monto_pagado_online <> COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.solicitud_id=s.id AND p.estado='APPROVED'),0)
   OR (s.anticipo_pagado_at IS NULL) <> NOT EXISTS (SELECT 1 FROM pagos p WHERE p.solicitud_id=s.id AND p.estado='APPROVED' AND p.tipo='anticipo')
   OR (s.abono_pagado_at    IS NULL) <> NOT EXISTS (SELECT 1 FROM pagos p WHERE p.solicitud_id=s.id AND p.estado='APPROVED' AND p.tipo='abono')
   OR (s.saldo_pagado_at    IS NULL) <> NOT EXISTS (SELECT 1 FROM pagos p WHERE p.solicitud_id=s.id AND p.estado='APPROVED' AND p.tipo='saldo');
```

Propuesta: envolverla en `auditar_pagos()` que inserte un evento
`pago_registrado` con `requiere_intervencion_admin` y `auditoria: true` por
cada fila incoherente, y programarla con `pg_cron` una vez al día. Cero
dependencia de Vercel ni de WhatsApp.

**Nivel 2 — cruce externo (BD ↔ Wompi), necesita red.** Ya existe:
`GET /api/cron/wompi-conciliar` (consulta por referencia con la llave privada,
registra las APPROVED por la misma función que el webhook). Lo que falta es
**quién lo dispara**: Vercel Hobby solo permite crons diarios. Opción
recomendada: `pg_cron` + `pg_net` en Supabase llamando al endpoint cada 5
minutos con `Authorization: Bearer <CRON_SECRET>` (el secreto guardado en
Vault, no en el SQL). Con eso un pago PSE sin regreso queda registrado en ≤ 5
min, sin tocar el código de la app. Requisito previo: crear `CRON_SECRET` en
Vercel (§ 2).

**Qué NO hacer:** un trigger que llame a Wompi por cada `INSERT`/`UPDATE` de
`solicitudes_servicio`. Acopla la BD a un servicio externo en cada escritura,
mete latencia y reintentos en la transacción, y lo mismo se logra con el cron
de 5 min.

## 5. Mejoras sugeridas, por costo/beneficio

| # | Mejora | Esfuerzo | Riesgo | Toca código de pagos |
|---|---|---|---|---|
| 1 | `CRON_SECRET` en Vercel | 2 min | ninguno | no |
| 2 | `WOMPI_PRIVATE_KEY` en Vercel | hecho | — | no |
| 3 | `pg_cron` + `pg_net` → `/api/cron/wompi-conciliar` cada 5 min | 30 min | bajo (solo lee) | no |
| 4 | Trigger `pagos_resumen_aiu` + CHECKs del ledger (§ 3) | 30 min | bajo (aditivo) | no |
| 5 | `auditar_pagos()` diaria con evento ⚠️ (§ 4 nivel 1) | 30 min | ninguno | no |
| 6 | Resolver la URL de eventos: segunda cuenta/sub-comercio Wompi para la app, o proxy en `/api/wompi/webhook` que reenvíe a Conexa lo que no es nuestro | 2–4 h + coordinación tienda | medio | sí (solo si proxy) |
| 7 | Page `/admin/pagos` de solo lectura sobre el ledger (filtro por fecha/origen/método) | 2 h | ninguno | no (lee) |
| 8 | Texto en la pantalla de resultado de PSE/Nequi: "si no vuelves a la app, tu pago igual se registra en minutos" — hoy el cliente no sabe que debe tocar "Regresar al comercio" | 15 min | ninguno | no (copy) |

Las 1–5 son suficientes para que el registro **no dependa del navegador del
cliente** y para detectar cualquier desviación sin intervención humana. La 6
es la única que ataca la raíz (webhook) y es la única que amerita tocar
código de pagos; hasta que la tienda deje de necesitar la URL, el cron de
5 min cubre el hueco.

## 6. Plan de aislamiento: "funciona → no se toca"

**Frontera del módulo de pagos** (lo que queda congelado una vez cumplidas 1–5):

```
src/lib/wompi.ts                         ← firma de checkout, checksum, referencias, consultas API
src/lib/services/pagos.service.ts        ← registrarPagoWompi, resumen, conciliación
src/app/api/wompi/webhook/route.ts
src/app/api/cron/wompi-conciliar/route.ts
src/app/api/admin/pagos/verificar/route.ts
src/app/pago/anticipo/[token]/page.tsx   ← solo la parte de confirmación (?id=)
src/app/pago/saldo/[token]/page.tsx      ← ídem
src/lib/constants/pagos.ts               ← porcentajes (anticipo 50 %, abono 50 %)
supabase/migrations/20260818_wompi_pagos.sql, 20261011_resumen_pago_solicitud.sql
```

Fuera de la frontera (puede cambiar libremente): etiqueta y stepper de etapa
(`pago-cliente.ts`, `BadgePagoCliente`), textos de plantillas WhatsApp,
páginas admin/supervisor/técnico, correo de facturación. Dependen del módulo
por **lectura** de columnas, nunca escriben en él.

**Invariantes del contrato** (lo que cualquier cambio futuro debe conservar;
hoy los cubren los tests `src/__tests__/lib/wompi*.test.ts` y
`utils/etapa-pago-cliente.test.ts`):

1. La referencia es `{anticipo|abono|saldo}-{uuid de la solicitud}`; nada
   más se registra.
2. El monto nunca viene del cliente: checkout firmado + comparación contra lo
   esperado al confirmar; pago corto → fila en `pagos` + evento ⚠️, sin
   confirmar.
3. Una transacción = una fila (`transaccion_id` único); un momento de pago =
   un aviso (`*_pagado_at IS NULL`).
4. El resumen (`monto_pagado_online`, `ultimo_pago_at`) se deriva del ledger,
   nunca se suma a mano.
5. Un fallo de WhatsApp/correo nunca revierte ni bloquea el registro.
6. Sin `WOMPI_*` todo es no-op (kill-switch); sin `WOMPI_PRIVATE_KEY` la
   conciliación es no-op.
7. El webhook solo acepta eventos con checksum válido (`WOMPI_EVENTS_SECRET`).

**Mecánica para que no se toque "si no es estrictamente necesario":**

- **Tests de contrato antes que nada.** Añadir `src/__tests__/services/pagos-contrato.test.ts`
  con `registrarPagoWompi` sobre un Supabase mockeado y los 7 escenarios:
  anticipo, abono, saldo, reintento (duplicado), pago corto, referencia ajena,
  segundo pago del mismo momento. Es la red que permite decir "no cambió"
  con evidencia, no con fe.
- **Marcador en el código.** Encabezado `// 🔒 MÓDULO DE PAGOS — contrato en docs/mejoras-futuras/pagos-aislamiento/README.md § 6. No modificar sin ticket y sin correr pagos-contrato.test.ts`
  en cada archivo de la frontera.
- **Guard en CI/pre-commit.** Script `scripts/check-pagos-frontera.mjs`: si
  el diff toca un archivo de la frontera y el mensaje del commit no incluye
  `[pagos]`, falla. Barato, visible, y obliga a que el cambio sea consciente.
- **`CODEOWNERS`** con la frontera asignada al responsable del recaudo, para
  que GitHub exija su revisión aunque el push sea directo a `main`.
- **Cambios que SÍ son "estrictamente necesarios"**: rotación de llaves Wompi,
  cambio de la URL de eventos (mejora 6), cambio de porcentajes de
  anticipo/abono (decisión comercial), y correcciones a un invariante roto
  con evidencia en el ledger. Todo lo demás (UI, textos, plantillas, reportes)
  se hace **fuera** de la frontera leyendo las columnas derivadas.
- **Procedimiento de emergencia documentado** (ya vigente, en `docs/WOMPI.md`):
  registro manual abriendo `/pago/{anticipo|saldo}/{cliente_token}?id={tx}` o
  el botón "Verificar pagos en Wompi" con el número de transacción. No
  requiere tocar código ni la BD a mano.

## 7. Orden sugerido

1. `CRON_SECRET` en Vercel (hoy).
2. Migración del trigger + CHECKs (§ 3) y `auditar_pagos()` (§ 4) — una sola
   migración, aditiva, con rollback en el encabezado.
3. `pg_cron` + `pg_net` cada 5 min → conciliación; `auditar_pagos()` diaria.
4. Tests de contrato + marcador + guard de frontera. A partir de aquí el
   módulo queda congelado.
5. Copy en la página de resultado (mejora 8) y `/admin/pagos` (7) cuando haya
   tiempo — ambos fuera de la frontera.
6. Mejora 6 (URL de eventos) solo cuando la tienda pueda prescindir de
   Conexa o se abra un sub-comercio Wompi para la app.
