# COWORK.md — Guía operativa para Claude Code (Cowork Mode)

**Proyecto:** Baird Service
**Repo:** `jdguerron-lgtm/baird-app`
**Última actualización:** 5 de abril de 2026

---

## 1. Modelo de trabajo

El desarrollador principal edita **localmente en su PC** y hace push a GitHub.
Claude Cowork opera desde una sesión enlazada a la **carpeta local con todos los permisos**, y también tiene acceso a GitHub vía MCP.

### Regla de oro: nunca pisar el trabajo del otro

```
DESARROLLADOR                          CLAUDE COWORK
─────────────                          ─────────────
Edita en su PC (VS Code / editor)      Edita en su sesión enlazada
Push a main o feature branch    →      Siempre hacer pull/fetch ANTES de tocar código
                                       Trabaja en branches dedicados (claude/*)
                                       Push al branch dedicado
                                       Crea PR para revisión
```

---

## 2. Protocolo de sincronización

### Antes de empezar cualquier tarea

```bash
# 1. Obtener el estado actual del repo
git fetch origin
git status

# 2. Si hay cambios remotos en main, actualizar
git pull origin main

# 3. Crear o cambiar a un branch dedicado
git checkout -b claude/<descripcion-corta> origin/main
```

### Al terminar una tarea

```bash
# 1. Verificar que no haya conflictos
git fetch origin main
git rebase origin/main  # preferir rebase sobre merge

# 2. Lint + type check obligatorios
npm run lint
npx tsc --noEmit

# 3. Commit con mensaje claro (en inglés, body puede ser español)
git add <archivos-especificos>
git commit -m "fix: descripción corta del cambio"

# 4. Push al branch dedicado
git push -u origin claude/<branch-name>

# 5. Crear PR para revisión del desarrollador
# (solo si el desarrollador lo solicita)
```

### Si el desarrollador pushea mientras Claude trabaja

1. **Pausar** el trabajo actual
2. `git fetch origin main && git rebase origin/main`
3. Resolver conflictos si los hay
4. Continuar

---

## 3. MCPs disponibles (Model Context Protocol)

### GitHub MCP (`mcp__github__*`)

Acceso completo al repo `jdguerron-lgtm/baird-app`. Usar para:

| Acción | Herramienta MCP | Cuándo usar |
|--------|----------------|-------------|
| **Ver PRs abiertos** | `mcp__github__list_pull_requests` | Antes de empezar trabajo, verificar qué hay en revisión |
| **Crear PR** | `mcp__github__create_pull_request` | Al completar una tarea, si el dev lo pide |
| **Leer archivos remotos** | `mcp__github__get_file_contents` | Verificar estado de un archivo en `main` sin hacer pull |
| **Ver issues** | `mcp__github__list_issues` / `issue_read` | Revisar tareas pendientes |
| **Comentar en PR** | `mcp__github__add_issue_comment` | Explicar cambios o responder code review |
| **Ver commits** | `mcp__github__list_commits` | Verificar qué cambió desde la última sincronización |
| **Crear branch remoto** | `mcp__github__create_branch` | Si necesitas crear el branch directamente en GitHub |
| **Merge PR** | `mcp__github__merge_pull_request` | Solo con autorización explícita del dev |
| **Buscar código** | `mcp__github__search_code` | Buscar patrones en el repo remoto |
| **Monitorear PR** | `subscribe_pr_activity` | Escuchar CI, reviews, comentarios en tiempo real |

**Regla:** NUNCA hacer merge a `main` sin autorización explícita.

### Chrome / Navegador

Si está disponible, usar para:

- Verificar el deploy en Vercel (`https://baird-app.vercel.app`)
- Consultar documentación de APIs (Meta WhatsApp, Supabase, Next.js)
- Verificar estados de WhatsApp templates en Meta Business

### Otros MCPs (activar según necesidad)

- **Supabase MCP** — Si se habilita: consultas directas a la BD, verificar RLS, revisar Storage
- **Vercel MCP** — Si se habilita: ver deployments, logs, env vars

---

## 4. Skills y comandos disponibles

### Slash commands integrados

| Comando | Uso |
|---------|-----|
| `/commit` | Crear commit con mensaje bien formateado |
| `/simplify` | Revisar código modificado por calidad, reuso y eficiencia |
| `/loop <intervalo> <comando>` | Ejecutar tareas recurrentes (ej: `/loop 5m npm run lint`) |
| `/schedule` | Crear agentes remotos programados (cron) |

### Agentes especializados

| Agente | Cuándo usar |
|--------|-------------|
| `Explore` | Buscar archivos, entender cómo funciona algo en el codebase |
| `Plan` | Diseñar la estrategia antes de implementar cambios grandes |
| `general-purpose` | Investigación compleja, tareas multi-paso |

### Workflow recomendado para tareas

```
1. ENTENDER  →  Usar agente Explore para mapear archivos relevantes
2. PLANIFICAR →  Usar agente Plan si el cambio toca 3+ archivos
3. IMPLEMENTAR → Editar archivos con Edit/Write
4. VERIFICAR  →  npm run lint && npx tsc --noEmit
5. COMMITEAR  →  /commit con mensaje descriptivo
6. PUSH       →  git push -u origin claude/<branch>
7. PR         →  Solo si el dev lo pide
```

