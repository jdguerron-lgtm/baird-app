import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import AceptarBoton from './AceptarBoton'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Página de aceptación de servicio para técnicos.
 * El técnico recibe el link /aceptar/{token} por WhatsApp y al abrirlo
 * ve los detalles completos del servicio y el botón para aceptar.
 *
 * Resiliente a conexiones lentas:
 * 1. Las 3 queries (notif → solicitud → técnico) corren en 2 fases:
 *    primero notif, luego solicitud + técnico EN PARALELO. Ahorra 1
 *    round-trip vs el patrón secuencial anterior.
 * 2. querySupabase reintenta automáticamente con backoff (800ms, 2400ms)
 *    en fetch errors transitorios típicos de 4G/3G flaky.
 */
export default async function AceptarServicioPage({ params }: Props) {
  const { token } = await params

  // Fase 1: necesitamos notif primero porque las otras 2 queries dependen
  // de sus IDs. Retry cubre transitorios de red.
  const { data: notif } = await querySupabase(() =>
    supabase
      .from('notificaciones_whatsapp')
      .select('solicitud_id, tecnico_id, estado')
      .eq('token', token)
      .single()
  )

  if (!notif) {
    notFound()
  }

  // Fase 2: solicitud + técnico en paralelo (independientes entre sí).
  const [solResult, tecnicoResult] = await Promise.all([
    querySupabase(() =>
      supabase
        .from('solicitudes_servicio')
        .select(`
          tipo_equipo,
          marca_equipo,
          novedades_equipo,
          direccion,
          zona_servicio,
          ciudad_pueblo,
          pago_tecnico,
          horario_visita_1,
          horario_visita_2,
          horario_confirmado,
          estado,
          tecnico_asignado_id,
          es_garantia
        `)
        .eq('id', notif.solicitud_id)
        .single()
    ),
    querySupabase(() =>
      supabase
        .from('tecnicos')
        .select('nombre_completo')
        .eq('id', notif.tecnico_id)
        .single()
    ),
  ])

  const sol = solResult.data
  if (!sol) {
    notFound()
  }

  const tecnico = tecnicoResult.data

  const yaAsignada = sol.estado === 'asignada' || !!sol.tecnico_asignado_id

  // Extract model from novedades if present: "[Modelo: ...] description"
  const modeloMatch = sol.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
  const modeloEquipo = modeloMatch ? modeloMatch[1] : null
  const novedadesSinModelo = modeloMatch
    ? sol.novedades_equipo.replace(modeloMatch[0], '').trim()
    : sol.novedades_equipo

  return (
    <AceptarBoton
      token={token}
      solicitud={{ ...sol, novedades_equipo: novedadesSinModelo }}
      tecnicoNombre={tecnico?.nombre_completo ?? 'Técnico'}
      yaAsignada={yaAsignada}
      modeloEquipo={modeloEquipo}
      esGarantia={sol.es_garantia ?? false}
    />
  )
}
