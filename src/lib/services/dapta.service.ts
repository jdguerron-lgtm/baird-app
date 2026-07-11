import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { isPhoneAllowed } from '@/lib/services/whatsapp.service'
import { phoneToDigits } from '@/lib/utils/phone'

/**
 * Dapta — segunda línea de voz IA.
 *
 * `iniciarLlamada` es el ÚNICO punto de salida hacia Dapta. NUNCA lanza: toda
 * ruta devuelve un objeto-resultado. El disparo está protegido por una cadena
 * de guardas (kill-switch → whitelist → horario hábil → tope de intentos →
 * cooldown atómico). Diseño POST-CALL: aquí solo disparamos; el resultado de
 * la conversación llega después a /api/dapta/webhook. Ver docs/DAPTA.md.
 *
 * Mientras DAPTA_ENABLED !== 'true' (default en Fase 0) el kill-switch corta
 * antes de cualquier efecto: 0 filas escritas, 0 POST a Dapta.
 */

export type Proposito = 'agendar' | 'cierre' | 'cotizacion' | 'repuesto' | 'presencia'

export interface IniciarLlamadaInput {
  solicitudId: string
  proposito: Proposito
  /** Teléfono del cliente (crudo o pipe); se normaliza con phoneToDigits. */
  telefono: string
  /** Variables dinámicas que recibe el agente Dapta (nombre, franjas, total…). */
  variables: Record<string, string | number | null>
}

export type SkipMotivo =
  | 'kill_switch'
  | 'no_whitelist'
  | 'fuera_horario'
  | 'tope_intentos'
  | 'cooldown'

export type IniciarLlamadaResult =
  | { ok: true; llamadaId: string; daptaCallId: string | null }
  | { ok: false; skipped: SkipMotivo }
  | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────────
// Config (env con defaults)
// ─────────────────────────────────────────────────────────────────
function envInt(name: string, def: number): number {
  const raw = process.env[name]
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? n : def
}

/** Hora actual (0–23) en America/Bogota (UTC-5, sin DST). */
function horaActualBogota(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const h = parts.find(p => p.type === 'hour')?.value ?? '0'
  // hour12:false puede dar '24' a medianoche en algunos runtimes → normalizar.
  return parseInt(h, 10) % 24
}

