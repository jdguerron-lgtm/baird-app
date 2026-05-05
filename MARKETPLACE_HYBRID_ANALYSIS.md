# Análisis Modelo Híbrido Marketplace — Baird Service

**Fecha:** 2026-05-05
**Audiencia:** Founder + contador + abogado
**Decisión a tomar:** ¿Migrar el flujo "particular" de modelo reseller a modelo marketplace para eliminar el IVA del 19% al consumidor final?

> **TL;DR estratégico**
>
> El modelo marketplace es viable y bajaría tu precio al consumidor ~16%, pero
> implica al menos 6-10 semanas de trabajo, integración de pasarela con
> split-payment, reescritura de T&C, y una exposición legal significativa por
> la **Ley 2466 de 2025** (reforma laboral de plataformas digitales). El flujo
> "garantía" (B2B con marca) debe permanecer reseller. Esta es una decisión
> de modelo de negocio, no de código.

---

## 1. Marco tributario actualizado a 2026

### UVT 2026
- **$52.374 COP** (Resolución DIAN 000238 del 15 dic 2025)

### Topes relevantes
| Concepto | UVT | COP 2026 |
|---|---|---|
| Tope "no responsable de IVA" persona natural | 3.500 | $183.309.000 |
| Tope "no responsable IVA" si presta servicios al Estado | 4.000 | $209.496.000 |
| Tope régimen Simple — servicios técnicos | 12.000 | $628.488.000 |
| Tope régimen Simple — todos los demás | 100.000 | $5.237.400.000 |

### Régimen Simple de Tributación (RST) para técnicos
Los servicios técnicos donde predomina el factor material (reparación de electrodomésticos lo es) son **elegibles para RST**. Si el técnico está en Simple y factura < 3.500 UVT/año:
- No es responsable de IVA → **no le cobra 19% al cliente**
- Paga una tarifa única consolidada (renta + ICA) sobre ingresos brutos
- Tarifa típica para servicios: ~5.9% (depende del grupo de actividad)

Esto es la base económica de la propuesta marketplace.

### Baird Service SAS
Como sociedad por acciones simplificada:
- **Siempre es responsable de IVA al 19%**, sin importar el tope
- Sobre la **comisión** que cobre al técnico debe facturar IVA
- Si el técnico es "no responsable", NO puede deducir ese IVA → es costo neto para él

### Comparativo mismo servicio (Mantenimiento Lavadora $126.000)

| Concepto | Reseller actual | Marketplace propuesto |
|---|---|---|
| Cliente paga | $126.000 | **~$105.000** |
| IVA al cliente | $20.118 (19%) | $0 (técnico no responsable) |
| Recibe el técnico (bruto) | — (Baird subcontrata) | $105.000 |
| Comisión Baird (20%) | n/a | $21.000 |
| IVA Baird sobre comisión | n/a | $3.353 (19% del 80% de $21k) |
| Margen Baird neto | ~$30k (resta del IVA + costo técnico) | $17.647 (comisión sin IVA) |
| Costo total al cliente | $126.000 | $105.000 (-16.7%) |

---

## 2. Riesgos legales — ⚠️ Sección crítica

### Ley 2466 de 2025 (Reforma laboral plataformas digitales)
**Esta es la novedad más importante de 2025-2026 que cambia el cálculo del modelo marketplace.**

Aprobada en 2025, aplica directamente a apps de reparto (Rappi, Didi Food, Picap, etc.) pero abre jurisprudencia para extenderse a otros marketplaces de servicios:

- Si un trabajador de plataforma trabaja **más del 50% de su tiempo** en una sola plataforma → tiene derecho a ser considerado **empleado dependiente**
- Aporte salud/pensión: **60% plataforma, 40% trabajador**
- Cobertura 100% riesgos laborales a cargo de la plataforma
- Registro y reporte trimestral al Ministerio de Trabajo

**Implicación directa para Baird:**
Si un técnico hace todos sus servicios a través de Baird, la DIAN/Mintrabajo puede exigir reclasificación laboral. El costo de esto es MUY alto: prestaciones, parafiscales (~52% sobre salario), aportes retroactivos, multas.

### Mitigaciones obligatorias para defensa
1. **T&C exigen multi-cliente** — el técnico debe declarar que tiene otros clientes/plataformas
2. **Sin horarios fijos**, sin uniformes obligatorios, sin asistencia obligatoria a capacitaciones
3. **Cobranza directa al cliente** (no Baird al técnico) → confirma autonomía económica
4. **Herramientas propias** del técnico (no entregadas por Baird)
5. **Logs de trabajo en otras plataformas** o clientes propios cada cierto tiempo
6. **Cláusula de no exclusividad** explícita y firmada
7. **Pólizas individuales** de responsabilidad civil del técnico

