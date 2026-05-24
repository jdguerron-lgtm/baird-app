# Runbook cutover — lineablanca.bairdservice.com

**Fecha:** 2026-05-23
**Objetivo:** Migrar producción a `https://lineablanca.bairdservice.com` con `baird-app.vercel.app` vivo como red de seguridad. Sistema funcionando mañana.

---

## Principio rector de seguridad

**`baird-app.vercel.app` se mantiene VIVO y FUNCIONAL durante todo el cutover.** Es el rollback de un click para cualquier paso. Vercel no lo borra automáticamente al agregar el dominio custom.

---

## Estado al iniciar (checkpoint 2026-05-23)

| Paso | Estado | Reversible? |
|---|---|---|
| 1. Vercel: `lineablanca` → Production/main | ✅ Hecho | Sí, Edit → Preview → test |
| 2. CNAME exacto capturado: `85e801567623d44c.vercel-dns-017.com.` | ✅ Hecho | N/A |
| 3. SiteGround: borrar A `34.174.251.210` + crear CNAME | ⏳ Pendiente | Sí, ver §3 |
| 4. Verificar propagación DNS + SSL Vercel | ⏳ Pendiente | N/A |
| 5. Smoke test del app sirviendo desde lineablanca | ⏳ Pendiente | N/A |
| 6. Env var `NEXT_PUBLIC_APP_URL` en Production | ⏳ Pendiente | Sí, ver §6 |
| 7. Fix hardcoded URLs en código + commit + deploy | ⏳ Pendiente | Sí, ver §7 |
| 8. Re-subir 16 templates Meta con URLs nuevas | ⏳ Pendiente | Sí, ver §8 |
| 9. Cambiar webhook Meta al nuevo dominio | ⏳ Pendiente | Sí, ver §9 — el más crítico |
| 10. Verificar Supabase Auth redirect URLs | ⏳ Pendiente | Aditivo, sin riesgo |

---

## Rollback por paso

### §3 — SiteGround DNS

**Cambio:** borrar `A lineablanca 34.174.251.210` + crear `CNAME lineablanca 85e801567623d44c.vercel-dns-017.com.`

**Riesgo:** `lineablanca.bairdservice.com` no resuelve, pero **NO afecta** `bairdservice.com` (WordPress), email Google Workspace, ni `tienda` (Shopify) — son records DNS separados.

**Rollback:**
1. SiteGround → DNS Zone Editor → CNAME tab → borrar el CNAME nuevo
2. SiteGround → DNS Zone Editor → A tab → recrear A con valor `34.174.251.210`, TTL `300`
3. Propagación: ~5 min con TTL 300

**Tiempo total rollback:** <10 min

**Mitigación preventiva:** TTL 300 (5 min) en el CNAME nuevo desde el inicio. Si algo falla, se revierte rápido.

---

### §6 — Env var `NEXT_PUBLIC_APP_URL`

**Cambio:** `https://baird-app.vercel.app` → `https://lineablanca.bairdservice.com` en Vercel Production scope. Trigger redeploy.

**Riesgo:** scripts/código que lee la var generará URLs apuntando al dominio nuevo. Como `baird-app.vercel.app` sigue vivo y sirve la misma app, links viejos siguen funcionando — solo los NUEVOS apuntan al dominio nuevo.

**Rollback:**
1. Vercel → Settings → Environment Variables → editar `NEXT_PUBLIC_APP_URL` → revertir al valor anterior
2. Deployments → ultimo deploy → ⋯ → Redeploy
3. Tiempo: 3-5 min

---

### §7 — Hardcoded URLs en código

**Archivos a tocar (de la auditoría 2026-05-12):**
- `scripts/upload-templates.mjs:18` — `APP_URL` literal
- `src/lib/services/whatsapp.service.ts:316` — fallback `'https://baird.app'` (typo)
- `src/lib/services/whatsapp.service.ts:1395` — mensaje cancelación con URL hardcoded
- `src/app/api/admin/export/route.ts:8` — fallback (cambiar el default)
- `src/app/api/repuesto-recibido/route.ts:89` — fallback
- `src/app/politica-privacidad/page.tsx:112` — texto legal con dominio

**Estrategia:** mantener los fallbacks apuntando a `lineablanca.bairdservice.com` pero hacer que TODOS lean `process.env.NEXT_PUBLIC_APP_URL || '<nuevo>'`. Así si la env var falta, el fallback ya es correcto.

**Rollback:** `git revert <commit-hash> && git push`. Vercel redespliega automático. Tiempo: 5 min.

---

### §8 — WhatsApp templates Meta

**Cambio:** re-subir las 16 templates con URLs apuntando a `lineablanca.bairdservice.com`. Meta interpola las URLs en el momento del upload, así que las templates aprobadas hoy tienen `baird-app.vercel.app` baked-in.

