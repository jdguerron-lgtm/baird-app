import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import ReprogramarSelector from './ReprogramarSelector'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Página de reprogramación tras llegada del repuesto.
 * El cliente recibe el link /reprogramar-repuesto/{token} por WhatsApp cuando
 * el admin marca el repuesto como recibido (estado repuesto_recibido) y elige
 * una nueva fecha (tentativa) para la visita. Al confirmar, pasa a en_proceso.
 */
export default async function ReprogramarRepuestoPage({ params }: Props) {
  const { token } = await params

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
        estado,
        cliente_token,
        tecnico_asignado_id
      `)
      .eq('reprogramacion_token', token)
      .single()
  )

  if (!sol) {
    notFound()
  }

  // Nombre del técnico asignado para reforzar el mensaje "fecha tentativa,
  // sujeta a la disponibilidad del técnico que lleva tu proceso".
  let tecnicoNombre = 'el técnico asignado'
  if (sol.tecnico_asignado_id) {
    const { data: tec } = await supabase
      .from('tecnicos')
      .select('nombre_completo')
      .eq('id', sol.tecnico_asignado_id)
      .single()
    if (tec?.nombre_completo) tecnicoNombre = tec.nombre_completo.split(' ')[0]
  }

  const yaReprogramado = sol.estado !== 'repuesto_recibido'

  return (
    <ReprogramarSelector
      token={token}
      solicitud={sol}
      tecnicoNombre={tecnicoNombre}
      yaReprogramado={yaReprogramado}
    />
  )
}
