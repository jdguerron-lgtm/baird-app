import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AceptarBoton from './AceptarBoton'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Página de aceptación de servicio para técnicos.
 * El técnico recibe el link /aceptar/{token} por WhatsApp y al abrirlo
 * ve los detalles completos del servicio y el botón para aceptar.
 */
export default async function AceptarServicioPage({ params }: Props) {
  const { token } = await params

  // Verificar que el token existe y obtener la solicitud relacionada
  const { data: notif } = await supabase
    .from('notificaciones_whatsapp')
    .select('solicitud_id, tecnico_id, estado')
    .eq('token', token)
    .single()

  if (!notif) {
    notFound()
  }

  // Obtener datos de la solicitud
  const { data: sol } = await supabase
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
      estado,
      tecnico_id
    `)
    .eq('id', notif.solicitud_id)
    .single()

  if (!sol) {
    notFound()
  }

  // Obtener nombre del técnico
  const { data: tecnico } = await supabase
    .from('tecnicos')
    .select('nombre')
    .eq('id', notif.tecnico_id)
    .single()

  const yaAsignada = sol.estado === 'asignada' || !!sol.tecnico_id

  return (
    <AceptarBoton
      token={token}
      solicitud={sol}
      tecnicoNombre={tecnico?.nombre ?? 'Técnico'}
      yaAsignada={yaAsignada}
    />
  )
}