**Estrategia segura:**
1. Subir templates **nuevas con sufijo `_v2`** (NO sobrescribir las existentes)
2. Esperar aprobación Meta (1-24h, normalmente <2h las simples)
3. Cuando todas aprobadas, deploy cambio en `whatsapp.service.ts` para que use los nombres `_v2`
4. **NO borrar** las viejas hasta 1 semana después sin issues

**Riesgo:** Meta rechaza alguna template. Mientras tanto, código sigue usando templates viejas con URLs viejas (que funcionan porque `baird-app.vercel.app` sigue vivo).

**Rollback:** revertir el commit que cambia los nombres a `_v2`. Templates viejas siguen aprobadas y funcionando.

---

### §9 — Webhook Meta — EL MÁS CRÍTICO

**Cambio:** Meta Business Manager → WhatsApp → Configuration → Webhooks → cambiar URL de `https://baird-app.vercel.app/api/whatsapp/webhook` → `https://lineablanca.bairdservice.com/api/whatsapp/webhook`.

**Riesgo:** si el nuevo endpoint falla la verificación o devuelve error, **Meta deja de entregar eventos inbound** (botones clickeados por clientes/técnicos, mensajes entrantes). Servicios en vuelo quedan paralizados.

**Pre-flight obligatorio antes de cambiar:**
1. ✅ DNS propagado y SSL Vercel verde
2. ✅ Smoke test del app pasando
3. ✅ `curl -X GET 'https://lineablanca.bairdservice.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=test123'` devuelve `test123` con HTTP 200
4. ✅ Templates `_v2` aprobadas (o decisión consciente de migrar webhook antes)

**Rollback inmediato (<2 min):**
1. Meta Business Manager → Webhooks → editar → restaurar `https://baird-app.vercel.app/api/whatsapp/webhook`
2. Meta empieza a entregar de nuevo

**⚠️ Eventos perdidos durante el switch:** Meta NO reentrega los eventos que falló mandar durante el outage. Si un cliente clickea "aprobar cotización" justo durante el switch y el webhook está en transición, ese evento se pierde. **Hacer este paso en ventana de tráfico bajo** (madrugada 2-5am COL).

---

## Plan de aborto total (emergencia)

Si algo sale muy mal y necesitamos reset completo, en orden:

1. **Meta webhook → `baird-app.vercel.app/api/whatsapp/webhook`** (1 min) — restaura entrega inbound
2. **Vercel env var `NEXT_PUBLIC_APP_URL` → `https://baird-app.vercel.app`** + redeploy (5 min) — restaura URLs en respuestas outbound
3. **Git revert del commit de URLs** (5 min) — restaura fallbacks viejos
4. **SiteGround DNS** — recrear A record `lineablanca → 34.174.251.210` (5 min DNS propagación con TTL 300) — opcional, solo si el dominio nuevo está causando problemas activos
5. **Vercel domain** — `lineablanca` se puede dejar conectado a Production aunque DNS no resuelva. No causa daño. O si querés limpieza, Edit → Remove.

**Tiempo total a estado pre-cutover:** ~15 min. Servicios afectados ese ratito: webhook inbound (mensajes/clicks de WhatsApp). Outbound (notificaciones que dispara la app) sigue funcionando porque usa el token de Meta directo.

---

## Validaciones obligatorias antes de declarar "funcionando"

Mañana, antes de irse del runbook:

- [ ] `Resolve-DnsName lineablanca.bairdservice.com -Server 8.8.8.8` → CNAME, no A
- [ ] `curl -I https://lineablanca.bairdservice.com` → HTTP 200, SSL válido
- [ ] Visita manual: `/`, `/solicitar`, `/registro`, `/admin/login`, `/cotizacion/<token-real>` (de una solicitud real)
- [ ] Crear una solicitud de prueba desde un número whitelist y verificar que llega el WhatsApp con link al dominio nuevo
- [ ] Logs Vercel sin error spam (Functions → Logs)
- [ ] Webhook Meta: enviarse a sí mismo un botón y verificar que Vercel recibe el POST y responde 200

Si alguna falla, plan de aborto.

---

## Snapshot del estado pre-cutover (para que el rollback sea fiel)

Capturado 2026-05-23 vía `Resolve-DnsName -Server 8.8.8.8`:

```
lineablanca.bairdservice.com  A  34.174.251.210         (← BORRAR + reemplazar)
bairdservice.com              A  34.160.17.71, 34.160.81.203, 34.120.190.48, 35.244.153.44  (← NO TOCAR, WordPress)
www.bairdservice.com          A  34.149.36.179, 35.190.31.54, 34.120.190.48, 34.149.120.3  (← NO TOCAR, WordPress)
tienda.bairdservice.com       A  23.227.38.65           (← NO TOCAR, Shopify)
```

NS: `ns1.siteground.net`, `ns2.siteground.net` (DNS authoritative en SiteGround).
