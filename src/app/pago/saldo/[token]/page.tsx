import { notFound } from 'next/navigation'
import Link from 'next/link'
import { construirCheckoutUrl, referenciaPago, consultarTransaccion, wompiHabilitado } from '@/lib/wompi'
import {
  cargarSolicitudPagoPorClienteToken,
  calcularMontoSaldo,
  calcularMontoAbonoRepuestos,
  registrarPagoWompi,
} from '@/lib/services/pagos.service'
import { formatCOP } from '@/lib/utils/format'

/**
 * Página de pago del SALDO (pasarela Wompi) — el total cotizado menos los
 * pagos ya acreditados. Se ofrece tras aprobar la cotización (plantilla
 * `pago_saldo_cliente_v1` + botón en /cotizacion) como ALTERNATIVA online al
 * pago en sitio con QR — no bloquea ninguna transición de estado.
 *
 * Modo ABONO (2026-08-25): si la cotización aprobada incluye REPUESTOS y aún
 * no hay abono registrado, la página cobra primero el 50% del saldo
 * (referencia `abono-{id}`) para que el técnico compre los repuestos; el
 * resto se cobra en una visita posterior por esta misma página (referencia
 * `saldo-{id}`). Solo en cotizaciones con repuestos.
 *
 * Misma arquitectura que /pago/anticipo/{token} (ver ese archivo): Server
 * Component, monto desde la BD firmado server-side, confirmación por webhook
 * o por el redirect (?id=) contra el API de Wompi — nunca por query string.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
  searchParams: Promise<{ id?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://lineablanca.bairdservice.com'

export default async function PagoSaldoPage({ params, searchParams }: Props) {
  const { token } = await params
  const { id: transactionId } = await searchParams

  if (!UUID_RE.test(token)) notFound()

  const sol = await cargarSolicitudPagoPorClienteToken(token)
  if (!sol) notFound()

  // ── Redirect de vuelta de Wompi: confirmar contra el API ──
  // La misma página cobra 'saldo' o 'abono' (repuestos) — aceptamos ambas
  // referencias, siempre validando que correspondan a ESTA solicitud.
  if (transactionId) {
    const tx = await consultarTransaccion(transactionId)
    const refSaldo = referenciaPago('saldo', sol.id)
    const refAbono = referenciaPago('abono', sol.id)
    if (tx && (tx.reference === refSaldo || tx.reference === refAbono)) {
      await registrarPagoWompi(tx, 'redirect')
      const esAbono = tx.reference === refAbono
      if (tx.status === 'APPROVED') {
        return (
          <Resultado
            tipo={esAbono ? 'abono_aprobado' : 'aprobado'}
            token={token}
            monto={Math.round(tx.amount_in_cents / 100)}
          />
        )
      }
      if (tx.status === 'PENDING') return <Resultado tipo="pendiente" token={token} />
      return <Resultado tipo="rechazado" token={token} />
    }
  }

  if (sol.saldo_pagado_at) {
    return <Resultado tipo="aprobado" token={token} yaRegistrado />
  }

  if (sol.es_garantia) {
    return (
      <Marco titulo="Este servicio no requiere pago" emoji="🛡️" color="blue">
        <p className="text-sm text-gray-600">
          Tu servicio está cubierto por la garantía del fabricante. No debes pagar nada.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const cot = sol.cotizacion as {
    total?: number
    diagnostico_cliente?: number
    servicio_cliente?: number
  } | null
  const total = cot?.total ?? 0
  const saldo = await calcularMontoSaldo(sol)
  // Modo ABONO: cotización con repuestos y sin abono registrado → se cobra
  // el 50% del saldo (0 = no aplica → modo saldo normal).
  const abono = await calcularMontoAbonoRepuestos(sol)
  const modoAbono = abono > 0 && abono < saldo
  const montoACobrar = modoAbono ? abono : saldo
  // Desglose discriminado (cotizaciones desde 2026-08-25): diagnóstico +
  // servicio con repuestos. Las viejas no traen los campos → solo total.
  const diagnosticoCliente = cot?.diagnostico_cliente ?? 0
  const servicioCliente = cot?.servicio_cliente ?? 0
  const hayDesglose = diagnosticoCliente > 0 && servicioCliente > 0

  if (total <= 0) {
    return (
      <Marco titulo="Aún no hay saldo por pagar" emoji="🧾" color="blue">
        <p className="text-sm text-gray-600">
          Tu servicio todavía no tiene una cotización aprobada. Cuando el técnico
          te cotice y la apruebes, acá aparecerá el saldo.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  if (saldo <= 0) {
    return (
      <Marco titulo="Estás al día" emoji="✅" color="emerald">
        <p className="text-sm text-gray-600">
          Los pagos registrados ya cubren el total de tu servicio. No tienes saldo pendiente.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  if (!wompiHabilitado()) {
    return (
      <Marco titulo="Pago no disponible en línea" emoji="💬" color="amber">
        <p className="text-sm text-gray-600">
          Puedes pagar tu saldo al finalizar el servicio con el QR de Baird, o el
          equipo se comunicará contigo para coordinarlo.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const checkoutUrl = construirCheckoutUrl({
    referencia: referenciaPago(modoAbono ? 'abono' : 'saldo', sol.id),
    montoCOP: montoACobrar,
    redirectUrl: `${APP_URL}/pago/saldo/${token}`,
    nombreCliente: sol.cliente_nombre,
  })

  if (!checkoutUrl) {
    return (
      <Marco titulo="Pago no disponible en línea" emoji="💬" color="amber">
        <p className="text-sm text-gray-600">
          No pudimos generar el link de pago. Puedes pagar en sitio con el QR de Baird.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const pagosAcreditados = total - saldo

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="text-center mb-5">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">{modoAbono ? '🔩' : '🧾'}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {modoAbono ? 'Abono para repuestos' : 'Paga el saldo de tu servicio'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {modoAbono
                ? `Hola ${sol.cliente_nombre.split(' ')[0]}, tu reparación de ${sol.tipo_equipo} necesita repuestos. Con este abono del 50% el técnico los compra y coordinamos la instalación.`
                : `Hola ${sol.cliente_nombre.split(' ')[0]}, tu reparación de ${sol.tipo_equipo} quedó aprobada.`}
            </p>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            {hayDesglose ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Visita de diagnóstico</span>
                  <span className="font-medium">${formatCOP(diagnosticoCliente)} COP</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Servicio (mano de obra + repuestos)</span>
                  <span className="font-medium">${formatCOP(servicioCliente)} COP</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-600 font-semibold">Total del servicio</span>
                  <span className="font-semibold">${formatCOP(total)} COP</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total del servicio (todo incluido)</span>
                <span className="font-medium">${formatCOP(total)} COP</span>
              </div>
            )}
            {pagosAcreditados > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Pagos acreditados</span>
                <span className="font-medium text-emerald-700">−${formatCOP(pagosAcreditados)} COP</span>
              </div>
            )}
            {modoAbono && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Saldo pendiente</span>
                <span className="font-medium">${formatCOP(saldo)} COP</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t pt-2 mt-2">
              <span className="font-bold text-gray-900">
                {modoAbono ? 'Abono a pagar hoy (50% del saldo)' : 'Saldo a pagar'}
              </span>
              <span className="text-2xl font-bold text-emerald-700">
                ${formatCOP(montoACobrar)} <span className="text-xs font-medium text-gray-500">COP</span>
              </span>
            </div>
            {modoAbono && (
              <p className="text-xs text-gray-500">
                El resto (${formatCOP(saldo - abono)} COP) lo pagas al finalizar el servicio.
              </p>
            )}
          </div>
        </div>

        <a
          href={checkoutUrl}
          className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl text-center text-base transition-colors"
        >
          💳 Pagar ${formatCOP(montoACobrar)} COP
        </a>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            🔐 Pago seguro con <strong>Wompi</strong> (Bancolombia): tarjeta, PSE, Nequi o Bancolombia.
            Si prefieres, también puedes pagar al finalizar el servicio con el QR de Baird.
          </p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-700">
            ⚠️ Todos los pagos se gestionan únicamente a través de <strong>Baird Service</strong>.
            Nunca entregues dinero en efectivo al técnico.
          </p>
        </div>

        <LinkPortal token={token} />

        <p className="text-center text-xs text-gray-400 pb-4">
          Baird Service — Red de técnicos verificados
        </p>
      </div>
    </div>
  )
}

// ── Presentación (espejo de /pago/anticipo) ──

function Marco({
  titulo, emoji, color, children,
}: {
  titulo: string
  emoji: string
  color: 'emerald' | 'blue' | 'amber' | 'red'
  children: React.ReactNode
}) {
  const fondos = { emerald: 'bg-emerald-100', blue: 'bg-blue-100', amber: 'bg-amber-100', red: 'bg-red-100' } as const
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-3">
        <div className={`w-16 h-16 ${fondos[color]} rounded-full flex items-center justify-center mx-auto mb-1`}>
          <span className="text-3xl">{emoji}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{titulo}</h1>
        {children}
      </div>
    </div>
  )
}

function Resultado({
  tipo, token, monto, yaRegistrado,
}: {
  tipo: 'aprobado' | 'abono_aprobado' | 'pendiente' | 'rechazado'
  token: string
  monto?: number
  yaRegistrado?: boolean
}) {
  if (tipo === 'abono_aprobado') {
    return (
      <Marco titulo="¡Abono recibido!" emoji="🔩" color="emerald">
        <p className="text-sm text-gray-600">
          Recibimos tu abono{monto ? ` de $${formatCOP(monto)} COP` : ''} para la compra de los repuestos.
          Le avisamos a tu técnico para que proceda con la compra — te contactaremos para coordinar la instalación.
        </p>
        <p className="text-xs text-gray-500">
          El saldo restante lo pagas al finalizar el servicio, en línea o con el QR de Baird.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }
  if (tipo === 'aprobado') {
    return (
      <Marco titulo="¡Servicio totalmente pagado!" emoji="🎉" color="emerald">
        <p className="text-sm text-gray-600">
          {yaRegistrado
            ? 'Tu saldo ya está registrado. No tienes pagos pendientes.'
            : `Recibimos tu pago${monto ? ` de $${formatCOP(monto)} COP` : ''}. Tu servicio quedó totalmente pagado.`}
        </p>
        <p className="text-xs text-gray-500">
          Le avisamos a tu técnico — no debes entregarle ningún dinero en sitio.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }
  if (tipo === 'pendiente') {
    return (
      <Marco titulo="Pago en proceso" emoji="⏳" color="amber">
        <p className="text-sm text-gray-600">
          Tu banco está procesando el pago. Apenas se confirme te avisamos por WhatsApp —
          no necesitas hacer nada más.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }
  return (
    <Marco titulo="El pago no se completó" emoji="❌" color="red">
      <p className="text-sm text-gray-600">
        Tu banco no aprobó la transacción y no se hizo ningún cobro. Puedes intentar
        de nuevo con otro medio de pago.
      </p>
      <Link
        href={`/pago/saldo/${token}`}
        className="inline-block bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-slate-800"
      >
        Intentar de nuevo
      </Link>
      <LinkPortal token={token} />
    </Marco>
  )
}

function LinkPortal({ token }: { token: string }) {
  return (
    <Link
      href={`/servicio/${token}`}
      className="block text-xs text-gray-500 underline hover:text-slate-900 pt-2"
    >
      Ver el estado de mi servicio
    </Link>
  )
}
