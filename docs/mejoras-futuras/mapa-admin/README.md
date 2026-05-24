# Mapa admin de servicios

**Estado: ✅ COMPLETADO el 2026-05-23.** Implementado en `/admin/mapa`. Esta carpeta queda como registro histórico del descubrimiento y decisiones tomadas.

> 🆕 **Para entender qué se implementó**: ver `src/app/admin/mapa/page.tsx` + `MapView.tsx`, `src/lib/services/geocoding.service.ts`, `scripts/backfill-geocoding.mjs`, `supabase/migrations/20260523_geocoding_y_fecha_visita.sql`. Commit principal: `dcfbf2d`. Mejoras UI: `80b4819`. Fix TZ: `6d4dcb5`.
>
> **Diferencias vs el plan original (las 5 decisiones tomadas):**
> 1. Geocoding: ✅ Google Maps API (como recomendaba)
> 2. Fallback aproximadas: ✅ centro de ciudad + badge visual (20+ ciudades CO mapeadas)
> 3. Fecha "día de reparación": ✅ `fecha_visita_at` parseado desde `horario_confirmado` al confirmar — default UI = "esta semana" (hoy +7d)
> 4. Tile look: ✅ OSM Estándar default + Carto Positron (claro) + Carto Dark Matter (oscuro) — layer switcher en el mapa
> 5. GPS técnicos en vivo: ⏭️ diferido a Fase 2 (sigue pendiente)

**Bonus implementado más allá del plan original:**
- Leyenda flotante con conteo por estado/técnico
- Search box (cliente, dirección, equipo) — case + acento insensitive
- Refresh button sin perder filtros
- Auto-fit a bounds al cargar
- Cluster fix: radio 30 + disabled desde zoom 12

**Pendientes (Fase 2 / backlog):**
- GPS técnicos en vivo (datos ya existen en `gps_pings`)
- Heatmap de demanda por zona
- Polígono de zona de servicio por técnico
- Ruta sugerida técnico → servicio
- Restringir Google API key a SOLO Geocoding (hoy: Ninguno application restriction, 33 APIs allowed — billing alerts $10/$50/$100 mitigan)

---

## Resumen del descubrimiento (histórico)

**Conversación de descubrimiento:** sesión 2026-05-23 (Claude Code).

## Concepto

Una sección nueva en el panel admin (`/admin/mapa`) donde se ven todos los servicios cargados como pines geolocalizados sobre un mapa de Colombia.

- **Color por estado (default):** cada `estado` de `solicitudes_servicio` mapea a un color (reusando `ESTADO_ESTILOS`).
- **Toggle "por técnico":** color estable y determinístico por `tecnico_asignado_id` (hash → HSL) — permite ver visualmente cómo están distribuidas las asignaciones.
- **Click en pin** → panel de detalle a la **izquierda** (~30 % del ancho) con info de la solicitud, miniatura del estado, técnico asignado y link a `/admin/solicitudes/[id]`.
- **Filtros:** día de visita, estado (multi-select), técnico (multi-select).
- **Clustering automático** en zoom bajo (sin esto, Bogotá queda como un solo punto sólido).

Resuelve dos preguntas que hoy son **ciegas**:
1. ¿Dónde están concentrados mis servicios? ¿Algún barrio se está disparando?
2. ¿Las asignaciones del técnico Carlos están agrupadas o lo estoy mandando de un extremo de Bogotá al otro entre cita y cita?

## Bloqueante principal: no hay coordenadas

`solicitudes_servicio.direccion` es **texto libre** (`"Calle 53 #24-18, Chapinero, Bogotá"`). No existe `lat`/`lng`. Sin coordenadas no hay mapa — hay que resolver eso primero.

**Solución propuesta:**
1. Migración: agregar `direccion_lat double precision`, `direccion_lng double precision`, `direccion_geocodificada_at timestamptz` a `solicitudes_servicio`.
2. Pipeline de geocoding **fire-and-forget** en `/api/solicitar` y `/api/admin/editar-solicitud` (no bloquea la respuesta).
3. Script one-shot `scripts/backfill-geocoding.mjs` para las filas existentes (respetando rate limit del provider).

## Stack propuesto

| Componente | Recomendación | Por qué |
|---|---|---|
| Map library | **Leaflet + `react-leaflet`** | Sin API key, bundle ~150 KB, suficiente para admin interno. |
| Tiles | OpenStreetMap (default); Mapbox opcional para look más cuidado | OSM gratis sin límite práctico al uso del admin (1-5 usuarios). |
| Clustering | `react-leaflet-markercluster` | Drop-in. |
| **Geocoding** | **Google Maps Geocoding API** | Es la única que da precisión consistente en direcciones colombianas sucias. Mapbox y Nominatim fallan en ~30 % de direcciones fuera de Bogotá/Medellín. |

## Fase 1 — MVP (~4-5 días)