---

## 5. Convenciones de este proyecto

### Git

- **Branches de Claude:** `claude/<descripcion-kebab-case>`
- **Commits:** Conventional Commits en inglés (`fix:`, `feat:`, `refactor:`, `docs:`)
- **Nunca** pushear a `main` directamente
- **Nunca** `--force` push sin autorización
- **Nunca** `--no-verify` en commits

### Código

- Dominio en **español** (solicitud, tecnico, ciudad_pueblo)
- Técnico en **inglés** (function, interface, component)
- Siempre importar supabase de `src/lib/supabase.ts`
- Operaciones de BD que necesitan WhatsApp → usar API routes, NO actualizaciones directas desde el cliente
- Validación con Zod en API routes
- `enviarMensajeTexto()` para notificaciones de texto libre
- `enviarPlantilla()` para templates aprobados de Meta

### Archivos que NO tocar sin permiso

- `.env*` — Variables de entorno
- `supabase/migrations/` — Migraciones de BD (requieren ejecución manual)
- `next.config.ts` — Configuración de Next.js
- `middleware.ts` — Rate limiting y headers de seguridad

---

## 6. Estado actual del ciclo de vida del servicio

Cada paso envía WhatsApp automáticamente:

```
 ┌─────────────┐    WhatsApp al cliente: "Recibimos tu solicitud"
 │  SOLICITUD   │    WhatsApp a técnicos: "Nuevo servicio disponible"
 │  (pendiente) │
 └──────┬───────┘
        │ técnicos notificados
 ┌──────▼───────┐
 │  NOTIFICADA  │    (esperando que un técnico acepte)
 └──────┬───────┘
        │ primer técnico acepta
 ┌──────▼───────┐    WhatsApp al técnico: datos del cliente + link portal
 │   ASIGNADA   │    WhatsApp al cliente: datos del técnico asignado
 └──────┬───────┘
        │ técnico envía diagnóstico
 ┌──────▼───────┐    WhatsApp al cliente: "Diagnóstico listo, reparando..."
 │  EN_PROCESO  │
 └──────┬───────┘
        │ técnico sube evidencias de completación
 ┌──────▼────────┐   WhatsApp al cliente: link de confirmación
 │EN_VERIFICACION│
 └──────┬────────┘
        │ cliente responde
 ┌──────▼───────┐    WhatsApp al técnico: "Servicio confirmado" ✅
 │  COMPLETADA  │
 └──────────────┘
        ó
 ┌──────────────┐    WhatsApp al técnico: "Cliente reportó problema" ⚠️
 │  EN_DISPUTA  │
 └──────────────┘
```

---

## 7. API routes — referencia rápida

| Ruta | Método | Auth | Función | WhatsApp |
|------|--------|------|---------|----------|
| `/api/solicitar` | POST | No | Crear solicitud + notificar | Cliente + técnicos |
| `/api/diagnostico` | POST | portal_token | Guardar diagnóstico | Cliente |
| `/api/completar-servicio` | POST | portal_token | Enviar link confirmación | Cliente |
| `/api/confirmar-servicio` | POST | confirmacion_token | Confirmar/disputar | Técnico |
| `/api/whatsapp/notify` | POST | Bearer (admin) | Re-notificar técnicos | Técnicos |
| `/api/whatsapp/accept` | POST | token notificación | Aceptar servicio | Cliente + técnico |
| `/api/carga-masiva` | POST | Bearer (admin) | Upload Excel masivo | Clientes + técnicos |

---

## 8. Checklist antes de cada push

```
□ git fetch origin main (verificar no hay cambios nuevos)
□ npm run lint (0 errores)
□ npx tsc --noEmit (0 errores en archivos tocados)
□ git diff --stat (revisar que solo se modifican archivos relevantes)
□ No se incluyeron archivos sensibles (.env, credentials)
□ Commit message sigue conventional commits
□ Push a branch claude/*, NUNCA a main
```

---

## 9. Resolución de problemas comunes

| Problema | Solución |
|----------|----------|
| `npm run build` falla por Google Fonts | Error de red/TLS del entorno. No es error de código. Verificar con `tsc --noEmit` |
| Conflicto de merge | `git fetch origin main && git rebase origin/main`, resolver manualmente |
| WhatsApp template no encontrado | Verificar nombre exacto del template en Meta Business Suite |
| Supabase RLS bloquea query | Verificar que la política de la tabla permite la operación para `anon` o `authenticated` |
| `push` falla por network | Reintentar hasta 4 veces con backoff: 2s, 4s, 8s, 16s |

---

## 10. Contacto y decisiones

- **Decisiones de arquitectura** → Siempre consultar al desarrollador antes de implementar
- **Cambios en BD (migraciones, RLS)** → Solo proponer, nunca ejecutar sin autorización
- **Merge a main** → Solo con autorización explícita
- **Nuevas dependencias (npm install)** → Consultar primero
