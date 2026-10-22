# Devoluciones de pagos online (Wompi) — instructivo

> Desde el 2026-10-22 (PR jdguerron-lgtm/baird-app#5) el admin puede devolver
> desde la ficha cualquier pago online aprobado (anticipo, abono de repuestos
> o saldo). Este doc explica **cómo se usa** (admin), **qué le decimos al
> cliente** y **qué hacer cuando el dinero ya se dispersó**. El detalle
> técnico (API, invariantes del ledger, tests) está en `docs/WOMPI.md`
> § Devoluciones; el catálogo de la plantilla en `docs/WHATSAPP_TEMPLATES.md`.

## 1. Qué permite Wompi hoy (verificado 2026-10-21/22)

| Mecanismo | Aplica a | Ventana | Comisión Wompi | Cómo lo usa la app |
|---|---|---|---|---|
| **Anulación** (`/void`) | Solo tarjeta | El **mismo día**, antes del cierre del adquirente (Redeban/Credibanco). Después responde 422. | Se revierte completa: el cobro desaparece | Respaldo automático cuando el pago fue con tarjeta y el reembolso no está disponible |
| **Reembolso V2** (`POST /v1/refunds`) | Transacción APPROVED (la doc del API no restringe el método; el centro de ayuda de Wompi habla solo de **tarjetas Visa/Mastercard/Amex**) | Después del día del pago | Wompi **no devuelve su comisión ni el IVA de la comisión** (≈2,85 % + IVA del monto) — Baird la asume | Primer intento del botón "Devolver por Wompi" |
| **Panel de Wompi** (manual) | Tarjetas | Mientras haya saldo en "Disponible" | Igual que el reembolso | Fuera de la app; luego se registra con "Registrar devolución manual" |
| **Transferencia desde Bancolombia de Baird** | PSE, Nequi, Bancolombia, o cualquier caso que Wompi rechace | Siempre | Ninguna (pero se perdió la comisión del cobro original) | Fuera de la app; se registra con "Registrar devolución manual" |

Dos condiciones de Wompi que mandan sobre todo lo demás:

1. **El reembolso solo se procesa si la cuenta Wompi de Baird tiene saldo en
   "Disponible"** (centro de ayuda de Wompi). Si la dispersión diaria ya
   mandó el dinero al banco y no hay saldo, el reembolso queda `DECLINED`
   ("Tiempo límite sin encontrar fondos excedido") y la app lo muestra como
   rechazado sin tocar nada.
2. **Para PSE y Nequi no hay anulación por API.** Si el reembolso V2 tampoco
   los acepta (por confirmar con Wompi en el primer caso real), la vía es
   transferencia manual.

Variables en Vercel que lo habilitan: `WOMPI_PRIVATE_KEY` (ya configurada).
Sin ella el botón responde "necesita WOMPI_PRIVATE_KEY" y queda la vía manual.

## 2. Instructivo para el ADMIN

### 2.1 Cuándo devolver

| Situación | Qué devolver | Vía recomendada |
|---|---|---|
| El cliente cancela **antes de la visita** y ya pagó el anticipo | El anticipo completo | Mismo día y tarjeta → "Devolver por Wompi" (anulación, sin costo). Otro día o PSE/Nequi → "Devolver por Wompi" primero; si Wompi rechaza, transferencia + registro manual |
| Baird cancela (sin técnico disponible, no se puede atender) | Todo lo pagado | Igual que arriba; Baird asume la comisión |
| El cliente pagó **dos veces** el mismo cobro (evento ⚠️ "segundo pago" en el historial) | Solo el segundo pago | "Devolver por Wompi" sobre la fila duplicada; el primero sigue acreditado |
| Se cobró de más (cotización ajustada después de pagar) | La diferencia | **Parcial no está en la app**: hacerlo desde el panel de Wompi o por transferencia y "Registrar devolución manual" con la nota del monto. Alternativa: dejarlo como saldo a favor en el siguiente cobro (anotar en la ficha) |
| No-show del cliente con evidencia (`no_show_cliente`) | Nada (política "no-show: nadie paga" solo cubre al técnico; el anticipo se conserva según T&C) | Solo si el admin decide devolver por buena voluntad |
| Técnico no se presentó (incumplido) y el cliente no quiere reprogramar | Todo lo pagado | Igual que cancelación por Baird |

Regla práctica: **si el pago fue con tarjeta y es el mismo día, devuélvelo
hoy** — la anulación no cuesta nada y el cliente ve el cargo desaparecer.
Al día siguiente ya es reembolso y Baird pierde la comisión.

### 2.2 Paso a paso en la ficha

1. Abre `/admin/solicitudes/{id}` → bloque **"Cobros al cliente"** (dentro de
   la tarjeta de precios). Si el servicio está `cancelada` y tiene pagos
   aprobados, verás el aviso ⚠️ "revisa si corresponde devolverlo".
2. En la lista del ledger ubica el pago (tipo, monto, método, fecha,
   N° de transacción). Solo los `APPROVED` tienen botones.
3. **"↩️ Devolver por Wompi"** → confirma el diálogo. La app:
   - intenta el reembolso por el monto completo del pago (el monto sale de
     la base de datos, no se puede editar);
   - si Wompi dice que el endpoint no está disponible y el pago fue con
     tarjeta, intenta la anulación;
   - si sale bien: la fila pasa a "↩️ Devuelto", el resumen de lo pagado
     baja, queda evento ↩️ en el historial con tu correo, el cliente recibe
     el WhatsApp `devolucion_confirmada_cliente_v1` y el equipo la alerta.
4. Si Wompi **rechaza** (mensaje ámbar "No se pudo devolver: …"): nada
   cambió en la base. Pasa a la vía manual:
   - Tarjeta: panel de Wompi → Transacciones → buscar por el N° de
     transacción → Reembolsar (necesita saldo "Disponible").
   - PSE / Nequi / Bancolombia o sin saldo: transferencia desde la cuenta de
     Baird. Pide al cliente los datos con el texto de § 3.3.
   - Luego **"Registrar devolución manual"** con una nota verificable:
     "reembolso panel Wompi #…" o "transferencia Bancolombia 22/10 ref …".
     Esto marca la fila como devuelta y manda el mismo WhatsApp al cliente
     ("regresa por el medio acordado contigo").
5. Verifica: el badge de etapa de pago vuelve a "anticipo pendiente" (o el
   que corresponda), el historial tiene el evento ↩️ y, si el WhatsApp falló,
   un evento ⚠️ "no se pudo avisar al cliente" → avísale a mano.

Qué **no** hace la app: devoluciones parciales, devolver pagos hechos por
la tienda Shopify (referencia `r…`, registrados a mano) ni pagos en sitio
con QR (no están en el ledger).

### 2.3 Dónde queda el rastro

- `pagos`: la misma fila cambia a `estado = VOIDED` y guarda en
  `raw._devolucion` la vía, la fecha, quién la hizo, la nota y la respuesta
  de Wompi (id del reembolso).
- `solicitud_eventos`: evento `pago_registrado` con `payload.devolucion = true`
  (o `devolucion_fallida` si Wompi rechazó).
- `solicitudes_servicio`: `monto_pagado_online` baja solo (trigger) y
  `{anticipo|abono|saldo}_pagado_at` se limpia si no queda otro pago de ese
  tipo. Si el cliente vuelve a pagar, se le avisa de nuevo.
- Contabilidad (`docs/FACTURACION.md`): el export de `/admin/liquidaciones`
  lee solo pagos `APPROVED`, así que la devolución desaparece del recaudo;
  la comisión perdida de Wompi queda como gasto en el extracto de Wompi, no
  en la app.

## 3. Instructivo para el CLIENTE

### 3.1 Lo que el cliente recibe automáticamente

WhatsApp `devolucion_confirmada_cliente_v1` (mientras Meta la aprueba sale
el mismo texto en mensaje libre):

> Hola {nombre}, te confirmamos que procesamos la devolución de {monto} COP
> correspondiente al {anticipo / abono de repuestos / saldo} de tu servicio
> de {equipo}. El dinero regresa {al mismo medio con el que pagaste (PSE) /
> por el medio acordado contigo}. Según tu banco puede tardar entre 1 y 15
> días hábiles en verse reflejado. Si tienes alguna duda, responde a este
> mensaje y te ayudamos.

### 3.2 Preguntas frecuentes (texto listo para `/servicio`, T&C o respuesta en WhatsApp)

**¿Cuándo me devuelven el dinero?**
Si cancelas antes de la visita, Baird devuelve el anticipo completo. Si el
servicio no pudo prestarse por causa de Baird o del técnico, se devuelve
todo lo pagado. Si el técnico llegó y no fue atendido (no-show), aplica lo
previsto en los Términos y Condiciones.

**¿Cómo me llega?**
- Pagaste con **tarjeta**: la devolución entra a la misma tarjeta. Si se
  anuló el mismo día, el cargo simplemente desaparece; si fue después,
  aparece como un abono entre 1 y 15 días hábiles según tu banco.
- Pagaste con **PSE, Nequi o Bancolombia**: te pedimos la cuenta o número
  Nequi a tu nombre y te transferimos. Toma 1 día hábil desde que nos
  confirmas los datos.

**¿Me devuelven todo?**
Sí, el valor que pagaste. Las comisiones de la pasarela las asume Baird.

**¿Qué hago si no me ha llegado?**
Responde al WhatsApp del servicio con el N° de transacción (está en el
comprobante que te envió Wompi) y revisamos con la pasarela.

**¿Puedo dejar el dinero para otra visita en vez de que me lo devuelvan?**
Sí: escríbenos y reprogramamos conservando tu anticipo.

### 3.3 Texto para pedir datos de transferencia (devolución manual)

> Hola {nombre}, para devolverte los {monto} COP de tu servicio necesitamos
> los datos de una cuenta a tu nombre: banco, tipo de cuenta, número y tu
> número de cédula (o tu número de Nequi). Apenas los recibamos hacemos la
> transferencia y te enviamos el comprobante.

(El cliente debe tener la ventana de 24 h abierta para recibir texto libre;
si no, llámalo o usa una plantilla.)

## 4. Mejoras propuestas: cuando ya pasó el día y el dinero no está en Wompi

Hoy el flujo funciona bien el mismo día con tarjeta. El problema real es el
día siguiente: la dispersión diaria mueve el dinero a Bancolombia, el
reembolso necesita saldo "Disponible" en Wompi y para PSE/Nequi ni siquiera
hay anulación. Opciones, de menor a mayor esfuerzo (ninguna implementada):

1. **Saldo "Disponible" permanente en Wompi (decisión 2026-10-22: dejar
   ~$200.000).** Ver § 4.1 con los pasos. Es operación, no código.
2. **Preferir reprogramar sobre devolver.** En la cancelación del cliente
   (`/servicio/{token}` y la plantilla de cancelación) ofrecer primero
   "conservar el anticipo para otra fecha" y dejar la devolución como segunda
   opción. Reduce devoluciones (y comisiones perdidas) y conserva la venta.
   Técnicamente: guardar el anticipo como saldo a favor en la solicitud
   nueva o reagendada.
3. **Cola de devoluciones con reintento.** Tabla `devoluciones` (pago,
   monto, estado `pendiente | enviada | rechazada | manual`, intentos) +
   cron diario que reintenta las `rechazadas` por falta de fondos durante N
   días (si se adopta la opción 1 el reintento del día siguiente suele
   pasar) y una página `/admin/devoluciones` con todo lo pendiente. Hoy un
   rechazo solo deja un evento en la ficha; con varios casos se pierde de
   vista.
4. **Devolución manual guiada.** Cuando Wompi rechaza o el método es
   PSE/Nequi: plantilla que pide al cliente los datos bancarios (hoy es
   texto libre, § 3.3, que exige ventana 24 h), formulario en
   `/servicio/{token}` para que los deje, y en la ficha el admin marca
   "transferido" adjuntando el comprobante. Conecta con el Documento soporte
   / contabilidad de `docs/FACTURACION.md`.
5. **Payouts de Wompi.** Wompi ofrece "pagos a terceros" (transferencias a
   cuentas bancarias desde la cuenta Wompi). Permitiría devolver PSE/Nequi
   por API sin pasar por el banco. Requiere contratar el producto y
   confirmar costos; evaluar solo si el volumen de devoluciones lo
   justifica.
6. **Política de anticipo más pequeña o más tardía.** Cobrar el anticipo
   más cerca de la visita (p. ej. recordatorio T-24h) reduce el tiempo en
   que un cambio de planes obliga a devolver. Decisión comercial, ver
   `docs/TARIFAS.md` y `docs/PROTOCOLO-VISITA.md`.

Recomendación: 1 + 2 primero (sin código o casi), luego 3 cuando haya más
de un par de devoluciones por semana.

### 4.1 Cómo dejar ~$200.000 en Wompi para devoluciones

El saldo "Disponible" que Wompi exige para un reembolso vive en la **Wompi
Cuenta**, la cuenta digital del producto **Pagos a Terceros**. Hoy está en
cero porque Wompi traslada las ventas al Bancolombia de Baird al día hábil
siguiente. La vía más simple es una **recarga única**, no retener ventas.

**Pasos (panel de Wompi, usuario con permiso de manejo de saldos):**

1. Menú izquierdo → **"Pagos a terceros"**. Si no aparece, el producto no
   está activo: usar "Solicitar activación" (login.wompi.co) o pedirla al
   ejecutivo de Wompi. La Wompi Cuenta se habilita con ese producto.
2. **Pagos a terceros → Saldos → módulo "Wompi cuenta" → "Recargar
   saldo"**. Se paga por el mismo checkout de Wompi (transferencia
   Bancolombia ahorros/corriente, Nequi, PSE, QR Bre-B o Daviplata). Se
   acredita de inmediato, máximo 5 recargas por día, con comprobante
   descargable.
