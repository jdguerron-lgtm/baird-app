# Plan de captación digital — Bogotá (propuesta 2026-10-25)

> **Objetivo:** que cada cliente particular nuevo (servicio pagado) cueste **menos de $20.000**,
> validando si conviene anunciar **por marca** (Mabe, Whirlpool, Samsung, LG) o **genérico**
> (reparación de lavadoras/neveras). Foco Bogotá + Sabana.
> **Regla de presupuesto:** reinvertir como mínimo el 10 % de la utilidad de los servicios
> particulares.
>
> Propuesta, NADA ejecutado: no se creó ni activó ninguna campaña.

## 1. Punto de partida (datos reales)

### Lo que deja cada servicio particular (BD, misma lógica que `/admin/finanzas`)

| Periodo | Servicios completados | Ticket con IVA | Utilidad Baird por servicio | Margen sobre venta neta |
|---|---|---|---|---|
| Desde agosto 2026 | 22 | $339.088 | **$99.832** | 36 % |
| Octubre 2026 | 16 | $274.243 | $116.472 | 53 % |
| Por tipo: Mantenimiento | 12 | $163.898 | $57.624 | 42 % |
| Por tipo: Diagnóstico → reparación | 10 | $481.301 | $103.020 | 26 % |
| Por tipo: Reparación | 5 | $363.380 | $113.409 | 39 % |

- Utilidad = venta sin IVA − pago al técnico. No descuenta Wompi, nómina ni otros gastos.
- Para planear se usa **$90.000 de utilidad por servicio**: algo por debajo del promedio, por prudencia.
- **De cada 100 solicitudes particulares se completan ~55.** Últimos 120 días: 36 solicitudes → 19 completadas, 5 perdidas y 12 aún en curso.

**Lo que implica:**
- Un cliente que cuesta $20.000 es el **22 % de lo que deja su primer servicio**. Está bien, y sin contar que vuelva.
- Como solo ~55 % de las solicitudes terminan en servicio, **cada solicitud (lead) debe costar ≤ $11.000** para llegar a $20.000 por cliente.

### Lo que pasó con Google Ads (cuenta 262-918-6921)

- **Hoy no corre ningún anuncio:** las 3 campañas están en pausa. Por eso GA4 marca 0 sesiones pagadas.
- La campaña de búsqueda "Servicio Linea Blanca" (presupuesto $10.000/día, puja "Maximizar conversiones"):
  - Gastó **$1.131.638** en total: 681 clics a **$1.662 por clic**, CTR 5,2 %.
  - Hizo 18 conversiones: **$62.778 por conversión**, 3 veces la meta.
- **Por qué salió cara:** con concordancia amplia, la mayor parte de los clics vino de gente buscando
  **repuestos** ("repuestos mabe bogotá", "repuestos whirlpool originales", "whirlpool colombia"),
  no de gente buscando a un técnico. Las búsquedas de servicio fueron pocas:
  - "servicio técnico whirlpool bogotá": $5.288–$6.378 por clic, sin conversiones.
  - "servicio técnico mabe bogotá": $1.889 por clic.
  - "reparación de lavadoras whirlpool": $1.780–$2.170 por clic.

### Cuánta gente busca en Bogotá (Planificador de palabras clave, últimos 12 meses)

| Búsqueda | Búsquedas/mes | Competencia | Puja parte superior (baja–alta) |
|---|---|---|---|
| reparación de lavadoras | **1.000–10.000** | Baja | $1.421 – $7.062 |
| arreglo de lavadoras | 100–1.000 | Media | $1.948 – $8.619 |
| técnico de lavadoras | 100–1.000 | Media | $2.378 – … |
| mantenimiento de lavadoras | 100–1.000 | Media | $1.823 – $8.486 |
| reparación de neveras | 100–1.000 | Baja | $1.607 – $7.203 |
| técnico de neveras | 100–1.000 | Media | $2.239 – … |
| reparación lavadoras mabe / samsung / lg | 10–100 cada una | Media | $798 – $15.200 |
| "servicio técnico" + marca | Google no da datos (marca registrada) | — | Histórico propio: $1.900 (Mabe) – $6.400 (Whirlpool) |

**Lectura:** el volumen está en lo **genérico de lavadoras**, que además es el 70 % de lo que
piden los clientes hoy. Las búsquedas por marca son pocas y, en Whirlpool, caras (compiten con el
servicio oficial). Mabe es la excepción interesante: es barata y Baird sí presta el servicio de
garantía MABE.

## 2. Estrategia en 3 pilares

