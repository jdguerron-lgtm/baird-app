import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente service_role — SOLO servidor. Bypasea RLS por completo.
 *
 * Reglas:
 *  - NUNCA importar desde un componente `'use client'` ni desde el browser.
 *  - La key NO lleva prefijo NEXT_PUBLIC a propósito (no debe viajar al bundle).
 *  - Usar en API routes, services y Server Components que toquen tablas con RLS
 *    activado (`solicitudes_servicio`). La validación del token de cliente/técnico
 *    la hace el código ANTES de la query (no la RLS).
 *
 * Inicialización perezosa: importar este módulo NO lanza ni crea el cliente; solo
 * lo hace en el primer uso real. Así es seguro mergearlo antes de configurar la
 * key (mientras nadie lo use, no cambia nada).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let _admin: SupabaseClient | null = null

function init(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin no puede usarse en el browser (expondría la service_role key).')
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'supabaseAdmin requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. ' +
        'Agregá SUPABASE_SERVICE_ROLE_KEY a .env.local y a todos los entornos de Vercel antes de activar RLS.',
    )
  }
  if (!_admin) {
    _admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _admin
}

/** Acceso explícito al cliente service_role. */
export function getSupabaseAdmin(): SupabaseClient {
  return init()
}

/**
 * Proxy perezoso para migrar server-side con un swap de import de una línea:
 *
 *   - import { supabase } from '@/lib/supabase'
 *   + import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
 *
 * Importar NO inicializa nada (no lanza). El primer uso real (`.from`, `.auth`…)
 * dispara `init()`. Es build-safe: crear el Proxy no llama a `init()`.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = init()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
