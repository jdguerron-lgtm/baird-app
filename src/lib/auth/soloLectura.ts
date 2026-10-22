/**
 * Guard de "solo lectura" para el shell `/admin/*` — 2026-10-13.
 *
 * Cuando la sesión es del rol `lectura` (logística), el layout admin instala este
 * guard sobre `window.fetch`. Toda request que pueda MODIFICAR datos se corta en
 * el navegador y devuelve un 403 sintético con un mensaje claro, sin llegar a la
 * red. Cubre de una vez las ~60 acciones del panel (API routes propias y los
 * writes directos de supabase-js, que resuelve `fetch` global en cada llamada).
 *
 * Qué bloquea (solo con método distinto de GET/HEAD/OPTIONS):
 *   - `/api/*` del mismo origen, salvo los exports de solo lectura listados en
 *     `API_LECTURA_PERMITIDAS` (son POST por el tamaño del body, pero no escriben)
 *     y la ÚNICA escritura permitida al rol lectura, `API_LECTURA_ESCRITURA_PERMITIDA`
 *     (seguimiento de facturación, decisión 2026-10-22 — match exacto de ruta).
 *   - Supabase `/rest/v1/*` (insert/update/delete/rpc) y `/storage/v1/*`
 *     (uploads/borrados), salvo `/storage/v1/object/sign*` (firmar URL = leer).
 *
 * Qué deja pasar siempre: `/auth/v1/*` (login, refresh, logout) y cualquier GET.
 *
 * IMPORTANTE: esto es UX y defensa en profundidad, NO la seguridad real. La
 * seguridad real está en el servidor: `verificarAdmin` rechaza al rol lectura en
 * todo endpoint que escribe. Los writes directos a Supabase dependen de RLS
 * (Fases 2–4 de docs/PLAN-RLS.md, pendientes).
 */

export const MENSAJE_SOLO_LECTURA =
  'Modo solo lectura: tu cuenta de logística puede consultar toda la información pero no modificarla.'

/** POST que NO escriben (generan archivos a partir de un filtro). El server también los admite para lectura. */
export const API_LECTURA_PERMITIDAS: readonly string[] = ['/api/admin/export', '/api/admin/liquidaciones']

/**
 * Única ESCRITURA que el rol lectura puede hacer (decisión 2026-10-22): marcar
 * un servicio completado como facturado / no aplica / pendiente. Es logística
 * quien captura la FV en Siigo y debe poder dejar constancia. El server
 * (`POST /api/admin/facturacion-estado` con `obtenerRolRequest`) es quien
 * realmente la autoriza; acá solo se deja pasar esa ruta EXACTA (sin
 * subrutas) para que el guard no la corte. Nada más se abre — ver
 * docs/SEGURIDAD.md § "Rol lectura".
 */
export const API_LECTURA_ESCRITURA_PERMITIDA: readonly string[] = ['/api/admin/facturacion-estado']

const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface ContextoGuard {
  /** `window.location.origin` */
  origen: string
  /** `NEXT_PUBLIC_SUPABASE_URL` (sin slash final). Vacío = no se filtra Supabase. */
  supabaseUrl: string
}

function metodoDe(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
  return (m || 'GET').toUpperCase()
}

function urlDe(input: RequestInfo | URL, origen: string): URL | null {
  try {
    if (typeof input === 'string') return new URL(input, origen)
    if (input instanceof URL) return input
    return new URL(input.url, origen)
  } catch {
    return null
  }
}

/**
 * Decide si una request debe bloquearse en modo solo lectura. Función pura
 * (testeable sin DOM).
 */
export function debeBloquearSoloLectura(
  url: string,
  metodo: string,
  ctx: ContextoGuard,
): boolean {
  if (METODOS_LECTURA.has(metodo.toUpperCase())) return false
  const u = urlDe(url, ctx.origen)
  if (!u) return false

  // API propia del mismo origen
  if (u.origin === ctx.origen && u.pathname.startsWith('/api/')) {
    if (API_LECTURA_ESCRITURA_PERMITIDA.includes(u.pathname)) return false
    return !API_LECTURA_PERMITIDAS.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))
  }

  // Supabase (anon key en el navegador)
  if (ctx.supabaseUrl && u.href.startsWith(ctx.supabaseUrl)) {
    const path = u.pathname
    if (path.startsWith('/auth/v1/')) return false
    if (path.startsWith('/storage/v1/object/sign')) return false
    if (path.startsWith('/rest/v1/') || path.startsWith('/storage/v1/')) return true
  }

  return false
}

function respuestaBloqueada(): Response {
  // `message` para que supabase-js lo muestre como `error.message`; `error`
  // para los `data.error` que muestran las páginas del admin.
  return new Response(
    JSON.stringify({ error: MENSAJE_SOLO_LECTURA, message: MENSAJE_SOLO_LECTURA, code: 'SOLO_LECTURA' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}

let avisoTimer: ReturnType<typeof setTimeout> | null = null

/** Toast mínimo inyectado en el DOM para que el aviso aparezca aunque la página no pinte el error. */
function mostrarAviso(): void {
  if (typeof document === 'undefined') return
  const ID = 'baird-aviso-solo-lectura'
  let el = document.getElementById(ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ID
    el.setAttribute('role', 'status')
    el.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;' +
      'background:#0f172a;color:#fff;font:600 13px/1.4 system-ui,sans-serif;' +
      'padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:92vw;text-align:center'
    el.textContent = `🔒 ${MENSAJE_SOLO_LECTURA}`
    document.body.appendChild(el)
  }
  if (avisoTimer) clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => el?.remove(), 4500)
}

let fetchOriginal: typeof window.fetch | null = null

/**
 * Instala el guard sobre `window.fetch`. Idempotente. Devuelve la función que lo
 * desinstala (para el cleanup del efecto del layout al cerrar sesión).
 */
export function instalarGuardSoloLectura(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (fetchOriginal) return desinstalarGuardSoloLectura

  const original = window.fetch.bind(window)
  fetchOriginal = original
  const ctx: ContextoGuard = {
    origen: window.location.origin,
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, ''),
  }

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const u = urlDe(input, ctx.origen)
    if (u && debeBloquearSoloLectura(u.href, metodoDe(input, init), ctx)) {
      mostrarAviso()
      return Promise.resolve(respuestaBloqueada())
    }
    return original(input, init)
  }) as typeof window.fetch

  return desinstalarGuardSoloLectura
}

export function desinstalarGuardSoloLectura(): void {
  if (typeof window === 'undefined' || !fetchOriginal) return
  window.fetch = fetchOriginal
  fetchOriginal = null
}
