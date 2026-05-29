# Mejoras futuras

Backlog de iniciativas en discusión que **aún no están implementadas**. Cada proyecto vive en su subcarpeta con un `README.md` que captura: contexto, factibilidad, costos, decisiones pendientes y esfuerzo estimado.

## Inventario actual

| Iniciativa | Estado | Notas |
|---|---|---|
| [Supervisores + estado `repuesto_recibido`](supervisores-y-repuesto-recibido/plan-despliegue-2026-05-29.md) | **código completo, pendiente de desplegar** | Notificaciones WhatsApp a supervisores en cada cambio de estado (config por ámbito/marca/estados) + fix del bug "repuesto que llega tarde" (cliente reprograma fecha tentativa antes de pasar a `en_proceso`). Runbook de despliegue (migración → plantillas Meta → deploy) y decisión de producto pendiente (¿notificar en creación?) en el plan. Migración: `supabase/migrations/20260529_supervisores_y_repuesto_recibido.sql`. |

## Proyectos completados (registro histórico)

| Iniciativa | Completado | Notas |
|---|---|---|
| [Migración a dominio propio](migracion-dominio/README.md) | 2026-05-23 | Cutover ejecutado a `lineablanca.bairdservice.com`. Runbook + plan de rollback en `migracion-dominio/runbook-cutover-2026-05-23.md`. `baird-app.vercel.app` queda vivo como alias del mismo deployment. |
| [Mapa admin de servicios](mapa-admin/README.md) | 2026-05-23 | Implementado en `/admin/mapa`. Leaflet + OSM + clusters + 9 mejoras UI. Pipeline geocoding Google Maps en `/api/solicitar` y `editar-solicitud`. Fase 2 (GPS técnicos en vivo, heatmap, rutas) diferida. |

## Convenciones

### Cuándo va a `docs/mejoras-futuras/`
Cualquier idea/proyecto que esté en fase de discusión, research o diagnóstico, **antes** de empezar implementación. Sirve como memoria del razonamiento (factibilidad, opciones evaluadas, costos, decisiones que faltan tomar) para que cuando se retome no haya que reconstruir el contexto.

### Cuándo sale de `docs/mejoras-futuras/`
- **Si se aprueba e implementa:** la doc canónica del feature se promueve a `docs/` (ej. `docs/MAPA-ADMIN.md`) y la subcarpeta acá se elimina o reduce a un puntero (`Movido a /docs/MAPA-ADMIN.md`).
- **Si se descarta:** se borra la subcarpeta o se marca el README como `**Estado: descartado** — razón: ...` para preservar el por qué.

### Cómo se agrega un proyecto nuevo
1. `mkdir docs/mejoras-futuras/<nombre-kebab>/`.
2. Crear `README.md` con secciones: Concepto, Factibilidad, Stack, Fases, Costos, Decisiones pendientes, Riesgos, Esfuerzo.
3. Si hay docs auxiliares (research, diagnóstico, mockups), agregarlos en la misma subcarpeta.
4. Sumar fila al inventario de arriba con costo dev + costo operativo.
