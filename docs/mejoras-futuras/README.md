# Mejoras futuras

Backlog de iniciativas en discusión que **aún no están implementadas**. Cada proyecto vive en su subcarpeta con un `README.md` que captura: contexto, factibilidad, costos, decisiones pendientes y esfuerzo estimado.

## Inventario actual

| Iniciativa | Estado | Costo dev | Costo operativo proyectado |
|---|---|---|---|
| [Mapa admin de servicios](mapa-admin/README.md) | Idea validada — 5 decisiones pendientes | ~4-5 días MVP | $0/mes a la escala actual (free tier Google Maps) |
| [Migración a dominio propio](migracion-dominio/README.md) | Diagnóstico + research hechos — decisión pendiente | ~1 día config | $0 (DNS) sobre hosting actual |

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
