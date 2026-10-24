<!-- Checklist de paso a producción (docs/PLAN-CIERRE-SEGURIDAD-Y-STAGING.md § 5 y docs/FLUJO-DESARROLLO.md § 3).
     Merge a main = deploy a producción. Un ítem aplicable sin marcar = no se mergea. -->

## Qué cambia y por qué

<!-- 2–4 líneas. Enlaza el doc o la decisión. -->

## Verificación

- [ ] CI en verde (`tsc`, `lint`, `test`).
- [ ] Probado en la **preview de Vercel contra staging** (URL: …). Flujos recorridos: …
- [ ] Si toca UI del técnico/cliente: probado en móvil (ancho ~400 px).

## Base de datos

- [ ] No hay migración **o**
- [ ] Migración aplicada en **staging**, `scripts/staging/02-inventario-schema.sql` sin diferencias inesperadas, y listada en `supabase/migrations/README.md`.
- [ ] Migración aplicada en **prod** en ventana (22:00–23:00 Bogotá, lun–jue) **antes** de este merge, con el rollback del archivo a mano.
- [ ] Si cambia RLS, policies o Storage: `node --env-file=.env.local scripts/verify-flows.mjs` antes y después.

## Integraciones

- [ ] Plantillas WhatsApp nuevas/cambiadas en `APPROVED` (`scripts/upload-templates.mjs --check`) y catálogo `docs/WHATSAPP_TEMPLATES.md` actualizado.
- [ ] Env vars nuevas creadas en Vercel **Production y Preview** y documentadas en `CLAUDE.md`.
- [ ] Si toca cobros (`[pagos]`): `npm run check:pagos` y revisión de `docs/WOMPI.md`.

## Documentación

- [ ] Docs del pipeline de `docs/INDEX.md` actualizados (ARQUITECTURA / FLOWS / SEGURIDAD / SUPABASE / GUIA-OPERACION según aplique).
- [ ] Si cambia una pantalla del admin: `docs/GUIA-OPERACION-LOGISTICA.md`.

## Después del merge (quien mergea)

- [ ] Ventana respetada (no 14:00–16:30; no :13–:17 ni :58–:02 si hay redeploy con env vars).
- [ ] 15 min de monitoreo: logs de runtime en Vercel, `/api/health`, el flujo tocado.
- [ ] Bitácora: `CLAUDE.md` § Current Status / doc del área / `docs/PLAN-CIERRE-SEGURIDAD-Y-STAGING.md` § 7 si es un cambio de seguridad.
