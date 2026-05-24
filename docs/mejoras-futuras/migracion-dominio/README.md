# Migración a dominio propio

**Estado: ✅ COMPLETADO el 2026-05-23.** Migración ejecutada a `lineablanca.bairdservice.com`. Esta carpeta queda como registro histórico del proceso.

> 🆕 **Para entender el cutover ejecutado** (qué se cambió, en qué orden, con plan de rollback): ver [`runbook-cutover-2026-05-23.md`](runbook-cutover-2026-05-23.md).
>
> Los archivos `research-subdominios-2026-05-12.md` y `diagnostico-2026-05-12.md` quedan como contexto histórico de las decisiones que llevaron al cutover.

---

## Resumen del proyecto (histórico)

**Fecha de la investigación:** 2026-05-12.
**Fecha del cutover:** 2026-05-23.

## Resumen

Hoy el app vive en `baird-app.vercel.app`. La idea es migrarla a un dominio propio bajo `bairdservice.com` (donde hoy corre el WordPress de marketing) para:

- Marca consistente entre marketing y app.
- Confianza en pasarelas de pago (Wompi, Mercado Pago, etc.).
- SEO/AEO bajo el dominio principal y sus subdominios.
- Soporte para emails transaccionales con dominio matching (mejor reputación de envío).

## Documentos en esta carpeta

| Archivo | Para qué |
|---|---|
| [`research-subdominios-2026-05-12.md`](research-subdominios-2026-05-12.md) | Análisis SEO/UX comparando opciones de subdominio para indexación en Google + motores de IA. Recomendación 🥇 `lineablanca.bairdservice.com`. Incluye caveat estratégico sobre root vs subdominio. |
| [`diagnostico-2026-05-12.md`](diagnostico-2026-05-12.md) | Por qué falló el primer intento de cutover en SiteGround (un A record que se creó automáticamente y está bloqueando el CNAME que Vercel necesita). Pasos para resolverlo. |

## Decisiones pendientes

1. **Subdominio definitivo vs root domain.**
   La recomendación del research es `lineablanca.bairdservice.com`, pero hay un **caveat arquitectónico**: Google trata los subdominios como sitios separados. Si SEO es prioridad, alternativa es mover WordPress a un subdominio (ej. `blog.bairdservice.com`) y poner el app en el root `bairdservice.com`. Decisión depende de cuánto pese SEO del app vs riesgo de mover WordPress.

2. **Cuándo ejecutar el cutover.**
   Requiere ventana corta de tráfico bajo: borrar el A record que SiteGround creó, agregar CNAME a Vercel, esperar propagación DNS (~minutos-horas), validar.

## Próximos pasos cuando se decida arrancar

1. Decidir subdominio definitivo (o root).
2. Configurar el dominio en Vercel → sección **Domains** del proyecto.
3. Aplicar los cambios DNS según `diagnostico-2026-05-12.md`.
4. Actualizar `NEXT_PUBLIC_APP_URL` en env vars de Vercel.
5. Validar redirects de `baird-app.vercel.app` → nuevo dominio (Vercel los hace automático).
6. Revisar plantillas WhatsApp y `scripts/upload-templates.mjs` por si alguna URL hardcodeada cambia (los botones de templates usan `${APP_URL}/...`, así que probablemente alcanza con cambiar la env var, pero validar).
7. Probar el smoke test (`scripts/verify-flows.mjs`) contra el dominio nuevo.

## Costos

- DNS: **$0** (incluido en SiteGround).
- Vercel: el plan actual incluye dominios custom — **$0 incremental**.
- Total: **$0/mes**.

## Riesgos

- **Downtime durante el cutover.** Minutos a horas según TTL del DNS actual. Mitigable bajando el TTL del A record problemático horas antes.
- **Cookies / OAuth.** Si en el futuro se agrega Supabase Auth con OAuth providers, los redirect URIs hay que registrar el dominio nuevo. Hoy no aplica.
- **WhatsApp templates.** Las URLs en los botones (`/aceptar/{token}`, etc.) son dinámicas con `${APP_URL}`. Cambiar la env var debería ser suficiente, pero hay que validar que Meta no haya hardcodeado el dominio en alguna plantilla aprobada.
