# Flujo de desarrollo, pruebas locales y despliegue

> Cómo se lleva un cambio desde la idea hasta producción sin romper nada, y
> qué hay replicado en el PC para probar y para restaurar. Creado 2026-10-21.

## 1. Entornos

| Entorno | Dónde | Cómo se actualiza |
|---|---|---|
| **Producción** | Vercel, `https://lineablanca.bairdservice.com` (alias `baird-app.vercel.app`) | Automático con cada push/merge a `main` en GitHub (`jdguerron-lgtm/baird-app`). |
| **Preview** | Vercel genera una URL por cada rama pusheada | Automático con cada push a una rama distinta de `main`. Sirve para que otra persona pruebe sin instalar nada. |
| **Local** | `npm run dev` → `http://localhost:3000` | Manual. **Usa la misma base de Supabase que producción** (no hay BD de staging): todo lo que escribas en local queda en prod. |

Para no alertar técnicos ni clientes reales desde local, `.env.local` lleva
`BAIRD_TEST_PHONE_WHITELIST` con tu celular: los envíos WhatsApp a cualquier
otro número se omiten (ver `CLAUDE.md` § Environment Variables).

## 2. Carpetas en el PC

| Carpeta | Qué es | Para qué |
|---|---|---|
| `Documents/baird-app` | Repo de trabajo. Rama de feature activa. **Lo comparten varias sesiones de Claude en paralelo.** | Desarrollar. |
| `Documents/baird-app-main` | Clon limpio que sigue `origin/main` (= lo que está en producción). Tiene su propio `node_modules` y copia de `.env.local`. | Probar en local exactamente lo que hay en prod, o una rama antes de mergearla, sin tocar el repo de trabajo. |
| `Documents/baird-app-backups/*.bundle` | Respaldo completo del repo (todas las ramas, tags y commits) en un solo archivo. | Restaurar si se pierde el repo o GitHub. |

### Probar lo que está en producción (o una rama) en la réplica

```bash
cd "C:/Users/Juan Guerron/Documents/baird-app-main"
git pull                      # trae el main actual
npm ci                        # solo si cambió package-lock.json
npm test
npm run dev                   # http://localhost:3000
```

Para una rama: `git fetch origin && git checkout feat/lo-que-sea` y lo mismo.
Al terminar, `git checkout main` para dejarla en prod.

### Hacer un respaldo nuevo

```bash
cd "C:/Users/Juan Guerron/Documents/baird-app"
git bundle create "../baird-app-backups/baird-app-$(date +%Y-%m-%d_%H%M).bundle" --all
git bundle verify "../baird-app-backups/baird-app-<fecha>.bundle"
```

Restaurar: `git clone baird-app-<fecha>.bundle baird-app-restaurado` (luego
`git remote set-url origin https://github.com/jdguerron-lgtm/baird-app.git`).
El bundle no incluye `.env.local` ni `node_modules`: guarda `.env.local`
aparte (o reconstrúyelo desde Vercel → Settings → Environment Variables).

## 3. Ciclo de un cambio

1. **Rama nueva desde `main` al día:** `git fetch origin && git switch -c feat/nombre origin/main`.
2. **Código + docs juntos.** Sigue el pipeline de `docs/INDEX.md` § "Pipeline de actualización" (qué docs tocar según lo que cambias).
3. **Verificación local obligatoria antes de cualquier push:**
   ```bash
   npx tsc --noEmit && npm run lint && npm test
   ```
   Un test en rojo SÍ es regresión. Si tocaste UI, pruébala con `npm run dev`.
4. **Dependencias externas antes del merge:**
   - Migraciones de `supabase/migrations/` aplicadas en prod (`supabase/migrations/README.md`).
   - Plantillas WhatsApp nuevas en `APPROVED` (`node --env-file=.env.local scripts/upload-templates.mjs --check`).
   - Env vars nuevas creadas en Vercel.
5. **Commit y push de la rama** (`git add <archivos>` explícitos, nunca `git add -A`: puede haber trabajo de otra sesión en el árbol). Vercel publica un preview.
6. **PR a `main` en GitHub** y merge. Eso despliega a producción.
7. **Verificar en prod** (la página o el flujo tocado) y cerrar: `CLAUDE.md` § Current Status, `TODO.md` y, si aplica, la memoria de Claude.

Rollback: Vercel → Deployments → "Promote to Production" sobre el deploy
anterior (inmediato), y luego `git revert` del commit en `main`.

## 4. Reglas por trabajar con varias sesiones en el mismo repo

- Antes de cambiar de rama o de hacer `reset`/`stash`, mira `git status`: si hay
  cambios sin commitear que no son tuyos, **no toques el árbol**; crea un clon
  o usa `baird-app-main`.
- Un commit solo con tus archivos (`git add <ruta>`), con mensaje que diga qué y por qué.
- `git push` de la rama cuando quieras; **push o merge a `main` solo con OK explícito** (es un deploy a producción).
- Actualiza `main` local sin checkout: `git fetch origin main:main`.

## 5. Herramientas recomendadas (no instaladas hoy)

- **GitHub CLI** (`winget install GitHub.cli`): `gh pr create`, `gh pr merge`, `gh pr list` desde la terminal.
- **Vercel CLI** (`npm i -g vercel`): `vercel env pull .env.local` para reconstruir el `.env.local` desde Vercel, `vercel logs`.
