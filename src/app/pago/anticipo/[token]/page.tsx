import { notFound } from 'next/navigation'
import Link from 'next/link'
import { construirCheckoutUrl, referenciaPago, consultarTransaccion, wompiHabilitado, urlPaginaPagoAnticipo } from '@/lib/wompi'
import {
  cargarSolicitudPagoPorClienteToken,
  calcularMontoAnticipo,
  registrarPagoWompi,
} from '@/lib/services/pagos.service'
import { formatCOP } from '@/lib/utils/format'

/**
 * Página de pago del ANTICIPO (pasarela Wompi).
 *
 * Se identifica por el `cliente_token` permanente de la solicitud (mismo
 * token del portal /servicio/{token}), así el link se puede mandar por
 * WhatsApp con un botón URL de plantilla (dominio fijo + sufijo {{1}}).
 *
 * Dos modos según la query:
 *   - sin `id`  → muestra el resumen y el botón "Pagar" hacia el Web Checkout
 *                 de Wompi, con el monto tomado de la BD y FIRMADO server-side.
 *   - con `id`  → es el redirect de vuelta de Wompi: consulta la transacción
 *                 contra el API y la registra (idempotente — el webhook puede
 *                 haber llegado primero). Nunca se confía en la query string
 *                 para dar por pagado: solo en lo que responde el API.
 *
 * Server Component a propósito: la construcción de la firma usa
 * WOMPI_INTEGRITY_SECRET, que jamás debe llegar al bundle del navegador.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
  searchParams: Promise<{ id?: string; env?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PagoAnticipoPage({ params, searchParams }: Props) {
  const { token } = await params
  const { id: transactionId } = await searchParams

  if (!UUID_RE.test(token)) notFound()

  const sol = await cargarSolicitudPagoPorClienteToken(token)
  if (!sol) notFound()

  // ── Redirect de vuelta de Wompi: confirmar contra el API ──
  if (transactionId) {
    const tx = await consultarTransaccion(transactionId)
    // Guard anti-suplantación: la transacción debe corresponder a ESTA
    // solicitud. Sin esto, cualquiera podría pegar el id de otra transacción
    // aprobada en la URL y ver "pagado" en la ficha ajena.
    const refEsperada = referenciaPago('anticipo', sol.id)
    if (tx && tx.reference === refEsperada) {
      await registrarPagoWompi(tx, 'redirect')
      if (tx.status === 'APPROVED') {
        return <ResultadoPago tipo="aprobado" solicitudToken={token} monto={Math.round(tx.amount_in_cents / 100)} />
      }
      if (tx.status === 'PENDING') {
        return <ResultadoPago tipo="pendiente" solicitudToken={token} />
      }
      return <ResultadoPago tipo="rechazado" solicitudToken={token} />
    }
    // Transacción no consultable o ajena: caemos a mostrar el estado real de
    // la solicitud (si el webhook ya la confirmó, se verá como pagada).
  }

  // ── Ya pagado (por webhook o por un intento previo) ──
  if (sol.anticipo_pagado_at) {
    return <ResultadoPago tipo="aprobado" solicitudToken={token} yaRegistrado />
  }

  // ── Garantía no lleva anticipo ──
  if (sol.es_garantia) {
    return (
      <Marco titulo="Este servicio no requiere pago" emoji="🛡️" color="blue">
        <p className="text-sm text-gray-600">
          Tu servicio está cubierto por la garantía del fabricante. No debes pagar nada por la visita.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const monto = calcularMontoAnticipo(sol)

  if (monto <= 0 || !wompiHabilitado()) {
    // Sin monto calculable o pasarela no configurada: no mostramos un botón
    // roto — derivamos al portal, donde el equipo coordina el pago.
    return (
      <Marco titulo="Pago no disponible en línea" emoji="💬" color="amber">
        <p className="text-sm text-gray-600">
          En este momento no podemos generar el link de pago automáticamente.
          El equipo de Baird Service se comunicará contigo para coordinarlo.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const checkoutUrl = construirCheckoutUrl({
    referencia: referenciaPago('anticipo', sol.id),
    montoCOP: monto,
    redirectUrl: urlPaginaPagoAnticipo(token),
    nombreCliente: sol.cliente_nombre,
  })

  if (!checkoutUrl) {
    return (
      <Marco titulo="Pago no disponible en línea" emoji="💬" color="amber">
        <p className="text-sm text-gray-600">
          No pudimos generar el link de pago. El equipo de Baird Service te contactará para coordinarlo.
        </p>
        <LinkPortal token={token} />
      </Marco>
    )
  }

  const horario = sol.horario_confirmado || 'Por confirmar'

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="text-center mb-5">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">🔒</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Confirma tu reserva</h1>
            <p className="text-sm text-gray-500 mt-1">
              Hola {sol.cliente_nombre.split(' ')[0]}, paga el anticipo para asegurar tu visita.
            </p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-emerald-800 uppercase mb-1">Tu visita</p>
            <p className="text-sm text-emerald-900 font-semibold">🕐 {horario}</p>
            <p className="text-xs text-emerald-700 mt-1">
              🔧 {sol.tipo_equipo} · {sol.tipo_solicitud}
            </p>
          </div>

          <div className="flex items-end justify-between border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm text-gray-600">Anticipo a pagar</p>
              <p className="text-[11px] text-gray-400">Se abona al total del servicio</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700">
              ${formatCOP(monto)} <span className="text-xs font-medium text-gray-500">COP</span>
            </p>
          </div>
        </div>

        <a
          href={checkoutUrl}
          className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl text-center text-base transition-colors"
        >
          💳 Pagar ${formatCOP(monto)} COP
        </a>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            🔐 El pago se procesa en <strong>Wompi</strong> (Bancolombia). Puedes pagar con
            tarjeta, PSE, Nequi o Bancolombia. Baird Service nunca almacena los datos de tu medio de pago.
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

// ─────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────

function Marco({
  titulo, emoji, color, children,
}: {
  titulo: string
  emoji: string
  color: 'emerald' | 'blue' | 'amber' | 'red'
  children: React.ReactNode
}) {
  const fondos = {
    emerald: 'bg-emerald-100',
    blue: 'bg-blue-100',
    amber: 'bg-amber-100',
    red: 'bg-red-100',
  } as const

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

function ResultadoPago({
  tipo, solicitudToken, monto, yaRegistrado,
}: {
  tipo: 'aprobado' | 'pendiente' | 'rechazado'
  solicitudToken: string
  monto?: number
  yaRegistrado?: boolean
}) {
  if (tipo === 'aprobado') {
    return (
      <Marco titulo="¡Reserva confirmada!" emoji="✅" color="emerald">
        <p className="text-sm text-gray-600">
          {yaRegistrado
            ? 'Tu anticipo ya está registrado y tu visita quedó asegurada.'
            : `Recibimos tu anticipo${monto ? ` de $${formatCOP(monto)} COP` : ''}. Tu visita quedó asegurada.`}
        </p>
        <p className="text-xs text-gray-500">
          Ya le avisamos a tu técnico. Te enviamos la confirmación por WhatsApp con todos los detalles.
        </p>
        <LinkPortal token={solicitudToken} />
      </Marco>
    )
  }

  if (tipo === 'pendiente') {
    return (
      <Marco titulo="Pago en proceso" emoji="⏳" color="amber">
        <p className="text-sm text-gray-600">
          Tu pago está siendo procesado por el banco. Apenas se confirme te avisamos por WhatsApp
          y tu reserva queda asegurada — no necesitas hacer nada más.
        </p>
        <LinkPortal token={solicitudToken} />
      </Marco>
    )
  }

  return (
    <Marco titulo="El pago no se completó" emoji="❌" color="red">
      <p className="text-sm text-gray-600">
        Tu banco no aprobó la transacción. No se hizo ningún cobro. Puedes intentarlo de nuevo
        con otro medio de pago.
      </p>
      <Link
        href={`/pago/anticipo/${solicitudToken}`}
        className="inline-block bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-slate-800"
      >
        Intentar de nuevo
      </Link>
      <LinkPortal token={solicitudToken} />
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
