import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import {
  confirmarHorarioSolicitud,
  confirmarServicioCliente,
  procesarAprobacionCotizacion,
  reprogramarRepuestoSolicitud,
  type TransicionResult,
} from '@/lib/services/transiciones.service'
import type { Proposito } from '@/lib/services/dapta.service'

// Las transiciones pueden disparar notificarTecnicos (varios segundos).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/dapta/webhook
 *
 * Recibe el resultado POST-CALL de Dapta al colgar la llamada. NUNCA confía en
 * Supabase del lado de Dapta: correlaciona por dapta_call_id contra la fila que
 * NOSOTROS insertamos en `llamadas`, y de ahí toma solicitud_id + proposito
 * (no dependemos de que Dapta espeje la metadata — [SUP-3] resuelto).
 *
 * Garantías:
 *  - Verifica firma (HMAC header) o token en query string. [SUP-2]
 *  - Idempotente: claim atómico por dapta_call_id (estado_llamada).
 *  - Carrera Dapta vs WhatsApp: delega a la MISMA fn de transición, cuyo guard
 *    atómico de estado convierte la segunda vía en no-op.
 *  - Responde 200 SIEMPRE (evita tormentas de reintento de Dapta).
 *
 * NOTA: la forma exacta del payload está sin confirmar con Dapta ([SUP-1]) y
 * toda esa asunción vive aislada en parseDaptaPayload — confirmarla es un
 * cambio de un solo lugar.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // 1. Autenticación (firma HMAC o token en query). [SUP-2]
    if (!autenticado(req, rawBody)) {
      console.warn('[dapta webhook] firma/token inválido — ignorado')
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    // 2. Parsear payload (asunciones [SUP-1] aisladas aquí).
    const p = parseDaptaPayload(rawBody)
    if (!p || !p.daptaCallId) {
      console.warn('[dapta webhook] payload sin call_id — ignorado')
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    // 3. Claim idempotente: pasa a 'procesando' solo desde un estado no-terminal
    //    y no-en-curso-de-proceso. Un único webhook gana; los duplicados ven
    //    'procesando'/'procesado' → 0 filas → no-op.
    const { data: claim } = await supabase
      .from('llamadas')
      .update({ estado_llamada: 'procesando', resultado: p.raw })
      .eq('dapta_call_id', p.daptaCallId)
      .neq('estado_llamada', 'procesado')
      .neq('estado_llamada', 'procesando')
      .select('id, solicitud_id, proposito')
      .maybeSingle()

    if (!claim) {
      // Ya procesado, en proceso, o call_id desconocido → no-op idempotente.
      return NextResponse.json({ ok: true, idempotent: true }, { status: 200 })
    }

    const llamadaId = claim.id as string
    const solicitudId = claim.solicitud_id as string
    const proposito = claim.proposito as Proposito
    const nowIso = new Date().toISOString()

    // 4. Sin respuesta / buzón → no mutar la solicitud; el cron reintenta luego
    //    (sujeto a tope/cooldown).
    if (!p.success) {
      await supabase
        .from('llamadas')
        .update({ estado_llamada: 'sin_respuesta', finished_at: nowIso })
        .eq('id', llamadaId)
      return NextResponse.json({ ok: true, outcome: 'sin_respuesta' }, { status: 200 })
    }

    // 5. Cliente respondió → delegar a la transición dueña.
    const tr = await resolverYDelegar(proposito, solicitudId, p)

    await supabase
      .from('llamadas')
      .update({
        estado_llamada: 'procesado',
        finished_at: nowIso,
        resultado: {
          ...asObj(p.raw),
          transicion: tr
            ? { ok: tr.ok, status: tr.httpStatus, body: tr.body }
            : { ok: false, motivo: 'sin_datos_para_transicion' },
        },
      })
      .eq('id', llamadaId)

    // TODO Fase 1: notificarResultadoLlamada(solicitudId, proposito, tr) a supervisores.

    return NextResponse.json(
      { ok: true, outcome: 'procesado', transicion: tr?.ok ?? false },
      { status: 200 },
    )
  } catch (err) {
    // Responde 200 SIEMPRE. Limitación conocida: un fallo tras el claim deja la
    // fila en 'procesando' sin reintento automático (revisar en monitoreo).
    console.error('[dapta webhook] error inesperado:', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

// ─────────────────────────────────────────────────────────────────
// Delegación por propósito → transiciones.service (única dueña)
// El token se resuelve desde la solicitud (no viaja en el payload de Dapta).
// ─────────────────────────────────────────────────────────────────
async function resolverYDelegar(
  proposito: Proposito,
  solicitudId: string,
  p: DaptaResultado,
): Promise<TransicionResult | null> {
  switch (proposito) {
    case 'agendar': {
      if (!p.horario) return null
      const { data } = await supabase
        .from('solicitudes_servicio')
        .select('horario_token')
        .eq('id', solicitudId)
        .single()
      if (!data?.horario_token) return null
      return confirmarHorarioSolicitud(data.horario_token, p.horario)
    }
    case 'cierre': {
      if (p.confirmado === null) return null
      const { data } = await supabase
        .from('evidencias_servicio')
        .select('confirmacion_token')
        .eq('solicitud_id', solicitudId)
        .is('confirmado', null)
        .limit(1)
        .maybeSingle()
      if (!data?.confirmacion_token) return null
      return confirmarServicioCliente(data.confirmacion_token, p.confirmado, p.comentario)
    }
    case 'cotizacion': {
      if (p.aprobado === null) return null
      const { data } = await supabase
        .from('solicitudes_servicio')
        .select('cotizacion')
        .eq('id', solicitudId)
        .single()
      const token = (data?.cotizacion as { token?: string } | null)?.token
      if (!token) return null
      return procesarAprobacionCotizacion(token, p.aprobado, p.comentario)
    }
    case 'repuesto': {
      if (!p.horario) return null
      const { data } = await supabase
        .from('solicitudes_servicio')
        .select('reprogramacion_token')
        .eq('id', solicitudId)
        .single()
      if (!data?.reprogramacion_token) return null
      return reprogramarRepuestoSolicitud(data.reprogramacion_token, p.horario)
    }
    case 'presencia':
      // Fase 3 — verificación de presencia (T-24h/T-2h).
      return null
  }
}

// ─────────────────────────────────────────────────────────────────
// Autenticación del webhook ([SUP-2] — firma HMAC o token en query)
// ─────────────────────────────────────────────────────────────────
function autenticado(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.DAPTA_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[dapta webhook] DAPTA_WEBHOOK_SECRET no configurada — rechazando')
    return false
  }
  // Opción A: firma HMAC en header.
  const sig =
    req.headers.get('x-dapta-signature') ??
    req.headers.get('x-signature') ??
    req.headers.get('x-hub-signature-256')
  if (sig) return verificarFirmaHmac(rawBody, sig, secret)
  // Opción B (fallback): token en query string ?token=...
  const token = new URL(req.url).searchParams.get('token')
  if (token) return timingSafeEqualStr(token, secret)
  return false
}

function verificarFirmaHmac(rawBody: string, signature: string, secret: string): boolean {
  const hex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Acepta hex pelado o prefijado 'sha256='.
  return timingSafeEqualStr(signature, hex) || timingSafeEqualStr(signature, `sha256=${hex}`)
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// ─────────────────────────────────────────────────────────────────
// Parseo del payload de Dapta ([SUP-1] — forma sin confirmar, aislada aquí)
// ─────────────────────────────────────────────────────────────────
interface DaptaResultado {
  raw: unknown
  daptaCallId: string | null
  success: boolean
  horario: string | null
  aprobado: boolean | null
  confirmado: boolean | null
  comentario: string | null
}

function parseDaptaPayload(rawBody: string): DaptaResultado | null {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return null
  }

  const callId = pickStr(payload, ['call_id', 'callId', 'id'])
  const success =
    payload.success === true || payload.status === 'completed' || payload.status === 'answered'

  // Los resultados estructurados pueden venir en variable_snapshots y/o
  // custom_analysis_data; los fusionamos sobre el payload base.
  const data: Record<string, unknown> = {
    ...payload,
    ...asObj(payload.custom_analysis_data),
    ...asObj(payload.variable_snapshots),
  }

  return {
    raw: payload,
    daptaCallId: callId,
    success,
    horario: pickStr(data, ['horario', 'franja', 'horario_elegido']),
    aprobado: pickBool(data, ['aprobado', 'aprobada']),
    confirmado: pickBool(data, ['confirmado', 'conforme']),
    comentario: pickStr(data, ['comentario']),
  }
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (['true', 'si', 'sí', 'yes', '1'].includes(s)) return true
      if (['false', 'no', '0'].includes(s)) return false
    }
  }
  return null
}
