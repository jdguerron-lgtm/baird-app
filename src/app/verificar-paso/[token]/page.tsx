import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describirSiguientePaso } from '@/lib/services/whatsapp.service'
import VerificarPasoView from './VerificarPasoView'

interface Props {
  params: Promise<{ token: string }>
}

export default async function VerificarPasoPage({ params }: Props) {
  const { token } = await params

  const { data: sol } = await supabase
    .from('solicitudes_servicio')
    .select(`
      id,
      cliente_nombre,
      tipo_equipo,
      marca_equipo,
      estado,
      es_garantia,
      siguiente_paso,
      siguiente_paso_detalle,
      verificacion_paso_decision,
      verificacion_paso_at,
      tecnico_asignado_id,
      triaje_resultado
    `)
    .eq('verificacion_paso_token', token)
    .single()

  if (!sol) notFound()

  const { data: tec } = await supabase
    .from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()

  let repuesto: { sku: string; descripcion: string; tiempo_estimado: string | null } | null = null
  if (sol.siguiente_paso === 'esperar_repuesto') {
    const { data } = await supabase
      .from('repuestos_pendientes')
      .select('sku, descripcion, tiempo_estimado')
      .eq('solicitud_id', sol.id)
      .order('solicitado_at', { ascending: false })
      .limit(1)
      .single()
    if (data) repuesto = data
  }

  const triajeJson = (sol.triaje_resultado ?? {}) as { diagnostico_tecnico?: string }
  const diagnostico = triajeJson.diagnostico_tecnico ?? ''
  const accion = describirSiguientePaso(
    sol.siguiente_paso ?? '',
    sol.siguiente_paso_detalle,
    repuesto ? { sku: repuesto.sku, descripcion: repuesto.descripcion, tiempoEstimado: repuesto.tiempo_estimado ?? undefined } : null,
  )

  return (
    <VerificarPasoView
      token={token}
      cliente={sol.cliente_nombre}
      equipo={`${sol.tipo_equipo} ${sol.marca_equipo}`}
      tecnico={tec?.nombre_completo ?? 'Técnico'}
      diagnostico={diagnostico}
      siguientePaso={sol.siguiente_paso ?? ''}
      accion={accion}
      repuestoSku={repuesto?.sku ?? null}
      repuestoDescripcion={repuesto?.descripcion ?? null}
      yaResuelto={!!sol.verificacion_paso_decision}
      decisionPrevia={sol.verificacion_paso_decision as 'aprobado' | 'rechazado' | null}
    />
  )
}
