# Histórico — documentos deprecados (no actualizar)

Snapshots que dejaron de ser canónicos. Se conservan íntegros para no perder el razonamiento de cada etapa; **no se actualizan**. Para lo vigente, empezar siempre por [`docs/INDEX.md`](../INDEX.md).

| Archivo | Qué era | Reemplazado por |
|---|---|---|
| `FLUJOS-USUARIO-v1.md` | State machine v1 (marzo 2026): `pendiente → … → en_verificacion`, tarifas "Tipo C", formato Excel viejo de carga masiva. | `docs/FLOWS.md` + `docs/MAQUINA-DE-ESTADOS.md` + `docs/TARIFAS.md` |
| `COWORK.md` | Guía operativa para Claude Code en modo cowork (abril 2026): protocolo de ramas `claude/*`, reglas de permisos, diagrama con `EN_VERIFICACION`. Hoy el trabajo va directo a `main` y las convenciones viven en `CLAUDE.md`. | `CLAUDE.md` + `docs/GOTCHAS.md` |
| `CONTEXTO.md` | Contexto de negocio y convenciones de la etapa MVP. La parte de dominio sigue siendo válida como lectura; la tabla de secretos quedó incompleta (sin service_role, Wompi, cron). | `README.md` + `CLAUDE.md` § Code Conventions + `docs/SEGURIDAD.md` |
| `DIAGNOSTIC_2026-04-05.md` | Testing manual del 2026-04-05, anterior al customer-first scheduling v2 y a la migración de dominio. | `docs/GOTCHAS.md` + `docs/FLOWS.md` § "Gaps conocidos" |

Los punteros de raíz `API.md`, `ARQUITECTURA.md` y `MODULOS.md` (deprecados el 2026-07-05, sin contenido propio) se eliminaron el 2026-10-07; su contenido original sigue en `git log -- <archivo>`.