// ─────────────────────────────────────────────────────────────────
// iniciarLlamada
// ─────────────────────────────────────────────────────────────────
export async function iniciarLlamada(input: IniciarLlamadaInput): Promise<IniciarLlamadaResult> {
  try {
    const { solicitudId, proposito, telefono, variables } = input

    // 1. Kill-switch global.
    if (process.env.DAPTA_ENABLED !== 'true') {
      return { ok: false, skipped: 'kill_switch' }
    }

    // 2. Whitelist (mismo gate que WhatsApp — BAIRD_TEST_PHONE_WHITELIST).
    if (!isPhoneAllowed(telefono)) {
      console.warn(`⚠️ [Dapta][TEST-MODE] FILTRADO ${proposito} → ${phoneToDigits(telefono)} (no está en BAIRD_TEST_PHONE_WHITELIST)`)
      return { ok: false, skipped: 'no_whitelist' }
    }

    // 3. Horario hábil (no llamar de madrugada).
    const inicio = envInt('DAPTA_HORARIO_INICIO', 8)
    const fin = envInt('DAPTA_HORARIO_FIN', 19)
    const hora = horaActualBogota()
    if (hora < inicio || hora >= fin) {
      return { ok: false, skipped: 'fuera_horario' }
    }

    // 4. Tope de intentos.
    const maxIntentos = envInt('DAPTA_MAX_INTENTOS', 2)
    const { data: sol, error: solErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, llamada_intentos')
      .eq('id', solicitudId)
      .single()

    if (solErr || !sol) {
      return { ok: false, error: `solicitud ${solicitudId} no encontrada` }
    }

    const intentosActuales = (sol.llamada_intentos as number) ?? 0
    if (intentosActuales >= maxIntentos) {
      return { ok: false, skipped: 'tope_intentos' }
    }

    // 5. Cooldown atómico (cerrojo anti-doble-disparo). Solo una llamada puede
    //    ganar el lock por ventana: el ganador setea ultima_llamada_at=now() y
    //    el resto matchea 0 filas. El guard .lt(llamada_intentos) repite el tope
    //    a nivel de fila por si dos crons se solapan.
    const cooldownH = envInt('DAPTA_REINTENTO_COOLDOWN_HORAS', 4)
    const cutoffIso = new Date(Date.now() - cooldownH * 3600 * 1000).toISOString()
    const nowIso = new Date().toISOString()
    const nuevoIntento = intentosActuales + 1

    const { data: locked, error: lockErr } = await supabase
      .from('solicitudes_servicio')
      .update({ ultima_llamada_at: nowIso, llamada_intentos: nuevoIntento })
      .eq('id', solicitudId)
      .lt('llamada_intentos', maxIntentos)
      .or(`ultima_llamada_at.is.null,ultima_llamada_at.lt.${cutoffIso}`)
      .select('id')
      .maybeSingle()

    if (lockErr) {
      return { ok: false, error: `cooldown lock: ${lockErr.message}` }
    }
    if (!locked) {
      return { ok: false, skipped: 'cooldown' }
    }

    // 6. INSERT en llamadas (estado iniciando).
    const { data: llamada, error: insErr } = await supabase
      .from('llamadas')
      .insert({
        solicitud_id: solicitudId,
        proposito,
        proveedor: 'dapta',
        estado_llamada: 'iniciando',
        intento: nuevoIntento,
      })
      .select('id')
      .single()

    if (insErr || !llamada) {
      return { ok: false, error: `insert llamada: ${insErr?.message ?? 'sin id'}` }
    }
    const llamadaId = llamada.id as string

    // 7. Disparar a Dapta vía Public Route URL.
    //    [SUP-4] Contrato de la Public Route URL pendiente de confirmar con Dapta:
    //    acepta POST JSON con las variables dinámicas + metadata, y devuelve
    //    algún identificador de llamada (call_id). Centralizado aquí para que
    //    confirmar el contrato sea un cambio de un solo lugar.
    const routeUrl = process.env.DAPTA_PUBLIC_ROUTE_URL
    if (!routeUrl) {
      await marcarError(llamadaId, 'DAPTA_PUBLIC_ROUTE_URL no configurada')
      return { ok: false, error: 'DAPTA_PUBLIC_ROUTE_URL no configurada' }
    }

    let daptaCallId: string | null = null
    try {
      const resp = await fetch(routeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...variables,
          telefono: phoneToDigits(telefono),
          metadata: { solicitud_id: solicitudId, proposito, llamada_id: llamadaId },
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (!resp.ok) {
        const detalle = await resp.text().catch(() => '')
        await marcarError(llamadaId, `Dapta HTTP ${resp.status}: ${detalle.slice(0, 300)}`)
        return { ok: false, error: `Dapta HTTP ${resp.status}` }
      }

      // [SUP-4] forma de la respuesta a confirmar — probamos campos comunes.
      const json = await resp.json().catch(() => null) as Record<string, unknown> | null
      const rawId = json?.call_id ?? json?.callId ?? json?.id
      daptaCallId = typeof rawId === 'string' ? rawId : null
    } catch (err) {
      await marcarError(llamadaId, err instanceof Error ? err.message : String(err))
      return { ok: false, error: 'fallo al disparar la llamada en Dapta' }
    }

    // 8. Guardar dapta_call_id + estado en_curso.
    await supabase
      .from('llamadas')
      .update({ dapta_call_id: daptaCallId, estado_llamada: 'en_curso' })
      .eq('id', llamadaId)

    // 9. TODO Fase 1: notificarDisparoLlamada(solicitudId, proposito) a supervisores
    //    (reusa filtrarSupervisores extraído de whatsapp.service).

    return { ok: true, llamadaId, daptaCallId }
  } catch (err) {
    // iniciarLlamada NUNCA lanza.
    console.error('[dapta] iniciarLlamada error inesperado:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'error desconocido' }
  }
}

async function marcarError(llamadaId: string, motivo: string): Promise<void> {
  console.error(`[dapta] llamada ${llamadaId} → error: ${motivo}`)
  try {
    await supabase
      .from('llamadas')
      .update({ estado_llamada: 'error', resultado: { error: motivo }, finished_at: new Date().toISOString() })
      .eq('id', llamadaId)
  } catch (err) {
    console.error('[dapta] no se pudo marcar la llamada como error:', err)
  }
}
