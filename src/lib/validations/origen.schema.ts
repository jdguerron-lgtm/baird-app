import { z } from 'zod'
import { PARAMS_CAMPANA } from '@/lib/analytics/rutas'
import { clasificarCanal, type Atribucion, type Canal } from '@/lib/analytics/atribucion'

/**
 * Origen del lead que manda /solicitar (ver src/lib/analytics/atribucion.ts).
 * Llega del navegador, así que se valida con topes de largo y se descartan
 * las claves desconocidas. Un origen inválido NUNCA rechaza la solicitud: se
 * guarda null y el lead se crea igual.
 */
const valor = z.string().trim().max(300)

const paramsCampana = Object.fromEntries(PARAMS_CAMPANA.map(p => [p, valor.optional()])) as Record<
  (typeof PARAMS_CAMPANA)[number],
  z.ZodOptional<typeof valor>
>

const toqueSchema = z.object({
  ts: z.string().max(40),
  landing: z.string().max(300),
  referrer: z.string().trim().max(253).optional(),
  ...paramsCampana,
})

export const origenSchema = z.object({
  v: z.literal(1),
  primera: toqueSchema,
  ultima: toqueSchema,
})

/** Lo que se guarda en `solicitudes_servicio.origen`. */
export type OrigenSolicitud = Atribucion & {
  /** Canal del último toque no directo (el que se le acredita al lead). */
  canal: Canal
  /** Canal del primer contacto con el sitio. */
  canal_primera: Canal
}

/** Valida el origen del body y le agrega los canales. null si falta o es inválido. */
export function parsearOrigen(raw: unknown): OrigenSolicitud | null {
  const r = origenSchema.safeParse(raw)
  if (!r.success) return null
  const a = r.data as Atribucion
  return { ...a, canal: clasificarCanal(a.ultima), canal_primera: clasificarCanal(a.primera) }
}