| Pilar | Qué | Costo | Por qué |
|---|---|---|---|
| **1. Google Ads búsqueda** | Prueba A/B genérico vs marca (abajo) | Presupuesto pagado | Es donde está la intención "necesito un técnico ya" |
| **2. Google Maps (Perfil de Empresa)** | Crear o verificar el perfil, zona de servicio Bogotá + Sabana, fotos reales, **pedir reseña al cerrar cada servicio** (link en el WhatsApp final) | $0 | "Técnico de lavadoras cerca de mí" se decide en el mapa; las reseñas bajan el costo de Ads |
| **3. Orgánico (SEO)** | Bloques 2 y 4 del estudio: títulos, landings de Mabe/Whirlpool, lavadora-secadora, mantenimiento, guías de fallas | $0 (desarrollo) | Clientes que no cuestan clic; también suben la calidad de la landing en Ads |

Facebook e Instagram quedan para una fase 2: sirven para mantenimiento preventivo, no para la
urgencia de "se me dañó la lavadora".

## 3. La prueba: marca vs genérico

Dos campañas de búsqueda **idénticas en todo menos en las palabras clave**, con el mismo
presupuesto, durante 4 semanas.

| | Campaña A — Genérico | Campaña B — Marca |
|---|---|---|
| Palabras clave (frase y exacta, **nunca amplia**) | reparación/arreglo/técnico/mantenimiento de lavadoras · neveras · secadoras (+ "a domicilio", "bogotá") | reparación/técnico/mantenimiento + Mabe, Whirlpool, Samsung, LG, Haceb, Electrolux |
| Peso del presupuesto interno | Lavadoras 60 %, neveras 25 %, secadoras 15 % | Mabe 40 %, resto 60 % |
| Destino | `/servicios/reparacion-{equipo}-bogota` | Landing por marca (**hay que crearlas**: Mabe y Whirlpool primero) |
| Negativas cruzadas | Excluye todas las marcas | Excluye las búsquedas sin marca |
| Etiqueta | `utm_campaign=genérico` | `utm_campaign=marca` |

**Igual en las dos campañas:**
- **Red:** solo Búsqueda de Google, sin Display ni socios de búsqueda.
- **Ubicación:** Bogotá + Soacha, Chía, Cajicá, Funza, Mosquera, Madrid y Cota, con la opción
  **"Presencia: personas que están en la zona"**, no "interés en".
- **Horario:** 6 am – 9 pm, todos los días.
- **Puja:** "Maximizar conversiones" las primeras 2 semanas. Desde la semana 3, **CPA objetivo
  de $15.000 por lead**; luego se baja hacia $11.000.
- **Conversión principal:** "Solicitud de servicio (formulario web)", que ya lleva valor e ID.
  `whatsapp_click` (importado desde GA4) va como conversión **secundaria**: solo se observa.
- **Anuncios:** 2 responsivos por grupo, con el precio visible ("Diagnóstico $84.000 con IVA"),
  "Técnico verificado: te llega su foto y nombre por WhatsApp" y "Pagas a Baird, nunca en
  efectivo". Extensiones de enlaces a las landings y de texto destacado (Bogotá y Sabana · Precio
  acordado antes de la visita).
- **Marcas en el texto del anuncio:** solo en las palabras clave. Google puede rechazar anuncios
  que usen "Mabe" o "Whirlpool" sin autorización. Para MABE se puede pedir la autorización de
  marca, porque Baird presta su servicio de garantía. Nunca decir "servicio oficial" de una marca
  que no lo es.

**Negativas de cuenta** (lo que hizo cara la campaña anterior): repuestos, repuesto, partes,
tarjeta, motor, transmisión, venta, comprar, precio de lavadora, nueva, usada, segunda mano,
manual, cómo usar, pdf, curso, empleo, trabajo, vacante, tienda, Alkosto, Éxito, Falabella,
Mercado Libre, gratis.

**Cómo se decide al final de las 4 semanas.** El criterio es el **costo por servicio pagado**,
no por clic ni por lead. Gracias a la medición nueva, cada solicitud guarda `origen.ultima.utm_campaign`.
- Si una campaña cuesta 25 % menos por cliente, se queda con el 70 % del presupuesto.
- Si la diferencia es menor al 25 %, se mantienen las dos.
- Si una campaña supera **$40.000 por cliente** con 15 o más solicitudes, se pausa.

## 4. Presupuesto

### La regla del 10 %

**Piso mensual = 10 % de la utilidad particular del mes anterior.** Octubre dejó $1.863.548 de
utilidad, así que el piso de noviembre es **$186.000**.

Con $1.660 por clic, $186.000 son ~110 clics al mes: no alcanza para comparar dos campañas. Por
eso la prueba arranca por encima del piso, como inversión con límite de pérdida.

### Fase 1 — Prueba (4 semanas)

