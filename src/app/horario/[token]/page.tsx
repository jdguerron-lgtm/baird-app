import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import { esFechaVisitaPasada } from '@/lib/utils/fecha-visita'
import HorarioSelector from './HorarioSelector'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Página de selección de horario por el cliente (paso 1 del flujo customer-first).
 * El cliente recibe el link /horario/{token} por WhatsApp tras crear la solicitud
 * y elige entre los 2 horarios propuestos.
 */
export default async function ConfirmarHorarioPage({ params }: Props) {
  const { token } = await params

  // Retry con backoff para tolerar conexiones flaky del cliente en 4G/3G
  const { data: sol } = await querySupabase(() =>
    supabase
      .from('solicitudes_servicio')
      .select(`
        id,
        cliente_nombre,
        tipo_equipo,
        marca_equipo,
        ciudad_pueblo,
        zona_servicio,
        horario_visita_1,
        horario_visita_2,
        horario_confirmado,
        horario_confirmado_at,
        fecha_visita_at,
        tecnico_asignado_id,
        estado,
        es_garantia,
        cliente_token
      `)
      .eq('horario_token', token)
      .single()
  )

  if (!sol) {
    notFound()
  }

  const yaConfirmado = !!sol.horario_confirmado_at
  const expirado = sol.estado === 'sin_agendar'

  // Reagendar-vencido: ya se agendó una vez, la fecha pasó y el servicio no
  // avanzó (sigue en 'notificada' sin técnico asignado — nadie lo tomó). En
  // ese caso reabrimos este mismo link para que el cliente elija nueva fecha.
  const reagendarVencido =
    yaConfirmado &&
    sol.estado === 'notificada' &&
    !sol.tecnico_asignado_id &&
    esFechaVisitaPasada(sol.fecha_visita_at)

  return (
    <HorarioSelector
      token={token}
      solicitud={sol}
      yaConfirmado={yaConfirmado}
      expirado={expirado}
      reagendarVencido={reagendarVencido}
    />
  )
}