3. Recargar **$200.000**. Desde ese momento "Devolver por Wompi" (reembolso
   V2) descuenta de ese saldo; cada devolución lo consume (más la comisión
   que Wompi no devuelve), así que revisar el saldo tras cada una y
   recargar cuando baje de ~$80.000 (dos anticipos).
4. Primer uso recomendado: la devolución pendiente de Juliana Hernández
   ($68.250) — sirve de prueba real del reembolso V2 en producción.

**Alternativa:** dejar el dinero de las ventas en la Wompi Cuenta en vez del
traslado automático (Bancolombia anuncia que el comercio elige entre
traslado al día hábil siguiente o mantener saldo hasta 180 días; pasado ese
plazo Wompi lo abona solo). Obliga a dispersar a mano lo que sobre; solo
tiene sentido si no se quiere adelantar plata desde el banco.

**Confirmar con el ejecutivo de Wompi ANTES de activar** (la documentación
pública no lo aclara):

- **Costo de tener Pagos a Terceros activo.** El pago a terceros cuesta
  $1.849 + 0,4 % + IVA por transferencia y los planes mensuales publicados
  (Lite $210.000 + IVA/mes y superiores) son para agregar cuentas
  Bancolombia como origen. Para solo mantener saldo y reembolsar no debería
  hacer falta plan; pedirlo por escrito. **Si cobran un fijo mensual, no
  vale la pena** por el volumen actual de devoluciones.