### Backend (~1.5 días)
1. Migración: columnas `direccion_lat`, `direccion_lng`, `direccion_geocodificada_at`.
2. Migración: columna estructurada **`fecha_visita_at timestamptz`** parseada desde `horario_confirmado` al confirmar (desbloquea filtro por día limpio y sirve a otros lugares que hoy parsean ese texto a mano).
3. `src/lib/services/geocoding.service.ts` + integración en `/api/solicitar` y `/api/admin/editar-solicitud`.
4. `scripts/backfill-geocoding.mjs` (respeta rate limit de 50 req/s de Google).

### Frontend (~2.5-3 días)
5. Página `/admin/mapa` con layout 30/70 (panel detalle / mapa).
6. Pins con color por estado / por técnico (toggle en top bar).
7. Filtros: día, estado, técnico.
8. Clustering en zoom bajo.
9. Detail panel al click + link al detail page del admin.
10. Code-splitting con `dynamic import` para que Leaflet solo cargue al entrar a `/admin/mapa`.

## Fase 2 — diferida (después de validar Fase 1)

| Feature | Costo extra esperado |
|---|---|
| GPS de técnicos en vivo (capa con ubicación actual de cada técnico desde `gps_pings`) | $0 — usa datos que ya guardás |
| Ruta sugerida técnico → servicio (Mapbox Directions o Google Directions) | $0 a la escala actual (free tiers amplios) |
| Heatmap de demanda por zona | $0 — render client-side |
| Polígono de zona de servicio por técnico | $0 — config en DB |
| Capa de alertas GPS (las flaggeadas en `/admin/gps-alertas`) | $0 — query existente |

## Costos

### Operativo (recurrente)

| Concepto | Hoy | A 500 solicitudes/mes | A 5 000/mes | A 50 000/mes |
|---|---|---|---|---|
| Geocoding (Google free tier $200/mes ≈ 40 000 req) | $0 | $0 | $0 | ~$50/mes |
| Tiles (OSM) | $0 | $0 | $0 | $0 |
| Vercel incremental | $0 | $0 | $0 | $0 |
| Supabase incremental | $0 | $0 | $0 | $0 |
| **Total operativo** | **$0** | **$0** | **$0** | **~$50/mes** |

Esencialmente gratis durante mucho tiempo. La factura real es el tiempo de desarrollo.

### Setup (one-time)
- Crear proyecto Google Cloud (free).
- Asociar tarjeta de crédito a GCP (requerido incluso en free tier — no cobra hasta exceder).
- Habilitar Geocoding API.
- Crear API key restringida al dominio (`baird-app.vercel.app/*` + dominio custom cuando exista).
- Agregar `GOOGLE_MAPS_API_KEY` a env vars de Vercel.
- Configurar alertas de billing en GCP a $10 / $50 / $100/mes (gratis).

### Dev time
~4-5 días de trabajo dedicado.

## Decisiones pendientes (antes de implementar)

1. **Geocoding provider** — Google (recomendado, ~$0 a tu escala) vs Mapbox (más barato a gran escala pero peor precisión en CO) vs Nominatim (gratis pero rompe en CO).
2. **Fallback para direcciones que no geocodifican** (~20-30 % en CO) — ¿pin gris en el centro de la ciudad con badge "ubicación aproximada"? ¿no mostrar?
3. **Qué fecha cuenta como "día de reparación"** — ¿solo `horario_confirmado`? ¿también `completado_at`? ¿permite rango (lunes-viernes de la semana)?
4. **Tile look** — OSM clásico vs Mapbox style (premium).
5. **GPS de técnicos en vivo** — confirmado para Fase 2 (no Fase 1).

## Riesgos / unknowns

- **Direcciones colombianas sucias.** ~20-30 % de las solicitudes van a tener entradas como `"barrio Las Margaritas, casa amarilla 3 cuadras del CAI"`. No geocodifican. Plan: fallback al centro de la ciudad con badge visual de "aproximada" + flag en BD.
- **Migración a `fecha_visita_at`.** Tocar el parser actual de `horario_confirmado` ("lunes 6 de mayo · 8am-12pm") tiene risk de regresión. Vale la pena hacerlo bien una vez — sirve a más lugares que solo el mapa.
- **API key leak.** Hay que restringir la key en GCP a tu dominio o cualquiera puede usarla desde el bundle JS. Es free pero hay que configurarlo.
- **Bundle size.** Leaflet suma ~150 KB al bundle del admin. Code-splitting obligatorio para que solo cargue en `/admin/mapa`.
- **Bills surpresa por bucle bug.** Si una integración llama el geocoder en bucle, podría disparar costos. Alertas de billing mitigan.

## Referencias

- Tablas relevantes: `solicitudes_servicio` (a extender), `gps_pings` (Fase 2), `tecnicos`, `evidencias_servicio`.
- Docs relacionadas:
  - `docs/SUPABASE.md` — columnas que faltarían agregar.
  - `docs/SEGURIDAD.md` § 4 — el mapa es admin-only, no expone PII fuera del admin.
  - `docs/ARQUITECTURA.md` § "Observabilidad" — patrón similar de fire-and-forget que usaríamos para el geocoding.
