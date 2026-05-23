# Diagnóstico — Migración a lineablanca.bairdservice.com

**Fecha:** 2026-05-12
**Contexto:** Antes de cambiar producción a dominio propio + montar rama `test` aislada.

---

## TL;DR — Causa raíz del problema en SiteGround

Cuando creaste el subdominio en SiteGround, **se creó automáticamente un A record apuntando al servidor de SiteGround (`34.174.251.210`)**. Ese A record está bloqueando el CNAME que Vercel necesita.

Verificación con dig:

```
lineablanca.bairdservice.com.  A    34.174.251.210   ← record actual (SiteGround)
                                                       Vercel quiere un CNAME, no un A.
```

Y la página que está sirviendo hoy es la default de SiteGround (HTTP 200, `server: nginx`).

---

## Estado actual completo (verificado vía dig + curl + Vercel UI)

### DNS de bairdservice.com

| Record | Tipo | Valor actual | Notas |
|--------|------|--------------|-------|
| **NS** | NS | `ns1.siteground.net`, `ns2.siteground.net` | ✅ Editás DNS en SiteGround |
| **@** (root) | A | 4 IPs de Google Cloud (`35.244.x.x`, `34.149.x.x`) | WordPress vivo en Google Cloud — **NO TOCAR** |
| **www** | A | 4 IPs de Google Cloud | Mismo WP — **NO TOCAR** |
| **lineablanca** | A | `34.174.251.210` | ⚠️ Bloquea Vercel — **A BORRAR** |
| **tienda** | A | `23.227.38.65` | Shopify — confirmado, no tocar |
| **ftp** | A | `34.174.251.210` | SiteGround default, ignorable |
| **mail** | A | `34.174.251.210` | SiteGround default, ignorable |
| **MX** | MX | 5 records de Google (`aspmx.l.google.com`) | Google Workspace — **NO TOCAR** |
| **TXT** | TXT | SPF Google + verificaciones Google + Uber | **NO TOCAR** |

### Vercel — config de baird-app

| Dominio | Estado | Rama | Acción |
|---------|--------|------|--------|
| `baird-app.vercel.app` | ✅ Valid | Production (main) | Sigue funcionando, no se toca |
| `lineablanca.bairdservice.com` | ❌ **Invalid Configuration** | `claude/add-custom-favicon-6Lppl` (rama vieja, Feb 2026) | ⚠️ **Doble problema** — DNS roto + apunta a rama vieja sin todos los features actuales |

### Valor EXACTO que Vercel pide para el CNAME

```
Type:  CNAME
Name:  lineablanca
Value: 85e801567623d44c.vercel-dns-017.com.
```

(Vercel migró a CNAMEs únicos por dominio. El antiguo `cname.vercel-dns.com` sigue funcionando pero el nuevo es preferido — Vercel mismo lo dice en su UI.)

---

## Riesgos identificados (qué NO romper)

1. **WordPress en `bairdservice.com` raíz** — 4 IPs de Google Cloud. Si tocás los A records del root, rompés el sitio institucional.
2. **Email empresarial (Google Workspace)** — los MX van a `aspmx.l.google.com`. Tocar MX = perdés correo.
3. **`tienda.bairdservice.com` apuntando a Shopify** — A record `23.227.38.65`. No tocar.
4. **Records TXT de verificación** — Google site verification (×2) + Uber. Tocarlos rompe integraciones.
5. **El subdominio en SiteGround puede estar "hosted"** — no solo un DNS record. Si lo "creaste" desde Site Tools > Subdomains, hay que borrarlo desde ahí también (no solo del DNS Zone Editor). Si solo es un DNS record, se borra del Zone Editor y listo.

---

## Lo que hay que hacer en SiteGround (cuando entres)

**Camino A — si creaste un "subdominio hosted":**
1. Site Tools → Domain → Subdomains → buscar `lineablanca` → **borrar**
2. Eso borra el A record automáticamente + la config de nginx
3. Después, Site Tools → Domain → DNS Zone Editor → agregar CNAME:
   - Name: `lineablanca`
   - Value: `85e801567623d44c.vercel-dns-017.com.`
   - TTL: 300 (5 min, para propagar rápido mientras testeas)

