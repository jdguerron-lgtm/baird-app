import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  esEmailAdmin,
  esEmailLectura,
  obtenerLecturaEmails,
  obtenerRolAdmin,
  tieneAccesoAdmin,
} from '@/lib/auth/adminEmails'
import {
  API_LECTURA_PERMITIDAS,
  debeBloquearSoloLectura,
  type ContextoGuard,
} from '@/lib/auth/soloLectura'

const ENV_KEYS = ['ADMIN_EMAILS', 'NEXT_PUBLIC_ADMIN_EMAILS', 'LECTURA_EMAILS', 'NEXT_PUBLIC_LECTURA_EMAILS'] as const
const backup: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    backup[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (backup[k] === undefined) delete process.env[k]
    else process.env[k] = backup[k]
  }
})

describe('rol lectura (logística) — allowlist', () => {
  it('default: logistica@encompasslatam.com es lectura, no admin', () => {
    expect(obtenerRolAdmin('logistica@encompasslatam.com')).toBe('lectura')
    expect(esEmailLectura('Logistica@EncompassLatam.com')).toBe(true)
    expect(esEmailAdmin('logistica@encompasslatam.com')).toBe(false)
    expect(tieneAccesoAdmin('logistica@encompasslatam.com')).toBe(true)
  })

  it('el admin por defecto sigue siendo admin y no lectura', () => {
    expect(obtenerRolAdmin('jdguerron@bairdservice.com')).toBe('admin')
    expect(esEmailLectura('jdguerron@bairdservice.com')).toBe(false)
  })

  it('un email fuera de ambas listas no tiene rol', () => {
    expect(obtenerRolAdmin('intruso@gmail.com')).toBeNull()
    expect(tieneAccesoAdmin('intruso@gmail.com')).toBe(false)
    expect(obtenerRolAdmin(null)).toBeNull()
    expect(obtenerRolAdmin(undefined)).toBeNull()
  })

  it('LECTURA_EMAILS / NEXT_PUBLIC_LECTURA_EMAILS reemplazan el default y se unen', () => {
    process.env.LECTURA_EMAILS = 'a@x.com, B@x.com'
    process.env.NEXT_PUBLIC_LECTURA_EMAILS = 'c@x.com'
    expect(obtenerLecturaEmails()).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
    expect(obtenerRolAdmin('logistica@encompasslatam.com')).toBeNull()
  })

  it('si un email está en ambas listas, gana admin', () => {
    process.env.ADMIN_EMAILS = 'dual@x.com'
    process.env.LECTURA_EMAILS = 'dual@x.com,solo@x.com'
    expect(obtenerRolAdmin('dual@x.com')).toBe('admin')
    expect(obtenerLecturaEmails()).toEqual(['solo@x.com'])
  })
})

describe('guard solo lectura — debeBloquearSoloLectura', () => {
  const ctx: ContextoGuard = { origen: 'https://lineablanca.bairdservice.com', supabaseUrl: 'https://abc.supabase.co' }
  const b = (url: string, metodo: string) => debeBloquearSoloLectura(url, metodo, ctx)

  it('deja pasar cualquier GET/HEAD/OPTIONS', () => {
    expect(b('/api/admin/supervisores', 'GET')).toBe(false)
    expect(b('https://abc.supabase.co/rest/v1/solicitudes_servicio?select=*', 'GET')).toBe(false)
    expect(b('https://abc.supabase.co/rest/v1/tecnicos', 'head')).toBe(false)
  })

  it('bloquea POST/PATCH/DELETE a la API propia', () => {
    expect(b('/api/admin/cambiar-estado', 'POST')).toBe(true)
    expect(b('/api/admin/cobro-final', 'POST')).toBe(true)
    expect(b('/api/admin/supervisores', 'PATCH')).toBe(true)
    expect(b('/api/carga-masiva', 'DELETE')).toBe(true)
    expect(b('/api/whatsapp/notify', 'post')).toBe(true)
    expect(b('https://lineablanca.bairdservice.com/api/admin/notas', 'POST')).toBe(true)
  })

  it('permite los exports de solo lectura aunque sean POST', () => {
    for (const p of API_LECTURA_PERMITIDAS) expect(b(p, 'POST')).toBe(false)
    expect(b('/api/admin/exportar-otro', 'POST')).toBe(true) // prefijo parecido no cuenta
  })

  it('bloquea writes directos a Supabase REST y Storage', () => {
    expect(b('https://abc.supabase.co/rest/v1/tecnicos?id=eq.1', 'PATCH')).toBe(true)
    expect(b('https://abc.supabase.co/rest/v1/especialidades_tecnico', 'POST')).toBe(true)
    expect(b('https://abc.supabase.co/rest/v1/rpc/algo', 'POST')).toBe(true)
    expect(b('https://abc.supabase.co/storage/v1/object/tecnicos-contratos/x.pdf', 'POST')).toBe(true)
    expect(b('https://abc.supabase.co/storage/v1/object/tecnicos-contratos/x.pdf', 'DELETE')).toBe(true)
  })

  it('permite auth (login/refresh/logout) y firmar URLs de storage', () => {
    expect(b('https://abc.supabase.co/auth/v1/token?grant_type=password', 'POST')).toBe(false)
    expect(b('https://abc.supabase.co/auth/v1/logout', 'POST')).toBe(false)
    expect(b('https://abc.supabase.co/storage/v1/object/sign/tecnicos-contratos/x.pdf', 'POST')).toBe(false)
  })

  it('no toca otros orígenes ni URLs inválidas', () => {
    expect(b('https://graph.facebook.com/v22.0/x/messages', 'POST')).toBe(false)
    expect(b('http://[::1', 'POST')).toBe(false)
  })

  it('sin supabaseUrl configurada no filtra Supabase pero sí la API propia', () => {
    const sin = { ...ctx, supabaseUrl: '' }
    expect(debeBloquearSoloLectura('https://abc.supabase.co/rest/v1/tecnicos', 'PATCH', sin)).toBe(false)
    expect(debeBloquearSoloLectura('/api/admin/notas', 'POST', sin)).toBe(true)
  })
})