### Caso Rappi como precedente vivo
- Marzo 2025: Rappi firmó acuerdo con sindicato USMTT en Medellín (700 trabajadores)
- Mintrabajo dice "los contratos no son ilegales" pero hay presión política/judicial constante
- El modelo gig-economy en Colombia está en zona gris regulatoria

### Responsabilidad solidaria al consumidor (Ley 1480, Estatuto del Consumidor)
Aún siendo marketplace, la SIC y los jueces civiles pueden hacer corresponsable a Baird por:
- Daños del técnico al inmueble/equipo del cliente
- Servicio mal prestado
- No devolución de anticipo

**Mitigación:**
- Sistema de disputas robusto (ya existe `en_disputa`)
- Pólizas de cumplimiento por servicio
- Fianza de servicio reembolsable
- Reglas claras de evidencia (fotos, GPS, firma — ya implementadas)

---

## 3. Pasarelas de pago con split-payment en Colombia

| Pasarela | Split nativo | Comisión | Notas |
|---|---|---|---|
| **ePayco Pagos Divididos** | ✅ Sí (oficial) | 2.99% + $900 + IVA | Davivienda: 2.68% + $900. Documentación clara |
| Mercado Pago | ✅ Sí (madura) | 3.49% + IVA | La más usada en LatAm marketplaces |
| Wompi (Bancolombia) | ⚠️ Parcial (API "Third-Party Payments") | 2.85% + IVA | No es split nativo, hay que orquestarlo |
| dLocal | ✅ Sí | Negociable, 3-4% | Más para volumen alto |
| PayU | ⚠️ No nativo | 3.49% + IVA | Hay que hacer doble transacción |

**Recomendación inicial:** **ePayco Pagos Divididos** o **Mercado Pago Marketplace** para arrancar.

### Cómo funciona el split
1. Cliente paga $105.000 al endpoint de la pasarela
2. La pasarela retiene la comisión Baird ($21.000) en cuenta Baird
3. La pasarela transfiere $84.000 al técnico (cuenta bancaria registrada)
4. Baird factura IVA sobre la comisión al técnico al final del mes

---

## 4. Facturación electrónica DIAN

DIAN obliga facturación electrónica (Resolución 165/2023 actualizada en 2025). Implicaciones:

### Modelo Reseller (actual)
- Baird emite factura electrónica al cliente final con IVA discriminado
- Una factura por servicio
- Software: Alegra, Siigo, Loggro, ContaPyme integrados al app

### Modelo Marketplace
- **Técnico responsable de IVA** → emite factura al cliente
- **Técnico no responsable de IVA** → emite "documento equivalente" (boleta sin IVA)
- **Baird** → emite factura mensual al técnico por la comisión (con IVA)
- **Más complejo**: necesitas integrar emisión de facturas DEL TÉCNICO a través de Baird (white-label invoicing)
- Software con marketplace: **Alegra Marketplace** (existe), Siigo Empresarial

---

## 5. Comisiones de referencia (benchmarks 2025-2026)

| Plataforma | Tipo | Comisión |
|---|---|---|
| Rappi (envíos) | Última milla | 25-30% del valor pedido |
| Uber Eats Colombia | Comida | 30% |
| TaskRabbit (USA) | Servicios profesionales | 15% + 7.5% trust fee = ~22.5% |
| IguanaFix (LatAm) | Servicios técnicos | ~20-25% |
| Wonolo | Trabajo temporal | 15-25% |
| Treble.ai | Servicios B2B | n/a (modelo subscripción) |

**Sweet spot para servicios técnicos en Colombia:** **18-22%**.

Por debajo de 15% no cierra la cuenta de Baird. Por encima de 25% el técnico se rebela y cobra el servicio por fuera (riesgo de fraude).

---

## 6. Plan de migración técnica (alto nivel)

### Fase 0 — Hoy (push #1, en curso)
- [x] Tarifas fijas con IVA discriminado
- [x] Catálogo cerrado (cliente no fija precio)
- [x] Helpers de IVA reusables
- [x] Lavadora Secadora como nueva categoría

### Fase 1 — Schema BD (1-2 semanas)
- Migración: agregar a `solicitudes_servicio`:
  - `modelo_facturacion`: 'reseller' | 'marketplace'
  - `comision_baird_porcentaje`: numeric
  - `pago_tecnico_neto`: int (lo que recibe el técnico)
  - `total_cliente`: int (lo que paga el cliente)
  - `metodo_pago`: 'split' | 'directo'
  - `factura_id`, `documento_equivalente_id`
