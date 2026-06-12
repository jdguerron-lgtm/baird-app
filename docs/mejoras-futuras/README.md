# Mejoras futuras

Backlog de iniciativas en discusión que **aún no están implementadas**. Cada proyecto vive en su subcarpeta con un `README.md` que captura: contexto, factibilidad, costos, decisiones pendientes y esfuerzo estimado.

## Inventario actual

| Iniciativa | Estado | Notas |
|---|---|---|
| [Supervisores + estado `repuesto_recibido`](supervisores-y-repuesto-recibido/plan-despliegue-2026-05-29.md) | **código completo, pendiente de desplegar** | Notificaciones WhatsApp a supervisores en cada cambio de estado (config por ámbito/marca/estados) + fix del bug "repuesto que llega tarde" (cliente reprograma fecha tentativa antes de pasar a `en_proceso`). Runbook de despliegue (migración → plantillas Meta → deploy) y decisión de producto pendiente (¿notificar en creación?) en el plan. Migración: `supabase/migrations/20260529_supervisores_y_repuesto_recibido.sql`. |
| [Segunda visita (reprogramación sin repuesto)](segunda-visita/README.md) | **en discusión — opciones para revisar** | Gap verificado 2026-06-02: la llegada de repuesto (segunda visita CON pieza) ya funciona end-to-end; pero NO hay camino para agendar una segunda visita cuando la reparación necesita otro día y **no** requiere repuesto (`reparar` cierra en la misma visita; `esperar_repuesto` exige SKU). 4 opciones evaluadas (A: nuevo `siguiente_paso`; B: generalizar máquina; C: disparar desde portal; D: solo admin). Recomendación tentativa: Opción A. |
| [Segunda línea de voz IA](segunda-linea-voz/README.md) | **Fase 0 código completo (apagada), decisión de proveedor pendiente** | Llamadas automáticas cuando WhatsApp no responde (agendar, verificar citas ya aceptadas T-24h/T-2h, cierre + encuesta). Infra agnóstica al proveedor ya construida tras kill-switch `DAPTA_ENABLED=false` (extracción a `transiciones.service`, webhook idempotente, tabla `llamadas`). **Hallazgo 2026-06-03:** Dapta $99/mes es piso fijo úsalo-o-piérdelo (sin PAYG); a <100 llamadas/mes conviene pago-por-uso (**Retell ~$8–25/mes** vs $99). **Costo dev:** Fase 0 hecha, Fases 1–4 ~4-5 días (+0.5-1 día si se pivota a Retell). **Costo operativo:** $99/mes (Dapta) vs ~$8–25/mes (Retell PAYG). |

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
