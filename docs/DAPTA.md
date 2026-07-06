# Dapta — segunda línea de voz IA

> Llamadas automatizadas al cliente cuando WhatsApp no responde (agendar, verificar cita T-24h/T-2h, cierre + encuesta, cotización, repuesto).
>
> **Estado actual: Fase 0 desplegada pero APAGADA** — kill-switch global `DAPTA_ENABLED` (default off). La decisión de proveedor sigue abierta: Dapta cobra $99/mes fijos (úsalo-o-piérdelo); a <100 llamadas/mes conviene pago-por-uso (Retell ~$8–25/mes). **El doc de decisión, fases y costos es [`mejoras-futuras/segunda-linea-voz/README.md`](mejoras-futuras/segunda-linea-voz/README.md)** — este archivo solo resume lo operativo ya construido.

## Qué existe en código (Fase 0)

| Pieza | Archivo | Notas |
|---|---|---|
| Servicio de llamadas | `src/lib/services/dapta.service.ts` | `iniciarLlamada()` con guardas: kill-switch, horario hábil (TZ Bogotá), tope de intentos, cooldown, whitelist de teléfonos (`isPhoneAllowed`, reusa `BAIRD_TEST_PHONE_WHITELIST`) |
| Webhook POST-CALL | `src/app/api/dapta/webhook/route.ts` | Verifica firma HMAC (`DAPTA_WEBHOOK_SECRET`); idempotente por `dapta_call_id` (índice UNIQUE parcial) |
| Tabla `llamadas` | `supabase/migrations/20260602_dapta_llamadas.sql` | Un intento por fila: proposito, proveedor, estado, resultado JSONB, transcript. + columnas en `solicitudes_servicio`: `llamada_intentos`, `ultima_llamada_at` (cerrojo cooldown), `requiere_confirmacion_llamada` |
| Transiciones extraídas | `transiciones.service` | La lógica de transición de estados se extrajo de los endpoints para que la llamada IA y WhatsApp compartan el mismo camino |

## Env vars

La lista canónica con defaults está en `CLAUDE.md` § "Environment Variables" (bloque `DAPTA_*`): kill-switch, route URL del Flow, secreto del webhook, tope de intentos, cooldown, horario hábil y umbrales de silencio WhatsApp por propósito (agendar / cierre / cotización / repuesto).

## Para encenderlo

1. Decidir proveedor (ver análisis de costos en el README de mejoras-futuras — Fases 1–4 pendientes, ~4-5 días dev; +0.5-1 día si se pivota a Retell).
2. Configurar `DAPTA_PUBLIC_ROUTE_URL` + `DAPTA_WEBHOOK_SECRET` en Vercel.
3. Verificar que `20260602_dapta_llamadas.sql` esté aplicada (la Fase 2 — cierre + encuesta — requiere además `cumple_encuesta` de `20260510_no_show_protocolo.sql`).
4. `DAPTA_ENABLED=true` y redeploy. En dev, mantener `BAIRD_TEST_PHONE_WHITELIST` para no llamar a clientes reales.
