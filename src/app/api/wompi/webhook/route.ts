import { NextRequest, NextResponse } from 'next/server'
import { verificarChecksumEvento, type EventoWompi } from '@/lib/wompi'
import { registrarPagoWompi } from '@/lib/services/pagos.service'

/**
 * POST /api/wompi/webhook — eventos de la pasarela Wompi.
 *
 * Es la FUENTE DE VERDAD de la conciliación: el redirect del navegador puede
 * no ocurrir nunca (el cliente cierra la pestaña, paga por PSE y no vuelve),
 * pero este evento sí llega. Wompi reintenta hasta 3 veces en 24h si no
 * recibe 200, así que:
 *   - firma inválida       → 401 (no es Wompi; no reintentar tiene sentido,
 *                            pero preferimos que quede visible en su panel)
 *   - error nuestro al procesar → 500 (queremos el reintento)
 *   - todo lo demás        → 200
 *
 * Seguridad: se verifica el checksum SHA-256 del evento contra
 * WOMPI_EVENTS_SECRET (ver src/lib/wompi.ts). Sin ese secreto configurado la
 * verificación falla siempre — nunca aceptamos un evento que no podemos
 * validar. El endpoint NO confía en ningún dato del body más allá de lo que
 * la firma cubre; el monto se contrasta contra lo esperado en pagos.service.
 *
 * Configuración en el panel de Wompi:
 *   URL de eventos → https://lineablanca.bairdservice.com/api/wompi/webhook
 */

export const maxDuration = 30

export async function POST(req: NextRequest) {
  let evento: EventoWompi
  try {
    evento = (await req.json()) as EventoWompi
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!verificarChecksumEvento(evento)) {
    console.error('[wompi/webhook] checksum inválido — evento descartado', {
      event: evento?.event,
      environment: evento?.environment,
    })
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  // Solo nos interesa el ciclo de vida de transacciones. Otros eventos
  // (nequi_token.updated, etc.) se aceptan con 200 para que Wompi no reintente.
  if (evento.event !== 'transaction.updated') {
    return NextResponse.json({ received: true, ignored: evento.event })
  }

  const tx = evento.data?.transaction
  if (!tx?.id || typeof tx.reference !== 'string') {
    return NextResponse.json({ received: true, ignored: 'sin transacción' })
  }

  try {
    const resultado = await registrarPagoWompi(tx, 'webhook')
    if (!resultado.ok) {
      // Fallo nuestro (BD caída, etc.) → 500 para que Wompi reintente.
      console.error('[wompi/webhook] registrarPagoWompi falló:', resultado.error)
      return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 })
    }
    return NextResponse.json({
      received: true,
      duplicado: resultado.duplicado ?? false,
      confirmado: resultado.confirmado ?? false,
    })
  } catch (err) {
    console.error('[wompi/webhook] error procesando el evento:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
