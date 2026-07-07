import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  resolverSupervisorPorToken,
  solicitudEnAlcance,
  filtroEsGarantia,
} from '@/lib/auth/supervisor'
import { precioClienteServicio } from '@/types/solicitud'

/**
 * Lista de solicitudes DENTRO DEL ALCANCE del supervisor (solo lectura).
 *
 * Auth: portal_token en query (?token=). El alcance (ambito + marca) se aplica
 * en el servidor — ver src/lib/auth/supervisor.ts. Nunca confiar en un filtro
 * client-side: el anon key ve toda la tabla.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const sup = await resolverSupervisorPorToken(token)
  if (!sup) {
    return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  }

  // Acotar por es_garantia en la BD cuando el ámbito lo permite; la marca se
  // filtra en JS (comparación normalizada, no expresable limpio en SQL).
  let query = supabase
    .from('solicitudes_servicio')
    .select(
      'id, cliente_nombre, cliente_telefono, ciudad_pueblo, zona_servicio, tipo_equipo, marca_equipo, tipo_solicitud, estado, pago_tecnico, cotizacion, es_garantia, created_at, tecnico_asignado_id',
    )
    .order('created_at', { ascending: false })

  const fg = filtroEsGarantia(sup)
  if (fg !== null) query = query.eq('es_garantia', fg)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Error cargando solicitudes' }, { status: 500 })
  }

  const enAlcance = (data ?? []).filter(s => solicitudEnAlcance(sup, s))

  // Resolver nombres de técnicos asignados (una sola query).
  const tecnicoIds = [...new Set(enAlcance.filter(s => s.tecnico_asignado_id).map(s => s.tecnico_asignado_id!))]
  const tecnicoMap = new Map<string, string>()
  if (tecnicoIds.length > 0) {
    const { data: tecnicos } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .in('id', tecnicoIds)
    tecnicos?.forEach((t: { id: string; nombre_completo: string }) => tecnicoMap.set(t.id, t.nombre_completo))
  }

  const solicitudes = enAlcance.map(s => ({
    id: s.id,
    cliente_nombre: s.cliente_nombre,
    cliente_telefono: s.cliente_telefono,
    ciudad_pueblo: s.ciudad_pueblo,
    zona_servicio: s.zona_servicio,
    tipo_equipo: s.tipo_equipo,
    marca_equipo: s.marca_equipo,
    estado: s.estado ?? 'pendiente',
    pago_tecnico: s.pago_tecnico ?? 0,
    precio_cliente: precioClienteServicio(s.tipo_equipo, s.tipo_solicitud, s.es_garantia, s.cotizacion),
    es_garantia: s.es_garantia,
    created_at: s.created_at,
    tecnico_nombre: s.tecnico_asignado_id ? tecnicoMap.get(s.tecnico_asignado_id) ?? null : null,
  }))

  return NextResponse.json({
    supervisor: { nombre: sup.nombre, ambito: sup.ambito, marca: sup.marca },
    solicitudes,
  })
}
