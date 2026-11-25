import { describe, expect, it } from 'vitest'
import { fallasDe, revisarServicios, textoAlerta, type ResultadoServicio } from '@/lib/services/salud-servicios.service'

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}

/** fetch falso: elige la respuesta por fragmento de URL. */
function fetchFalso(rutas: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const k = Object.keys(rutas).find(k => url.includes(k))
    if (!k) throw new Error(`URL no esperada en el test: ${url}`)
    return rutas[k]()
  }) as typeof fetch
}

const ENV_COMPLETO = {
  WHATSAPP_PHONE_ID: '123', WHATSAPP_API_TOKEN: 'tok',
  WOMPI_PUBLIC_KEY: 'pub_prod_x',
  SIIGO_USERNAME: 'u', SIIGO_ACCESS_KEY: 'k',
  RESEND_API_KEY: 're_x',
  GOOGLE_MAPS_API_KEY: 'g',
}

const RUTAS_OK = {
  'graph.facebook.com': () => respuesta(200, { quality_rating: 'GREEN', status: 'CONNECTED' }),
  'production.wompi.co': () => respuesta(200, { data: { name: 'Baird Service' } }),
  'api.siigo.com/auth': () => respuesta(200, { access_token: 'abc', expires_in: 86400 }),
  'api.resend.com/domains': () => respuesta(200, { data: [{ name: 'bairdservice.com', status: 'verified' }] }),
  'maps.googleapis.com': () => respuesta(200, { status: 'OK' }),
}

const porNombre = (rs: ResultadoServicio[]) => Object.fromEntries(rs.map(r => [r.servicio, r]))

describe('revisarServicios', () => {
  it('todo configurado y sano → todos ok', async () => {
    const rs = await revisarServicios({ fetch: fetchFalso(RUTAS_OK), env: ENV_COMPLETO, pingSupabase: async () => {} })
    expect(rs.map(r => r.estado)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(fallasDe(rs)).toHaveLength(0)
  })

  it('sin credenciales → sin_configurar y no cuentan como falla (kill-switch)', async () => {
    const rs = await revisarServicios({ fetch: fetchFalso({}), env: {}, pingSupabase: async () => {} })
    const m = porNombre(rs)
    expect(m.supabase.estado).toBe('ok')
    for (const s of ['whatsapp', 'wompi', 'siigo', 'resend', 'google_maps']) expect(m[s].estado).toBe('sin_configurar')
    expect(fallasDe(rs)).toHaveLength(0)
  })

  it('HTTP 500 de un proveedor → falla con el status, sin tumbar a los demás', async () => {
    const rs = await revisarServicios({
      fetch: fetchFalso({ ...RUTAS_OK, 'production.wompi.co': () => respuesta(500, { error: 'boom' }) }),
      env: ENV_COMPLETO, pingSupabase: async () => {},
    })
    const m = porNombre(rs)
    expect(m.wompi.estado).toBe('falla')
    expect(m.wompi.detalle).toContain('HTTP 500')
    expect(m.whatsapp.estado).toBe('ok')
    expect(fallasDe(rs).map(r => r.servicio)).toEqual(['wompi'])
  })

  it('WhatsApp con calidad distinta de GREEN → falla', async () => {
    const rs = await revisarServicios({
      fetch: fetchFalso({ ...RUTAS_OK, 'graph.facebook.com': () => respuesta(200, { quality_rating: 'YELLOW', status: 'CONNECTED' }) }),
      env: ENV_COMPLETO, pingSupabase: async () => {},
    })
    expect(porNombre(rs).whatsapp).toMatchObject({ estado: 'falla' })
    expect(porNombre(rs).whatsapp.detalle).toContain('YELLOW')
  })

  it('Supabase que no responde → falla por timeout', async () => {
    const rs = await revisarServicios({
      fetch: fetchFalso(RUTAS_OK), env: ENV_COMPLETO, timeoutMs: 30,
      pingSupabase: () => new Promise(() => {}),
    })
    expect(porNombre(rs).supabase.estado).toBe('falla')
    expect(porNombre(rs).supabase.detalle).toContain('timeout')
  })

  it('Siigo sin token en la respuesta y Maps con status distinto de OK → fallas', async () => {
    const rs = await revisarServicios({
      fetch: fetchFalso({ ...RUTAS_OK, 'api.siigo.com/auth': () => respuesta(200, {}), 'maps.googleapis.com': () => respuesta(200, { status: 'REQUEST_DENIED' }) }),
      env: ENV_COMPLETO, pingSupabase: async () => {},
    })
    expect(fallasDe(rs).map(r => r.servicio).sort()).toEqual(['google_maps', 'siigo'])
  })
})

describe('textoAlerta', () => {
  it('lista solo las fallas, cuenta los OK y no incluye credenciales', () => {
    const rs: ResultadoServicio[] = [
      { servicio: 'supabase', estado: 'ok', ms: 10 },
      { servicio: 'wompi', estado: 'falla', ms: 20, detalle: 'HTTP 500' },
      { servicio: 'siigo', estado: 'sin_configurar', ms: 0 },
    ]
    const t = textoAlerta(rs, new Date('2026-10-26T12:00:00Z'))
    expect(t).toContain('1 servicio(s) con falla, 1 OK')
    expect(t).toContain('❌ wompi: HTTP 500')
    expect(t).not.toContain('siigo')
    expect(t).not.toMatch(/pub_prod|tok|re_x/)
  })
})