- Tabla `tecnicos`: agregar `regimen_tributario`, `responsable_iva`, `numero_rut`, `cuenta_bancaria_*`
- Tabla nueva `comisiones_baird` para rastrear cobros mensuales

### Fase 2 — Pasarela split (2-3 semanas)
- Integración ePayco Pagos Divididos o Mercado Pago Marketplace
- Webhooks de confirmación de pago + split exitoso
- UI de cobranza en `/cotizacion/{token}` para flow particular

### Fase 3 — Facturación electrónica (2-3 semanas)
- Integración con Alegra Marketplace o Siigo
- Emisión de doc. equivalente para no responsables IVA
- Factura mensual de comisión al técnico
- Reporte DIAN consolidado

### Fase 4 — T&C, contratos y onboarding (1-2 semanas, paralelo)
- Reescribir `legal/03-contrato-tecnico.docx` con cláusulas de no exclusividad, multi-cliente, autonomía
- Onboarding técnico ampliado: RUT, régimen, datos bancarios, declaración de multi-cliente
- Política de comisiones publicada

### Fase 5 — Migración gradual (2-3 semanas)
- Switch por solicitud (`es_garantia=false` y nuevo flag `usa_marketplace=true`)
- Activación piloto con N técnicos
- A/B test: comparar conversión y satisfacción reseller vs marketplace
- Rollout completo si métricas positivas

**Estimado total:** 8-13 semanas con un dev. 4-6 semanas con un equipo de 2.

---

## 7. Decisiones que deben tomarse antes de empezar

1. **% de comisión Baird** — Recomendación inicial: 20%. ¿Te alcanza? Modelar margen con tu contador.
2. **Pasarela** — ePayco vs Mercado Pago vs custom. Primer paso: pedir cotización a ambos.
3. **Garantía sigue como reseller** — Confirmar con marcas (Mabe, GE) que esto no afecta sus contratos.
4. **Categoría de servicios marketplace** — ¿Empezamos solo con Mantenimiento? ¿O incluimos Diagnóstico/Reparación desde el día 1?
5. **Política de no exclusividad** — Decidir si es soft (recomendación) o hard (límite de % de horas en Baird).
6. **Disputa de pagos** — Si el cliente paga al técnico vía split y queda insatisfecho, ¿quién devuelve qué? Necesitamos escrow temporal.

---

## 8. Recomendación final

**Push #1 (hoy):** Tarifas fijas + IVA discriminado. Es valor que sirve para AMBOS modelos. Lo ya hecho debe ir a producción.

**Sprint #2 (próximas 2 semanas):**
1. Llevar este documento a tu contador y abogado
2. Cotizar ePayco Pagos Divididos y Mercado Pago Marketplace
3. Modelar P&L del modelo marketplace con los números reales de Baird
4. Decidir GO/NO-GO con base en margen + apetito de riesgo legal

**Sprint #3+ (si GO):** Implementación por fases (sección 6).

---

## Fuentes

- [UVT 2026 — Resolución DIAN 000238](https://actualicese.com/uvt-2026/)
- [Régimen Simple Tributación 2026 DIAN](https://dian.com.co/regimen-simple-tributacion-colombia-2026/)
- [Ley 2466 de 2025 — Análisis Valencia Grajales](https://valenciagrajales.com/ley-2466-de-2025-analisis-de-la-reforma-laboral-para-plataformas-de-reparto-en-colombia/)
- [Acuerdo Rappi-USMTT marzo 2025 — Infobae](https://www.infobae.com/colombia/2025/03/14/rappi-cambiara-las-condiciones-laborales-en-colombia-tras-historico-acuerdo-con-el-sindicato-de-domiciliarios/)
- [ePayco Pagos Divididos](https://epayco.com/pagos-divididos/)
- [Wompi Pagos a Terceros API](https://docs.wompi.co/en/docs/colombia/introduccion-pagos-a-terceros/)
- [Comparativa pasarelas Colombia 2026](https://btodigital.com/pasarelas-pago-colombia-comparativa-guia-negocio/)
- [IVA en servicios mantenimiento — Gerencie](https://www.gerencie.com/servicios-de-mantenimiento-gravados-con-iva.html)
- [Servicios excluidos de IVA — Actualícese](https://actualicese.com/servicios-excluidos-de-iva/)
- [No responsables de IVA 2026 — Actualícese](https://actualicese.com/montos-para-ser-no-responsables-de-iva-en-2026/)
- [Reforma laboral 2026 — Finiquito Justo](https://finiquitojusto.com/derechos-laborales/reforma-laboral-colombia-ley-2466/)