**Camino B — si solo es un DNS record:**
1. Site Tools → Domain → DNS Zone Editor → encontrar el A record `lineablanca` → **borrar**
2. Crear CNAME nuevo:
   - Name: `lineablanca`
   - Value: `85e801567623d44c.vercel-dns-017.com.`
   - TTL: 300

**Cómo saber cuál camino aplicar:** entrá a Subdomains en Site Tools. Si aparece `lineablanca` listado, es Camino A. Si no, es Camino B.

---

## Bonus problema descubierto — Vercel apunta a rama vieja

Aunque arregles el DNS, lineablanca va a servir la rama `claude/add-custom-favicon-6Lppl` (Feb 2026). Esa rama NO tiene:
- Customer-first scheduling (`pendiente_horario`, `horario_token`)
- Admin pricing gate
- Self-service portal (`/servicio/{cliente_token}`)
- Customer schedule selection
- Self-service cancelar/reagendar
- Admin export Excel
- Verificación de paso post-diagnóstico
- Y muchos features más

**Solución para tu plan de "rama test":**
1. Crear rama `test` desde `main` (estado actual de producción)
2. En Vercel → baird-app → Settings → Domains → `lineablanca` → Edit → cambiar de `claude/add-custom-favicon-6Lppl` a `test`
3. Eso aprovecha la entrada existente en Vercel sin tener que crear nada nuevo

---

## Lugares hardcoded en código (auditoría completa)

Estos NO impactan el switch de dominio si vos solo cambiás `NEXT_PUBLIC_APP_URL`, **pero algunos sí**:

### Sí impactan (fallbacks usados si la env var no está)

| Archivo | Línea | Hardcoded actual |
|---------|-------|------------------|
| `scripts/upload-templates.mjs` | 18 | `const APP_URL = 'https://baird-app.vercel.app'` ⚠️ **NO LEE env var** — siempre usa este valor |
| `src/lib/services/whatsapp.service.ts` | 265 | Fallback `'https://baird.app'` — typo, debería ser otro |
| `src/lib/services/whatsapp.service.ts` | 1251 | Fallback hardcoded en mensaje de cancelación |
| `src/app/api/admin/export/route.ts` | 15 | Fallback OK |
| `src/app/api/repuesto-recibido/route.ts` | 85 | Fallback OK |
| `src/app/politica-privacidad/page.tsx` | 112 | Texto legal — mencionar dominio nuevo en T&C |

### No impactan (docs/demos)

- `demo-baird-service.html` (10+ refs) — demo público, no afecta usuarios
- `CLAUDE.md`, `TODO.md`, `WHATSAPP_SETUP.md`, etc. — docs internos
- `DIAGNOSTIC_2026-04-05.md`, `DOMAIN-RESEARCH-2026-05-12.md`, `COWORK.md` — docs históricos
- `ARCHITECTURE_GUIDE.html` — guía interna

### Error encontrado en doc previo

El research previo `DOMAIN-RESEARCH-2026-05-12.md` línea 253 dice:
> *"WhatsApp templates con CTA URLs ya construidos con NEXT_PUBLIC_APP_URL se actualizan solos al cambiar la env var."*

**Esto es falso.** El script `upload-templates.mjs` interpola `${APP_URL}` al momento del upload, así que Meta tiene la URL completa baked-in en cada plantilla. Para que los botones apunten al nuevo dominio **hay que re-subir las plantillas con `_v2` o `_test` en el nombre**.

---

## Lugares OFF-platform que también tienen el dominio

| Lugar | Configuración actual | Acción al migrar |
|-------|---------------------|------------------|
| Meta Business Manager → WhatsApp → Webhook | `https://baird-app.vercel.app/api/whatsapp/webhook` | Re-apuntar al final (solo cuando todo verde) |
| 16 plantillas Meta con botones URL | URLs `https://baird-app.vercel.app/{path}/{{token}}` | Re-subir cada una con sufijo `_v2` o `_test` |
| Supabase Auth → URL Configuration | (a verificar) | Agregar nuevo dominio a Redirect URLs |
| Supabase Storage → CORS | Públicos hoy, sin restricción de origen | Probablemente OK, verificar igualmente |
| Vercel → Environment Variables | `NEXT_PUBLIC_APP_URL=https://baird-app.vercel.app` | Cambiar por branch (Production vs Preview) |

---

## Plan para post-reu (orden recomendado)

