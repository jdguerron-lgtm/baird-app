import { z } from 'zod'
import { FACTURACION_ESTADOS, type FacturacionEstado } from '@/types/solicitud'

/**
 * Seguimiento de facturación por servicio (2026-10-22) — lógica PURA del
 * endpoint `POST /api/admin/facturacion-estado` (docs/FACTURACION.md
 * § "Seguimiento facturado / no facturado"). Sin Supabase ni Next para que
 * las reglas se prueben solas.
 *
 * Reglas:
 *   - Solo aplica a solicitudes en estado `completada` (otros → 409).
 *   - `facturada` exige `factura_numero` (p. ej. FV-2-1524) → si falta, 400.
 *   - `pendiente` limpia número, fecha y quién; conserva la nota solo si viene
 *     en el body (si no, también se limpia).
 *   - `no_aplica` no exige número (se descarta si viene) y registra fecha/quién.
 *   - Siempre deja un evento `nota_admin` con payload.origen='facturacion_estado'
 *     y el antes/después, para que la ficha y el audit lo muestren.
 */

export const FACTURA_NUMERO_MAX = 40
export const FACTURACION_NOTA_MAX = 500

export const facturacionEstadoBodySchema = z.object({
  solicitud_id: z.string().uuid('solicitud_id inválido'),
  facturacion_estado: z.enum(FACTURACION_ESTADOS),
  factura_numero: z
    .string()
    .trim()
    .max(FACTURA_NUMERO_MAX, `Número de factura demasiado largo (máx ${FACTURA_NUMERO_MAX})`)
    .optional(),
  facturacion_nota: z
    .string()
    .trim()
    .max(FACTURACION_NOTA_MAX, `Nota demasiado larga (máx ${FACTURACION_NOTA_MAX})`)
    .optional(),
})

export type FacturacionEstadoBody = z.infer<typeof facturacionEstadoBodySchema>

/** Lo que el endpoint necesita leer de la solicitud antes de decidir. */
export interface SolicitudFacturacionActual {
  id: string
  estado: string | null
  facturacion_estado?: FacturacionEstado | string | null
  factura_numero?: string | null
  facturacion_nota?: string | null
}

/** Columnas que se escriben en `solicitudes_servicio`. */
export interface FacturacionUpdate {
  facturacion_estado: FacturacionEstado
  factura_numero: string | null
  facturada_at: string | null
  facturada_por: string | null
  facturacion_nota: string | null
}

export interface FacturacionEventoPayload {
  origen: 'facturacion_estado'
  antes: { facturacion_estado: string; factura_numero: string | null }
  despues: { facturacion_estado: FacturacionEstado; factura_numero: string | null }
  nota: string | null
}

export type ResultadoCambioFacturacion =
  | { ok: true; update: FacturacionUpdate; motivo: string; payload: FacturacionEventoPayload }
  | { ok: false; status: 400 | 409; error: string }

/** Texto corto del cambio para `solicitud_eventos.motivo` y el historial. */
export function describirCambioFacturacion(
  antes: string,
  despues: FacturacionEstado,
  numero: string | null,
  nota: string | null,
): string {
  const base =
    despues === 'facturada'
      ? `Facturación: facturada${numero ? ` (${numero})` : ''}`
      : despues === 'no_aplica'
        ? 'Facturación: no aplica'
        : 'Facturación: vuelve a pendiente'
  const desde = antes && antes !== despues ? ` · antes: ${antes}` : ''
  return `${base}${desde}${nota ? ` · ${nota}` : ''}`
}

/**
 * Decide qué escribir (o con qué error responder) a partir del estado actual
 * de la solicitud y el body validado. `actor` = email del admin / rol lectura.
 */
export function prepararCambioFacturacion(
  sol: SolicitudFacturacionActual,
  body: FacturacionEstadoBody,
  actor: string,
  ahora: Date = new Date(),
): ResultadoCambioFacturacion {
  if (sol.estado !== 'completada') {
    return {
      ok: false,
      status: 409,
      error: `Solo se marca la facturación de servicios completados (estado actual: ${sol.estado ?? '—'})`,
    }
  }

  const numero = body.factura_numero?.trim() || null
  const nota = body.facturacion_nota?.trim() || null
  const estadoActual = (sol.facturacion_estado as string | null | undefined) || 'pendiente'

  let update: FacturacionUpdate
  if (body.facturacion_estado === 'facturada') {
    if (!numero) {
      return { ok: false, status: 400, error: 'Para marcar facturada indica el número de la factura (p. ej. FV-2-1524)' }
    }
    update = {
      facturacion_estado: 'facturada',
      factura_numero: numero,
      facturada_at: ahora.toISOString(),
      facturada_por: actor,
      facturacion_nota: nota,
    }
  } else if (body.facturacion_estado === 'no_aplica') {
    update = {
      facturacion_estado: 'no_aplica',
      factura_numero: null,
      facturada_at: ahora.toISOString(),
      facturada_por: actor,
      facturacion_nota: nota,
    }
  } else {
    update = {
      facturacion_estado: 'pendiente',
      factura_numero: null,
      facturada_at: null,
      facturada_por: null,
      facturacion_nota: nota,
    }
  }

  const payload: FacturacionEventoPayload = {
    origen: 'facturacion_estado',
    antes: { facturacion_estado: estadoActual, factura_numero: sol.factura_numero ?? null },
    despues: { facturacion_estado: update.facturacion_estado, factura_numero: update.factura_numero },
    nota,
  }

  return {
    ok: true,
    update,
    motivo: describirCambioFacturacion(estadoActual, update.facturacion_estado, update.factura_numero, nota),
    payload,
  }
}
