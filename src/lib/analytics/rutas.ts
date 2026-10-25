/**
 * Qué rutas mide la analítica (GA4, Google Ads, Vercel) y cómo se limpia la
 * URL antes de mandarla (2026-10-24).
 *
 * Tres grupos:
 *
 * 1. SIN MEDICIÓN — portales internos (admin, técnico, supervisor). No son
 *    clientes: medirlos infla el tráfico y mete tokens en los informes. Ahí
 *    no se carga gtag ni se manda nada a Vercel Analytics. `/admin` incluye
 *    `/admin/establecer-clave?token_hash=…`, que llevaba el token de
 *    recuperación de clave a Google.
 *
 * 2. CON TOKEN — páginas del cliente que llegan por link de WhatsApp
 *    (`/servicio/{token}`, `/pago/anticipo/{token}?id=…`, …). Sí se miden
 *    (son parte del embudo), pero el token se reemplaza por `[token]` y la
 *    query se descarta, para que GA vea una sola fila por página y nunca el
 *    acceso del cliente.
 *
 * 3. PÚBLICAS — marketing (home, landings, /solicitar, /registro). Se miden
 *    tal cual, conservando SOLO los parámetros de campaña (utm_*, gclid, …):
 *    GA4 y Ads los necesitan en page_location para atribuir la visita.
 *
 * Si se crea una ruta nueva con token en la URL, agregarla aquí (y en
 * NOINDEX_PREFIXES de src/middleware.ts).
 */

/** Portales internos: no se carga ninguna analítica. Match por segmento. */
export const RUTAS_SIN_MEDICION = [
  '/admin',
  '/api',
  '/tecnico',
  '/aceptar',
  '/supervisor',
] as const

/** Páginas del cliente con token en la URL: se miden con la URL saneada. */
export const RUTAS_CON_TOKEN = [
  '/servicio',
  '/pago',
  '/cotizacion',
  '/horario',
  '/confirmar',
  '/verificar-paso',
  '/reprogramar-repuesto',
  '/receptor',
] as const

/**
 * Parámetros de campaña que se conservan en la URL que ve GA4 / Ads. Todo lo
 * demás de la query se descarta (puede traer ids de pago o tokens).
 */
export const PARAMS_CAMPANA = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'gad_campaignid',
  'fbclid',
  'msclkid',
  'ttclid',
] as const

export type ParamCampana = (typeof PARAMS_CAMPANA)[number]

/**
 * Parámetros que pueden quedarse en la URL pública que ve la analítica:
 * los de campaña más los que agrega Google solo (`_gl` = vinculador entre
 * dominios con la tienda, `srsltid` = resultados orgánicos de Merchant
 * Center, `gclsrc`/`dclid` = Ads/Display). No se guardan en la atribución.
 */
export const PARAMS_PERMITIDOS_URL: readonly string[] = [
  ...PARAMS_CAMPANA,
  '_gl',
  'srsltid',
  'gclsrc',
  'dclid',
]

function coincidePrefijo(pathname: string, prefijos: readonly string[]): boolean {
  return prefijos.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/** true en los portales internos, donde no se carga analítica. */
export function rutaSinMedicion(pathname: string): boolean {
  return coincidePrefijo(pathname, RUTAS_SIN_MEDICION)
}

/** true en las páginas del cliente con token en la URL. */
export function rutaConToken(pathname: string): boolean {
  return coincidePrefijo(pathname, RUTAS_CON_TOKEN)
}

// UUID (cliente_token, horario_token, …) o cualquier segmento largo tipo
// token (base64url / hex de 20+ caracteres). Los slugs de las landings llevan
// guiones entre palabras cortas y no tienen 20 caracteres seguidos sin guion.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_LARGO_RE = /^[A-Za-z0-9_]{20,}$/

/** Reemplaza los segmentos que parecen token por `[token]`. */
export function sanitizarRuta(pathname: string): string {
  return pathname
    .split('/')
    .map(seg => (UUID_RE.test(seg) || TOKEN_LARGO_RE.test(seg) ? '[token]' : seg))
    .join('/')
}

/**
 * URL segura para mandar a la analítica:
 * - ruta con tokens reemplazados,
 * - en rutas con token: sin query,
 * - en el resto: solo los parámetros de campaña,
 * - nunca el fragmento (#access_token de los links de recuperación).
 *
 * Si la URL no se puede parsear devuelve '' (mejor no mandar nada).
 */
export function sanitizarUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return ''
  }
  const conToken = rutaConToken(u.pathname)
  const limpia = new URL(`${u.origin}${sanitizarRuta(u.pathname)}`)
  if (!conToken) {
    for (const p of PARAMS_PERMITIDOS_URL) {
      const v = u.searchParams.get(p)
      if (v !== null) limpia.searchParams.set(p, v)
    }
  }
  return limpia.toString()
}

/**
 * true si la URL trae algo que no debe llegar a la analítica: es una ruta con
 * token, tiene un segmento que parece token, o lleva en la query algo que no
 * es un parámetro de campaña. En ese caso el page_view se manda a mano con la
 * versión saneada. Las URLs públicas limpias (el 99 % del tráfico) dan false
 * y quedan con la medición estándar de gtag.
 */
export function urlNecesitaSaneo(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (rutaConToken(u.pathname)) return true
  if (sanitizarRuta(u.pathname) !== u.pathname) return true
  const permitidos = new Set<string>(PARAMS_PERMITIDOS_URL)
  for (const k of u.searchParams.keys()) {
    if (!permitidos.has(k)) return true
  }
  return false
}