### Fase 0 — destrabás SiteGround (15 min, ahora)
1. Entrás a SiteGround → identificás Camino A o B
2. Borrás el A record de `lineablanca` (o el subdomain hosted)
3. Creás el CNAME a `85e801567623d44c.vercel-dns-017.com.`
4. Esperás 5-30 min de propagación. Verificás con `dig CNAME lineablanca.bairdservice.com`

### Fase 1 — entorno test aislado (~1h)
5. Crear rama `test` desde `main`: `git checkout main && git pull && git checkout -b test && git push -u origin test`
6. En Vercel: cambiar `lineablanca` de la rama favicon a la rama `test`
7. En Vercel Env Vars (Preview, scope: branch=test):
   - `NEXT_PUBLIC_APP_URL=https://lineablanca.bairdservice.com`
   - `BAIRD_TEST_PHONE_WHITELIST=573134951164` (solo tu número)
8. Confirmar que `lineablanca.bairdservice.com` sirve la rama test con env vars de test

### Fase 2 — plantillas Meta paralelas (1-24h por aprobación, hacer en paralelo)
9. Crear copia de `scripts/upload-templates.mjs` → `upload-templates-test.mjs`:
   - Cambiar `APP_URL` a `https://lineablanca.bairdservice.com`
   - Renombrar todas las plantillas con sufijo `_test` (ej: `nueva_solicitud_test_v1`)
10. Subirlas: `node --env-file=.env.local scripts/upload-templates-test.mjs`
11. Esperar aprobación de Meta (1-24h por plantilla, casi siempre <2h las simples)

### Fase 3 — webhook (decisión)
**Importante:** Meta solo permite UN webhook URL por número de WhatsApp. Opciones:
- **Mantener webhook en producción** → el entorno test NO recibe respuestas inbound (botones, mensajes de cliente). Solo podés probar outbound. **Recomendado mientras producción esté viva.**
- **Cambiar webhook a test** → producción deja de recibir respuestas. ⚠️ NO HACER mientras producción esté en uso.

### Fase 4 — mejoras de seguridad (rama test, semanas)
12. RLS en las 5 tablas con ❌ (ver `CLAUDE.md`)
13. Signed URLs en storage para PII (`tecnicos-documentos`)
14. Service role client para operaciones privilegiadas
15. Auth check en API routes admin
16. Fix race conditions documentadas en `aprobar-cotizacion`, `confirmar-horario`, cron
17. Refactor columna generada para `cotizacion_token` (matar antipattern JSONB filter)

### Fase 5 — cutover (después de validación completa)
18. Cambiar env vars de Production a `NEXT_PUBLIC_APP_URL=https://lineablanca.bairdservice.com`
19. Re-subir plantillas Meta sin sufijo `_test` (las "definitivas" v_next)
20. Cambiar webhook Meta a nuevo dominio
21. En Vercel → Settings → Redirects: `baird-app.vercel.app` → `302` (no 301) a `lineablanca.bairdservice.com`
22. Después de 1-2 semanas sin issues, subir el 302 a 301

---

## Lo que necesito de vos cuando vuelvas de la reu

1. **Acceso a SiteGround** (te logueás vos, yo inspecciono después)
2. **Confirmación de qué hacer con `baird-app.vercel.app` long-term:**
   - ¿Lo dejamos como alias forever?
   - ¿Lo redirige 301 al nuevo dominio?
3. **Confirmación de si la rama `claude/add-custom-favicon-6Lppl` se puede ignorar** (parece código viejo de Feb)
4. **Confirmación de si querés Supabase separado para test o compartido con BAIRD_TEST_PHONE_WHITELIST**

---

## Resumen ejecutivo en 3 líneas

1. **Problema en SiteGround:** A record viejo de SiteGround en `lineablanca` bloquea el CNAME de Vercel. Hay que borrarlo y crear el CNAME a `85e801567623d44c.vercel-dns-017.com.`.
2. **Problema bonus en Vercel:** El dominio apunta a una rama vieja (Feb 2026, antes del customer-first flow). Hay que apuntarlo a la rama `test` (que aún no existe).
3. **Plan tu rama test:** sólido. Único gotcha: webhook Meta es único por número → entorno test no podrá recibir respuestas inbound mientras producción esté viva. Outbound sí.
