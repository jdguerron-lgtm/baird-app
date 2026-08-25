import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { estadoPagoCliente, PAGO_CLIENTE_LABELS } from '@/lib/constants/pago-cliente'
import { precioClienteServicio } from '@/types/solicitud'
import { formatCOP } from '@/lib/utils/format'

/**
 * Envío de correos transaccionales vía Resend (https://resend.com).
 *
 * Mismo patrón kill-switch que Wompi/Dapta: sin RESEND_API_KEY todo es no-op
 * (loguea y retorna ok:false) — el flujo que lo invoque nunca se rompe por
 * falta de configuración.
 *
 * Env vars:
 *   RESEND_API_KEY     — API key de Resend. Ausente = correos deshabilitados.
 *   FACTURACION_EMAIL  — destino del correo de facturación al completar un
 *                        servicio (default logistica@encompasslatam.com).
 *   EMAIL_FROM         — remitente verificado en Resend
 *                        (default "Baird Service <facturacion@bairdservice.com>").
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

export const FACTURACION_EMAIL_DEFAULT = 'logistica@encompasslatam.com'

export function emailHabilitado(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export interface ResultadoEmail {
  ok: boolean
  id?: string
  error?: string
}

/** Primitiva de envío. Best-effort: nunca lanza, siempre retorna resultado. */
export async function enviarEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<ResultadoEmail> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY no configurada — correo omitido:', params.subject)
    return { ok: false, error: 'RESEND_API_KEY no configurada' }
  }

  const from = process.env.EMAIL_FROM || 'Baird Service <facturacion@bairdservice.com>'

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, html: params.html }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = (data as { message?: string } | null)?.message || `HTTP ${res.status}`
      console.error('[email] Resend rechazó el envío:', msg)
      return { ok: false, error: msg }
    }
    return { ok: true, id: (data as { id?: string } | null)?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] error enviando correo:', msg)
    return { ok: false, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────
// Correo de facturación al COMPLETAR un servicio (2026-08-25)
// ─────────────────────────────────────────────────────────────────

const fmtFecha = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
    : '—'

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Notifica por correo al equipo de facturación (FACTURACION_EMAIL) que un
 * servicio pasó a `completada`, con todo lo necesario para facturar y
 * conciliar: cliente (nombre, teléfono, cédula o consumidor final), equipo,
 * estado del pago ONLINE (Wompi) y el detalle de cada transacción registrada.
 *
 * Best-effort: la invoca confirmarServicioCliente dentro de try/catch — un
 * fallo de correo jamás revierte la confirmación del servicio.
 *
 * OJO: refleja solo el recaudo ONLINE (tabla `pagos`). Un pago en sitio con
 * QR Bre-B no aparece — el correo lo advierte cuando hay saldo sin cubrir.
 */
export async function enviarCorreoFacturacionServicio(solicitudId: string): Promise<ResultadoEmail> {
  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select(
      'id, cliente_nombre, cliente_telefono, cliente_cedula, direccion, ciudad_pueblo, tipo_equipo, marca_equipo, tipo_solicitud, es_garantia, numero_serie_factura, cotizacion, recargo_weekend_aplicado, anticipo_pagado_at, saldo_pagado_at, estado, horario_confirmado',
    )
    .eq('id', solicitudId)
    .single()

  if (!sol) return { ok: false, error: `Solicitud ${solicitudId} no encontrada` }

  const { data: pagos } = await supabase
    .from('pagos')
    .select('tipo, estado, monto, metodo, pagado_at, transaccion_id, referencia')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: true })

  const idCorto = solicitudId.slice(0, 8)
  const totalCliente = sol.es_garantia
    ? 0
    : precioClienteServicio(
        sol.tipo_equipo,
        sol.tipo_solicitud,
        sol.es_garantia,
        sol.cotizacion as { total?: number | null } | null,
        sol.recargo_weekend_aplicado ?? null,
      )
  const aprobados = (pagos ?? []).filter((p) => p.estado === 'APPROVED')
  const pagadoOnline = aprobados.reduce((acc, p) => acc + (p.monto ?? 0), 0)
  const saldo = Math.max(0, totalCliente - pagadoOnline)

  const estadoPago = estadoPagoCliente(sol)
  const estadoPagoTexto = sol.es_garantia
    ? 'Garantía — factura a la marca (el cliente no paga)'
    : estadoPago
      ? PAGO_CLIENTE_LABELS[estadoPago]
      : 'Sin pago online registrado'

  const filasPagos = (pagos ?? [])
    .map(
      (p) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(p.tipo)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(p.estado)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">$${formatCOP(p.monto)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(p.metodo)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtFecha(p.pagado_at)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${esc(p.transaccion_id)}</td>
      </tr>`,
    )
    .join('')

  const tablaPagos = filasPagos
    ? `<table style="border-collapse:collapse;font-size:13px;margin-top:6px;">
        <tr style="background:#f3f4f6;">
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Tipo</th>
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Estado</th>
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Monto</th>
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Método</th>
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Fecha</th>
          <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Transacción Wompi</th>
        </tr>${filasPagos}
      </table>`
    : '<p style="color:#92400e;">Sin transacciones online registradas (Wompi). Si el cliente pagó en sitio (QR Bre-B), conciliar manualmente.</p>'

  const dato = (label: string, valor: string) =>
    `<tr><td style="padding:4px 10px 4px 0;color:#6b7280;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-weight:600;">${valor}</td></tr>`

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">
    <h2 style="margin:0 0 4px;">✅ Servicio completado — solicitud #${idCorto}</h2>
    <p style="margin:0 0 16px;color:#6b7280;">Baird Service — datos para facturación y conciliación de pago.</p>

    <h3 style="margin:16px 0 4px;font-size:15px;">Cliente</h3>
    <table style="font-size:13px;">
      ${dato('Nombre', esc(sol.cliente_nombre))}
      ${dato('Teléfono', esc(sol.cliente_telefono))}
      ${dato('Cédula / NIT', sol.cliente_cedula ? esc(sol.cliente_cedula) : 'No registrada — facturar como consumidor final')}
      ${dato('Dirección', `${esc(sol.direccion)}, ${esc(sol.ciudad_pueblo)}`)}
    </table>

    <h3 style="margin:16px 0 4px;font-size:15px;">Servicio</h3>
    <table style="font-size:13px;">
      ${dato('Equipo', `${esc(sol.tipo_equipo)} ${esc(sol.marca_equipo)}`)}
      ${dato('Tipo de servicio', esc(sol.tipo_solicitud))}
      ${dato('Flujo', sol.es_garantia ? `Garantía (orden/serie: ${esc(sol.numero_serie_factura) || '—'})` : 'Particular (paga el cliente)')}
      ${dato('Visita', esc(sol.horario_confirmado) || '—')}
    </table>

    <h3 style="margin:16px 0 4px;font-size:15px;">Pago</h3>
    <table style="font-size:13px;">
      ${dato('Estado del pago', estadoPagoTexto)}
      ${sol.es_garantia ? '' : dato('Total del servicio', `$${formatCOP(totalCliente)} COP`)}
      ${sol.es_garantia ? '' : dato('Pagado online (Wompi)', `$${formatCOP(pagadoOnline)} COP`)}
      ${sol.es_garantia ? '' : dato('Saldo sin pago online', `$${formatCOP(saldo)} COP`)}
    </table>
    ${tablaPagos}

    <p style="margin-top:20px;font-size:11px;color:#9ca3af;">
      Correo automático de la plataforma Baird Service (lineablanca.bairdservice.com)
      al completarse el servicio. El estado refleja únicamente el recaudo online vía Wompi.
    </p>
  </div>`

  const to = process.env.FACTURACION_EMAIL || FACTURACION_EMAIL_DEFAULT
  const pagoTag = sol.es_garantia ? 'Garantía' : saldo <= 0 && totalCliente > 0 ? 'PAGADO' : pagadoOnline > 0 ? 'PAGO PARCIAL' : 'SIN PAGO ONLINE'
  return enviarEmail({
    to,
    subject: `[Facturación] Servicio completado #${idCorto} — ${pagoTag} — ${sol.cliente_nombre}`,
    html,
  })
}
