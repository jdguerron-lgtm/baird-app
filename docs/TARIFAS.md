# Tarifas — Baird Service

> Documento canónico de tarifas, bonos, márgenes, y reparto de pagos
> entre Baird Service, las marcas (MABE) y los técnicos.
>
> **Última actualización: 2026-05-12.**
>
> 🧭 **Ver también**:
> - [docs/INDEX.md](./INDEX.md) — hub de navegación.
> - [docs/PROTOCOLO-VISITA.md](./PROTOCOLO-VISITA.md) — verificación T-24h / T-2h / llegada / no-show.
> - [docs/FLOWS.md](./FLOWS.md) — flujos end-to-end.
> - `src/lib/constants/tarifas/` — implementación.

---

## Tabla de contenido

1. [Principios](#principios)
2. [Garantía MABE](#garantía-mabe)
3. [Particular (post-garantía, multi-marca)](#particular-post-garantía-multi-marca)
4. [Protocolo de visita y no-show](#protocolo-de-visita-y-no-show)
5. [Cómo cambiar una tarifa](#cómo-cambiar-una-tarifa)
6. [Pendientes con contador](#pendientes-con-contador)
7. [Apéndice A — Marco tributario 2026](#apéndice-a--marco-tributario-2026)
8. [Apéndice B — Pasarelas de pago](#apéndice-b--pasarelas-de-pago)
9. [Apéndice C — Decisión modelo reseller vs marketplace](#apéndice-c--decisión-modelo-reseller-vs-marketplace)

---

## Principios

1. **Dos tarifarios independientes.** Garantía MABE tiene su propia tabla fija (la marca paga). Particular se calcula a partir del costo que el técnico ingresa (el cliente paga).
2. **Cliente nunca paga directo al técnico.** Todos los pagos pasan por Baird Service. La cláusula está en T&C sección 3.
3. **Baird siempre toma su margen sobre lo que cobra**, no sobre lo que el cliente paga. En garantía es 22% de la tarifa base MABE; en particular es 10% sobre (costo técnico + IVA).
4. **Baird captura 10% sobre cada bono y recargo de fin de semana** (cambio 2026-05-12). El técnico recibe el 90% restante. Antes el bono iba íntegro al técnico; ahora la captura del 10% cubre soporte, dispute resolution y el capital de trabajo (MABE paga NET-30/60). El bono sigue siendo un incentivo diseñado por MABE para premiar al técnico — el 90% que recibe sigue siendo superior al bruto que tendría sin protocolo de TA + encuesta.
5. **No-show: nadie paga.** Si el cliente no está al momento de la visita, ni MABE ni Baird ni el cliente cubren el costo. El técnico pierde transporte y tiempo. Existe un protocolo de evidencia obligatorio para proteger al técnico de acusaciones falsas y reportar a MABE.
6. **Tarifas con IVA discriminado.** Para particular el cliente ve solo "Total (incluye IVA)" sin desglose. Internamente se separa base + IVA + margen Baird para facturación electrónica DIAN.

---

## Garantía MABE

Aplica cuando `solicitudes_servicio.es_garantia = true`. La marca paga a Baird; el cliente final no paga nada.

### Tipo de Taller

Baird Service está clasificado por MABE como **Taller Tipo D (código 24)**. Es un segmento aprobado para Baird con tarifas más altas que C/B/A. Las otras filas (A=21, B=22, C=23) se mantienen documentadas como referencia histórica pero **no se usan en el cálculo activo**.

### Tarifas base (mano de obra MABE — Tipo D)

| Complejidad | Código | Mano de obra base (COP) |
|---|---|---|
| Baja | 24 (D) | $42,000 |
| Media | 24 (D) | $50,000 |
| Alta | 24 (D) | $115,000 |

### Bono por tiempo de solución

El bono depende de **dos** condiciones:

1. **TA cumplido**: el técnico marca el diagnóstico dentro de las **24 horas** desde que el cliente confirmó el horario (`horario_confirmado_at` → `diagnosticado_at`).
2. **Encuesta de satisfacción contestada por el cliente**: Baird envía la encuesta tras el cierre del servicio. Si el cliente la contesta, el bono es la fila A. Si no, fila B.

Si el técnico no cumple TA, **no hay bono** (cualquier fila).

#### Tabla A — Cumple encuesta y TA

| Días de solución | Baja | Media | Alta |
|---|---|---|---|
| 0–1 día | $9,400 | $13,000 | $17,000 |
| 1.1–2 días | $7,500 | $11,500 | $15,000 |
| 2.1–3 días | $3,000 | $5,000 | $10,000 |
| > 3 días | $0 | $0 | $0 |

#### Tabla B — Cumple TA pero no contestó encuesta

| Días de solución | Baja | Media | Alta |
|---|---|---|---|
| 0–1 día | $4,700 | $6,500 | $8,500 |
| 1.1–2 días | $3,800 | $5,600 | $7,500 |
| 2.1–3 días | $1,500 | $2,500 | $5,000 |
| > 3 días | $0 | $0 | $0 |

**Días de solución** se cuentan desde `created_at` hasta el momento en que la solicitud entra a `completada`, **pausando el contador mientras el estado es `esperando_repuesto`** (porque depende de Baird/MABE, no del técnico).

### Recargo fin de semana

Se aplica si el `horario_confirmado` por el cliente cae **sábado o domingo**. Es predecible para el técnico desde que el cliente confirma horario.

| Complejidad | Recargo |
|---|---|
| Baja | $5,000 |
| Media | $6,000 |
| Alta | $7,000 |

### Reparto Baird ↔ Técnico (2026-05-12)

```
Baird captura     = 22% × tarifa_base
                  + 10% × bono
                  + 10% × recargo_weekend
Técnico recibe    = 78% × tarifa_base
                  + 90% × bono
                  + 90% × recargo_weekend
Total MABE paga   = tarifa_base + bono + recargo_weekend
```

El **margen que captura Baird sirve para cubrir**: WhatsApp + infra (Vercel/Supabase), customer support, dispute resolution, capital de trabajo (MABE paga NET-30/60), gestión de relación con MABE, y bonificaciones discrecionales que Baird pueda dar a técnicos por desempeño excepcional. La extensión del 10% al bono y al recargo (2026-05-12) protege el margen cuando la mezcla de servicios se inclina hacia complejidades bajas (donde el bono representa un porcentaje alto del total).

### Casos extremos

**Peor caso (Baja, sin bono, sin weekend, sin encuesta):**
- MABE paga: $42,000
- Baird (22% × 42,000): $9,240
- Técnico: $32,760

**Mejor caso (Alta, 0–1 día, encuesta OK, weekend):**
- MABE paga: $115,000 + $17,000 + $7,000 = $139,000
- Baird: 22% × 115,000 + 10% × 17,000 + 10% × 7,000 = $25,300 + $1,700 + $700 = $27,000
- Técnico: 78% × 115,000 + 90% × 17,000 + 90% × 7,000 = $89,700 + $15,300 + $6,300 = $111,300

> Cambio 2026-05-12: el mejor caso para el técnico bajó de $113,700 a $111,300 (–$2,400) por la captura del 10% sobre bono y recargo de fin de semana.

### Implementación

- Constantes y cálculo: `src/lib/constants/tarifas/mabe.ts`
- Función principal: `calcularTarifaMABE({ complejidad, diasSolucion, cumpleEncuesta, cumpleTA, esFinDeSemana })`
- Devuelve: `{ tarifaBase, bono, recargoWeekend, totalMABE, margenBaird, margenBaseMabe, margenBonoBaird, margenRecargoBaird, pagoTecnico, pagoBase, pagoBono, pagoRecargo, meta }`
- Constantes de reparto: `MARGEN_BAIRD_GARANTIA = 0.22` (sobre la base) y `MARGEN_BAIRD_BONO = 0.10` (sobre bono y recargo de fin de semana).
- Persistido en `solicitudes_servicio.triaje_resultado` (JSONB) cuando se completa el diagnóstico, y recalculado al cerrar el servicio (porque la encuesta puede llegar después).

### Pago mínimo mostrado al técnico antes de aceptar

Cuando el técnico recibe la notificación de garantía MABE (plantilla `nueva_solicitud_v4`) y abre `/aceptar/{token}`, **no podemos mostrar el pago real** porque la complejidad y los bonos se conocen sólo tras el diagnóstico.

Por eso mostramos el **pago mínimo garantizado**: el peor escenario para el técnico, calculado en `PAGO_MINIMO_TECNICO_GARANTIA`:

```
TARIFAS_MABE_TIPO_D.baja × (1 − MARGEN_BAIRD_GARANTIA)
       = 42_000 × 0.78
       = $32.760 COP
```

Corresponde a: Complejidad Baja + Sin bono TA + Sin encuesta + Sin recargo weekend. El monto real es **siempre ≥** este valor (puede subir a Media/Alta + bonos + recargo).

La UI lo deja explícito con "desde $32.760" + nota aclaratoria. El WhatsApp incluye `"Garantía MABE — desde $32.760 COP"` como `{{6}}` de la plantilla.

**Carga masiva**: al importar BITÁCORA, las solicitudes de garantía se insertan con `pago_tecnico = 0` (antes se ponía $80.000 por error). El campo se llena con el valor real al hacer el diagnóstico.

---

## Particular (post-garantía, multi-marca)

Aplica cuando `solicitudes_servicio.es_garantia = false`. El cliente paga a Baird; Baird paga al técnico. Cubre todas las marcas (MABE, GE, Haceb, Whirlpool, etc.).

### Modelo: reseller con IVA discriminado

Baird actúa como reseller del servicio: factura al cliente con IVA, paga al técnico el costo neto, y declara IVA + impuestos a la DIAN. Esta decisión está cerrada (ver Apéndice C para análisis del modelo marketplace alternativo).

### Fórmula

```
Costo_Técnico  = lo que el técnico ingresa (mano de obra + repuestos)
Subtotal_IVA   = Costo_Técnico × 1.19
Total_Cliente  = Subtotal_IVA × 1.10
               = Costo_Técnico × 1.309

Distribución del Total_Cliente:
  Técnico recibe   = Costo_Técnico
  IVA a la DIAN    = Costo_Técnico × 0.19 (aprox, antes de deducciones)
  Margen Baird     = Costo_Técnico × 0.119 (10% sobre Subtotal_IVA, neto de IVA sobre comisión)
```

### Display al cliente

El cliente solo ve **"Total: $X (incluye IVA)"**. No se le muestra el desglose de costo técnico, IVA, ni margen Baird. Esto protege la información comercial del intermediario.

Internamente la base + IVA se calcula con `calcularBaseSinIva()` y `calcularIvaIncluido()` para la factura electrónica DIAN.

### Por qué se eliminó el admin pricing gate para particular (2026-05-10)

Entre 2026-05-07 y 2026-05-10 el flujo particular obligaba al admin a fijar `mano_obra` y `precio_unitario` por SKU antes de notificar al cliente. **Con el modelo nuevo el técnico ingresa su `costo_total` y el sistema calcula automáticamente** el total al cliente con IVA + margen. El gate admin se mantiene **solo para garantía con `esperar_repuesto`** (ahí el admin debe fijar `tiempo_entrega` porque MABE no lo computa).

### Implementación

- Constantes y cálculo: `src/lib/constants/tarifas/particular.ts`
- Función principal: `calcularTarifaParticular({ costoTecnico })` → `{ costoTecnico, subtotalConIva, totalCliente, baseBaird, ivaCliente, margenBaird }`
- Constantes de IVA: `IVA_TARIFA = 0.19`, `MARGEN_BAIRD_PARTICULAR = 0.10`

### Ajuste manual del valor al cliente (admin, 2026-05-30)

El admin puede reajustar el valor que paga el cliente desde `/admin/solicitudes/[id]` → tarjeta "Actualizar valor del servicio" (`POST /api/admin/actualizar-valor`). Solo aplica a **particular** (`es_garantia=false`) con cotización existente y en estado no terminal. Sobreescribe `cotizacion.total`, limpia el desglose (`mano_obra/repuestos→0`), reabre la aprobación (`estado→cotizacion_enviada`) y avisa al cliente con la plantilla `valor_actualizado_cliente_v1` para que re-confirme en `/cotizacion/{token}`.

**Importante:** este override afecta el **precio al cliente** (y por tanto el margen Baird), **no** el `pago_tecnico` — lo que recibe el técnico se fijó en el diagnóstico y queda intacto. Guarda `valor_anterior`/`valor_actualizado_at`/`valor_actualizado_motivo` en `cotizacion` para auditoría. Si en el futuro se quiere que el ajuste también recalcule el pago al técnico, hay que tocar el endpoint explícitamente (hoy lo deja igual a propósito).

### Tarifa de diagnóstico (cuando aplica)

Cuando el técnico va a diagnosticar y el cliente decide no proceder con la reparación, se cobra una tarifa fija:
- **TARIFA_DIAGNOSTICO** = $84,000 COP (IVA incluido, base $70,588 + IVA $13,412)
- **ANTICIPO_PORCENTAJE** = 50% — se cobra antes de la visita técnica
- Si el cliente aprueba la cotización completa, el anticipo se acredita al total.

Constantes en `src/types/solicitud.ts`.

### Servicios de tarifa fija al solicitar (Diagnóstico, Reparación, Mantenimiento, Cambio de filtro)

Algunos servicios particulares tienen **precio fijo de catálogo definido al crear la solicitud** — el cliente lo ve y lo paga sin esperar cotización del técnico. La función `calcularPagoTecnico(tipo_equipo, tipo_solicitud, es_garantia)` en `src/types/solicitud.ts` resuelve el **precio de catálogo al cliente** (IVA incl.).

> ⚠️ **Modelo reseller — el técnico NO recibe el precio de catálogo.** Igual que en cotización libre, el cliente paga `costoTécnico × 1.309` (IVA 19% × margen Baird 10%). En tarifa fija ese 1.309 ya está embebido en el catálogo, así que el **neto del técnico = catálogo ÷ 1.309** (`pagoNetoTecnicoTarifaFija()` en `tarifas/particular.ts`, inversa de `calcularTarifaParticular`). El nombre `calcularPagoTecnico` es histórico: **devuelve el precio al cliente, no el pago al técnico.**

`/api/solicitar` recalcula server-side (anti-manipulación) y guarda en la columna **`pago_tecnico` el NETO** que recibe el técnico:

| `tipo_solicitud` | Precio al cliente (catálogo) | Pago **neto** al técnico (`pago_tecnico`) | Constante |
|---|---|---|---|
| Diagnóstico / Reparación | $84.000 (anticipo 50%) | **$64.171** | `TARIFA_DIAGNOSTICO` |
| Mantenimiento | $105.000–$189.000 según equipo | **$80.214–$144.385** | `TARIFAS_MANTENIMIENTO[tipo_equipo]` |
| **Cambio de filtro** | **$180.000 todo incluido** | **$137.510** | `TARIFA_CAMBIO_FILTRO` |
| (cualquiera, garantía) | $0 (la marca paga) | $0 | — |

Detalle de los netos por equipo en [docs/pagos-tecnico.html](./pagos-tecnico.html) (guía del técnico). El cliente nunca ve este desglose.

**Dos conceptos, dos lecturas:**
- **Pago al técnico (neto):** se lee directo de `pago_tecnico`. Lo usan el portal del técnico (`/tecnico/[token]`, `/aceptar/[token]`, completar), las plantillas WhatsApp al técnico y la columna "Pago técnico neto" del export. Consistente en todos los flujos particulares (tarifa fija o cotización libre).
- **Precio al cliente:** se **deriva** con `precioClienteServicio(tipo_equipo, tipo_solicitud, es_garantia, cotizacion)` — devuelve `cotizacion.total` si existe (Reparación cotizada o ajuste de admin) o el catálogo si no (tarifa fija). Lo usan la tarjeta de `/solicitar`, las plantillas/`tecnico_asignado_particular_v1` al cliente, `/confirmar/[token]`, las vistas admin y la columna "Valor al cliente" del export. **No se persiste una columna aparte** — siempre es derivable (catálogo es función pura de equipo×tipo, y cotización ya guarda el total al cliente).

**Cambio de filtro** (agregado 2026-05-29): precio fijo todo-incluido de **$180.000 COP** al cliente — cubre el **filtro (repuesto)**, la mano de obra y el IVA 19% (base $151.261 + IVA $28.739). El técnico recibe **$137.510 neto** (de ahí sale el filtro). Solo aplica en flujo particular (`es_garantia=false`); en garantía siempre es 0. La tarjeta de precio en `/solicitar` lo muestra como "Filtro incluido" con desglose de IVA para facturación DIAN.

> 🐛 **Fix 2026-06-09:** antes `pago_tecnico` guardaba el precio de catálogo (sobrepagaba al técnico el IVA+margen) y, al aprobar una cotización, `procesarAprobacionCotizacion` lo sobreescribía con `cotizacion.total` (= precio al cliente). Ahora `pago_tecnico` guarda siempre el neto: tarifa fija → catálogo ÷ 1.309 en `/api/solicitar`; cotización libre → `costoTecnico` fijado en `/api/diagnostico` o `/api/cotizacion-precios`, y la aprobación **ya no lo toca** (mismo criterio que `/api/admin/actualizar-valor`).

---

## Protocolo de visita y no-show

**No-show = nadie paga.** Si el cliente no está al momento de la visita confirmada, ni MABE ni Baird ni el cliente cubren el costo. El técnico pierde transporte y tiempo.

Para proteger al técnico contra acusaciones falsas y para reportar el caso a MABE, **es obligatorio el protocolo de evidencia** documentado en [docs/PROTOCOLO-VISITA.md](./PROTOCOLO-VISITA.md).

Resumen mínimo:
- Recordatorios automáticos al cliente T-24h y T-2h.
- Confirmación al técnico al ping GPS de llegada.
- Si el cliente no está: foto del inmueble, intentos de contacto registrados, espera 15 min documentada con GPS, marca `no_show_cliente` en el portal técnico.
- Estado terminal `no_show_cliente` con `evidencia_no_show` (JSONB) en `evidencias_servicio`.
- Audit en `solicitud_eventos`.
- Histórico acumulado del cliente en `cliente_historial` para gestión de riesgo (no-show repetidos → bloqueo de futuras solicitudes sin pago previo).

---

## Cómo cambiar una tarifa

### Cambiar tarifa MABE Tipo D
1. Editar `src/lib/constants/tarifas/mabe.ts` → `TARIFAS_MABE_TIPO_D` o `BONOS_MABE`.
2. Verificar que ningún caller dependa del valor literal (deberían usar las constantes).
3. Actualizar las tablas de este doc.
4. Si cambia el código de complejidad (de 24 a otro), agregar al CHECK constraint en una migración SQL (ver `supabase/migrations/README.md` § "Cómo aplicar las pendientes").
5. `npm test` para confirmar que no rompe nada.

### Cambiar margen Baird (22% MABE / 10% particular)
1. Editar la constante `MARGEN_BAIRD_GARANTIA` (`tarifas/mabe.ts`) o `MARGEN_BAIRD_PARTICULAR` (`tarifas/particular.ts`).
2. Actualizar las tablas de "casos extremos" en este doc.
3. Si el cambio es político (no solo numérico), comunicar al equipo de operaciones y al contador.

### Cambiar IVA (cambio normativo DIAN)
1. Editar `IVA_TARIFA` en `src/types/solicitud.ts`.
2. Actualizar este doc + `MARKETPLACE_HYBRID_ANALYSIS` legacy si aplica.
3. Validar con contador antes del cambio en producción.

### Agregar una nueva marca al flujo garantía (ej. GE, Haceb)
1. Decidir si la nueva marca usa la misma estructura MABE o tiene su propio tarifario.
2. Si tiene tarifario propio, crear `src/lib/constants/tarifas/<marca>.ts` con la misma forma que `mabe.ts`.
3. Actualizar el switch de cálculo en `tarifas/index.ts` (función `calcularTarifaGarantia({ marca, ... })`).
4. Documentar la nueva marca en este doc bajo una nueva sección.
5. Si la marca tiene su propio Excel BITÁCORA, actualizar `src/lib/utils/excel-mapping.ts`.

### Agregar nuevo bono o recargo
1. Definir constantes en `tarifas/mabe.ts` o `tarifas/particular.ts`.
2. Extender `calcularTarifaMABE()` o `calcularTarifaParticular()` con el nuevo input.
3. Actualizar callers (formulario diagnóstico, API `/api/diagnostico`, API `/api/confirmar-servicio` si depende de encuesta).
4. Documentar en este doc.
5. Si requiere persistir un nuevo dato en `solicitudes_servicio` o `evidencias_servicio`: nueva migración SQL.

### Agregar un servicio de tarifa fija al solicitar (nuevo `tipo_solicitud`)
Ejemplo de referencia: "Cambio de filtro" ($180k), agregado el 2026-05-29. **No requiere migración** — `tipo_solicitud` no tiene CHECK constraint en BD y Zod deriva el enum del array TS.
1. Agregar el valor al array `TIPOS_SOLICITUD` en `src/types/solicitud.ts` (el schema Zod `z.enum(TIPOS_SOLICITUD)` se actualiza solo).
2. Definir la constante de **precio al cliente** (ej. `TARIFA_CAMBIO_FILTRO = 180000`, IVA incluido) y agregar el caso en `calcularPagoTecnico()` (que devuelve ese precio de catálogo). Garantía siempre devuelve 0 antes de los casos particulares.
3. Agregar la rama de la tarjeta de precio en `src/app/solicitar/page.tsx` (modelar sobre la verde de Mantenimiento; usa `formData.pago_tecnico` —que en el form es el precio al cliente— + desglose IVA con `calcularBaseSinIva`/`calcularIvaIncluido`).
4. `/api/solicitar` recalcula server-side y guarda en `pago_tecnico` el **NETO** = `pagoNetoTecnicoTarifaFija(calcularPagoTecnico(...))` (catálogo ÷ 1.309) — no se confía en el valor del cliente. El precio al cliente se deriva donde haga falta con `precioClienteServicio()`; no se persiste aparte.
5. Actualizar la tabla de "Servicios de tarifa fija al solicitar" en este doc (ambas columnas: precio al cliente y neto al técnico).

---

## Pendientes con contador

Estos puntos requieren validación con el contador antes de que el modelo entre en producción a escala:

1. **Status tributario del técnico** — la fórmula particular asume que Baird factura al cliente y maneja el IVA. Esto es correcto si Baird es responsable de IVA (lo es por ser SAS). Si el técnico también factura IVA a Baird, hay que verificar la deducción de IVA en compras. Si el técnico es no responsable de IVA (régimen simplificado), Baird no puede deducir IVA en su compra al técnico → costo neto sube.

2. **Factura electrónica al cliente** — obligatoria en Colombia (Resolución 165/2023 actualizada en 2025). Hoy Baird no la emite automáticamente. Pendiente integrar Alegra / Siigo / ContaPyme.

3. **Documento equivalente del técnico** — si el técnico es no responsable de IVA, debe emitir documento equivalente (boleta sin IVA) por sus servicios a Baird. Hoy no se emite.

4. **Base 10% margen particular** — modelar P&L con datos reales del primer trimestre. Si los costos operativos por servicio (soporte + dispute + WhatsApp + MDR) superan el margen en servicios chicos ($30k–$50k de costo técnico), considerar:
   - Subir margen a 12–15%
   - Poner piso de "Baird mínimo $8,000 por servicio"
   - Ambos parametrizables sin migración.

5. **Pagos al técnico** — hoy no hay pasarela de split-payment integrada. Baird recibe el pago del cliente y manualmente transfiere al técnico. Para escala se necesita ePayco Pagos Divididos o Mercado Pago Marketplace (ver Apéndice B).

6. **Retenciones** — Baird debe retener Rete-Fuente al técnico al pagarle (típicamente 6–11% según concepto). Esto reduce lo que el técnico recibe en mano y lo declara como impuesto pagado en su renta. Pendiente automatizar la retención y certificado anual.

---

## Apéndice A — Marco tributario 2026

### UVT 2026
- **$52,374 COP** (Resolución DIAN 000238 del 15 dic 2025)

### Topes relevantes para personas naturales (técnicos)

| Concepto | UVT | COP 2026 |
|---|---|---|
| Tope "no responsable de IVA" persona natural | 3,500 | $183,309,000 |
| Tope "no responsable IVA" si presta servicios al Estado | 4,000 | $209,496,000 |
| Tope régimen Simple — servicios técnicos | 12,000 | $628,488,000 |
| Tope régimen Simple — todos los demás | 100,000 | $5,237,400,000 |

### Régimen Simple de Tributación (RST) para técnicos
Los servicios técnicos donde predomina el factor material (reparación de electrodomésticos lo es) son **elegibles para RST**. Si el técnico está en Simple y factura < 3,500 UVT/año:
- No es responsable de IVA → no le cobra 19% al cliente.
- Paga una tarifa única consolidada (renta + ICA) sobre ingresos brutos.
- Tarifa típica para servicios: ~5.9% (depende del grupo de actividad).

### Baird Service SAS
Como sociedad por acciones simplificada:
- **Siempre es responsable de IVA al 19%**, sin importar el tope.
- Sobre la **comisión** que cobre al técnico debe facturar IVA.
- Si el técnico es "no responsable", NO puede deducir ese IVA → es costo neto para él.

### Riesgo legal: Ley 2466 de 2025

Aprobada en 2025, aplica directamente a apps de reparto (Rappi, Didi Food, Picap, etc.) pero abre jurisprudencia para extenderse a otros marketplaces de servicios:
- Si un trabajador de plataforma trabaja **más del 50% de su tiempo** en una sola plataforma → tiene derecho a ser considerado **empleado dependiente**.
- Aporte salud/pensión: 60% plataforma, 40% trabajador.
- Cobertura 100% riesgos laborales a cargo de la plataforma.
- Registro y reporte trimestral al Ministerio de Trabajo.

**Implicación para Baird:** si un técnico hace todos sus servicios a través de Baird, la DIAN/Mintrabajo puede exigir reclasificación laboral. Costo: prestaciones, parafiscales (~52% sobre salario), aportes retroactivos, multas.

**Mitigaciones obligatorias para defensa:**
1. T&C exigen multi-cliente — el técnico declara que tiene otros clientes/plataformas.
2. Sin horarios fijos, sin uniformes obligatorios, sin asistencia obligatoria a capacitaciones.
3. Cobranza directa al cliente (no Baird al técnico) → confirma autonomía económica.
4. Herramientas propias del técnico (no entregadas por Baird).
5. Cláusula de no exclusividad explícita y firmada.
6. Pólizas individuales de responsabilidad civil del técnico.

### Responsabilidad solidaria al consumidor (Ley 1480, Estatuto del Consumidor)
La SIC y los jueces civiles pueden hacer corresponsable a Baird por:
- Daños del técnico al inmueble/equipo del cliente.
- Servicio mal prestado.
- No devolución de anticipo.

**Mitigación:**
- Sistema de disputas robusto (estado `en_disputa`).
- Pólizas de cumplimiento por servicio.
- Reglas claras de evidencia (fotos, GPS, firma — ya implementadas).

---

## Apéndice B — Pasarelas de pago

| Pasarela | Split nativo | Comisión | Notas |
|---|---|---|---|
| **ePayco Pagos Divididos** | ✅ Sí (oficial) | 2.99% + $900 + IVA | Davivienda: 2.68% + $900. Documentación clara |
| Mercado Pago | ✅ Sí (madura) | 3.49% + IVA | La más usada en LatAm marketplaces |
| Wompi (Bancolombia) | ⚠️ Parcial | 2.85% + IVA | API "Third-Party Payments" — orquestación manual |
| dLocal | ✅ Sí | Negociable, 3-4% | Más para volumen alto |
| PayU | ⚠️ No nativo | 3.49% + IVA | Doble transacción manual |

**Recomendación inicial para split-payment**: ePayco Pagos Divididos o Mercado Pago Marketplace.

### Cómo funciona el split (cuando se integre)

1. Cliente paga `Total_Cliente` al endpoint de la pasarela.
2. La pasarela retiene la comisión Baird en cuenta Baird.
3. La pasarela transfiere `Costo_Técnico` al técnico.
4. Baird factura IVA sobre la comisión al técnico al final del mes.

**Estado hoy (2026-05-10):** Baird recibe el pago manual y transfiere al técnico también manual. Sin split-payment integrado. Pendiente para escala.

---

## Apéndice C — Decisión modelo reseller vs marketplace

**Decisión cerrada (2026-05-10): modelo reseller.** Baird factura al cliente con IVA y paga al técnico el costo neto. El modelo marketplace alternativo (técnico factura directo al cliente, sin IVA si está en régimen simplificado) **no se implementa por ahora**. Razones:

- 6-10 semanas de trabajo: pasarela split-payment, white-label invoicing, reescritura de T&C, onboarding de técnicos con datos tributarios.
- Exposición legal aumentada por Ley 2466 de 2025 (reforma plataformas digitales).
- Beneficio principal (16% más barato al cliente) es atractivo pero no urgente para volumen actual.
- Reseller sirve el mismo flujo y permite IVA discriminado, que la DIAN exige.

Esta decisión se reabre cuando:
- El volumen mensual particular supere ~500 servicios y el ahorro al cliente compense la inversión.
- Mintrabajo emita reglamentación específica para plataformas de servicios técnicos.
- Aparezcan competidores cobrando 16% menos al consumidor (riesgo competitivo real).

### Comparativa de referencia (un servicio de $126,000 al cliente)

| Concepto | Reseller (actual) | Marketplace (descartado) |
|---|---|---|
| Cliente paga | $126,000 | ~$105,000 |
| IVA al cliente | $20,118 (19%) | $0 (técnico no responsable) |
| Recibe el técnico (bruto) | — (Baird subcontrata) | $105,000 |
| Comisión Baird (20%) | n/a | $21,000 |
| IVA Baird sobre comisión | n/a | $3,353 |
| Margen Baird neto | ~$30k | $17,647 |
| Costo total al cliente | $126,000 | $105,000 (-16.7%) |

---

## Fuentes

- [UVT 2026 — Resolución DIAN 000238](https://actualicese.com/uvt-2026/)
- [Régimen Simple Tributación 2026 DIAN](https://dian.com.co/regimen-simple-tributacion-colombia-2026/)
- [Ley 2466 de 2025 — Análisis Valencia Grajales](https://valenciagrajales.com/ley-2466-de-2025-analisis-de-la-reforma-laboral-para-plataformas-de-reparto-en-colombia/)
- [ePayco Pagos Divididos](https://epayco.com/pagos-divididos/)
- [Wompi Pagos a Terceros API](https://docs.wompi.co/en/docs/colombia/introduccion-pagos-a-terceros/)
- [IVA en servicios mantenimiento — Gerencie](https://www.gerencie.com/servicios-de-mantenimiento-gravados-con-iva.html)
- [No responsables de IVA 2026 — Actualícese](https://actualicese.com/montos-para-ser-no-responsables-de-iva-en-2026/)
