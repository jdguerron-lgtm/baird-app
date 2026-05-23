# Subdomain Research — Baird Service Web App

**Fecha:** 2026-05-12
**Contexto:** Elegir el mejor subdominio bajo `bairdservice.com` para la web app pública
(formularios `/solicitar`, `/cotizacion`, `/horario`, etc.), maximizando indexación en
Google **y** en motores de IA (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews),
con foco en el mercado **colombiano**.

---

## TL;DR — Recomendación

| # | Subdominio | Caracteres | Cuándo usarlo |
|---|------------|-----------:|----------------|
| 🥇 | `lineablanca.bairdservice.com` | 11 | **Opción ganadora.** Mejor balance keyword + memorabilidad + marca. |
| 🥈 | `reparacion.bairdservice.com` | 10 | Si priorizas intención transaccional ("necesito reparar X"). |
| 🥉 | `serviciotecnico.bairdservice.com` | 15 | Si quieres el match exacto con la búsqueda #1 en Colombia (pero es largo). |

**Veredicto:** `lineablanca.bairdservice.com` — corto, memorable, sin guiones, 100% en
el lenguaje colombiano, y el término define la categoría completa (cubre lavadora,
nevera, estufa, horno, secadora, lavavajillas — exactamente lo que es Baird).

> ⚠️ **Aviso arquitectónico importante (leer "Caveat estratégico" al final):** Google
> trata los subdominios como **sitios separados**. Si tu objetivo es maximizar SEO,
> deberías considerar mover el app público a la **raíz** `bairdservice.com` y dejar
> los subdominios para áreas internas (admin, tecnico, blog). El subdominio que elijas
> tendrá que construir su propia autoridad desde cero.

---

## 1. Cómo investigué

Investigué cuatro dimensiones:

1. **SEO técnico en subdominios** — cómo Google los rankea en 2026.
2. **Keywords que usan los colombianos** — qué buscan realmente para reparar electrodomésticos.
3. **GEO/AEO (Generative/Answer Engine Optimization)** — cómo ChatGPT, Perplexity, Gemini eligen qué citar.
4. **Best practices de naming** — longitud, guiones, memorabilidad.

Las fuentes están al pie del documento.

---

## 2. Findings clave

### 2.1 SEO de subdominios (Google, 2026)

