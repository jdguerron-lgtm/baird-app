import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import ReceptorView from './ReceptorView'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * /receptor/{receptor_token}  (2026-10-13)
 *
 * Webview que abre la persona que recibe al técnico (distinta del titular)
 * desde el botón de `receptor_bienvenida_v1`. Acepta T&C + privacidad y, con
 * eso, pasa a recibir los avisos del servicio en paralelo con el titular.
 *
 * Mismo patrón que /verificar-paso/{token}: RSC lee por token con el cliente
 * anon (RLS off en solicitudes_servicio) y delega la interacción a un
 * componente cliente que llama POST /api/receptor/aceptar.
 */
export default async function ReceptorPage({ params }: Props) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound()

  const { data: sol } = await querySupabase(() =>
    supabase
      .from('solicitudes_servicio')
      .select('id, cliente_nombre, tipo_equipo, marca_equipo, es_garantia, estado, tecnico_asignado_id, cliente_token, receptor_nombre, receptor_relacion, receptor_acepto_at')
      .eq('receptor_token', token)
      .maybeSingle()
  )
  if (!sol || !sol.receptor_nombre) notFound()

  const { data: tec } = sol.tecnico_asignado_id
    ? await querySupabase(() =>
        supabase.from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).single()
      )
    : { data: null }

  return (
    <ReceptorView
      token={token}
      receptor={sol.receptor_nombre}
      titular={sol.cliente_nombre}
      equipo={`${sol.tipo_equipo} ${sol.marca_equipo}`}
      esGarantia={!!sol.es_garantia}
      tecnico={tec?.nombre_completo ?? 'el técnico de Baird'}
      aceptoAt={sol.receptor_acepto_at ?? null}
      clienteToken={sol.cliente_token ?? null}
    />
  )
}