| Concepto | Por día | Por mes |
|---|---|---|
| Campaña A — Genérico | $10.000 | $300.000 |
| Campaña B — Marca | $10.000 | $300.000 |
| Perfil de Empresa, reseñas, SEO | — | $0 |
| **Total** | **$20.000** | **$600.000** |

**Límite de pérdida:** si a mitad de mes (semana 2) el costo por lead pasa de $35.000 en las dos
campañas, se pausa y se revisan los términos de búsqueda antes de seguir.

### Qué se puede esperar del mes de prueba ($600.000)

| Escenario | Costo por clic | Clic → solicitud | Costo por lead | Solicitudes | Servicios (55 %) | **Costo por cliente** | Utilidad generada ($90k c/u) |
|---|---|---|---|---|---|---|---|
| Pesimista | $1.800 | 7 % | $25.700 | 23 | 13 | $46.700 | $1,2 M |
| Base | $1.600 | 10 % | $16.000 | 37 | 21 | $29.100 | $1,9 M |
| Optimista | $1.400 | 14 % | $10.000 | 60 | 33 | **$18.200** | $3,0 M |

**Cómo llegar a $20.000 por cliente:** clics de $1.400–1.500 y que **13–14 % de los clics
terminen en solicitud**. Hoy `/solicitar` convierte ~14 % de sus visitantes, pero la home retiene
solo 12 segundos. Por eso los anuncios **no deben llevar a la home**: deben llevar a la landing del
equipo, con el formulario y WhatsApp a la vista. Incluso en el escenario pesimista, cada peso
invertido genera ~2 pesos de utilidad.

### Fase 2 — Escalado (desde el mes 2)

**Presupuesto del mes = el mayor entre (a) 10 % de la utilidad particular del mes anterior y (b)
lo que sostenga el costo por cliente en la meta:**

| Costo por cliente de la semana | Acción |
|---|---|
| ≤ $20.000 | Subir el presupuesto 20 % por semana en la campaña ganadora |
| $20.000 – $30.000 | Mantener; limpiar términos y mejorar landing/anuncios |
| $30.000 – $40.000 | Bajar 20 % y revisar |
| > $40.000 (con ≥ 15 leads) | Pausar esa campaña |

Tope de seguridad: la pauta del mes no pasa del **30 % de la utilidad particular del mes
anterior** sin aprobación explícita.

## 5. Lo que hay que tener listo antes de encender (checklist)

1. ✅ Medición: origen del lead (gclid + UTM), conversión con valor e ID, eventos del embudo y propiedad Línea Blanca configurada (hecho 2026-10-24/25).
2. ⬜ **En Ads:** sufijo de URL final por campaña `utm_source=google&utm_medium=cpc&utm_campaign={genérico|marca}`. Sin esto no se puede comparar por servicio pagado.
3. ✅ **Landings de marca** (rama `feat/landings-marca-whatsapp`): `/servicios/servicio-tecnico-mabe-bogota` y `/servicios/servicio-tecnico-whirlpool-bogota` (contenido en `src/lib/constants/marcas-seo.ts`).
4. ✅ **`/solicitar` con título propio** (`src/app/solicitar/layout.tsx`) y CTA "Escríbenos por WhatsApp" en el hero y el cierre de todas las landings (`data-rastreo` = `landing_hero` / `landing_final`).
5. ⬜ **Perfil de Empresa en Google** creado o verificado, y link de reseña en el WhatsApp de cierre.
6. ⬜ Importar `whatsapp_click` de GA4 como conversión **secundaria** en Ads.
7. ⬜ Confirmar en Facturación de Ads el medio de pago y un presupuesto mensual tope.

## 6. Cómo se mide cada semana

- **Google Ads:** gasto, clics, CPC, leads por campaña.
- **BD:** servicios pagados por campaña. Esta consulta da el costo por cliente real al dividir el gasto de Ads por campaña entre las completadas:

```sql
SELECT origen->'ultima'->>'utm_campaign' AS campana,
       count(*)                                   AS solicitudes,
       count(*) FILTER (WHERE estado = 'completada') AS completadas
FROM solicitudes_servicio
WHERE NOT es_garantia
  AND origen->>'canal' = 'google_ads'
  AND created_at >= date_trunc('week', now()) - interval '7 days'
GROUP BY 1;
```

- **GA4 (Línea Blanca):** Informes → Adquisición de tráfico, filtrado por campaña. En
  `generate_lead` se puede cruzar con la dimensión **Reserva** (agendada o sin horario).
- **Fase 3** (cuando haya 30+ servicios atribuidos): subir a Google Ads como conversión offline
  "servicio completado" con su utilidad real, usando el gclid guardado. Así Google puja por
  clientes que pagan, no por formularios.