- **Si el reembolso cubre PSE y Nequi.** El centro de ayuda habla solo de
  tarjetas Visa/Mastercard/Amex (Redeban/Credibanco). Si PSE/Nequi quedan
  por fuera, el saldo en Wompi solo sirve para devoluciones con tarjeta
  hechas después del día del pago; PSE/Nequi siguen por transferencia.

**Plan B mientras se confirma (o si hay costo fijo):** reservar los
$200.000 en la cuenta Bancolombia de Baird (bolsillo o marca contable) y
devolver por transferencia con "Registrar devolución manual" (§ 2.2 paso 4),
que ya está en producción. Con tarjeta el mismo día seguir usando "Devolver
por Wompi": anula sin costo y no necesita saldo.

Fuentes: docs.wompi.co "Recarga Wompi Cuenta"; soporte.wompi.co "¿Cómo sé
qué monto tengo disponible para dispersar?" y "¿Qué es reembolso total…?";
prensa.bancolombia.com "Wompi te ayuda a administrar el dinero de las
ventas virtuales"; wompi.com/es/co/soluciones/payouts (tarifas).

## 5. Checklist de puesta en marcha (pendiente)

- [ ] Verificar que `devolucion_confirmada_cliente_v1` esté APPROVED:
      `node --env-file=.env.local scripts/upload-templates.mjs --check`.
- [ ] Primer caso real con tarjeta → confirmar que Wompi acepta el reembolso
      V2 en producción (si responde 403/404, pedir a Wompi que lo habilite).
- [ ] Primer caso real con PSE/Nequi → documentar aquí si el reembolso V2 lo
      aceptó o si hubo que transferir.
- [ ] Resolver la devolución pendiente de Juliana Hernández ($68.250 del
      doble cobro del 2026-10-20) con este flujo.
- [ ] Confirmar con Wompi el costo de activar Pagos a Terceros / Wompi
      Cuenta y si el reembolso cubre PSE/Nequi (§ 4.1); luego recargar los
      $200.000.
