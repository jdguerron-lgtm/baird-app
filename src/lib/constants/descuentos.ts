/**
 * Códigos de descuento (2026-10-19) — helpers PUROS y client-safe.
 *
 * Reglas de negocio (decididas 2026-10-19):
 *   - El cliente PARTICULAR escribe el código en /solicitar; en la solicitud
 *     queda un SNAPSHOT (`descuento_codigo`, `descuento_tipo`,
 *     `descuento_valor`) para que editar/desactivar el código después no
 *     cambie servicios ya reservados.
 *   - El descuento se aplica SOLO en el ÚLTIMO pago (saldo final). Anticipo
 *     (50% del precio) y abono de repuestos (50% del saldo BRUTO) se cobran
 *     como siempre.
 *   - `porcentaje` → % sobre el TOTAL del servicio (diagnóstico + servicio +
 *     repuestos, IVA incl.). `valor` → COP fijos. En ambos casos el monto se
 *     resta del saldo final.
 *   - Baird asume el descuento: `pago_tecnico` / `costo_tecnico` no cambian.
 *   - Tope: nunca supera el total y nunca deja el saldo negativo (sin
 *     devoluciones). Garantía: no aplica.
 *
 * Dónde se usa el monto: `descuentoClienteParaCobro()` en
 * `src/lib/constants/pago-cliente.ts` (único punto que lo calcula sobre una
 * solicitud) → `calcularMontoSaldo` (pagos.service), etapa de pago, página
 * /pago/saldo, finanzas y facturación.
 */

export type TipoDescuento = 'porcentaje' | 'valor'

export const TIPOS_DESCUENTO: readonly TipoDescuento[] = ['porcentaje', 'valor'] as const

/** Formato canónico del código: mayúsculas, dígitos, guion y guion bajo, 3–30. */
export const CODIGO_DESCUENTO_REGEX = /^[A-Z0-9_-]{3,30}$/

export interface DescuentoSnapshot {
  codigo: string
  tipo: TipoDescuento
  /** % (1–100) si tipo = porcentaje; COP si tipo = valor. */
  valor: number
}

/** Normaliza lo que escribe el cliente: trim + mayúsculas (sin validar). */
export function normalizarCodigoDescuento(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}

/** true si el texto ya normalizado cumple el formato canónico. */
export function esCodigoDescuentoValido(codigo: string): boolean {
  return CODIGO_DESCUENTO_REGEX.test(codigo)
}

/**
 * Lee el snapshot de descuento guardado en una solicitud. `null` si no tiene
 * código, si el tipo/valor no son válidos o si es garantía.
 */
export function descuentoDeSolicitud(sol: {
  es_garantia?: boolean | null
  descuento_codigo?: string | null
  descuento_tipo?: string | null
  descuento_valor?: number | string | null
}): DescuentoSnapshot | null {
  if (sol.es_garantia) return null
  const codigo = normalizarCodigoDescuento(sol.descuento_codigo)
  if (!codigo) return null
  const tipo = sol.descuento_tipo
  if (tipo !== 'porcentaje' && tipo !== 'valor') return null
  // numeric(12,2) llega como string desde PostgREST.
  const valor = typeof sol.descuento_valor === 'string' ? Number(sol.descuento_valor) : sol.descuento_valor
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null
  if (tipo === 'porcentaje' && valor > 100) return null
  return { codigo, tipo, valor }
}

/**
 * Monto (COP, entero) que descuenta un snapshot sobre un total dado.
 * Porcentaje → round(total × valor / 100); valor → min(valor, total).
 * Nunca negativo ni mayor que el total; 0 si el total o el descuento no
 * son válidos.
 */
export function montoDescuento(total: number, descuento: DescuentoSnapshot | null | undefined): number {
  if (!descuento) return 0
  if (!Number.isFinite(total) || total <= 0) return 0
  const t = Math.round(total)
  const bruto = descuento.tipo === 'porcentaje'
    ? Math.round(t * descuento.valor / 100)
    : Math.round(descuento.valor)
  return Math.max(0, Math.min(t, bruto))
}

/** "10%" o "$50.000" — para etiquetas en formulario, admin y página de pago. */
export function describirDescuento(descuento: DescuentoSnapshot): string {
  if (descuento.tipo === 'porcentaje') {
    const v = Number.isInteger(descuento.valor) ? descuento.valor : descuento.valor.toFixed(1)
    return `${v}%`
  }
  return `$${Math.round(descuento.valor).toLocaleString('es-CO')}`
}
