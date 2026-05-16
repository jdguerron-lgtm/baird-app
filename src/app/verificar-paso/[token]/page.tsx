import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import { describirSiguientePaso } from '@/lib/services/whatsapp.service'
import VerificarPasoView from './VerificarPasoView'

interface Props {
  params: Promise<{ token: string }>
}

export default async function VerificarPasoPage({ params }: Props) {
  const { token } = await params

  // Retry con backoff para tolerar 4G/3G flaky del cliente al abrir el link
  const { data: sol } = await querySupabase(() =>
    supabase
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
        triaje_resultado,
        cliente_token
      `)
      .eq('verificacion_paso_token', token)
      .single()
  )

  if (!sol) notFound()

  // Técnico + repuesto en paralelo (independientes). El query de repuesto
  // se dispara siempre pero se descarta si no es esperar_repuesto — barato
  // y simplifica el await.
  const [tecResult, repuestoResult] = await Promise.all([
    querySupabase(() =>
      supabase.from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()
    ),
    sol.siguiente_paso === 'esperar_repuesto'
      ? querySupabase(() =>
          supabase
            .from('repuestos_pendientes')
            .select('sku, descripcion, tiempo_estimado')
            .eq('solicitud_id', sol.id)
            .order('solicitado_at', { ascending: false })
            .limit(1)
            .single()
        )
      : Promise.resolve({ data: null, error: null }),
  ])

  const tec = tecResult.data
  const repuesto = (repuestoResult.data ?? null) as { sku: string; descripcion: string; tiempo_estimado: string | null } | null

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
      clienteToken={sol.cliente_token}
    />
  )
}
