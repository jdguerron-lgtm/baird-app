import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import {
  ESTADOS_CANCELABLES_POR_CLIENTE,
  ESTADOS_REAGENDABLES_POR_CLIENTE,
  MAX_REAGENDAMIENTOS_CLIENTE,
} from '@/types/solicitud'
import {
  CARNET_TECNICO_SELECT,
  construirCarnet,
  type CarnetTecnicoData,
  type CarnetTecnicoRow,
} from '@/lib/utils/carnet'
import type { CarnetAuxiliarData } from '@/lib/utils/equipo'
import ServicioPortal from './ServicioPortal'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Portal del cliente — gestiona su solicitud:
 * - Ver estado actual y datos del servicio
 * - Cancelar si el estado lo permite
 * - Reagendar (si está dentro del límite y estado lo permite)
 */
export default async function ServicioPortalPage({ params }: Props) {
  const { token } = await params

  // Retry con backoff para tolerar 4G/3G flaky del cliente
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
        estado,
        es_garantia,
        tecnico_asignado_id,
        reagendamientos_count
      `)
      .eq('cliente_token', token)
      .single()
  )

  if (!sol) {
    notFound()
  }

  // Carnet digital del técnico (2026-10-10): al cliente NO se le muestra la
  // foto de la cédula (PII sensible) — solo el carnet con documento
  // enmascarado. Ver src/lib/utils/carnet.ts.
  let carnet: CarnetTecnicoData | null = null
  if (sol.tecnico_asignado_id) {
    const { data: tec } = await querySupabase(() =>
      supabase
        .from('tecnicos')
        .select(CARNET_TECNICO_SELECT)
        .eq('id', sol.tecnico_asignado_id)
        .single()
    )
    carnet = tec ? construirCarnet(tec as unknown as CarnetTecnicoRow) : null
  }

  // Equipo que visita (2026-10-13): auxiliares verificados que acompañan al
  // técnico en ESTE servicio. Lectura aparte con service_role (la tabla está
  // cerrada al anon) y best-effort: sin migración / sin service role en dev
  // el portal sigue funcionando sin la sección.
  let equipo: CarnetAuxiliarData[] = []
  if (carnet) {
    try {
      const { equipoDeServicioPorId } = await import('@/lib/services/equipo.service')
      equipo = await equipoDeServicioPorId(sol.id)
    } catch (err) {
      console.warn('[servicio/portal] equipo no disponible:', err instanceof Error ? err.message : err)
    }
  }

  const cancelable = ESTADOS_CANCELABLES_POR_CLIENTE.has(sol.estado)
  const reagendamientosCount = sol.reagendamientos_count ?? 0
  const reagendable =
    ESTADOS_REAGENDABLES_POR_CLIENTE.has(sol.estado) &&
    reagendamientosCount < MAX_REAGENDAMIENTOS_CLIENTE

  return (
    <ServicioPortal
      token={token}
      solicitud={sol}
      tecnico={carnet}
      equipo={equipo}
      cancelable={cancelable}
      reagendable={reagendable}
      reagendamientosRestantes={MAX_REAGENDAMIENTOS_CLIENTE - reagendamientosCount}
    />
  )
}