- **Google trata los subdominios como sitios separados.** El subdominio NO hereda
  automáticamente la autoridad del dominio raíz. Tiene que construir su propio perfil
  de backlinks y contenido. ([SE Ranking](https://seranking.com/blog/seo-for-subdomains/),
  [HostAdvice](https://hostadvice.com/blog/domains/seo-for-subdomains/))
- **Keywords en el subdominio** dan una señal contextual y mejoran el CTR, pero el peso
  como factor de ranking es bajo. Más importante: el contenido, los datos estructurados
  (schema) y los backlinks.
- **Guiones (`-`)** son neutros para ranking según Google, pero perjudican memorabilidad y
  branding. **Conclusión: evítalos** salvo que sin ellos la lectura se rompa.
- **Longitud óptima:** 6–14 caracteres. Hay un estudio (U. Pennsylvania) que muestra **2% de
  pérdida de tráfico por cada carácter después del séptimo**. Hard limit técnico: 63
  caracteres por label.

### 2.2 Keywords en Colombia — qué busca la gente

Analicé los SERPs reales del mercado colombiano. El landscape competitivo usa estas
combinaciones:

| Término | Frecuencia en SERPs CO | Intent | Volumen estimado |
|---|---|---|---|
| `linea blanca` | Muy alta | Categoría / informacional | Alto |
| `servicio tecnico` | **Muy alta** | Transaccional | **Muy alto** |
| `reparacion lavadoras` / `reparacion neveras` | Muy alta | Transaccional específico | Alto |
| `tecnico` + ciudad (Bogotá, Medellín) | Alta | Transaccional geo | Alto |
| `electrodomesticos` | Media | Categoría amplia | Medio |
| `reparacion electrodomesticos` | Alta | Transaccional | Alto |

**Insight clave:** Las empresas colombianas top dominan con combos tipo
`Servicio Técnico Línea Blanca` (lineablanca.co, tecniservicioslineablanca.com,
lineablancamantenimiento.com, etc.). Es el lenguaje natural del sector. Tu subdominio
debe encajar.

### 2.3 GEO / AEO — Indexación en IA

- **ChatGPT** usa principalmente datos de Bing API + crawls específicos (GPTBot,
  OAI-SearchBot). Visibilidad en Bing → visibilidad en ChatGPT.
- **Perplexity** tiene su propio bot (PerplexityBot) y prefiere contenido reciente y
  bien citado.
- **Google AI Overviews** aparece en 30-40% de las búsquedas; basado en el índice
  de Google.
- **El nombre del dominio importa menos que estos factores:**
  1. Schema markup (JSON-LD: LocalBusiness, Service, FAQPage, Offer)
  2. Contenido que responda preguntas directamente en los primeros 200 caracteres
  3. Frescura (ciclos de 7-14 días)
  4. `llms.txt` y `robots.txt` con permisos para GPTBot/PerplexityBot/Google-Extended
  5. Citaciones de terceros (menciones en foros, prensa, directorios)
- **Sin embargo,** un subdominio con keyword claro **mejora la confianza semántica** del modelo
  ("este sitio claramente es sobre X") y aumenta probabilidad de citación cuando el
  contenido es comparable.

Conclusión: el nombre del subdominio es una **señal débil** para IA. Es una optimización
**marginal**, no estratégica. Lo estratégico es el contenido + schema.

### 2.4 Best practices de naming

- ✅ Una sola palabra cuando sea posible.
- ✅ Sin guiones, sin números, sin acentos (los subdominios no soportan tildes bien — se
  convierten a Punycode `xn--...`, ilegible).
- ✅ 7-12 caracteres ideal; 15 es el límite práctico.
- ✅ Pronunciable en voz alta (test: "¿puedes dictarlo por teléfono sin deletrear?").
- ❌ Evita "app", "web", "site" — son genéricos y no aportan señal.
- ❌ Evita redundancia con el dominio raíz (ej. `service.bairdservice.com`).

---

## 3. Matriz de evaluación de candidatos

Escala 1-10. **Total ponderado:** SEO (25%) + GEO (15%) + Memorabilidad (20%) +
Branding (15%) + Keyword match colombiano (25%).

| Candidato | Largo | SEO | GEO | Memo | Brand | KW CO | **Total** |
|-----------|------:|----:|----:|-----:|------:|------:|----------:|
| `lineablanca.bairdservice.com` | 11 | 8 | 8 | 9 | 7 | 10 | **8.55** 🥇 |
| `reparacion.bairdservice.com` | 10 | 8 | 8 | 9 | 7 | 9 | **8.30** 🥈 |
| `serviciotecnico.bairdservice.com` | 15 | 9 | 8 | 6 | 6 | 10 | **8.15** 🥉 |
| `reparaciones.bairdservice.com` | 12 | 8 | 7 | 8 | 7 | 8 | 7.65 |
| `tecnicos.bairdservice.com` | 8 | 6 | 6 | 9 | 7 | 7 | 6.95 |
| `electrodomesticos.bairdservice.com` | 17 | 7 | 7 | 5 | 6 | 7 | 6.55 |
| `ServicioLineaBlanca.bairdservice.com` | 19 | 8 | 7 | 4 | 5 | 9 | 6.85 |
| `servicio.bairdservice.com` | 8 | 4 | 4 | 9 | 5 | 5 | 5.20 |
| `app.bairdservice.com` | 3 | 1 | 1 | 10 | 8 | 0 | 3.45 |

### Notas por candidato

**`lineablanca.bairdservice.com`** 🥇
- ✅ Define la categoría completa que cubre Baird (lavadora, nevera, estufa, horno, secadora, lavavajillas).
- ✅ "Línea blanca" es el término que usa la industria y los clientes colombianos.
- ✅ 11 caracteres, sin guiones, pronunciable, memorable.
- ✅ Match exacto con la búsqueda de categoría ("línea blanca Bogotá", "técnico línea blanca").
- ⚠️ No incluye verbo transaccional ("reparar"). Pero la categoría implica el servicio.
- ⚠️ Competencia con `lineablanca.co` (top SERP) — pero estás en otro nivel: subdominio de tu marca, no exact match domain.

**`reparacion.bairdservice.com`** 🥈
- ✅ Verbo transaccional puro. Mucha gente busca "reparación de lavadora" más que "línea blanca".
- ✅ 10 caracteres, claro.
- ⚠️ "Reparación" sin contexto puede aplicar a cualquier cosa (zapatos, autos, ropa). Menos específico.
- ⚠️ El subdominio + dominio juntos ("reparación bairdservice") sí dejan claro el sector.

**`serviciotecnico.bairdservice.com`** 🥉
- ✅ El término **#1 que usan las empresas colombianas** del sector.
- ✅ Match exacto con búsquedas de alta intención.
- ❌ 15 caracteres es el límite alto. Difícil de dictar por teléfono.
- ❌ "Service" + "ServicioTecnico" produce redundancia incómoda al leer la URL completa.

**`ServicioLineaBlanca.bairdservice.com`** (tu propuesta)
- ❌ **19 caracteres** — pasa del límite recomendado.
- ❌ La mezcla mayúsculas/minúsculas se pierde (los subdominios son case-insensitive). Aparece como `serviciolineablanca.bairdservice.com` → ilegible sin separadores.
- ❌ Con guión `servicio-linea-blanca.bairdservice.com` mejora lectura pero queda spammy.
- ✅ Sí incluye los dos términos top.
- **Veredicto:** descártalo. La idea es buena pero la ejecución pierde por longitud.

**`app.bairdservice.com`**
- ✅ Cortísimo, profesional, moderno.
- ❌ Cero valor SEO/GEO. "App" no aporta señal de qué hace.
- 👉 **Úsalo SOLO si dejas la web pública en la raíz** y este subdominio es para la versión instalable/PWA.

---

## 4. Caveat estratégico — el elefante en la sala

Toda esta investigación asume que vas a vivir en un subdominio. Pero **la mejor decisión SEO no es elegir el mejor subdominio: es no usar subdominio para el app público**.

### Por qué

Google trata los subdominios como sitios separados. Si pones tu app de mayor tráfico en
`lineablanca.bairdservice.com`:

- Esa URL tiene que construir su propia autoridad de cero.
- Si en el futuro `bairdservice.com` recibe backlinks (prensa, blogs, directorios), esos
  backlinks **no benefician** al subdominio.
- Cada vez que alguien linkee tu landing, ese juice se queda en la raíz, no en la app.

### Las dos arquitecturas a considerar

**Opción A — App público en la raíz (recomendado para max SEO):**
```
bairdservice.com              → app público (solicitar, cotización, horario, etc.)
admin.bairdservice.com        → panel admin (no indexar)
tecnico.bairdservice.com      → portal técnico (no indexar)
blog.bairdservice.com         → blog futuro (sí indexar)
```
✅ Toda la autoridad SEO se concentra en una sola URL.
✅ Cuando lleguen menciones de prensa o backlinks, todos ayudan al app.

**Opción B — App en subdominio (lo que pediste):**
```
bairdservice.com              → landing institucional/corporate
lineablanca.bairdservice.com  → app público (solicitar, etc.)
admin.bairdservice.com        → admin
tecnico.bairdservice.com      → técnico
```
⚠️ Divide autoridad. Necesitas SEO+contenido dedicado en ambos.
✅ Permite branding diferenciado entre "Baird (empresa)" y "Línea Blanca (servicio)".

> **Mi sugerencia honesta:** revisa si la "landing institucional" justifica una URL aparte.
> Si Baird Service ES la app, ponla en la raíz. Si Baird Service es un grupo más grande y
> esta app es solo una vertical, entonces sí tiene sentido el subdominio — y `lineablanca`
> es la mejor elección.

---

## 5. Recomendación final + plan de acción

### Si decides **subdominio** (escenario que planteaste):
👉 **`lineablanca.bairdservice.com`**

### Si decides **raíz**:
👉 **`bairdservice.com`** para el app público; mantén `app.bairdservice.com` solo si quieres una URL técnica adicional para integraciones.

### Plan de implementación (cualquier opción)

1. **DNS + Vercel:**
   - Agregar el dominio en Vercel project settings.
   - Configurar CNAME `lineablanca` → `cname.vercel-dns.com` en tu proveedor DNS de `bairdservice.com`.
   - Verificar SSL automático (Vercel emite cert Let's Encrypt).

2. **Actualizar variables de entorno:**
   ```bash
   # Vercel env vars (Production)
   NEXT_PUBLIC_APP_URL=https://lineablanca.bairdservice.com
   ```
   Esto afecta los CTAs en plantillas WhatsApp (`scripts/upload-templates.mjs` lee esta var
   para construir links a `/horario`, `/cotizacion`, etc.).

3. **301 redirects desde el dominio viejo:**
   ```
   baird-app.vercel.app/* → https://lineablanca.bairdservice.com/$1 (301)
   ```
   Hazlo en Vercel via `next.config.ts` `redirects()` o reglas de proveedor DNS.

4. **SEO técnico mínimo viable (independiente del subdominio):**
   - `robots.txt` — permite `GPTBot`, `OAI-SearchBot`, `PerplexityBot`, `Google-Extended`, `ClaudeBot`, `CCBot`.
   - `sitemap.xml` — generado automáticamente por Next 16.
   - JSON-LD schema en `/solicitar`: `LocalBusiness` + `Service` con `areaServed: Colombia`.
   - `<html lang="es-CO">` en `app/layout.tsx`.
   - `hreflang="es-co"` en `<head>`.
   - `<title>` y `<meta description>` específicos por página, con keywords del estudio (línea blanca, reparación, servicio técnico, ciudad).

5. **GEO/AEO mínimo viable:**
   - Crear `/llms.txt` listando URLs públicas relevantes y descripciones cortas.
   - FAQs con `FAQPage` schema en `/solicitar` y/o landing.
   - "Quick answer block" arriba del fold con frase tipo: "Baird Service conecta hogares en Colombia con técnicos verificados de línea blanca: lavadoras, neveras, estufas, hornos."
   - Lista de marcas atendidas (LG, Samsung, Mabe, Whirlpool, Haceb, Centrales) — los modelos de IA citan listas.

6. **Reagendar webhooks Meta:**
   - WhatsApp templates con CTA URLs ya construidos con `NEXT_PUBLIC_APP_URL` se actualizan solos al cambiar la env var.
   - Verificar que el webhook de Meta apunta al nuevo dominio (Business Manager > Configuration > Webhooks).

7. **Notificar a Google y Bing:**
   - Submit el `sitemap.xml` nuevo en Google Search Console y Bing Webmaster Tools.
   - Solicitar re-crawl del dominio raíz.

---

## 6. Diagnóstico rápido del app (instrucción del proyecto)

Como tu CLAUDE.md pide diagnóstico cada vez, ahí van **3 mejoras rápidas relacionadas con
este cambio**:

1. **`NEXT_PUBLIC_APP_URL` está hardcoded a Vercel preview** — cuando hagas el switch,
   asegúrate de actualizar en *Vercel Production env* y *Vercel Preview env* por separado.
   `src/lib/services/whatsapp.service.ts` y `scripts/upload-templates.mjs` la usan para
   construir links a `/aceptar/{token}`, `/horario/{token}`, etc.
2. **Falta `robots.txt` y `llms.txt`** — actualmente no tienes ninguno. Cualquiera de los
   dos subdominios elegidos parte de cero en indexación AI. Es lo primero a agregar
   después del switch.
3. **Falta JSON-LD schema** en `/solicitar` y `/` — el componente `terminos/page.tsx` ya
   existe; agrega `LocalBusiness` + `Service` schemas en `app/layout.tsx` o en una
   ruta específica. Es la palanca con **más ROI** para GEO en este momento, mucho más que
   el nombre del subdominio.

---

## Fuentes

- [SE Ranking — SEO for Subdomains](https://seranking.com/blog/seo-for-subdomains/)
- [HostAdvice — SEO for Subdomains: Pros, Cons & Strategies](https://hostadvice.com/blog/domains/seo-for-subdomains/)
- [OnCrawl — 6 Ways subdomains impact your SEO performance](https://www.oncrawl.com/technical-seo/subdomains-impact-seo-performance/)
- [Boston Institute of Analytics — SEO Best Practices 2026](https://bostoninstituteofanalytics.org/blog/seo-best-practices-that-actually-work-in-2026/)
- [LLMrefs — Generative Engine Optimization 2026 Guide](https://llmrefs.com/generative-engine-optimization)
- [Enrich Labs — GEO Complete 2026 Guide](https://www.enrichlabs.ai/blog/generative-engine-optimization-geo-complete-guide-2026)
- [NP Group — How to Get Indexed in ChatGPT, Gemini, Grok, Perplexity](https://www.npgroup.net/blog/get-website-indexed-chatgpt-gemini-perplexity-guide/)
- [Hashmeta — Structured Data for AI Search Engines](https://www.hashmeta.ai/en/blog/structured-data-for-ai-search-engines-the-complete-guide-to-schema-markup-for-chatgpt-perplexity-google-ai)
- [DomainDetails — Domain Name Length Guide](https://domaindetails.com/kb/getting-started/domain-name-length-guide)
- [Network Solutions — Should You Use a Hyphen in a Domain Name?](https://www.networksolutions.com/blog/should-you-use-a-hyphen-in-your-domain-name/)
- [Línea Blanca CO](https://www.lineablanca.co/) — SERP competitor analysis
- [Técnicos de Hogar Bogotá](https://tecnicosdehogar.com.co/) — SERP competitor analysis
- [Servicio Bogotá](https://serviciobogota.com.co/) — SERP competitor analysis
