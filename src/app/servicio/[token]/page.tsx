import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import {
  ESTADOS_CANCELABLES_POR_CLIENTE,
  ESTADOS_REAGENDABLES_POR_CLIENTE,
  MAX_REAGENDAMIENTOS_CLIENTE,
} from '@/types/solicitud'
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

  let tecnicoInfo: {
    nombre_completo: string
    foto_perfil_url: string | null
    foto_documento_url: string | null
    tipo_documento: string | null
    numero_documento: string | null
  } | null = null
  if (sol.tecnico_asignado_id) {
    const { data: tec } = await querySupabase(() =>
      supabase
        .from('tecnicos')
        .select('nombre_completo, foto_perfil_url, foto_documento_url, tipo_documento, numero_documento')
        .eq('id', sol.tecnico_asignado_id)
        .single()
    )
    tecnicoInfo = tec ?? null
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
      tecnico={tecnicoInfo}
      cancelable={cancelable}
      reagendable={reagendable}
      reagendamientosRestantes={MAX_REAGENDAMIENTOS_CLIENTE - reagendamientosCount}
    />
  )
}
